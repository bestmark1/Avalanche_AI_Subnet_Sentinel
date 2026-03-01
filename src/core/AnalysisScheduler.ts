// src/core/AnalysisScheduler.ts

import type { IAnalysisScheduler, ISchedulerFeedback } from '../interfaces/IAiPipeline.js';
import type { IAiAnalysisConfig } from '../types/config.types.js';
import type { EvaluationResult } from '../types/threshold.types.js';
import type { SchedulerDecision } from '../types/trigger.types.js';

// Re-export so consumers that previously imported SchedulerDecision from this
// module continue to compile without import-path changes.
export type { SchedulerDecision } from '../types/trigger.types.js';

type SchedulerConfig = Pick<
  IAiAnalysisConfig,
  'alertDeduplicationWindowMs' | 'dailySummaryIntervalMs'
>;

export class AnalysisScheduler implements IAnalysisScheduler, ISchedulerFeedback {
  private readonly deduplicationWindowMs: number;
  private readonly dailySummaryIntervalMs: number;
  private static readonly SUMMARY_PENDING_TIMEOUT_MS = 300_000;
  private static readonly SUMMARY_FAILURE_BACKOFF_MS = 300_000;

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
  private static readonly WALLET_BALANCE_DEDUP_MS = 86_400_000; // 24 hours

  private readonly alertTimestamps: Map<string, number> = new Map();
  private lastSummaryAt: number;
  private summaryPendingSince: number | null = null;
  private summaryBackoffUntil: number = 0;

  constructor(config: SchedulerConfig) {
    this.deduplicationWindowMs = config.alertDeduplicationWindowMs;
    this.dailySummaryIntervalMs = config.dailySummaryIntervalMs;
    this.lastSummaryAt = Date.now();
  }

  public shouldTrigger(evaluationResult: EvaluationResult, now: number = Date.now()): SchedulerDecision {
    this.pruneExpiredKeys(now);

    if (
      this.isSummaryDue(now) &&
      !this.isPendingAndNotTimedOut(now) &&
      now >= this.summaryBackoffUntil
    ) {
      this.summaryPendingSince = now;
      return {
        trigger: true,
        context: {
          type: 'summary',
          coverageFrom: new Date(this.lastSummaryAt).toISOString(),
          coverageTo: new Date(now).toISOString(),
        },
      };
    }

    if (evaluationResult.breached && evaluationResult.violations.length > 0) {
      const dedupKey = this.buildDedupKey(evaluationResult);
      if (this.isDeduped(dedupKey, now)) return { trigger: false };
      this.alertTimestamps.set(dedupKey, now);
      return {
        trigger: true,
        context: { type: 'alert', violations: evaluationResult.violations, dedupKey },
      };
    }

    return { trigger: false };
  }

  public recordSummaryTimestamp(ts: number): void {
    this.lastSummaryAt = ts;
    this.summaryPendingSince = null;
    this.summaryBackoffUntil = 0;
  }

  public cancelPendingSummary(): void {
    this.summaryPendingSince = null;
    this.summaryBackoffUntil = Date.now() + AnalysisScheduler.SUMMARY_FAILURE_BACKOFF_MS;
  }

  public getActiveAlertKeys(): ReadonlyMap<string, number> { return this.alertTimestamps; }
  public getLastSummaryAt(): number { return this.lastSummaryAt; }
  public getSummaryPendingSince(): number | null { return this.summaryPendingSince; }
  public getSummaryBackoffUntil(): number { return this.summaryBackoffUntil; }

  private isSummaryDue(now: number): boolean {
    return now - this.lastSummaryAt >= this.dailySummaryIntervalMs;
  }

  private isPendingAndNotTimedOut(now: number): boolean {
    if (this.summaryPendingSince === null) return false;
    return now - this.summaryPendingSince < AnalysisScheduler.SUMMARY_PENDING_TIMEOUT_MS;
  }

  /**
   * Returns the effective deduplication window for a given dedupKey.
   *
   * wallet_balance_low uses a 24h window to prevent spam on chronic low balance.
   * All other alert keys use the standard configurable window (default 5 min).
   */
  private getDeduplicationWindowMs(key: string): number {
    if (key.includes('wallet_balance_low')) {
      return AnalysisScheduler.WALLET_BALANCE_DEDUP_MS;
    }
    return this.deduplicationWindowMs;
  }

  private isDeduped(dedupKey: string, now: number): boolean {
    const lastTriggered = this.alertTimestamps.get(dedupKey);
    if (lastTriggered === undefined) return false;
    return now - lastTriggered < this.getDeduplicationWindowMs(dedupKey);
  }

  private buildDedupKey(evaluationResult: EvaluationResult): string {
    return evaluationResult.violations.map((v) => v.metric).sort().join('+');
  }

  private pruneExpiredKeys(now: number): void {
    for (const [key, lastTriggered] of this.alertTimestamps.entries()) {
      if (now - lastTriggered >= this.getDeduplicationWindowMs(key)) {
        this.alertTimestamps.delete(key);
      }
    }
  }
}
