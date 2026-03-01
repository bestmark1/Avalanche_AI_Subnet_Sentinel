"use strict";
// src/core/AnalysisScheduler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisScheduler = void 0;
class AnalysisScheduler {
    deduplicationWindowMs;
    dailySummaryIntervalMs;
    static SUMMARY_PENDING_TIMEOUT_MS = 300_000;
    static SUMMARY_FAILURE_BACKOFF_MS = 300_000;
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
    static WALLET_BALANCE_DEDUP_MS = 86_400_000; // 24 hours
    alertTimestamps = new Map();
    lastSummaryAt;
    summaryPendingSince = null;
    summaryBackoffUntil = 0;
    constructor(config) {
        this.deduplicationWindowMs = config.alertDeduplicationWindowMs;
        this.dailySummaryIntervalMs = config.dailySummaryIntervalMs;
        this.lastSummaryAt = Date.now();
    }
    shouldTrigger(evaluationResult, now = Date.now()) {
        this.pruneExpiredKeys(now);
        if (this.isSummaryDue(now) &&
            !this.isPendingAndNotTimedOut(now) &&
            now >= this.summaryBackoffUntil) {
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
            if (this.isDeduped(dedupKey, now))
                return { trigger: false };
            this.alertTimestamps.set(dedupKey, now);
            return {
                trigger: true,
                context: { type: 'alert', violations: evaluationResult.violations, dedupKey },
            };
        }
        return { trigger: false };
    }
    recordSummaryTimestamp(ts) {
        this.lastSummaryAt = ts;
        this.summaryPendingSince = null;
        this.summaryBackoffUntil = 0;
    }
    cancelPendingSummary() {
        this.summaryPendingSince = null;
        this.summaryBackoffUntil = Date.now() + AnalysisScheduler.SUMMARY_FAILURE_BACKOFF_MS;
    }
    getActiveAlertKeys() { return this.alertTimestamps; }
    getLastSummaryAt() { return this.lastSummaryAt; }
    getSummaryPendingSince() { return this.summaryPendingSince; }
    getSummaryBackoffUntil() { return this.summaryBackoffUntil; }
    isSummaryDue(now) {
        return now - this.lastSummaryAt >= this.dailySummaryIntervalMs;
    }
    isPendingAndNotTimedOut(now) {
        if (this.summaryPendingSince === null)
            return false;
        return now - this.summaryPendingSince < AnalysisScheduler.SUMMARY_PENDING_TIMEOUT_MS;
    }
    /**
     * Returns the effective deduplication window for a given dedupKey.
     *
     * wallet_balance_low uses a 24h window to prevent spam on chronic low balance.
     * All other alert keys use the standard configurable window (default 5 min).
     */
    getDeduplicationWindowMs(key) {
        if (key.includes('wallet_balance_low')) {
            return AnalysisScheduler.WALLET_BALANCE_DEDUP_MS;
        }
        return this.deduplicationWindowMs;
    }
    isDeduped(dedupKey, now) {
        const lastTriggered = this.alertTimestamps.get(dedupKey);
        if (lastTriggered === undefined)
            return false;
        return now - lastTriggered < this.getDeduplicationWindowMs(dedupKey);
    }
    buildDedupKey(evaluationResult) {
        return evaluationResult.violations.map((v) => v.metric).sort().join('+');
    }
    pruneExpiredKeys(now) {
        for (const [key, lastTriggered] of this.alertTimestamps.entries()) {
            if (now - lastTriggered >= this.getDeduplicationWindowMs(key)) {
                this.alertTimestamps.delete(key);
            }
        }
    }
}
exports.AnalysisScheduler = AnalysisScheduler;
//# sourceMappingURL=AnalysisScheduler.js.map