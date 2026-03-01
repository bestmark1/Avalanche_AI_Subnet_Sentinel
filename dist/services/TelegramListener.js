"use strict";
// src/services/TelegramListener.ts
// Background Telegram long-polling listener.
// Handles text commands, a persistent full-width ReplyKeyboardMarkup, and
// optional voice message transcription.
// No external libraries — pure fetch (Node.js 18+ built-in).
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramListener = void 0;
// ── Timing Constants ──────────────────────────────────────────────────────────
/** Telegram long-poll timeout (seconds). Telegram blocks until update or timeout fires. */
const POLL_TIMEOUT_S = 25;
/** Total fetch deadline — slightly longer than poll timeout to avoid premature abort. */
const FETCH_TIMEOUT_MS = 30_000;
/** Backoff delay after any fetch/parse failure before the next poll attempt. */
const ERROR_BACKOFF_MS = 5_000;
/** Per-request timeout for sendMessage and getFile calls. */
const SEND_TIMEOUT_MS = 10_000;
/** Timeout for downloading voice audio files from Telegram CDN. */
const AUDIO_DOWNLOAD_TIMEOUT_MS = 30_000;
// ── Reply Keyboard Button Labels ──────────────────────────────────────────────
/**
 * Exact text strings displayed on the persistent keyboard buttons.
 *
 * A ReplyKeyboardMarkup button sends its `text` field as a plain text
 * message when pressed. The message router in handleUpdate() performs
 * exact-string comparison against these constants.
 *
 * Centralising the strings here prevents silent mismatches if the
 * keyboard label and the routing condition drift apart over time.
 */
const MENU_LABEL = {
    STATUS: '📊 Status',
    BALANCE: '💰 Balance',
    AI: '🤖 AI Analysis',
    RESTART: '🔄 Restart Node',
};
/**
 * Persistent 2×2 grid keyboard sent on /start and /menu.
 *
 * Two buttons per row; Telegram divides the available width equally
 * between siblings in the same row.
 *
 * Layout:
 *   ┌─────────────────┬──────────────────┐
 *   │   📊 Status     │   💰 Balance     │
 *   ├─────────────────┼──────────────────┤
 *   │ 🤖 AI Analysis  │ 🔄 Restart Node  │
 *   └─────────────────┴──────────────────┘
 */
const MENU_KEYBOARD = {
    keyboard: [
        [{ text: MENU_LABEL.STATUS }, { text: MENU_LABEL.BALANCE }],
        [{ text: MENU_LABEL.AI }, { text: MENU_LABEL.RESTART }],
    ],
    resize_keyboard: true,
    is_persistent: true,
};
// ── Update Type Filter ────────────────────────────────────────────────────────
/**
 * URL-encoded allowed_updates value passed to getUpdates.
 * Restricting to "message" prevents Telegram from sending update types
 * we do not handle (callback_query, edited_message, channel_post, etc.),
 * reducing unnecessary payload and processing overhead.
 */
const ALLOWED_UPDATES = encodeURIComponent(JSON.stringify(['message']));
// ── Class ─────────────────────────────────────────────────────────────────────
/**
 * TelegramListener — Persistent-keyboard Telegram command and voice handler.
 *
 * Runs a background long-polling loop against the Telegram Bot API.
 *
 * Commands that attach or re-attach the persistent keyboard:
 *   /start (or /start@BotName) — greeting + attach MENU_KEYBOARD
 *   /menu  (or /menu@BotName)  — re-attach MENU_KEYBOARD with confirmation
 *
 * Keyboard button actions (exact text match on incoming message.text):
 *   "📊 Status"       → formatStatusMessage()  (same as /status)
 *   "💰 Balance"      → formatBalanceMessage()
 *   "🤖 AI Analysis"  → formatAiAnalysisMessage()
 *   "🔄 Restart Node" → handleRestart(); invokes onRestartRequest() if wired
 *
 * Additional text command:
 *   /status (or /status@BotName) — formatted snapshot summary (no keyboard re-send)
 *
 * Voice messages (when ITranscriber is configured):
 *   1. Resolve file_path via getFile API.
 *   2. Download OGG audio as ArrayBuffer from Telegram CDN.
 *   3. Transcribe via ITranscriber.
 *   4. Acknowledge with 🎙️ Recognized: "...".
 *   5. If transcript mentions "status"/"статус", send the status reply.
 *
 * Lifecycle:
 *   start() — begins the polling loop (idempotent, fire-and-forget)
 *   stop()  — signals the loop to exit after the current long-poll resolves
 *
 * Fault isolation:
 *   - HTTP errors, JSON parse errors, network timeouts → log + 5s backoff, loop continues.
 *   - Menu handler exceptions → log + user-friendly error reply, loop continues.
 *   - Voice pipeline failures → log + user-friendly error reply, loop continues.
 *   - sendMessage failures → logged and swallowed; never crash the poll loop.
 *
 * Design notes:
 *   - getUpdates uses allowed_updates=["message"] — callback_query is not requested.
 *   - ReplyKeyboardMarkup is stateless from the server side: Telegram stores the
 *     keyboard state on the client. The bot only re-sends it on /start or /menu.
 *   - Offset-based deduplication: each update is acked by advancing the offset.
 *   - AbortSignal.timeout() (Node 17.3+) provides per-fetch hard deadlines.
 *   - onRestartRequest is an opaque () => Promise<boolean> injected by the
 *     composition root, keeping TelegramListener free of IAutoHealer coupling.
 */
class TelegramListener {
    baseUrl;
    fileBaseUrl;
    store;
    transcriber;
    onRestartRequest;
    logger;
    offset = 0;
    running = false;
    /**
     * @param botToken         — Telegram bot token from BotFather (e.g. "123456:ABC-DEF...").
     * @param store            — State store; read for snapshot and analysis data.
     * @param logger           — Parent logger; a child logger is created internally.
     * @param transcriber      — Optional audio transcription backend. When absent,
     *                           incoming voice messages are silently ignored.
     * @param onRestartRequest — Optional callback invoked by the "🔄 Restart Node" button.
     *                           Wire in the composition root as:
     *                             () => healer.attemptHeal(healCommand)
     *                           When absent, the button replies "not configured".
     */
    constructor(botToken, store, logger, transcriber, onRestartRequest) {
        this.baseUrl = `https://api.telegram.org/bot${botToken}`;
        this.fileBaseUrl = `https://api.telegram.org/file/bot${botToken}`;
        this.store = store;
        this.transcriber = transcriber;
        this.onRestartRequest = onRestartRequest;
        this.logger = logger.child({ component: 'telegram-listener' });
    }
    // ── Public Lifecycle ──────────────────────────────────────────────────────
    /** Start the polling loop. Idempotent — calling twice is a no-op. */
    start() {
        if (this.running)
            return;
        this.running = true;
        this.logger.info('telegram_listener_started', {
            voiceTranscriptionEnabled: this.transcriber !== undefined,
            restartEnabled: this.onRestartRequest !== undefined,
        });
        void this.pollLoop();
    }
    /**
     * Signal the loop to stop.
     * The in-flight long-poll completes first (up to 30 s), then the loop exits.
     */
    stop() {
        this.running = false;
        this.logger.info('telegram_listener_stopped');
    }
    // ── Private: Poll Loop ────────────────────────────────────────────────────
    async pollLoop() {
        while (this.running) {
            try {
                const url = `${this.baseUrl}/getUpdates` +
                    `?offset=${this.offset}` +
                    `&timeout=${POLL_TIMEOUT_S}` +
                    `&allowed_updates=${ALLOWED_UPDATES}`;
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                });
                if (!response.ok) {
                    this.logger.warn('telegram_poll_http_error', { status: response.status });
                    await this.sleep(ERROR_BACKOFF_MS);
                    continue;
                }
                const data = await response.json();
                if (!data.ok) {
                    this.logger.warn('telegram_poll_api_error');
                    await this.sleep(ERROR_BACKOFF_MS);
                    continue;
                }
                for (const update of data.result) {
                    // Advance offset BEFORE handling — guarantees no re-processing even
                    // if handleUpdate() throws an unhandled exception.
                    this.offset = update.update_id + 1;
                    await this.handleUpdate(update);
                }
            }
            catch (err) {
                if (!this.running)
                    break; // Intentional stop — exit without backoff delay.
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn('telegram_poll_error', { error: msg });
                await this.sleep(ERROR_BACKOFF_MS);
            }
        }
    }
    // ── Private: Update Router ────────────────────────────────────────────────
    /**
     * Top-level router for incoming message updates.
     *
     * Routing priority (first match wins):
     *   1. /start, /menu        — send greeting + attach persistent keyboard
     *   2. /status              — send snapshot reply (no keyboard re-send)
     *   3. Exact keyboard label — dispatch to the corresponding menu handler
     *   4. voice                — transcription pipeline (when transcriber is wired)
     *   5. everything else      — silently ignored
     *
     * The keyboard buttons send their label text as plain messages, so routing
     * on exact text equality is the correct and only required dispatch mechanism.
     */
    async handleUpdate(update) {
        const msg = update.message;
        if (msg === undefined)
            return;
        const chatId = msg.chat.id;
        const text = msg.text?.trim() ?? '';
        // ── /start and /menu — attach the persistent keyboard ────────────────────
        if (text === '/start' || text.startsWith('/start@') ||
            text === '/menu' || text.startsWith('/menu@')) {
            await this.sendMenuGreeting(chatId);
            return;
        }
        // ── /status — formatted snapshot (kept for power users / scripting) ───────
        if (text === '/status' || text.startsWith('/status@')) {
            await this.sendMessage(chatId, this.formatStatusMessage());
            return;
        }
        // ── Keyboard button labels — exact text sent by ReplyKeyboardMarkup ───────
        if (text === MENU_LABEL.STATUS) {
            await this.handleMenuStatus(chatId);
            return;
        }
        if (text === MENU_LABEL.BALANCE) {
            await this.handleMenuBalance(chatId);
            return;
        }
        if (text === MENU_LABEL.AI) {
            await this.handleMenuAiAnalysis(chatId);
            return;
        }
        if (text === MENU_LABEL.RESTART) {
            await this.handleMenuRestart(chatId);
            return;
        }
        // ── Voice messages (requires transcriber) ─────────────────────────────────
        if (msg.voice !== undefined && this.transcriber !== undefined) {
            await this.handleVoiceMessage(chatId, msg.voice.file_id);
        }
    }
    // ── Private: Keyboard Greeting ────────────────────────────────────────────
    /**
     * Sends the "Sentinel is ready." greeting with the persistent MENU_KEYBOARD
     * attached via reply_markup.
     *
     * Telegram attaches ReplyKeyboardMarkup to the bottom input area on the
     * client. The keyboard remains visible across subsequent messages until
     * the bot sends a ReplyKeyboardRemove — which this implementation never
     * does intentionally, keeping the keyboard permanently accessible.
     *
     * Triggered by: /start, /menu (and their @BotName variants).
     */
    async sendMenuGreeting(chatId) {
        await this.sendMessageWithKeyboard(chatId, '✅ <b>Sentinel is ready.</b>', MENU_KEYBOARD);
    }
    // ── Private: Menu Action Handlers ─────────────────────────────────────────
    /**
     * "📊 Status" button — sends the full snapshot summary.
     * Identical output to the /status slash command.
     */
    async handleMenuStatus(chatId) {
        await this.sendMessage(chatId, this.formatStatusMessage());
    }
    /**
     * "💰 Balance" button — wallet balance and threshold status.
     *
     * Shows the current AVAX balance from the latest snapshot alongside the
     * hard-coded 0.5 AVAX minimum so the operator can assess margin at a glance.
     *
     * Renders three states:
     *   - No snapshot yet      → warming-up notice
     *   - WALLET_ADDRESS unset → configuration hint
     *   - Balance available    → value, block height, timestamp, threshold status
     */
    async handleMenuBalance(chatId) {
        const { snapshot } = this.store.getLatestState();
        const lines = [];
        lines.push('💰 <b>Wallet Balance</b>');
        lines.push('');
        if (snapshot === null) {
            lines.push('⏳ No snapshot yet — system is still warming up.');
            await this.sendMessage(chatId, lines.join('\n'));
            return;
        }
        if (snapshot.walletBalanceAvax === null) {
            lines.push('ℹ️ Wallet monitoring is not configured.');
            lines.push('');
            lines.push('Set <code>WALLET_ADDRESS</code> in your <code>.env</code> to enable.');
        }
        else {
            const balance = snapshot.walletBalanceAvax;
            const aboveMin = balance >= 0.5;
            const statusIcon = aboveMin ? '✅' : '⚠️';
            // Append USD equivalent when the Chainlink oracle price is available
            const avaxUsdPrice = snapshot.rpc?.avaxUsdPrice ?? null;
            const usdSuffix = avaxUsdPrice !== null
                ? ` (~$${(balance * avaxUsdPrice).toFixed(2)})`
                : '';
            lines.push(`${statusIcon} <b>Balance:</b> <code>${balance.toFixed(4)} AVAX</code>${usdSuffix}`);
            // Always render the AVAX/USD section — when null, "unavailable" confirms the oracle
            // call failed so operators can cross-reference the chainlink_fetch_error log entry.
            if (avaxUsdPrice !== null) {
                lines.push(`💱 <b>AVAX/USD:</b> <code>$${avaxUsdPrice.toFixed(2)}</code> (Chainlink)`);
            }
            else {
                lines.push('💱 <b>AVAX/USD:</b> unavailable');
            }
            lines.push(`📦 <b>Block:</b> ${snapshot.rpc !== null
                ? snapshot.rpc.blockNumber.toLocaleString()
                : 'unknown'}`);
            lines.push(`🕐 <b>As of:</b> <code>${snapshot.timestamp}</code>`);
            lines.push('');
            lines.push(aboveMin
                ? '✅ Balance is above the 0.5 AVAX minimum threshold.'
                : '⚠️ Balance is <b>below</b> the 0.5 AVAX minimum threshold.');
        }
        await this.sendMessage(chatId, lines.join('\n'));
    }
    /**
     * "🤖 AI Analysis" button — last AnalysisResult stored by AiAnalysisService.
     *
     * Renders different fields depending on whether the stored result is an
     * alert (reactive) or a daily summary (proactive).
     */
    async handleMenuAiAnalysis(chatId) {
        const { analysis } = this.store.getLatestState();
        const lines = [];
        lines.push('🤖 <b>Last AI Analysis</b>');
        lines.push('');
        if (analysis === null) {
            lines.push('ℹ️ No AI analysis has run yet.');
            lines.push('');
            lines.push('Analysis fires when a metric threshold is breached or every 24 hours.');
            await this.sendMessage(chatId, lines.join('\n'));
            return;
        }
        lines.push(...this.formatAnalysisResult(analysis));
        await this.sendMessage(chatId, lines.join('\n'));
    }
    /**
     * "🔄 Restart Node" button — invokes the onRestartRequest callback.
     *
     * Protocol:
     *   1. When onRestartRequest is absent: reply with a configuration hint.
     *   2. Otherwise:
     *      a. Send "⏳ Triggering restart..." for immediate user feedback.
     *      b. Await onRestartRequest() (subprocess may take up to 30 s).
     *      c. Send ✅ or ❌ depending on the boolean result.
     */
    async handleMenuRestart(chatId) {
        if (this.onRestartRequest === undefined) {
            await this.sendMessage(chatId, '⚙️ <b>Auto-Heal Not Configured</b>\n\n' +
                'Set <code>AUTO_HEAL_COMMAND</code> in your <code>.env</code> to enable ' +
                'the Restart Node button.\n\n' +
                'Example:\n<code>AUTO_HEAL_COMMAND=systemctl restart avalanchego</code>');
            return;
        }
        // Step a: Immediate acknowledgement — operator knows the request landed.
        await this.sendMessage(chatId, '⏳ <b>Triggering node restart...</b>');
        this.logger.warn('telegram_restart_requested', { chatId });
        // Step b: Execute the configured heal command via the injected callback.
        const succeeded = await this.onRestartRequest();
        // Step c: Report the outcome.
        if (succeeded) {
            this.logger.info('telegram_restart_succeeded', { chatId });
            await this.sendMessage(chatId, '✅ <b>Restart command completed successfully.</b>\n\n' +
                'The node should be back online within a few seconds.');
        }
        else {
            this.logger.error('telegram_restart_failed', { chatId });
            await this.sendMessage(chatId, '❌ <b>Restart command failed.</b>\n\n' +
                'Check the sentinel logs for the full error output.');
        }
    }
    // ── Private: Voice Pipeline ───────────────────────────────────────────────
    /**
     * Full voice message processing pipeline:
     *   1. Resolve Telegram file_path from file_id via getFile API.
     *   2. Download OGG audio as ArrayBuffer from Telegram CDN.
     *   3. Transcribe via ITranscriber.
     *   4. Acknowledge with 🎙️ Recognized: "...".
     *   5. If transcript contains "status" or "статус", send the status reply.
     *
     * The entire pipeline runs inside try/catch. Any failure is logged and a
     * user-friendly error message is sent. The polling loop is never interrupted.
     *
     * @param chatId — Telegram chat ID to reply to.
     * @param fileId — Telegram file_id of the incoming voice message.
     */
    async handleVoiceMessage(chatId, fileId) {
        try {
            // ── Step 1: Resolve file_path ─────────────────────────────────────────
            const fileResponse = await fetch(`${this.baseUrl}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
            if (!fileResponse.ok) {
                throw new Error(`getFile HTTP ${fileResponse.status}`);
            }
            const fileData = await fileResponse.json();
            const filePath = fileData.result?.file_path;
            if (filePath === undefined || filePath === '') {
                throw new Error('getFile returned no file_path');
            }
            // ── Step 2: Download OGG audio as ArrayBuffer ─────────────────────────
            const audioResponse = await fetch(`${this.fileBaseUrl}/${filePath}`, { signal: AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MS) });
            if (!audioResponse.ok) {
                throw new Error(`audio download HTTP ${audioResponse.status}`);
            }
            const audioBuffer = await audioResponse.arrayBuffer();
            this.logger.info('voice_audio_downloaded', {
                chatId,
                bytes: audioBuffer.byteLength,
            });
            // ── Step 3: Transcribe ────────────────────────────────────────────────
            // transcriber is guaranteed non-undefined here (checked in handleUpdate).
            const transcript = await this.transcriber.transcribe(audioBuffer, 'audio/ogg');
            if (transcript === null) {
                await this.sendMessage(chatId, '🎙️ Could not transcribe the voice message. Please try again or tap 📊 Status.');
                return;
            }
            // ── Step 4: Acknowledge transcription ─────────────────────────────────
            await this.sendMessage(chatId, `🎙️ Recognized: "${escapeHtml(transcript)}"`);
            this.logger.info('voice_message_transcribed', {
                chatId,
                transcriptLength: transcript.length,
            });
            // ── Step 5: Intent check — "status" in any language ───────────────────
            const lower = transcript.toLowerCase();
            if (lower.includes('status') || lower.includes('статус')) {
                await this.sendMessage(chatId, this.formatStatusMessage());
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn('voice_message_pipeline_failed', { chatId, error: errorMsg });
            await this.sendMessage(chatId, '⚠️ Failed to process the voice message. Please try again later.');
        }
    }
    // ── Private: Message Formatters ───────────────────────────────────────────
    /**
     * Builds the full status reply for /status and the "📊 Status" keyboard button.
     * Never throws — falls back to a warming-up notice when the store has no snapshot.
     */
    formatStatusMessage() {
        const state = this.store.getLatestState();
        if (state.snapshot === null) {
            return '⏳ <b>Sentinel Status</b>\n\nNo snapshot yet — system is still warming up.';
        }
        const s = state.snapshot;
        const lines = [];
        lines.push('📊 <b>Sentinel Status</b>');
        lines.push(`🕐 <code>${s.timestamp}</code>`);
        lines.push(`🔢 Tick #${s.tickNumber}`);
        lines.push('');
        // ── RPC data ──────────────────────────────────────────────────────────
        if (s.rpc !== null) {
            const feeGwei = hexWeiToGwei(s.rpc.maxPriorityFeePerGas);
            lines.push(`⛽ <b>Priority fee:</b> ${feeGwei !== null ? feeGwei.toFixed(2) : '?'} gwei`);
            lines.push(`📦 <b>Block:</b> ${s.rpc.blockNumber.toLocaleString()}`);
        }
        else {
            lines.push('⚠️ <b>RPC data unavailable</b>');
        }
        // ── Wallet balance (only when WALLET_ADDRESS is configured) ───────────
        if (s.walletBalanceAvax !== null) {
            // Append USD equivalent when Chainlink price is available
            const usdSuffix = s.rpc?.avaxUsdPrice != null
                ? ` (~$${(s.walletBalanceAvax * s.rpc.avaxUsdPrice).toFixed(2)})`
                : '';
            lines.push(`💰 <b>Wallet:</b> ${s.walletBalanceAvax.toFixed(4)} AVAX${usdSuffix}`);
        }
        // ── AVAX/USD spot rate (shown regardless of WALLET_ADDRESS config) ────
        // Always present when RPC data is available so the Chainlink oracle status
        // is visible even when no wallet is being monitored.
        if (s.rpc?.avaxUsdPrice != null) {
            lines.push(`💱 <b>AVAX/USD:</b> ${s.rpc.avaxUsdPrice.toFixed(2)} (Chainlink)`);
        }
        // ── Node metrics ──────────────────────────────────────────────────────
        if (s.nodeMetrics !== null) {
            lines.push(`🖥 <b>CPU:</b> ${s.nodeMetrics.cpuUsage.toFixed(1)}%`);
        }
        // ── Source health ──────────────────────────────────────────────────────
        lines.push('');
        const rpcSrc = s.sources.rpc;
        const metSrc = s.sources.nodeMetrics;
        lines.push(`🔌 <b>RPC:</b> ${rpcSrc.status}` +
            (rpcSrc.consecutiveFailures > 0
                ? ` (${rpcSrc.consecutiveFailures} failures)`
                : ''));
        lines.push(`📡 <b>Metrics:</b> ${metSrc.status}` +
            (metSrc.consecutiveFailures > 0
                ? ` (${metSrc.consecutiveFailures} failures)`
                : ''));
        // ── Last AI analysis summary ───────────────────────────────────────────
        if (state.analysis !== null) {
            const a = state.analysis;
            lines.push('');
            lines.push(`🤖 <b>AI:</b> ${a.status.toUpperCase()} — ${escapeHtml(a.reason)}`);
        }
        return lines.join('\n');
    }
    /**
     * Renders an AnalysisResult into HTML-formatted lines.
     *
     * Narrows on `analysisType` to surface type-specific fields:
     *   'alert'   — urgency rating, triggered-by metric list
     *   'summary' — observed trends, forward risks, coverage window
     *
     * Common fields rendered for both types:
     *   status, confidence, reason, recommendation, producedAt, tokenUsage.
     *
     * @param analysis — The AnalysisResult to render (alert or summary).
     * @returns Array of HTML-safe lines; caller joins with '\n'.
     */
    formatAnalysisResult(analysis) {
        const statusIcon = { healthy: '✅', degraded: '⚠️', critical: '🚨' }[analysis.status];
        const confidenceIcon = { low: '🔵', medium: '🟡', high: '🟢' }[analysis.confidence];
        const lines = [];
        if (analysis.analysisType === 'alert') {
            lines.push('🚨 <b>Type:</b> Alert');
            lines.push(`${statusIcon} <b>Status:</b> ${analysis.status.toUpperCase()}`);
            lines.push(`${confidenceIcon} <b>Confidence:</b> ${analysis.confidence}`);
            lines.push(`⚡ <b>Urgency:</b> ${analysis.urgency}/5`);
            lines.push('');
            lines.push(`📋 <b>Reason:</b>\n${escapeHtml(analysis.reason)}`);
            lines.push('');
            lines.push(`💡 <b>Recommendation:</b>\n${escapeHtml(analysis.recommendation)}`);
            if (analysis.triggeredBy.length > 0) {
                lines.push('');
                lines.push(`🔍 <b>Triggered by:</b> ${analysis.triggeredBy.map((v) => v.metric).join(', ')}`);
            }
        }
        else {
            // Summary result (analysisType === 'summary')
            lines.push('📅 <b>Type:</b> 24h Summary');
            lines.push(`${statusIcon} <b>Status:</b> ${analysis.status.toUpperCase()}`);
            lines.push(`${confidenceIcon} <b>Confidence:</b> ${analysis.confidence}`);
            lines.push('');
            lines.push(`📋 <b>Reason:</b>\n${escapeHtml(analysis.reason)}`);
            lines.push('');
            lines.push(`💡 <b>Recommendation:</b>\n${escapeHtml(analysis.recommendation)}`);
            if (analysis.trends.length > 0) {
                lines.push('');
                lines.push('<b>📈 Trends:</b>');
                for (const trend of analysis.trends) {
                    lines.push(`• ${escapeHtml(trend)}`);
                }
            }
            if (analysis.forwardRisks.length > 0) {
                lines.push('');
                lines.push('<b>⚠️ Forward risks:</b>');
                for (const risk of analysis.forwardRisks) {
                    lines.push(`• ${escapeHtml(risk)}`);
                }
            }
            lines.push('');
            lines.push(`🗓 <b>Coverage:</b> <code>${analysis.coverageWindow.from}</code> → ` +
                `<code>${analysis.coverageWindow.to}</code>`);
        }
        lines.push('');
        lines.push(`🕐 <b>Produced:</b> <code>${analysis.producedAt}</code>`);
        lines.push(`🔢 <b>Tokens:</b> ${analysis.tokenUsage.inputTokens} in / ` +
            `${analysis.tokenUsage.outputTokens} out`);
        return lines;
    }
    // ── Private: Telegram API Calls ───────────────────────────────────────────
    /**
     * Sends an HTML-formatted message to the given chat.
     * Never throws — errors are logged and swallowed so the poll loop continues.
     *
     * @param chatId — Target chat ID.
     * @param text   — HTML-formatted message body (special chars must be escaped).
     */
    async sendMessage(chatId, text) {
        try {
            const response = await fetch(`${this.baseUrl}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'HTML',
                }),
                signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            });
            if (!response.ok) {
                this.logger.warn('telegram_send_error', { status: response.status, chatId });
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn('telegram_send_failed', { error: msg, chatId });
        }
    }
    /**
     * Sends an HTML-formatted message with a ReplyKeyboardMarkup attached.
     *
     * The keyboard is rendered by the Telegram client at the bottom of the
     * screen and persists across future messages because `is_persistent: true`
     * is set in MENU_KEYBOARD. The bot does not need to re-send the keyboard
     * on every message — only on /start and /menu.
     *
     * Never throws — errors are logged and swallowed.
     *
     * @param chatId   — Target chat ID.
     * @param text     — HTML-formatted message body.
     * @param keyboard — ReplyKeyboardMarkup to attach.
     */
    async sendMessageWithKeyboard(chatId, text, keyboard) {
        try {
            const response = await fetch(`${this.baseUrl}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                }),
                signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            });
            if (!response.ok) {
                this.logger.warn('telegram_send_keyboard_error', {
                    status: response.status,
                    chatId,
                });
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn('telegram_send_keyboard_failed', { error: msg, chatId });
        }
    }
    // ── Private: Utilities ────────────────────────────────────────────────────
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.TelegramListener = TelegramListener;
// ── Module-Level Helpers ──────────────────────────────────────────────────────
/**
 * Converts a wei hex string to a gwei float.
 * Returns null on any parse failure — callers display "?" instead of crashing.
 */
function hexWeiToGwei(hexWei) {
    try {
        const gwei = Number(BigInt(hexWei)) / 1e9;
        return Number.isFinite(gwei) ? gwei : null;
    }
    catch {
        return null;
    }
}
/**
 * Escapes HTML special characters to prevent injection into Telegram HTML messages.
 * Applied to all user-supplied strings and LLM-generated text before sending.
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
//# sourceMappingURL=TelegramListener.js.map