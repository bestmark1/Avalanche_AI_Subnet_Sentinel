import type { IOrchestrator } from '../interfaces/IOrchestrator.js';
import type { IProvider } from '../interfaces/IProvider.js';
import type { ICollector } from '../interfaces/ICollector.js';
import type { IStateStore } from '../interfaces/IStateStore.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { ISubnetAdmin } from '../interfaces/ISubnetAdmin.js';
import type { IAiPipeline } from '../interfaces/IAiPipeline.js';
/**
 * OrchestratorConfig — Narrow contract for the orchestrator.
 *
 * Follows the same Interface Segregation pattern as ServerConfig:
 * the orchestrator depends only on what it needs, not the full AppConfig tree.
 */
export interface OrchestratorConfig {
    readonly tickIntervalMs: number;
}
/**
 * PollingOrchestrator — The Heartbeat Coordinator
 *
 * Lifecycle:
 *   1. start() begins the setTimeout loop (idempotent — calling twice is a no-op)
 *   2. Each tick generates a unique traceId via crypto.randomUUID()
 *   3. IProvider.getGasMetrics() and ICollector.collectNodeMetrics() run in parallel
 *      via Promise.allSettled — one failure does NOT crash the other
 *   4. Results are merged into a SubnetSnapshot with partial-state rules:
 *      - Success → SourceStatus.CURRENT, data is fresh
 *      - Failure + previous data exists → SourceStatus.STALE, last-known-good data
 *      - Failure + no previous data → SourceStatus.UNKNOWN, data is null
 *   5. Consecutive failure counters drive AlertSeverity escalation:
 *      - >= WARN_AFTER (3) → AlertSeverity.WARNING
 *      - >= ERROR_AFTER (10) → AlertSeverity.CRITICAL
 *   6. Snapshot is written to IStateStore
 *   7. AI pipeline (error-isolated): evaluator → scheduler → service
 *      - IThresholdEvaluator.evaluate() — pure, synchronous "Dumb Guard"
 *      - IAnalysisScheduler.shouldTrigger() — dedup + 24h summary gating
 *      - IAiAnalysisService.enqueue() — fire-and-forget, does NOT block the tick
 *      The entire step runs inside a try/catch. A bug in any pipeline component
 *      (unexpected snapshot shape, Map corruption, etc.) is logged and swallowed —
 *      it must never crash the 10s monitoring loop.
 *   8. Next tick is scheduled AFTER the current tick completes (never overlapping)
 *   9. stop() prevents the next tick but allows the in-flight tick to complete
 *
 * ADR-001: setTimeout (not setInterval) prevents tick overlap.
 * ADR-003: Manual DI via constructor — no framework.
 *
 * SOLID:
 *   - Single Responsibility: Only tick scheduling and result assembly
 *   - Open/Closed: New data sources added by extending, not modifying
 *   - Dependency Inversion: Depends on interfaces, not concrete classes
 *   - Liskov: Any IProvider/ICollector implementation is interchangeable
 */
export declare class PollingOrchestrator implements IOrchestrator {
    private readonly provider;
    private readonly collector;
    private readonly store;
    private readonly logger;
    private readonly admin;
    private readonly pipeline;
    private readonly config;
    private running;
    private timerId;
    private readonly rpcTracker;
    private readonly metricsTracker;
    constructor(provider: IProvider, collector: ICollector, store: IStateStore, logger: ILogger, admin: ISubnetAdmin, pipeline: IAiPipeline, config: OrchestratorConfig);
    /**
     * Start the polling loop. Idempotent — calling twice is a no-op.
     * The first tick fires immediately (no initial delay).
     */
    start(): void;
    /**
     * Stop the polling loop.
     * The in-flight tick completes but no new tick fires.
     */
    stop(): void;
    /**
     * Returns true if the polling loop is currently active.
     */
    isRunning(): boolean;
    /**
     * Force a single tick outside the timer. Useful for testing.
     * Does NOT affect the running state or timer scheduling.
     */
    triggerTick(): Promise<void>;
    /**
     * Schedules the next tick after `delayMs` milliseconds.
     * Uses setTimeout (not setInterval) to prevent tick overlap (ADR-001).
     *
     * The callback:
     *   1. Executes the tick (await)
     *   2. If still running, schedules the NEXT tick
     *   3. If stopped during the tick, does NOT schedule
     */
    private scheduleNextTick;
    /**
     * Executes a single monitoring tick.
     *
     * Flow:
     *   1. Generate traceId → scoped child logger
     *   2. Parallel fetch: provider.getGasMetrics() + collector.collectNodeMetrics()
     *   3. Process results → update trackers → build SourceHealth
     *   4. Assemble SubnetSnapshot (including walletBalanceAvax from RpcData)
     *   5. Store snapshot in IStateStore
     *   6. AI pipeline — synchronous gating, async LLM call (fire-and-forget):
     *        a. ThresholdEvaluator.evaluate(snapshot) — pure "Dumb Guard"
     *        b. AnalysisScheduler.shouldTrigger(evaluation) — dedup + summary gate
     *        c. If trigger: AiAnalysisService.enqueue(snapshot, context) — non-blocking
     *   7. Log tick completion with timing
     */
    private executeTick;
    /**
     * Processes the RPC Promise.allSettled result.
     * Updates the rpcTracker and returns the data for the snapshot.
     *
     * Partial state rules:
     *   - fulfilled → CURRENT: use fresh data, reset failure counter
     *   - rejected + previous data → STALE: use last-known-good
     *   - rejected + no previous data → UNKNOWN: null
     */
    private processRpcResult;
    /**
     * Processes the Metrics Promise.allSettled result.
     * Same partial-state logic as processRpcResult.
     */
    private processMetricsResult;
    /**
     * Builds a frozen SourceHealth object from a SourceTracker.
     *
     * Status derivation:
     *   - consecutiveFailures === 0 AND lastSuccessAt !== null → CURRENT
     *   - consecutiveFailures > 0 AND lastSuccessAt !== null → STALE
     *   - consecutiveFailures > 0 AND lastSuccessAt === null → UNKNOWN
     *   - (edge case) consecutiveFailures === 0 AND lastSuccessAt === null → UNKNOWN
     *     (before first tick completes)
     *
     * AlertSeverity thresholds (from enums.ts):
     *   - >= ERROR_AFTER (10) → CRITICAL
     *   - >= WARN_AFTER (3) → WARNING
     *   - < 3 → NONE
     */
    private buildSourceHealth;
    /**
     * Logs source failures with escalating severity.
     *
     * From ARCHITECTURE.md:
     *   - consecutiveFailures >= ERROR_AFTER (10) → logger.error
     *   - consecutiveFailures >= WARN_AFTER (3) → logger.warn
     *   - below 3 → logger.warn (always at least warn for any failure)
     */
    private logSourceFailure;
}
//# sourceMappingURL=PollingOrchestrator.d.ts.map