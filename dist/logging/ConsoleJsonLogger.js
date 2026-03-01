"use strict";
// src/logging/ConsoleJsonLogger.ts
// Implements ILogger — Structured NDJSON to stdout with traceId correlation.
// Zero external dependencies. Swappable for winston/pino via DI in future.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleJsonLogger = void 0;
const enums_js_1 = require("../types/enums.js");
/**
 * Numeric priority for log levels.
 * Lower number = more verbose. A log entry is emitted only when
 * its priority >= the configured minimum level's priority.
 */
const LOG_LEVEL_PRIORITY = {
    [enums_js_1.LogLevel.DEBUG]: 0,
    [enums_js_1.LogLevel.INFO]: 1,
    [enums_js_1.LogLevel.WARN]: 2,
    [enums_js_1.LogLevel.ERROR]: 3,
};
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
class ConsoleJsonLogger {
    minPriority;
    component;
    traceId;
    /**
     * @param minLevel  - Minimum log level to emit (e.g., "info" suppresses "debug")
     * @param component - Component name attached to every log entry (default: "main")
     * @param traceId   - Correlation ID inherited from parent or polling cycle (default: "")
     */
    constructor(minLevel = enums_js_1.LogLevel.INFO, component = 'main', traceId = '') {
        const priority = LOG_LEVEL_PRIORITY[minLevel.toLowerCase()];
        if (priority === undefined) {
            throw new Error(`[LOGGER ERROR] Invalid log level: "${minLevel}". ` +
                `Must be one of: debug, info, warn, error.`);
        }
        this.minPriority = priority;
        this.component = component;
        this.traceId = traceId;
    }
    debug(message, data) {
        this.emit(enums_js_1.LogLevel.DEBUG, message, data);
    }
    info(message, data) {
        this.emit(enums_js_1.LogLevel.INFO, message, data);
    }
    warn(message, data) {
        this.emit(enums_js_1.LogLevel.WARN, message, data);
    }
    error(message, data) {
        this.emit(enums_js_1.LogLevel.ERROR, message, data);
    }
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
    child(context) {
        return new ConsoleJsonLogger(this.getMinLevelString(), context.component, context.traceId ?? this.traceId);
    }
    // ── Private ──────────────────────────────────────────────────────
    /**
     * Core emit method. Checks level priority, builds the LogEntry,
     * serializes to JSON, and writes to stdout.
     */
    emit(level, message, data) {
        const priority = LOG_LEVEL_PRIORITY[level];
        if (priority === undefined || priority < this.minPriority) {
            return; // Suppress log entries below the configured minimum level
        }
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            traceId: this.traceId,
            component: this.component,
            message,
            ...(data !== undefined && { data }),
        };
        // Single atomic write — one JSON object per line (NDJSON)
        console.log(JSON.stringify(entry));
    }
    /**
     * Reverse-maps the numeric priority back to a level string.
     * Used when creating child loggers that inherit the parent's level.
     */
    getMinLevelString() {
        for (const [level, priority] of Object.entries(LOG_LEVEL_PRIORITY)) {
            if (priority === this.minPriority) {
                return level;
            }
        }
        return enums_js_1.LogLevel.INFO; // Fallback (should never happen)
    }
}
exports.ConsoleJsonLogger = ConsoleJsonLogger;
//# sourceMappingURL=ConsoleJsonLogger.js.map