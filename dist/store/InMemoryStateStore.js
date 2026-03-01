"use strict";
// src/store/InMemoryStateStore.ts
// Implements IStateStore — single-slot in-memory snapshot repository.
// structuredClone() + deep freeze guarantees zero side effects on callers.
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryStateStore = void 0;
/**
 * InMemoryStateStore — Snapshot Repository
 *
 * Holds exactly ONE current snapshot (the latest tick's output) and
 * ONE most-recent AnalysisResult (the latest successful LLM call).
 *
 * Ownership semantics (Architect critique #1):
 *   updateSnapshot() takes a DEEP COPY of the incoming snapshot via
 *   structuredClone(), then deep-freezes the clone. This means:
 *     1. The caller's original object stays mutable — no side effects
 *     2. The stored snapshot is immutable — no consumer can corrupt state
 *   This is the correct ownership boundary: the store OWNS its copy.
 *
 *   setLastAnalysis() applies the same deep-clone + freeze pattern so
 *   AiAnalysisService cannot mutate an analysis result after handing it off.
 *
 * The tick counter is strictly monotonic: it increments once per
 * updateSnapshot() call, regardless of whether the snapshot data
 * changed or not. This lets the orchestrator track liveness.
 *
 * Step 2 extension point: swap this for a circular buffer of N
 * historical snapshots (ring buffer) for trend analysis.
 *
 * SOLID:
 *   - Single Responsibility: Only stores and retrieves state
 *   - Open/Closed: Can be extended to buffer history without modifying callers
 *   - Dependency Inversion: Consumers depend on IStateStore, not this class
 */
class InMemoryStateStore {
    snapshot = null;
    lastAnalysis = null;
    tickCount = 0;
    // ── Snapshot ─────────────────────────────────────────────────────────────
    /**
     * Replaces the current snapshot with a new one.
     *
     * 1. Deep-clones the input via structuredClone() so the store
     *    owns its own copy and the caller's reference stays mutable.
     * 2. Deep-freezes the clone to prevent any runtime mutation
     *    by consumers who read it via getCurrentSnapshot().
     * 3. Increments the monotonic tick counter.
     */
    updateSnapshot(snapshot) {
        const owned = structuredClone(snapshot);
        this.deepFreeze(owned);
        this.snapshot = owned;
        this.tickCount++;
    }
    /**
     * Returns the latest snapshot, or null if no tick has completed yet.
     * The returned object is already frozen — safe to pass to any consumer.
     */
    getCurrentSnapshot() {
        return this.snapshot;
    }
    /**
     * Returns the total number of updateSnapshot() calls since process start.
     * Monotonically increasing — never resets.
     */
    getTickCount() {
        return this.tickCount;
    }
    // ── Analysis Result ───────────────────────────────────────────────────────
    /**
     * Stores the most recent AnalysisResult.
     *
     * Deep-clones and freezes the incoming object so the service cannot
     * mutate an analysis result after handing it off to the store.
     *
     * Called by AiAnalysisService on every successful LLM job completion.
     */
    setLastAnalysis(analysis) {
        const owned = structuredClone(analysis);
        this.deepFreeze(owned);
        this.lastAnalysis = owned;
    }
    /**
     * Returns the most recent AnalysisResult, or null before the first
     * successful LLM call. The returned object is already frozen.
     */
    getLastAnalysis() {
        return this.lastAnalysis;
    }
    // ── Composite Read ────────────────────────────────────────────────────────
    /**
     * Atomic read of both mutable state fields.
     *
     * Returns a StateSnapshot object containing the current snapshot and the
     * most recent analysis result. Both fields may be null independently.
     * Preferred over calling getCurrentSnapshot() + getLastAnalysis() separately
     * to avoid TOCTOU races in future concurrent implementations.
     */
    getLatestState() {
        return {
            snapshot: this.snapshot,
            analysis: this.lastAnalysis,
        };
    }
    // ── Private: Deep Freeze ──────────────────────────────────────────────────
    /**
     * Recursively freezes an object and all its nested object properties.
     * Handles null values and already-frozen objects gracefully.
     *
     * Why deep freeze?
     *   Object.freeze() is shallow — it only freezes the top-level properties.
     *   SubnetSnapshot contains nested objects (rpc, nodeMetrics, sources,
     *   sources.rpc, sources.nodeMetrics). Without deep freeze, a consumer
     *   could do `snapshot.sources.rpc.status = "hacked"` and corrupt
     *   shared state.
     *
     * Note: This is called on a structuredClone()'d copy, never on the
     * caller's original reference. No side effects.
     */
    deepFreeze(obj) {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return obj;
        }
        Object.freeze(obj);
        const values = Object.values(obj);
        for (const value of values) {
            if (value !== null &&
                value !== undefined &&
                typeof value === 'object' &&
                !Object.isFrozen(value)) {
                this.deepFreeze(value);
            }
        }
        return obj;
    }
}
exports.InMemoryStateStore = InMemoryStateStore;
//# sourceMappingURL=InMemoryStateStore.js.map