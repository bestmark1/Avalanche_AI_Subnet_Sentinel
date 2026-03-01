import type { IAutoHealer } from '../interfaces/IAutoHealer.js';
import type { IMessenger } from '../interfaces/IMessenger.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { AnalysisResult } from '../types/analysis.types.js';
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
export declare class HealingCoordinator {
    private readonly healer;
    private readonly messenger;
    private readonly command;
    private readonly logger;
    /**
     * @param logger    — Parent logger; child is prefixed with component='healing-coordinator'
     * @param healer    — IAutoHealer implementation. Pass undefined to disable healing.
     * @param messenger — IMessenger for heal outcome notifications. Optional.
     * @param command   — Shell command to execute on critical status. Pass undefined
     *                    or empty string to disable healing even when healer is present.
     */
    constructor(logger: ILogger, healer?: IAutoHealer, messenger?: IMessenger, command?: string);
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
    evaluate(result: AnalysisResult): void;
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
    private executeHeal;
}
//# sourceMappingURL=HealingCoordinator.d.ts.map