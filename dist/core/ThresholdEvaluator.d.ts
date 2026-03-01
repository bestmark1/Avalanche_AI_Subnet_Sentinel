import type { IThresholdEvaluator } from '../interfaces/IAiPipeline.js';
import type { IAiAnalysisConfig } from '../types/config.types.js';
import type { SubnetSnapshot } from '../types/models.js';
import type { EvaluationResult } from '../types/threshold.types.js';
/** Convenience alias for the thresholds slice of IAiAnalysisConfig */
type ThresholdsConfig = IAiAnalysisConfig['thresholds'];
/**
 * ThresholdEvaluator — The "Dumb Guard"
 *
 * Compares a SubnetSnapshot against operator-configured thresholds and returns
 * a structured EvaluationResult listing every active violation.
 *
 * Design contract (from Architecture ADR):
 *   - Pure: zero I/O, zero network calls, zero external state mutations
 *   - Synchronous: no Promises, no async/await
 *   - Deterministic: identical snapshot + identical config + identical now → identical result
 *   - Fast: O(n) where n = number of checkable metrics (~3–7); < 1ms per call
 *
 * Determinism note (Fix #2):
 *   The `now` parameter is injected rather than derived from Date.now() internally.
 *   This makes evaluate() a true pure function: tests can pin time, and the
 *   orchestrator passes a single stable timestamp per tick across all calls.
 *
 * Metrics evaluated against the current SubnetSnapshot model:
 *   ✓ cpu_usage_percent         — snapshot.nodeMetrics.cpuUsage
 *   ✓ rpc_consecutive_failures  — snapshot.sources.rpc.consecutiveFailures
 *   ✓ gas_priority_fee_gwei     — snapshot.rpc.maxPriorityFeePerGas (wei hex → gwei)
 *   ✓ wallet_balance_low        — snapshot.walletBalanceAvax (AVAX float; null = skip)
 *
 * Metrics NOT yet in SubnetSnapshot (deferred until model expands in Step 3):
 *   — memory_usage_percent      — not in NodeMetricsData
 *   — validator_uptime_percent  — not in SubnetSnapshot
 *   — block_processing_delay_ms — not in SubnetSnapshot
 *   — peer_count                — not in SubnetSnapshot
 *
 * SOLID:
 *   - Single Responsibility: only threshold evaluation
 *   - Open/Closed: new metric checks added as private methods, evaluate() unchanged
 *   - Dependency Inversion: takes IAiAnalysisConfig['thresholds'], not the full config
 */
export declare class ThresholdEvaluator implements IThresholdEvaluator {
    private readonly thresholds;
    /**
     * Maximum gwei value returned by weiHexToGwei().
     *
     * Caps IEEE 754 precision loss on maliciously large RPC responses.
     * 1_000_000 gwei = 1,000 ETH-per-gas — astronomically above any real fee.
     * Any value above this cap is treated as the cap itself, still triggering
     * the spike threshold while preventing Infinity or NaN from propagating.
     */
    private static readonly GWEI_PRECISION_CAP;
    /**
     * @param thresholds — The thresholds slice of IAiAnalysisConfig.
     *   Inject via: new ThresholdEvaluator(aiConfig.thresholds)
     */
    constructor(thresholds: ThresholdsConfig);
    /**
     * Evaluate a snapshot against all configured thresholds.
     *
     * Called once per orchestrator tick (~every 10s).
     * The result is immediately passed to AnalysisScheduler.shouldTrigger().
     *
     * @param snapshot — The SubnetSnapshot assembled by PollingOrchestrator this tick.
     * @param now      — Unix ms timestamp for EvaluationResult.evaluatedAt.
     *                   Defaults to Date.now() for production use.
     *                   Pass an explicit value in tests for deterministic output.
     * @returns EvaluationResult — breached=true if one or more violations detected.
     */
    evaluate(snapshot: SubnetSnapshot, now?: number): EvaluationResult;
    /**
     * CPU usage check.
     *
     * Source:    snapshot.nodeMetrics.cpuUsage (percentage 0–100, parsed float)
     * Direction: 'above' — high CPU indicates overload or runaway process
     * Skipped:   when nodeMetrics is null (source stale or never succeeded)
     */
    private checkCpu;
    private checkRpcFailures;
    private checkGasPriorityFee;
    /**
     * Wallet balance check.
     *
     * Source:    snapshot.walletBalanceAvax (AVAX float)
     * Direction: 'below' — low balance risks validator operations or gas top-ups
     * Skipped:   when walletBalanceAvax is null (WALLET_ADDRESS not configured,
     *            or eth_getBalance soft-failed this tick)
     *
     * Deduplication: AnalysisScheduler applies a 24h dedup window for
     * 'wallet_balance_low' alerts specifically, preventing notification spam
     * on chronic low-balance conditions.
     */
    private checkWalletBalance;
    /**
     * Safely converts a wei hex string to a gwei float, with a precision cap.
     *
     * Accepts strings with or without "0x" prefix.
     * Returns null on any parse failure — callers treat null as "skip check".
     * Does NOT throw. Safe to call with untrusted RPC output.
     *
     * Precision cap (Fix #5):
     *   After converting, the result is clamped to GWEI_PRECISION_CAP (1_000_000 gwei).
     *   A non-finite result (e.g. from a wei value beyond Number range) is also
     *   replaced with the cap rather than propagating Infinity or NaN.
     *
     * @param hexWei — e.g. "0x9502f900" (3,600,000,000 wei = 3.6 gwei)
     * @returns gwei as a capped floating-point number, or null if unparseable
     */
    private static weiHexToGwei;
}
export {};
//# sourceMappingURL=ThresholdEvaluator.d.ts.map