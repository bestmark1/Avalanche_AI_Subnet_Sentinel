import type { ThresholdViolation } from './threshold.types.js';
/**
 * TriggerContext — Discriminated union on `type`.
 *
 * Produced by: AnalysisScheduler.shouldTrigger()
 * Consumed by: AiAnalysisService.enqueue() → PromptBuilder
 *
 * Consumers MUST narrow on `type` before reading type-specific fields:
 *
 *   if (ctx.type === 'alert') {
 *     // ctx.violations and ctx.dedupKey are available
 *   } else {
 *     // ctx.coverageFrom and ctx.coverageTo are available
 *   }
 */
export type TriggerContext = AlertTriggerContext | SummaryTriggerContext;
/**
 * Emitted when ThresholdEvaluator detected a breach AND
 * the dedupKey has not been seen within alertDeduplicationWindowMs.
 *
 * Maps to: AlertAnalysisResult (analysisType: 'alert')
 * Prompt:  PromptBuilder.forAlert()
 * Temperature: 0.1
 */
export interface AlertTriggerContext {
    readonly type: 'alert';
    /** All active violations from ThresholdEvaluator — injected verbatim into the LLM prompt */
    readonly violations: ThresholdViolation[];
    /**
     * Deduplication key for this anomaly event.
     * Passed through to AlertAnalysisResult.dedupKey for correlation.
     * Format: "{sorted_metric_names}-{time_bucket}"
     */
    readonly dedupKey: string;
}
/**
 * Emitted when dailySummaryIntervalMs has elapsed since the last summary.
 * Fires regardless of whether thresholds are currently breached.
 *
 * Maps to: SummaryAnalysisResult (analysisType: 'summary')
 * Prompt:  PromptBuilder.forSummary()
 * Temperature: 0.3
 */
export interface SummaryTriggerContext {
    readonly type: 'summary';
    /** ISO-8601 start of the 24h coverage window */
    readonly coverageFrom: string;
    /** ISO-8601 end of the 24h coverage window (approximately now) */
    readonly coverageTo: string;
}
/**
 * SchedulerDecision — Strict discriminated union returned by AnalysisScheduler.shouldTrigger().
 *
 * Lives here (not in AnalysisScheduler.ts) to allow IAiPipeline.ts to reference it
 * without creating a circular dependency between the interfaces/ and core/ directories.
 *
 *   trigger=false → drop this tick. No LLM call. Cost: $0.
 *   trigger=true  → context is guaranteed fully populated; pass to AiAnalysisService.enqueue().
 */
export type SchedulerDecision = {
    readonly trigger: false;
} | {
    readonly trigger: true;
    readonly context: TriggerContext;
};
//# sourceMappingURL=trigger.types.d.ts.map