/**
 * ProviderError — Thrown when all RPC retry attempts are exhausted
 * or the overall timeout is exceeded.
 */
export declare class ProviderError extends Error {
    readonly attempt: number;
    readonly maxAttempts: number;
    readonly cause?: Error;
    constructor(message: string, attempt: number, maxAttempts: number, cause?: Error);
}
/**
 * CollectorError — Base error for all metrics collection failures.
 */
export declare class CollectorError extends Error {
    readonly metricName: string;
    readonly cause?: Error;
    constructor(message: string, metricName: string, cause?: Error);
}
/**
 * CollectorTimeoutError — Thrown when the /ext/metrics fetch
 * exceeds the configured timeout (default 5s).
 */
export declare class CollectorTimeoutError extends CollectorError {
    readonly timeoutMs: number;
    constructor(timeoutMs: number, cause?: Error);
}
/**
 * MetricParseError — Thrown when a required metric name
 * is not found in the Prometheus response body.
 */
export declare class MetricParseError extends CollectorError {
    constructor(metricName: string);
}
//# sourceMappingURL=SentinelErrors.d.ts.map