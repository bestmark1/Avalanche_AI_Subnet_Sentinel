import type { ThresholdViolation } from './threshold.types.js';
/**
 * Discriminated union on `analysisType`.
 *
 * Consumers MUST narrow on `analysisType` before accessing type-specific fields:
 *
 *   if (result.analysisType === 'alert') {
 *     console.log(result.urgency);        // AlertAnalysisResult
 *   } else {
 *     console.log(result.trends);         // SummaryAnalysisResult
 *   }
 */
export type AnalysisResult = AlertAnalysisResult | SummaryAnalysisResult;
/**
 * Fields common to both analysis types.
 * Not exported — consumers use AlertAnalysisResult or SummaryAnalysisResult directly.
 */
interface BaseAnalysisResult {
    /** ISO-8601 timestamp of when the LLM produced this analysis */
    readonly producedAt: string;
    /**
     * LLM-assessed health status of the subnet at time of analysis.
     * Maps to the subnet's operational condition, not just metric state.
     */
    readonly status: 'healthy' | 'degraded' | 'critical';
    /**
     * Human-readable explanation of the assessed status.
     * Technical, concise — suitable for operator dashboards and logs.
     * maxLength: 500 characters (enforced via tool input_schema).
     */
    readonly reason: string;
    /**
     * ONE concrete, actionable recommendation for the operator to take.
     * maxLength: 500 characters (enforced via tool input_schema).
     */
    readonly recommendation: string;
    /**
     * LLM's self-reported confidence in this assessment.
     * 'low' indicates limited or ambiguous telemetry — should surface a flag to the operator.
     */
    readonly confidence: 'low' | 'medium' | 'high';
    /**
     * Token consumption for this call — used for cost tracking and budget alerting.
     * Populated from Anthropic SDK response.usage.
     */
    readonly tokenUsage: {
        readonly inputTokens: number;
        readonly outputTokens: number;
    };
}
/**
 * AlertAnalysisResult — Produced reactively when ThresholdEvaluator detects a breach.
 *
 * Triggered by: AnalysisScheduler returning { type: 'alert', ... }
 * Temperature: 0.1 (deterministic root-cause analysis)
 * Max tokens: 1024
 */
export interface AlertAnalysisResult extends BaseAnalysisResult {
    readonly analysisType: 'alert';
    /** The specific ThresholdViolations that triggered this analysis */
    readonly triggeredBy: ThresholdViolation[];
    /**
     * Urgency rating on a 1–5 scale.
     *   1 = informational / monitor
     *   3 = operator attention required within the hour
     *   5 = immediate action required / potential outage
     * Used by downstream consumers to route to the appropriate notification channel.
     */
    readonly urgency: 1 | 2 | 3 | 4 | 5;
    /**
     * Deduplication key identifying the anomaly event.
     * Format: "{sorted_metrics}-{time_bucket}"
     * e.g.: "cpu_usage_percent+rpc_consecutive_failures-3412"
     *
     * The same key is suppressed by AnalysisScheduler for `alertDeduplicationWindowMs`
     * to prevent repeated LLM calls on a sustained anomaly across 10s ticks.
     */
    readonly dedupKey: string;
}
/**
 * SummaryAnalysisResult — Produced proactively once every 24 hours.
 *
 * Triggered by: AnalysisScheduler returning { type: 'summary', ... }
 * Temperature: 0.3 (synthetic trend reasoning)
 * Max tokens: 2048
 */
export interface SummaryAnalysisResult extends BaseAnalysisResult {
    readonly analysisType: 'summary';
    /** The 24-hour window this summary covers, in ISO-8601 */
    readonly coverageWindow: {
        readonly from: string;
        readonly to: string;
    };
    /**
     * Up to 5 notable trends observed across the coverage period.
     * e.g.: "CPU usage gradually increasing from 40% to 65% over 24h"
     */
    readonly trends: string[];
    /**
     * Up to 5 forward-looking risk items for the next 24h based on current trajectory.
     * e.g.: "If CPU trend continues, threshold breach likely within 8 hours"
     */
    readonly forwardRisks: string[];
}
export {};
//# sourceMappingURL=analysis.types.d.ts.map