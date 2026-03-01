import type { IAnalysisScheduler, ISchedulerFeedback } from '../interfaces/IAiPipeline.js';
import type { IAiAnalysisConfig } from '../types/config.types.js';
import type { EvaluationResult } from '../types/threshold.types.js';
import type { SchedulerDecision } from '../types/trigger.types.js';
export type { SchedulerDecision } from '../types/trigger.types.js';
type SchedulerConfig = Pick<IAiAnalysisConfig, 'alertDeduplicationWindowMs' | 'dailySummaryIntervalMs'>;
export declare class AnalysisScheduler implements IAnalysisScheduler, ISchedulerFeedback {
    private readonly deduplicationWindowMs;
    private readonly dailySummaryIntervalMs;
    private static readonly SUMMARY_PENDING_TIMEOUT_MS;
    private static readonly SUMMARY_FAILURE_BACKOFF_MS;
    /**
     * Extended deduplication window for wallet_balance_low alerts.
     *
     * A low balance is a chronic condition (not a transient spike) — once notified,
     * re-alerting every 5 minutes would be noise. 24 hours matches the daily summary
     * cadence, giving the operator a full day to top up before the next alert.
     *
     * This is applied per dedupKey: any key that contains 'wallet_balance_low'
     * uses this window; all other keys use deduplicationWindowMs (default 5 min).
     */
    private static readonly WALLET_BALANCE_DEDUP_MS;
    private readonly alertTimestamps;
    private lastSummaryAt;
    private summaryPendingSince;
    private summaryBackoffUntil;
    constructor(config: SchedulerConfig);
    shouldTrigger(evaluationResult: EvaluationResult, now?: number): SchedulerDecision;
    recordSummaryTimestamp(ts: number): void;
    cancelPendingSummary(): void;
    getActiveAlertKeys(): ReadonlyMap<string, number>;
    getLastSummaryAt(): number;
    getSummaryPendingSince(): number | null;
    getSummaryBackoffUntil(): number;
    private isSummaryDue;
    private isPendingAndNotTimedOut;
    /**
     * Returns the effective deduplication window for a given dedupKey.
     *
     * wallet_balance_low uses a 24h window to prevent spam on chronic low balance.
     * All other alert keys use the standard configurable window (default 5 min).
     */
    private getDeduplicationWindowMs;
    private isDeduped;
    private buildDedupKey;
    private pruneExpiredKeys;
}
//# sourceMappingURL=AnalysisScheduler.d.ts.map