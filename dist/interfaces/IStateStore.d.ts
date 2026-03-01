import type { SubnetSnapshot } from '../types/models.js';
import type { AnalysisResult } from '../types/analysis.types.js';
/**
 * StateSnapshot — Atomic read of both mutable state fields.
 *
 * Returned by getLatestState() so callers can retrieve the current
 * SubnetSnapshot and the most recent AnalysisResult in a single call,
 * avoiding any TOCTOU race between two separate getters.
 *
 * Both fields are nullable:
 *   snapshot  — null before the first successful orchestrator tick
 *   analysis  — null before the first successful LLM call
 */
export interface StateSnapshot {
    readonly snapshot: SubnetSnapshot | null;
    readonly analysis: AnalysisResult | null;
}
/**
 * IStateStore — In-Memory Snapshot Repository
 *
 * Holds exactly one current snapshot (the latest).
 * Returns a frozen (readonly) snapshot to prevent mutation.
 * Step 2 extension point: circular buffer for N historical snapshots.
 */
export interface IStateStore {
    /** Replace the current snapshot. */
    updateSnapshot(snapshot: SubnetSnapshot): void;
    /** Get the current snapshot. Returns null before first successful tick. */
    getCurrentSnapshot(): SubnetSnapshot | null;
    /** Returns the monotonic tick counter. */
    getTickCount(): number;
    /**
     * Store the most recent AnalysisResult produced by AiAnalysisService.
     * Called on every successful LLM job completion.
     */
    setLastAnalysis(analysis: AnalysisResult): void;
    /**
     * Get the most recent AnalysisResult.
     * Returns null before the first successful LLM call.
     */
    getLastAnalysis(): AnalysisResult | null;
    /**
     * Atomic read of both mutable state fields.
     * Preferred over calling getCurrentSnapshot() + getLastAnalysis() separately
     * to avoid TOCTOU races in future concurrent implementations.
     */
    getLatestState(): StateSnapshot;
}
//# sourceMappingURL=IStateStore.d.ts.map