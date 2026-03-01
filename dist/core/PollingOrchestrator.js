"use strict";
// src/core/PollingOrchestrator.ts
// Implements IOrchestrator — The heartbeat coordinator.
// Drives the 10s setTimeout loop, dispatches data fetching in parallel,
// handles partial failures, assembles SubnetSnapshot, updates the store,
// and feeds each snapshot through the "Dumb Guard + Smart Detective" AI pipeline.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollingOrchestrator = void 0;
const enums_js_1 = require("../types/enums.js");
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
class PollingOrchestrator {
    provider;
    collector;
    store;
    logger;
    admin;
    pipeline;
    config;
    running = false;
    timerId = null;
    // ── Per-source consecutive failure trackers ──
    rpcTracker = {
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        lastData: null,
    };
    metricsTracker = {
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        lastData: null,
    };
    constructor(provider, collector, store, logger, admin, pipeline, config) {
        this.provider = provider;
        this.collector = collector;
        this.store = store;
        this.logger = logger.child({ component: 'orchestrator' });
        this.admin = admin;
        this.pipeline = pipeline;
        this.config = config;
    }
    // ── IOrchestrator Public API ──────────────────────────────────
    /**
     * Start the polling loop. Idempotent — calling twice is a no-op.
     * The first tick fires immediately (no initial delay).
     */
    start() {
        if (this.running) {
            this.logger.warn('orchestrator_already_running');
            return;
        }
        this.running = true;
        this.logger.info('orchestrator_started', {
            tickIntervalMs: this.config.tickIntervalMs,
            adminAvailable: false, // Step 1: stub. Future: this.admin.isAvailable()
        });
        // admin is a stub (ISubnetAdmin). Retained as a constructor dependency so a
        // future Step can wire the real implementation without refactoring the
        // composition root. Reference here suppresses TS6133 noUnusedLocals.
        void this.admin;
        // Fire first tick immediately, then schedule subsequent ticks
        this.scheduleNextTick(0);
    }
    /**
     * Stop the polling loop.
     * The in-flight tick completes but no new tick fires.
     */
    stop() {
        this.running = false;
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.logger.info('orchestrator_stopped');
    }
    /**
     * Returns true if the polling loop is currently active.
     */
    isRunning() {
        return this.running;
    }
    /**
     * Force a single tick outside the timer. Useful for testing.
     * Does NOT affect the running state or timer scheduling.
     */
    async triggerTick() {
        await this.executeTick();
    }
    // ── Private: Scheduling ───────────────────────────────────────
    /**
     * Schedules the next tick after `delayMs` milliseconds.
     * Uses setTimeout (not setInterval) to prevent tick overlap (ADR-001).
     *
     * The callback:
     *   1. Executes the tick (await)
     *   2. If still running, schedules the NEXT tick
     *   3. If stopped during the tick, does NOT schedule
     */
    scheduleNextTick(delayMs) {
        this.timerId = setTimeout(async () => {
            this.timerId = null;
            try {
                await this.executeTick();
            }
            catch (err) {
                // Catastrophic safety net — executeTick() should never throw,
                // but if it does, the loop must survive.
                const message = err instanceof Error ? err.message : String(err);
                this.logger.error('tick_catastrophic_failure', { error: message });
            }
            // Schedule next tick only if we're still running
            if (this.running) {
                this.scheduleNextTick(this.config.tickIntervalMs);
            }
        }, delayMs);
    }
    // ── Private: Tick Execution ───────────────────────────────────
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
    async executeTick() {
        const traceId = crypto.randomUUID();
        const tickLogger = this.logger.child({ component: 'orchestrator', traceId });
        const tickNumber = this.store.getTickCount() + 1;
        tickLogger.info('tick_started', { tickNumber });
        const startMs = Date.now();
        // ── Step 1: Parallel data fetching via Promise.allSettled ──────────────
        const [rpcResult, metricsResult] = await Promise.allSettled([
            this.provider.getGasMetrics(),
            this.collector.collectNodeMetrics(),
        ]);
        // ── Step 2: Process RPC result ─────────────────────────────────────────
        const rpcData = this.processRpcResult(rpcResult, tickLogger);
        const rpcHealth = this.buildSourceHealth(this.rpcTracker);
        // ── Step 3: Process Metrics result ────────────────────────────────────
        const metricsData = this.processMetricsResult(metricsResult, tickLogger);
        const metricsHealth = this.buildSourceHealth(this.metricsTracker);
        // ── Step 4: Assemble SubnetSnapshot ───────────────────────────────────
        //
        // walletBalanceAvax is mirrored as a top-level field from rpcData so that
        // ThresholdEvaluator can access it without needing to null-guard the
        // (potentially stale-cached) full RpcData object.
        const snapshot = {
            traceId,
            timestamp: new Date().toISOString(),
            tickNumber,
            rpc: rpcData,
            nodeMetrics: metricsData,
            walletBalanceAvax: rpcData?.walletBalanceAvax ?? null,
            sources: {
                rpc: rpcHealth,
                nodeMetrics: metricsHealth,
            },
        };
        // ── Step 5: Update store ───────────────────────────────────────────────
        this.store.updateSnapshot(snapshot);
        // ── Step 6: AI pipeline (error-isolated) ──────────────────────────────
        //
        // All three pipeline calls are synchronous or fire-and-forget:
        //   evaluator.evaluate()       — pure, sync, zero I/O
        //   scheduler.shouldTrigger()  — sync, in-memory state only
        //   service.enqueue()          — returns void; async errors caught inside processJob()
        //
        // The try/catch here is a safety boundary for the *orchestrator* layer.
        // A bug in the evaluator (e.g. unexpected snapshot shape causes a throw),
        // a corrupted dedup Map, or any other unhandled exception in the pipeline
        // must not propagate into executeTick() and crash the 10s monitoring loop.
        // Errors are logged at ERROR level and swallowed so the loop continues.
        let thresholdBreached = false;
        let analysisTriggered = false;
        try {
            const evaluation = this.pipeline.evaluator.evaluate(snapshot);
            thresholdBreached = evaluation.breached;
            if (evaluation.breached) {
                tickLogger.info('threshold_breached', {
                    violationCount: evaluation.violations.length,
                    metrics: evaluation.violations.map((v) => v.metric),
                });
            }
            const decision = this.pipeline.scheduler.shouldTrigger(evaluation);
            analysisTriggered = decision.trigger;
            if (decision.trigger) {
                tickLogger.info('analysis_enqueued', {
                    type: decision.context.type,
                    ...(decision.context.type === 'alert'
                        ? {
                            dedupKey: decision.context.dedupKey,
                            violationCount: decision.context.violations.length,
                        }
                        : {
                            coverageFrom: decision.context.coverageFrom,
                            coverageTo: decision.context.coverageTo,
                        }),
                });
                this.pipeline.service.enqueue(snapshot, decision.context);
            }
        }
        catch (pipelineErr) {
            const msg = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
            tickLogger.error('ai_pipeline_error', {
                error: msg,
                note: 'Pipeline error isolated — monitoring loop continues.',
            });
        }
        // ── Step 7: Log tick completion ───────────────────────────────────────
        const durationMs = Date.now() - startMs;
        tickLogger.info('tick_completed', {
            tickNumber,
            durationMs,
            rpcStatus: rpcHealth.status,
            metricsStatus: metricsHealth.status,
            thresholdBreached,
            analysisTriggered,
        });
    }
    // ── Private: Result Processing ────────────────────────────────
    /**
     * Processes the RPC Promise.allSettled result.
     * Updates the rpcTracker and returns the data for the snapshot.
     *
     * Partial state rules:
     *   - fulfilled → CURRENT: use fresh data, reset failure counter
     *   - rejected + previous data → STALE: use last-known-good
     *   - rejected + no previous data → UNKNOWN: null
     */
    processRpcResult(result, tickLogger) {
        if (result.status === 'fulfilled') {
            this.rpcTracker.consecutiveFailures = 0;
            this.rpcTracker.lastSuccessAt = new Date().toISOString();
            this.rpcTracker.lastErrorMessage = null;
            this.rpcTracker.lastData = result.value;
            return result.value;
        }
        // Rejected — update failure tracker
        this.rpcTracker.consecutiveFailures++;
        this.rpcTracker.lastFailureAt = new Date().toISOString();
        this.rpcTracker.lastErrorMessage =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logSourceFailure(tickLogger, 'rpc', this.rpcTracker.lastErrorMessage, this.rpcTracker.consecutiveFailures);
        // Return last-known-good data (may be null if never succeeded)
        return this.rpcTracker.lastData;
    }
    /**
     * Processes the Metrics Promise.allSettled result.
     * Same partial-state logic as processRpcResult.
     */
    processMetricsResult(result, tickLogger) {
        if (result.status === 'fulfilled') {
            this.metricsTracker.consecutiveFailures = 0;
            this.metricsTracker.lastSuccessAt = new Date().toISOString();
            this.metricsTracker.lastErrorMessage = null;
            this.metricsTracker.lastData = result.value;
            return result.value;
        }
        // Rejected — update failure tracker
        this.metricsTracker.consecutiveFailures++;
        this.metricsTracker.lastFailureAt = new Date().toISOString();
        this.metricsTracker.lastErrorMessage =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logSourceFailure(tickLogger, 'nodeMetrics', this.metricsTracker.lastErrorMessage, this.metricsTracker.consecutiveFailures);
        return this.metricsTracker.lastData;
    }
    // ── Private: SourceHealth Builder ─────────────────────────────
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
    buildSourceHealth(tracker) {
        let status;
        if (tracker.consecutiveFailures === 0 && tracker.lastSuccessAt !== null) {
            status = enums_js_1.SourceStatus.CURRENT;
        }
        else if (tracker.consecutiveFailures > 0 && tracker.lastSuccessAt !== null) {
            status = enums_js_1.SourceStatus.STALE;
        }
        else {
            status = enums_js_1.SourceStatus.UNKNOWN;
        }
        let alertSeverity;
        if (tracker.consecutiveFailures >= enums_js_1.FAILURE_THRESHOLDS.ERROR_AFTER) {
            alertSeverity = enums_js_1.AlertSeverity.CRITICAL;
        }
        else if (tracker.consecutiveFailures >= enums_js_1.FAILURE_THRESHOLDS.WARN_AFTER) {
            alertSeverity = enums_js_1.AlertSeverity.WARNING;
        }
        else {
            alertSeverity = enums_js_1.AlertSeverity.NONE;
        }
        return {
            status,
            lastSuccessAt: tracker.lastSuccessAt,
            lastFailureAt: tracker.lastFailureAt,
            lastErrorMessage: tracker.lastErrorMessage,
            consecutiveFailures: tracker.consecutiveFailures,
            alertSeverity,
        };
    }
    // ── Private: Failure Logging ──────────────────────────────────
    /**
     * Logs source failures with escalating severity.
     *
     * From ARCHITECTURE.md:
     *   - consecutiveFailures >= ERROR_AFTER (10) → logger.error
     *   - consecutiveFailures >= WARN_AFTER (3) → logger.warn
     *   - below 3 → logger.warn (always at least warn for any failure)
     */
    logSourceFailure(tickLogger, sourceName, errorMessage, consecutiveFailures) {
        const logData = {
            source: sourceName,
            error: errorMessage,
            consecutiveFailures,
        };
        if (consecutiveFailures >= enums_js_1.FAILURE_THRESHOLDS.ERROR_AFTER) {
            tickLogger.error('source_failure_critical', logData);
        }
        else if (consecutiveFailures >= enums_js_1.FAILURE_THRESHOLDS.WARN_AFTER) {
            tickLogger.warn('source_failure_warning', logData);
        }
        else {
            tickLogger.warn('source_failure', logData);
        }
    }
}
exports.PollingOrchestrator = PollingOrchestrator;
//# sourceMappingURL=PollingOrchestrator.js.map