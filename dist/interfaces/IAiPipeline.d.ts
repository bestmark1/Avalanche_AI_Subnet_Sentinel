import type { SubnetSnapshot } from '../types/models.js';
import type { EvaluationResult } from '../types/threshold.types.js';
import type { TriggerContext, SchedulerDecision } from '../types/trigger.types.js';
/**
 * IThresholdEvaluator — "Dumb Guard" contract.
 *
 * Implemented by: ThresholdEvaluator
 *
 * The `now` parameter is optional and defaults to Date.now() in the concrete
 * implementation. Tests pass an explicit value for deterministic output.
 */
export interface IThresholdEvaluator {
    evaluate(snapshot: SubnetSnapshot, now?: number): EvaluationResult;
}
/**
 * IAnalysisScheduler — Gatekeeper contract (read path).
 *
 * Implemented by: AnalysisScheduler
 *
 * Called once per tick. Returns whether and why an LLM call should fire.
 * The `now` parameter is optional and defaults to Date.now() in the concrete
 * implementation. Tests pass an explicit value to control dedup and summary timing.
 */
export interface IAnalysisScheduler {
    shouldTrigger(evaluation: EvaluationResult, now?: number): SchedulerDecision;
}
/**
 * ISchedulerFeedback — Gatekeeper contract (write path).
 *
 * Implemented by: AnalysisScheduler
 *
 * Consumed exclusively by AiAnalysisService to close the feedback loop after
 * an async LLM job completes or fails. Separated from IAnalysisScheduler by ISP:
 * AiAnalysisService has no business reading SchedulerDecisions — only writing back.
 */
export interface ISchedulerFeedback {
    /** Called by AiAnalysisService on summary SUCCESS. Advances the 24h clock. */
    recordSummaryTimestamp(ts: number): void;
    /**
     * Called by AiAnalysisService on summary FAILURE (in finally block).
     * Clears the in-flight guard and activates the failure backoff cooldown.
     */
    cancelPendingSummary(): void;
}
/**
 * IAiAnalysisService — "Smart Detective" contract.
 *
 * Implemented by: AiAnalysisService
 *
 * Fire-and-forget: enqueue() returns void. All async LLM work and error handling
 * happen inside the implementation. The orchestrator never awaits it.
 */
export interface IAiAnalysisService {
    enqueue(snapshot: SubnetSnapshot, context: TriggerContext): void;
}
/**
 * IAiPipeline — Composite object injected into PollingOrchestrator.
 *
 * Groups the three pipeline interfaces into a single constructor parameter.
 * This is an Object Parameter pattern (not a Service Locator) — all three
 * members are known at compile time and have specific, typed contracts.
 *
 * Assembled in: src/index.ts (composition root only)
 * Consumed by:  PollingOrchestrator.executeTick()
 *
 * Test doubles can implement this interface with in-memory fakes:
 *   const pipeline: IAiPipeline = {
 *     evaluator: new FakeEvaluator(),
 *     scheduler: new FakeScheduler(),
 *     service:   new FakeAiService(),
 *   };
 */
export interface IAiPipeline {
    readonly evaluator: IThresholdEvaluator;
    readonly scheduler: IAnalysisScheduler;
    readonly service: IAiAnalysisService;
}
//# sourceMappingURL=IAiPipeline.d.ts.map