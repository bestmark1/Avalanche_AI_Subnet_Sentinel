// src/core/HealingCoordinator.ts
// Observes AI analysis results and dispatches auto-heal actions on critical status.
// Owns all post-analysis side effects: shell command execution and status messaging.
// Segregated from AiAnalysisService per SRP.

import type { IAutoHealer } from '../interfaces/IAutoHealer.js';
import type { IMessenger } from '../interfaces/IMessenger.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { AnalysisResult } from '../types/analysis.types.js';

// ── HTML Escape Helper ────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters for safe embedding in Telegram HTML messages.
 * Applied to operator-supplied strings (e.g. the auto-heal command) before
 * including them inside <code> tags.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── HealingCoordinator ────────────────────────────────────────────────────────

/**
 * HealingCoordinator — Dispatches auto-heal actions in response to critical AI results.
 *
 * Responsibilities (SRP):
 *   - Observe AnalysisResult.status from AiAnalysisService.
 *   - When status === 'critical' AND a healer + command are configured:
 *     launch executeHeal() as a fire-and-forget async task.
 *   - After healing, send a plain-text status notification via IMessenger (if present).
 *
 * Kill-switch: passing undefined as healer (or omitting command) disables healing.
 * No boolean flag is required — presence of the dependency IS the enable check.
 *
 * SOLID:
 *   - SRP: owns ONLY post-analysis side effects; AiAnalysisService stays clean.
 *   - DIP: depends on IAutoHealer and IMessenger interfaces, not concrete types.
 *   - ISP: consumes IMessenger (plain text) rather than the wider INotifier.
 */
export class HealingCoordinator {
  private readonly healer: IAutoHealer | undefined;
  private readonly messenger: IMessenger | undefined;
  private readonly command: string | undefined;
  private readonly logger: ILogger;

  /**
   * @param logger    — Parent logger; child is prefixed with component='healing-coordinator'
   * @param healer    — IAutoHealer implementation. Pass undefined to disable healing.
   * @param messenger — IMessenger for heal outcome notifications. Optional.
   * @param command   — Shell command to execute on critical status. Pass undefined
   *                    or empty string to disable healing even when healer is present.
   */
  constructor(
    logger: ILogger,
    healer?: IAutoHealer,
    messenger?: IMessenger,
    command?: string,
  ) {
    this.logger = logger.child({ component: 'healing-coordinator' });
    this.healer = healer;
    this.messenger = messenger;
    this.command = command;
  }

  /**
   * Evaluate an AnalysisResult and fire auto-healing if conditions are met.
   *
   * Synchronous entry point — called by AiAnalysisService after every successful
   * LLM job. Async healing is launched via a detached promise (fire-and-forget).
   *
   * Conditions for healing to fire:
   *   1. result.status === 'critical'
   *   2. this.healer is defined (kill-switch via DI)
   *   3. this.command is a non-empty string
   *
   * @param result — The AnalysisResult produced by AiAnalysisService.
   */
  public evaluate(result: AnalysisResult): void {
    if (result.status !== 'critical') return;
    if (this.healer === undefined || !this.command) return;

    void this.executeHeal(this.healer, this.command).catch((err: unknown) => {
      this.logger.error('healing_coordinator_unexpected_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ── Private: Async Heal Execution ─────────────────────────────────────────

  /**
   * Executes the heal command and optionally sends a status notification.
   *
   * Never throws — all error paths resolve (or are caught by evaluate's .catch).
   *
   * Flow:
   *   1. Call healer.attemptHeal(command) and await the boolean result.
   *   2. If a messenger is configured, send a Telegram HTML status message
   *      indicating success or failure.
   *   3. Messenger errors are caught and logged; they do not affect the heal result.
   *
   * @param healer  — IAutoHealer (already checked non-undefined by evaluate)
   * @param command — Shell command (already checked non-empty by evaluate)
   */
  private async executeHeal(healer: IAutoHealer, command: string): Promise<void> {
    const success = await healer.attemptHeal(command);

    if (this.messenger === undefined) return;

    const statusLine = success
      ? '✅ Critical error resolved. Avalanche C-Chain Node successfully restarted and synced.'
      : '❌ Command failed. Manual intervention may be required.';

    const text =
      `🔧 <b>Auto-Heal Status</b>\n\n` +
      `<code>${escapeHtml(command)}</code>\n\n` +
      statusLine;

    void this.messenger.sendMessage(text).catch((err: unknown) => {
      this.logger.error('healing_coordinator_messenger_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
