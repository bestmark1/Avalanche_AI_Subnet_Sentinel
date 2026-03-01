// src/interfaces/IOrchestrator.ts
// Verbatim from ARCHITECTURE.md Section 6.8

/**
 * IOrchestrator — The Heartbeat Coordinator
 *
 * Responsibilities:
 *   - Owns the 10s setTimeout-based timer loop
 *   - Generates a unique traceId (UUIDv4) per tick
 *   - Dispatches IProvider.getGasMetrics() and ICollector.collectNodeMetrics()
 *     in parallel via Promise.allSettled
 *   - Wraps each call with timing and error normalization
 *   - Merges results into SubnetSnapshot respecting partial-state rules
 *   - Writes snapshot to IStateStore
 *   - Passes snapshot to IAnalysisService (no-op in Step 1)
 *   - Tracks consecutive failure counters per source
 *   - Logs all events with the cycle's traceId
 *   - Schedules next tick AFTER current tick completes (never overlapping)
 */
export interface IOrchestrator {
  /** Start the polling loop. Idempotent — calling twice is a no-op. */
  start(): void;

  /** Stop the polling loop. The in-flight tick completes but no new tick fires. */
  stop(): void;

  /** Returns true if the polling loop is currently active. */
  isRunning(): boolean;

  /** Force a single tick outside the timer. Useful for testing. */
  triggerTick(): Promise<void>;
}
