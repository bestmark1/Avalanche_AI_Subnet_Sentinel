// src/types/config.types.ts
// Configuration contract for the AiAnalysisService and its sub-components.
// Defined in Part 1 because ThresholdEvaluator and AnalysisScheduler
// both depend on specific slices of this config via indexed access types.

/**
 * IAiAnalysisConfig — Full configuration contract for the AI pipeline.
 *
 * ThresholdEvaluator consumes: IAiAnalysisConfig['thresholds']
 * AnalysisScheduler  consumes: Pick<IAiAnalysisConfig, 'alertDeduplicationWindowMs' | 'dailySummaryIntervalMs'>
 * AiAnalysisService  consumes: the full interface
 *
 * All fields are readonly to mirror the deep-freeze pattern used for AppConfig.
 */
export interface IAiAnalysisConfig {
  // ── Anthropic Credentials ───────────────────────────────────────────────────
  readonly apiKey: string;

  /**
   * Pinned to a specific model string to prevent silent behavior regressions
   * when Anthropic releases new versions.
   * Recommended: 'claude-sonnet-4-5' | 'claude-sonnet-4-6'
   */
  readonly model: string;

  /** Token ceiling per API call. Recommended: 1024 (alerts), 2048 (summaries). */
  readonly maxTokens: number;

  // ── Threshold Values — "Dumb Guard" configuration ───────────────────────────
  readonly thresholds: {
    /** CPU usage percentage. Trigger when: observed > threshold. Default: 80 */
    readonly cpuUsagePercent: number;

    /** Memory usage percentage. Trigger when: observed > threshold. Default: 85 */
    readonly memoryUsagePercent: number;

    /** Consecutive RPC fetch failures. Trigger when: observed >= threshold. Default: 1 */
    readonly rpcConsecutiveFailures: number;

    /** Priority fee in gwei. Trigger when: observed > threshold (spike). Default: 50 */
    readonly gasPriorityFeeGwei: number;

    /** Validator uptime percentage. Trigger when: observed < threshold. Default: 95 */
    readonly validatorUptimePercent: number;

    /** Block processing delay in ms. Trigger when: observed > threshold. Default: 500 */
    readonly blockProcessingDelayMs: number;

    /** Minimum peer count. Trigger when: observed < threshold. Default: 5 */
    readonly minPeerCount: number;

    /**
     * Minimum wallet AVAX balance. Trigger when: observed < threshold. Default: 0.5.
     * Check is skipped when WALLET_ADDRESS is not configured (walletBalanceAvax is null).
     * Alert is deduplicated for 24 hours to avoid notification spam on chronic low balance.
     */
    readonly minAvaxBalance: number;
  };

  // ── Scheduling ──────────────────────────────────────────────────────────────
  /**
   * Proactive daily health summary interval in ms.
   * Default: 86_400_000 (24 hours)
   */
  readonly dailySummaryIntervalMs: number;

  // ── Deduplication ───────────────────────────────────────────────────────────
  /**
   * Minimum ms between two LLM calls triggered by the SAME dedupKey.
   * Prevents the 10s polling loop from burning tokens on a sustained anomaly.
   * Default: 300_000 (5 minutes)
   *
   * Note: wallet_balance_low uses a separate 24h dedup window regardless of
   * this value. See AnalysisScheduler.WALLET_BALANCE_DEDUP_MS.
   */
  readonly alertDeduplicationWindowMs: number;

  // ── Resilience ──────────────────────────────────────────────────────────────
  /** Maximum retry attempts for failed Anthropic API calls. Default: 2 */
  readonly maxRetries: number;

  /** Per-call timeout in ms before aborting. Default: 15_000 */
  readonly timeoutMs: number;

  // ── Auto-Healing ────────────────────────────────────────────────────────────
  /**
   * Auto-healing configuration.
   * When command is non-empty AND a SystemAutoHealer is injected into
   * HealingCoordinator, the command is executed whenever the LLM returns
   * status === 'critical'.
   *
   * Controlled by:
   *   AUTO_HEAL_COMMAND — Shell command to execute (e.g. "systemctl restart avalanchego").
   *                       Empty string = healing disabled (no boolean flag needed).
   *
   * Safety notes:
   *   - The command runs in the OS shell (/bin/sh -c) with the sentinel process's
   *     user permissions. Use a dedicated system user with minimum required rights.
   *   - If `command` is empty, no healing action is taken.
   *   - A failed command (non-zero exit) is logged at ERROR level and does NOT
   *     crash or alter the monitoring loop.
   */
  readonly autoHeal: {
    readonly command: string;
  };
}
