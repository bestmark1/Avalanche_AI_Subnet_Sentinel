/**
 * The full set of metrics the "Dumb Guard" can evaluate.
 *
 * Not all metrics are available in every SubnetSnapshot — ThresholdEvaluator
 * silently skips checks for metrics whose source data is null/stale.
 *
 * Metrics available in the current SubnetSnapshot model (Step 1):
 *   ✓ cpu_usage_percent         — nodeMetrics.cpuUsage
 *   ✓ rpc_consecutive_failures  — sources.rpc.consecutiveFailures
 *   ✓ gas_priority_fee_gwei     — rpc.maxPriorityFeePerGas (converted from wei hex)
 *   ✓ wallet_balance_low        — walletBalanceAvax (AVAX; null when no WALLET_ADDRESS)
 *
 * Metrics deferred until NodeMetricsData / snapshot model is expanded:
 *   — memory_usage_percent
 *   — validator_uptime_percent
 *   — block_processing_delay_ms
 *   — peer_count
 */
export type ThresholdMetric = 'cpu_usage_percent' | 'memory_usage_percent' | 'rpc_consecutive_failures' | 'gas_priority_fee_gwei' | 'validator_uptime_percent' | 'block_processing_delay_ms' | 'peer_count' | 'wallet_balance_low';
/**
 * A single threshold breach detected in a SubnetSnapshot.
 *
 * Included in:
 *   - EvaluationResult.violations  (produced by ThresholdEvaluator)
 *   - TriggerContext (alert type)   (consumed by AnalysisScheduler)
 *   - AlertAnalysisResult.triggeredBy (passed to LLM for root-cause context)
 */
export interface ThresholdViolation {
    /** Which metric breached its threshold */
    readonly metric: ThresholdMetric;
    /** The raw value observed in the snapshot */
    readonly observedValue: number;
    /** The configured threshold that was crossed */
    readonly thresholdValue: number;
    /**
     * Direction of the breach relative to the threshold.
     *   'above' — metric exceeded the threshold (e.g., CPU spike, gas spike)
     *   'below' — metric fell below the threshold (e.g., validator uptime, peer count, wallet balance)
     */
    readonly direction: 'above' | 'below';
    /**
     * Number of consecutive 10s ticks this violation has been continuously active.
     * Set to 1 by ThresholdEvaluator (stateless; single-tick view).
     * May be augmented by AnalysisScheduler with historical context in future iterations.
     */
    readonly ticksActive: number;
}
/**
 * The full result of a single ThresholdEvaluator.evaluate() call.
 *
 * Produced once per orchestrator tick. Consumed by AnalysisScheduler.shouldTrigger().
 */
export interface EvaluationResult {
    /** True if at least one ThresholdViolation was detected */
    readonly breached: boolean;
    /** All active violations in this snapshot. Empty array when breached=false. */
    readonly violations: ThresholdViolation[];
    /** Unix epoch ms when this evaluation was performed */
    readonly evaluatedAt: number;
}
//# sourceMappingURL=threshold.types.d.ts.map