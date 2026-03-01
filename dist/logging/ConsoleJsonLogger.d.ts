import type { ILogger } from '../interfaces/ILogger.js';
/**
 * ConsoleJsonLogger — Structured JSON Logger
 *
 * Writes one JSON object per line to stdout (NDJSON format).
 * Supports:
 *   - Configurable minimum log level
 *   - traceId correlation across polling cycles
 *   - Component-scoped child loggers via child()
 *
 * Design decisions:
 *   - Uses console.log (not process.stdout.write) for simplicity.
 *     console.log appends \n automatically, producing clean NDJSON.
 *   - JSON.stringify is called once per log entry — no partial writes.
 *   - Child loggers inherit the parent's minLevel and override component/traceId.
 */
export declare class ConsoleJsonLogger implements ILogger {
    private readonly minPriority;
    private readonly component;
    private readonly traceId;
    /**
     * @param minLevel  - Minimum log level to emit (e.g., "info" suppresses "debug")
     * @param component - Component name attached to every log entry (default: "main")
     * @param traceId   - Correlation ID inherited from parent or polling cycle (default: "")
     */
    constructor(minLevel?: string, component?: string, traceId?: string);
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
    /**
     * Creates a child logger that inherits the parent's minimum log level.
     * The child overrides component and optionally traceId.
     *
     * If the child context provides a traceId, it takes precedence.
     * Otherwise, the parent's traceId is inherited.
     *
     * Usage:
     *   const tickLogger = logger.child({ component: "orchestrator", traceId: "abc-123" })
     *   tickLogger.info("cycle_start")  // → { ..., component: "orchestrator", traceId: "abc-123" }
     */
    child(context: {
        component: string;
        traceId?: string;
    }): ILogger;
    /**
     * Core emit method. Checks level priority, builds the LogEntry,
     * serializes to JSON, and writes to stdout.
     */
    private emit;
    /**
     * Reverse-maps the numeric priority back to a level string.
     * Used when creating child loggers that inherit the parent's level.
     */
    private getMinLevelString;
}
//# sourceMappingURL=ConsoleJsonLogger.d.ts.map