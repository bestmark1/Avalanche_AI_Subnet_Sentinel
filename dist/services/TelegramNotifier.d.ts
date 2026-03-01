import type { INotifier } from '../interfaces/INotifier.js';
import type { IMessenger } from '../interfaces/IMessenger.js';
import type { AnalysisResult } from '../types/analysis.types.js';
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
export declare class TelegramNotifier implements INotifier, IMessenger {
    private readonly apiUrl;
    private readonly chatId;
    /**
     * @param botToken — Telegram bot token from BotFather (e.g. "123456:ABC-DEF...")
     * @param chatId   — Target chat/channel ID (e.g. "-1001234567890" or "@channelusername")
     */
    constructor(botToken: string, chatId: string);
    /**
     * Formats and delivers the AnalysisResult to the configured Telegram chat.
     *
     * @returns true on HTTP 200 OK from Telegram, false on any error.
     *          Never rejects — all errors are swallowed and the caller gets false.
     */
    sendAlert(analysis: AnalysisResult): Promise<boolean>;
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
    sendMessage(text: string): Promise<boolean>;
    /**
     * Delivers `text` to the Telegram sendMessage endpoint.
     * Shared by sendAlert() and sendMessage() to eliminate duplication.
     */
    private post;
}
//# sourceMappingURL=TelegramNotifier.d.ts.map