// src/interfaces/INotifier.ts

import type { AnalysisResult } from '../types/analysis.types.js';

/**
 * INotifier — Structured alert delivery contract.
 *
 * Implemented by any channel that should receive AI-produced AnalysisResult
 * alerts (Telegram, Slack, PagerDuty, etc.). The composition root wires the
 * concrete implementation; AiAnalysisService depends only on this interface.
 *
 * Plain-text messaging is handled by the separate IMessenger interface per ISP.
 * TelegramNotifier implements both — consumers receive only the interface they need.
 *
 * Contract:
 *   - All errors are caught internally; the method never throws.
 *   - Returns true on successful delivery, false on any error.
 */
export interface INotifier {
  /**
   * Format and deliver a structured AnalysisResult to the configured channel.
   * The implementation decides how to render the result (HTML, Markdown, JSON, etc.).
   *
   * @param analysis — The AI-produced result to format and deliver.
   * @returns true on successful delivery, false on any error.
   */
  sendAlert(analysis: AnalysisResult): Promise<boolean>;
}
