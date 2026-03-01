"use strict";
// src/services/TelegramNotifier.ts
// Sends AnalysisResult alerts and plain-text status messages to a Telegram chat
// via the Bot API using native fetch. No external libraries — Node.js >= 18.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramNotifier = void 0;
// ── Telegram API constants ────────────────────────────────────────────────────
const TELEGRAM_API_BASE = 'https://api.telegram.org';
// ── HTML Formatting Helpers ───────────────────────────────────────────────────
/**
 * Escapes the three HTML special characters that Telegram's parse_mode=HTML
 * requires to be escaped in user-supplied text content.
 * Applied to all LLM-generated strings (reason, recommendation, trends, risks).
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/**
 * Maps AnalysisResult status to a leading emoji for visual triage at a glance.
 *   🚨 critical  — immediate action required
 *   ⚠️ degraded  — attention needed
 *   ✅ healthy   — all clear
 */
function statusEmoji(status) {
    switch (status) {
        case 'critical': return '🚨';
        case 'degraded': return '⚠️';
        case 'healthy': return '✅';
    }
}
/**
 * Builds an HTML-formatted Telegram message from an AnalysisResult.
 *
 * Alert layout:
 *   {emoji} Subnet Alert — {STATUS}
 *   Metrics: (violation list)
 *   Reason / Recommendation / Urgency / Confidence / Timestamp
 *
 * Summary layout:
 *   {emoji} 24h Subnet Summary — {STATUS}
 *   Reason / Recommendation / Confidence / Coverage window
 *   Trends / Forward Risks / Timestamp
 */
function formatMessage(analysis) {
    const emoji = statusEmoji(analysis.status);
    const statusLabel = analysis.status.toUpperCase();
    const lines = [];
    if (analysis.analysisType === 'alert') {
        lines.push(`${emoji} <b>Subnet Alert — ${statusLabel}</b>`);
        lines.push('');
        if (analysis.triggeredBy.length > 0) {
            lines.push('<b>Metrics:</b>');
            for (const v of analysis.triggeredBy) {
                const arrow = v.direction === 'above' ? '↑' : '↓';
                lines.push(`• <code>${v.metric}</code> ${arrow} ${v.observedValue}` +
                    ` (threshold: ${v.thresholdValue}, ${v.ticksActive} tick(s))`);
            }
            lines.push('');
        }
        lines.push(`<b>Reason:</b> ${escapeHtml(analysis.reason)}`);
        lines.push(`<b>Recommendation:</b> ${escapeHtml(analysis.recommendation)}`);
        lines.push('');
        lines.push(`Urgency: ${analysis.urgency}/5 · Confidence: ${analysis.confidence}`);
    }
    else {
        lines.push(`${emoji} <b>24h Subnet Summary — ${statusLabel}</b>`);
        lines.push('');
        lines.push(`<b>Reason:</b> ${escapeHtml(analysis.reason)}`);
        lines.push(`<b>Recommendation:</b> ${escapeHtml(analysis.recommendation)}`);
        lines.push(`Confidence: ${analysis.confidence}`);
        lines.push(`Coverage: ${analysis.coverageWindow.from} → ${analysis.coverageWindow.to}`);
        if (analysis.trends.length > 0) {
            lines.push('');
            lines.push('<b>Trends:</b>');
            for (const trend of analysis.trends) {
                lines.push(`• ${escapeHtml(trend)}`);
            }
        }
        if (analysis.forwardRisks.length > 0) {
            lines.push('');
            lines.push('<b>Forward Risks:</b>');
            for (const risk of analysis.forwardRisks) {
                lines.push(`• ${escapeHtml(risk)}`);
            }
        }
    }
    lines.push('');
    lines.push(`<i>${analysis.producedAt}</i>`);
    return lines.join('\n');
}
// ── TelegramNotifier ─────────────────────────────────────────────────────────
/**
 * TelegramNotifier — Sends structured alerts and plain messages to a Telegram chat.
 *
 * Implements INotifier and IMessenger with two delivery methods:
 *   sendAlert()   — formats and delivers an AnalysisResult as a rich HTML message.
 *   sendMessage() — delivers a pre-formatted string (used for auto-heal status).
 *
 * A single instance satisfies both interfaces; the composition root wires it
 * into both the INotifier role (AiAnalysisService) and the IMessenger role
 * (HealingCoordinator) without duplication.
 *
 * Uses the Telegram Bot API sendMessage endpoint with parse_mode=HTML.
 * Native fetch (Node.js >= 18, no external libs).
 *
 * Contract (from INotifier / IMessenger):
 *   - Both methods catch ALL errors internally and return false on failure.
 *   - Neither method ever throws — safe to fire-and-forget.
 */
class TelegramNotifier {
    apiUrl;
    chatId;
    /**
     * @param botToken — Telegram bot token from BotFather (e.g. "123456:ABC-DEF...")
     * @param chatId   — Target chat/channel ID (e.g. "-1001234567890" or "@channelusername")
     */
    constructor(botToken, chatId) {
        this.apiUrl = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
        this.chatId = chatId;
    }
    /**
     * Formats and delivers the AnalysisResult to the configured Telegram chat.
     *
     * @returns true on HTTP 200 OK from Telegram, false on any error.
     *          Never rejects — all errors are swallowed and the caller gets false.
     */
    async sendAlert(analysis) {
        return this.post(formatMessage(analysis));
    }
    /**
     * Delivers a pre-formatted text string to the configured Telegram chat.
     * Supports Telegram HTML tags (parse_mode=HTML).
     *
     * Used by HealingCoordinator to send auto-heal status notifications after
     * a self-healing command executes in response to a critical alert.
     *
     * @returns true on HTTP 200 OK from Telegram, false on any error.
     *          Never rejects — all errors are swallowed and the caller gets false.
     */
    async sendMessage(text) {
        return this.post(text);
    }
    // ── Private: HTTP transport ───────────────────────────────────────────────
    /**
     * Delivers `text` to the Telegram sendMessage endpoint.
     * Shared by sendAlert() and sendMessage() to eliminate duplication.
     */
    async post(text) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text,
                    parse_mode: 'HTML',
                }),
            });
            return response.ok;
        }
        catch {
            // Network error, DNS failure, timeout, etc.
            return false;
        }
    }
}
exports.TelegramNotifier = TelegramNotifier;
//# sourceMappingURL=TelegramNotifier.js.map