// src/errors/SentinelErrors.ts
// Custom error types per ARCHITECTURE.md Section 8.5

/**
 * ProviderError — Thrown when all RPC retry attempts are exhausted
 * or the overall timeout is exceeded.
 */
export class ProviderError extends Error {
  public readonly attempt: number;
  public readonly maxAttempts: number;
  public override readonly cause?: Error;

  constructor(
    message: string,
    attempt: number,
    maxAttempts: number,
    cause?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
    this.attempt = attempt;
    this.maxAttempts = maxAttempts;
    this.cause = cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/**
 * CollectorError — Base error for all metrics collection failures.
 */
export class CollectorError extends Error {
  public readonly metricName: string;
  public override readonly cause?: Error;

  constructor(
    message: string,
    metricName: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'CollectorError';
    this.metricName = metricName;
    this.cause = cause;

    Object.setPrototypeOf(this, CollectorError.prototype);
  }
}

/**
 * CollectorTimeoutError — Thrown when the /ext/metrics fetch
 * exceeds the configured timeout (default 5s).
 */
export class CollectorTimeoutError extends CollectorError {
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    cause?: Error
  ) {
    super(`Metrics fetch timed out after ${timeoutMs}ms`, 'timeout', cause);
    this.name = 'CollectorTimeoutError';
    this.timeoutMs = timeoutMs;

    Object.setPrototypeOf(this, CollectorTimeoutError.prototype);
  }
}

/**
 * MetricParseError — Thrown when a required metric name
 * is not found in the Prometheus response body.
 */
export class MetricParseError extends CollectorError {
  constructor(metricName: string) {
    super(
      `Metric "${metricName}" not found in Prometheus response body`,
      metricName
    );
    this.name = 'MetricParseError';

    Object.setPrototypeOf(this, MetricParseError.prototype);
  }
}
