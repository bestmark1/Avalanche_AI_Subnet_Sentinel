"use strict";
// src/errors/SentinelErrors.ts
// Custom error types per ARCHITECTURE.md Section 8.5
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricParseError = exports.CollectorTimeoutError = exports.CollectorError = exports.ProviderError = void 0;
/**
 * ProviderError — Thrown when all RPC retry attempts are exhausted
 * or the overall timeout is exceeded.
 */
class ProviderError extends Error {
    attempt;
    maxAttempts;
    cause;
    constructor(message, attempt, maxAttempts, cause) {
        super(message);
        this.name = 'ProviderError';
        this.attempt = attempt;
        this.maxAttempts = maxAttempts;
        this.cause = cause;
        // Maintain proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, ProviderError.prototype);
    }
}
exports.ProviderError = ProviderError;
/**
 * CollectorError — Base error for all metrics collection failures.
 */
class CollectorError extends Error {
    metricName;
    cause;
    constructor(message, metricName, cause) {
        super(message);
        this.name = 'CollectorError';
        this.metricName = metricName;
        this.cause = cause;
        Object.setPrototypeOf(this, CollectorError.prototype);
    }
}
exports.CollectorError = CollectorError;
/**
 * CollectorTimeoutError — Thrown when the /ext/metrics fetch
 * exceeds the configured timeout (default 5s).
 */
class CollectorTimeoutError extends CollectorError {
    timeoutMs;
    constructor(timeoutMs, cause) {
        super(`Metrics fetch timed out after ${timeoutMs}ms`, 'timeout', cause);
        this.name = 'CollectorTimeoutError';
        this.timeoutMs = timeoutMs;
        Object.setPrototypeOf(this, CollectorTimeoutError.prototype);
    }
}
exports.CollectorTimeoutError = CollectorTimeoutError;
/**
 * MetricParseError — Thrown when a required metric name
 * is not found in the Prometheus response body.
 */
class MetricParseError extends CollectorError {
    constructor(metricName) {
        super(`Metric "${metricName}" not found in Prometheus response body`, metricName);
        this.name = 'MetricParseError';
        Object.setPrototypeOf(this, MetricParseError.prototype);
    }
}
exports.MetricParseError = MetricParseError;
//# sourceMappingURL=SentinelErrors.js.map