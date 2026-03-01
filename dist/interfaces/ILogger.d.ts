/**
 * ILogger — Structured JSON Logger
 *
 * Emits one JSON object per line to stdout (NDJSON format).
 * Supports traceId correlation and component-scoped child loggers.
 * Step 1: Built on console.log + JSON.stringify (zero dependencies).
 * Future: Swappable for winston/pino via DI.
 */
export interface ILogger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
    /** Creates a child logger scoped to a component with an inherited traceId. */
    child(context: {
        component: string;
        traceId?: string;
    }): ILogger;
}
//# sourceMappingURL=ILogger.d.ts.map