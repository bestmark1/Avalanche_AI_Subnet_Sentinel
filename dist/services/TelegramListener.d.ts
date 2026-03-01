import type { IStateStore } from '../interfaces/IStateStore.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { ITranscriber } from '../interfaces/ITranscriber.js';
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
export declare class TelegramListener {
    private readonly baseUrl;
    private readonly fileBaseUrl;
    private readonly store;
    private readonly transcriber;
    private readonly onRestartRequest;
    private readonly logger;
    private offset;
    private running;
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
    constructor(botToken: string, store: IStateStore, logger: ILogger, transcriber?: ITranscriber, onRestartRequest?: () => Promise<boolean>);
    /** Start the polling loop. Idempotent — calling twice is a no-op. */
    start(): void;
    /**
     * Signal the loop to stop.
     * The in-flight long-poll completes first (up to 30 s), then the loop exits.
     */
    stop(): void;
    private pollLoop;
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
    private handleUpdate;
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
    private sendMenuGreeting;
    /**
     * "📊 Status" button — sends the full snapshot summary.
     * Identical output to the /status slash command.
     */
    private handleMenuStatus;
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
    private handleMenuBalance;
    /**
     * "🤖 AI Analysis" button — last AnalysisResult stored by AiAnalysisService.
     *
     * Renders different fields depending on whether the stored result is an
     * alert (reactive) or a daily summary (proactive).
     */
    private handleMenuAiAnalysis;
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
    private handleMenuRestart;
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
    private handleVoiceMessage;
    /**
     * Builds the full status reply for /status and the "📊 Status" keyboard button.
     * Never throws — falls back to a warming-up notice when the store has no snapshot.
     */
    private formatStatusMessage;
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
    private formatAnalysisResult;
    /**
     * Sends an HTML-formatted message to the given chat.
     * Never throws — errors are logged and swallowed so the poll loop continues.
     *
     * @param chatId — Target chat ID.
     * @param text   — HTML-formatted message body (special chars must be escaped).
     */
    private sendMessage;
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
    private sendMessageWithKeyboard;
    private sleep;
}
//# sourceMappingURL=TelegramListener.d.ts.map