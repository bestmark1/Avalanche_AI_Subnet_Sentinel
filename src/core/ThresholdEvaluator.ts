// src/core/ThresholdEvaluator.ts
// "Dumb Guard" — pure, synchronous threshold checker.
// No I/O, no side effects, no external state. Same input → same output.

import type { IThresholdEvaluator } from '../interfaces/IAiPipeline.js';
import type { IAiAnalysisConfig } from '../types/config.types.js';
import type { SubnetSnapshot } from '../types/models.js';
import type { EvaluationResult, ThresholdViolation } from '../types/threshold.types.js';

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
export class ThresholdEvaluator implements IThresholdEvaluator {
  private readonly thresholds: ThresholdsConfig;

  /**
   * Maximum gwei value returned by weiHexToGwei().
   *
   * Caps IEEE 754 precision loss on maliciously large RPC responses.
   * 1_000_000 gwei = 1,000 ETH-per-gas — astronomically above any real fee.
   * Any value above this cap is treated as the cap itself, still triggering
   * the spike threshold while preventing Infinity or NaN from propagating.
   */
  private static readonly GWEI_PRECISION_CAP = 1_000_000;

  /**
   * @param thresholds — The thresholds slice of IAiAnalysisConfig.
   *   Inject via: new ThresholdEvaluator(aiConfig.thresholds)
   */
  constructor(thresholds: ThresholdsConfig) {
    this.thresholds = thresholds;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

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
  public evaluate(snapshot: SubnetSnapshot, now: number = Date.now()): EvaluationResult {
    const violations: ThresholdViolation[] = [];

    this.checkCpu(snapshot, violations);
    this.checkRpcFailures(snapshot, violations);
    this.checkGasPriorityFee(snapshot, violations);
    this.checkWalletBalance(snapshot, violations);

    return {
      breached: violations.length > 0,
      violations,
      evaluatedAt: now,
    };
  }

  // ── Private: Metric Checks ──────────────────────────────────────────────────

  /**
   * CPU usage check.
   *
   * Source:    snapshot.nodeMetrics.cpuUsage (percentage 0–100, parsed float)
   * Direction: 'above' — high CPU indicates overload or runaway process
   * Skipped:   when nodeMetrics is null (source stale or never succeeded)
   */
  private checkCpu(snapshot: SubnetSnapshot, violations: ThresholdViolation[]): void {
    if (snapshot.nodeMetrics === null) return;

    const observed = snapshot.nodeMetrics.cpuUsage;

    // Default to 80% critical threshold if not provided in config
    const threshold = this.thresholds?.cpuUsagePercent ?? 80;

    if (observed > threshold) {
      violations.push({
        metric: 'cpu_usage_percent',
        observedValue: observed,
        thresholdValue: threshold,
        direction: 'above',
        ticksActive: 1,
      });
    }
  }

  private checkRpcFailures(snapshot: SubnetSnapshot, violations: ThresholdViolation[]): void {
    const observed = snapshot.sources.rpc.consecutiveFailures;

    // Default to 1 (trigger on the very first failure) if not provided in config
    const threshold = this.thresholds?.rpcConsecutiveFailures ?? 1;

    if (observed >= threshold) {
      violations.push({
        metric: 'rpc_consecutive_failures',
        observedValue: observed,
        thresholdValue: threshold,
        direction: 'above',
        ticksActive: 1,
      });
    }
  }

  private checkGasPriorityFee(snapshot: SubnetSnapshot, violations: ThresholdViolation[]): void {
    if (snapshot.rpc === null) return;

    const priorityFeeGwei = ThresholdEvaluator.weiHexToGwei(snapshot.rpc.maxPriorityFeePerGas);
    if (priorityFeeGwei === null) return;

    // Default to 50 Gwei as a spike anomaly if not provided in config
    const threshold = this.thresholds?.gasPriorityFeeGwei ?? 50;

    if (priorityFeeGwei > threshold) {
      violations.push({
        metric: 'gas_priority_fee_gwei',
        observedValue: priorityFeeGwei,
        thresholdValue: threshold,
        direction: 'above',
        ticksActive: 1,
      });
    }
  }

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
  private checkWalletBalance(snapshot: SubnetSnapshot, violations: ThresholdViolation[]): void {
    if (snapshot.walletBalanceAvax === null) return;

    const observed = snapshot.walletBalanceAvax;

    // Default to 0.5 AVAX minimum if not provided in config
    const threshold = this.thresholds?.minAvaxBalance ?? 0.5;

    if (observed < threshold) {
      violations.push({
        metric: 'wallet_balance_low',
        observedValue: observed,
        thresholdValue: threshold,
        direction: 'below',
        ticksActive: 1,
      });
    }
  }

  // ── Private: Helpers ────────────────────────────────────────────────────────

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
  private static weiHexToGwei(hexWei: string): number | null {
    try {
      const wei = BigInt(hexWei);
      const gwei = Number(wei) / 1e9;
      return Number.isFinite(gwei)
        ? Math.min(gwei, ThresholdEvaluator.GWEI_PRECISION_CAP)
        : ThresholdEvaluator.GWEI_PRECISION_CAP;
    } catch {
      return null;
    }
  }
}
