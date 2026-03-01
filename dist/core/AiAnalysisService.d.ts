import type { IAiAnalysisService, ISchedulerFeedback } from '../interfaces/IAiPipeline.js';
import type { IStateStore } from '../interfaces/IStateStore.js';
import type { INotifier } from '../interfaces/INotifier.js';
import type { IAiAnalysisConfig } from '../types/config.types.js';
import type { TriggerContext } from '../types/trigger.types.js';
import type { SubnetSnapshot } from '../types/models.js';
import type { ILogger } from '../interfaces/ILogger.js';
import { HealingCoordinator } from './HealingCoordinator.js';
/**
 * AiAnalysisService — The "Smart Detective"
 *
 * Receives trigger decisions from AnalysisScheduler and executes LLM calls
 * via the Anthropic SDK using forced Tool Calling for structured output.
 *
 * Concurrency contract:
 *   - enqueue() is synchronous, returns void (fire-and-forget).
 *   - processJob() runs async; the polling tick does NOT await it.
 *   - processJob() GUARANTEES cancelPendingSummary() in its finally block
 *     when a summary job fails, preventing indefinite AnalysisScheduler deadlock.
 *
 * Storage:
 *   - On success, the AnalysisResult is handed off to IStateStore.setLastAnalysis().
 *   - The store owns the result and serves it to GET /status via getLatestState().
 *   - AiAnalysisService holds no local analysis state.
 *
 * Notifications:
 *   - If an INotifier is provided, sendAlert() is called fire-and-forget after
 *     the store write. Notifier errors are caught and logged; they never block
 *     or fail the LLM job itself.
 *
 * Post-analysis coordination:
 *   - If a HealingCoordinator is provided, evaluate() is called synchronously
 *     after the notification dispatch. The coordinator owns all auto-healing and
 *     status-messaging side effects (SRP).
 *
 * SOLID:
 *   - Single Responsibility: LLM invocation and response parsing only.
 *   - Dependency Inversion: depends on interfaces (ILogger, IStateStore,
 *     ISchedulerFeedback, INotifier) and one concrete coordinator.
 */
export declare class AiAnalysisService implements IAiAnalysisService {
    private readonly client;
    private readonly config;
    private readonly scheduler;
    private readonly store;
    private readonly notifier;
    private readonly coordinator;
    private readonly logger;
    constructor(config: IAiAnalysisConfig, scheduler: ISchedulerFeedback, store: IStateStore, logger: ILogger, notifier?: INotifier, coordinator?: HealingCoordinator);
    /**
     * Fire-and-forget entry point.
     *
     * Schedules an async LLM analysis job without blocking the caller.
     * The orchestrator calls this and immediately returns to its next tick.
     *
     * @param snapshot — The SubnetSnapshot assembled this tick (provides telemetry)
     * @param context  — The TriggerContext from AnalysisScheduler (alert or summary)
     */
    enqueue(snapshot: SubnetSnapshot, context: TriggerContext): void;
    /**
     * Performs a lightweight API connectivity check.
     * Sends a minimal message and returns true if the SDK responds without error.
     * Used during startup to fail-fast on bad API keys or network issues.
     */
    isReady(): Promise<boolean>;
    /**
     * Async job runner — the body of the fire-and-forget pattern.
     *
     * Guarantees:
     *   - On summary SUCCESS: scheduler.recordSummaryTimestamp() is called to advance
     *     the 24h clock and lift the in-flight guard.
     *   - On summary FAILURE: scheduler.cancelPendingSummary() is called in the
     *     finally block to prevent deadlock and activate the backoff cooldown.
     *   - Alert jobs do NOT interact with the summary state machine.
     *
     * Notification:
     *   - If a notifier is configured, sendAlert() is dispatched fire-and-forget
     *     after the store write. sendAlert() never rejects (INotifier contract),
     *     but an extra .catch() guard is applied defensively.
     *
     * Post-analysis coordination:
     *   - coordinator.evaluate() is called synchronously after notification dispatch.
     *     Any async healing is launched as a detached promise inside the coordinator.
     *
     * Error isolation:
     *   - All exceptions are caught and logged; none propagate to the event loop.
     *   - A failed job does not affect the next polling tick.
     */
    private processJob;
    /**
     * Executes the Anthropic API call with forced Tool Calling.
     *
     * Alert:   temperature=0.1, max_tokens=1024 (deterministic root-cause analysis)
     * Summary: temperature=0.3, max_tokens=2048 (synthetic trend reasoning, more creative)
     *
     * tool_choice: { type: 'tool', name: 'report_analysis' } forces the LLM to
     * always call report_analysis rather than emitting prose — structured output
     * reliability increases from ~85% to ~99.5%.
     *
     * @throws Error if the API call fails or the tool response fails validation
     */
    private callLlm;
    /**
     * Validates the Anthropic SDK response and builds a typed AnalysisResult.
     *
     * Expects exactly one tool_use content block named 'report_analysis'.
     * Validates all required fields via strict helper functions that throw
     * descriptive errors on malformed input — errors propagate to processJob()
     * and are caught + logged there.
     *
     * @throws Error on any structural or type validation failure
     */
    private parseToolResponse;
}
//# sourceMappingURL=AiAnalysisService.d.ts.map