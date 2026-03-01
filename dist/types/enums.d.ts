/** Log severity levels */
export declare enum LogLevel {
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error"
}
/** Health status of a data source within a snapshot */
export declare enum SourceStatus {
    CURRENT = "current",// Data fetched successfully this cycle
    STALE = "stale",// Using last-known-good; source failed this cycle
    UNKNOWN = "unknown"
}
/** Alert severity derived from consecutive failure count */
export declare enum AlertSeverity {
    NONE = "none",
    WARNING = "warning",// >= 3 consecutive failures
    CRITICAL = "critical"
}
/** Failure thresholds — centralized, not magic numbers */
export declare const FAILURE_THRESHOLDS: {
    readonly WARN_AFTER: 3;
    readonly ERROR_AFTER: 10;
};
/** Timing constants (milliseconds) */
export declare const TIMING: {
    readonly TICK_INTERVAL_MS: 10000;
    readonly SOURCE_TIMEOUT_MS: 5000;
    readonly RPC_RETRY_COUNT: 3;
    readonly RPC_RETRY_BASE_MS: 500;
};
//# sourceMappingURL=enums.d.ts.map