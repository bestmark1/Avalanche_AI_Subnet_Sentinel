// src/services/PrometheusMetricsCollector.ts
// Implements ICollector — Prometheus text scraper with regex extraction.
// Single-attempt fetch, configurable timeout, structured error wrapping.

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ICollector } from '../interfaces/ICollector.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { NodeMetricsData } from '../types/models.js';
import type { AppConfig } from '../config/AppConfig.js';
import {
  CollectorError,
  CollectorTimeoutError,
  MetricParseError,
} from '../errors/SentinelErrors.js';

// ── Regex Patterns ───────────────────────────────────────────────
// Named capture group "value" extracts the numeric portion.
// Supports standard decimal (42.7), integer (15), and scientific
// notation (4.27e+01, 1.5E-3) as emitted by some Prometheus exporters.
// The `m` flag enables ^ to match at the start of any line.
//
// Per ARCHITECTURE.md Appendix A:

const CPU_REGEX =
  /^avalanche_node_cpu_usage\s+(?<value>[\d.]+(?:[eE][+-]?\d+)?)/m;

const LATENCY_REGEX =
  /^avalanche_node_network_latency\s+(?<value>[\d.]+(?:[eE][+-]?\d+)?)/m;

/**
 * PrometheusMetricsCollector — Prometheus /ext/metrics Scraper
 *
 * Fetches raw Prometheus exposition text from the configured endpoint
 * and extracts exactly two metrics via named-capture-group regex:
 *   1. avalanche_node_cpu_usage       (float, 0–100 percentage)
 *   2. avalanche_node_network_latency (float, milliseconds)
 *
 * Design constraints:
 *   - Single attempt per tick — NO retry (the orchestrator handles
 *     consecutive-failure tracking and staleness marking)
 *   - Hard timeout via Axios config (default 5s, configurable)
 *   - All failures wrapped in structured CollectorError subclasses
 *     so the orchestrator can catch them with Promise.allSettled
 *     and produce a CollectorFailure result — the app never crashes
 *   - All failures logged as WARN (auxiliary data, not critical)
 *
 * SOLID:
 *   - Single Responsibility: Only fetches + parses Prometheus text
 *   - Dependency Inversion: Orchestrator depends on ICollector, not Axios
 */
export class PrometheusMetricsCollector implements ICollector {
  private readonly client: AxiosInstance;
  private readonly logger: ILogger;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: AppConfig['metrics'], logger: ILogger) {
    this.endpoint = config.endpoint;
    this.timeoutMs = config.timeoutMs;
    this.logger = logger.child({ component: 'metrics-collector' });

    this.client = axios.create({
      timeout: this.timeoutMs,
      headers: { Accept: 'text/plain' },
      // Only treat 2xx as success — 404, 5xx etc. go to catch block
      validateStatus: (status: number) => status >= 200 && status < 300,
    });
  }

  /**
   * Fetches the Prometheus metrics endpoint and regex-parses the
   * two target metrics.
   *
   * @returns NodeMetricsData with cpuUsage and networkLatency
   * @throws {CollectorTimeoutError} if the HTTP request exceeds timeoutMs
   * @throws {MetricParseError} if a metric line is missing or its value is NaN
   * @throws {CollectorError} for any other HTTP/network failure
   */
  public async collectNodeMetrics(): Promise<NodeMetricsData> {
    const startMs = Date.now();

    this.logger.debug('metrics_fetch_start', {
      endpoint: this.endpoint,
    });

    // ── Step 1: Fetch raw Prometheus text ──
    let body: string;
    try {
      const response = await this.client.get<string>(this.endpoint, {
        responseType: 'text',
      });
      body = response.data;
    } catch (error: unknown) {
      const durationMs = Date.now() - startMs;
      this.handleFetchError(error, durationMs);

      // handleFetchError always throws — this line is unreachable
      // but satisfies TypeScript's control flow analysis
      /* istanbul ignore next */
      throw error;
    }

    // ── Step 2: Regex-parse both metrics ──
    const metrics = this.parseMetrics(body);

    const durationMs = Date.now() - startMs;
    this.logger.debug('metrics_fetch_success', {
      cpuUsage: metrics.cpuUsage,
      networkLatency: metrics.networkLatency,
      durationMs,
    });

    return metrics;
  }

  // ── Private: Fetch Error Handler ─────────────────────────────

  /**
   * Classifies Axios errors into structured CollectorError subclasses.
   * Logs all failures as WARN (metrics are auxiliary, not critical).
   *
   * @throws {CollectorTimeoutError} on Axios timeout (ECONNABORTED / ETIMEDOUT)
   * @throws {CollectorError} on any other HTTP or network failure
   */
  private handleFetchError(error: unknown, durationMs: number): never {
    const cause = error instanceof Error ? error : undefined;

    // ── Timeout detection ──
    if (this.isTimeoutError(error)) {
      this.logger.warn('metrics_fetch_timeout', {
        endpoint: this.endpoint,
        timeoutMs: this.timeoutMs,
        durationMs,
      });
      throw new CollectorTimeoutError(this.timeoutMs, cause);
    }

    // ── HTTP error (4xx/5xx) or network error ──
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus = this.extractHttpStatus(error);

    this.logger.warn('metrics_fetch_failed', {
      endpoint: this.endpoint,
      httpStatus,
      durationMs,
      error: message,
    });

    throw new CollectorError(
      `Metrics fetch failed: ${message}`,
      'http',
      cause
    );
  }

  // ── Private: Regex Parser ────────────────────────────────────

  /**
   * Applies both regex patterns to the Prometheus text body.
   * Extracts cpuUsage and networkLatency as parsed floats.
   *
   * @throws {MetricParseError} if a metric line is missing or its value is NaN
   */
  private parseMetrics(body: string): NodeMetricsData {
    const cpuUsage = this.extractFloat(
      body,
      'avalanche_node_cpu_usage',
      CPU_REGEX
    );

    const networkLatency = this.extractFloat(
      body,
      'avalanche_node_network_latency',
      LATENCY_REGEX
    );

    return { cpuUsage, networkLatency };
  }

  /**
   * Applies a single regex to the body and returns the parsed float.
   *
   * @param body       Raw Prometheus exposition text
   * @param metricName Human-readable metric name (for error messages)
   * @param pattern    Regex with a named capture group "value"
   * @returns          The parsed float value
   * @throws {MetricParseError} if the regex doesn't match or parseFloat yields NaN
   */
  private extractFloat(
    body: string,
    metricName: string,
    pattern: RegExp
  ): number {
    const match = pattern.exec(body);

    if (!match?.groups?.['value']) {
      this.logger.warn('metrics_parse_missing', { metricName });
      throw new MetricParseError(metricName);
    }

    const raw = match.groups['value'];
    const parsed = parseFloat(raw);

    if (!Number.isFinite(parsed)) {
      this.logger.warn('metrics_parse_invalid', {
        metricName,
        rawValue: raw,
      });
      throw new MetricParseError(metricName);
    }

    return parsed;
  }

  // ── Private: Error Classification Helpers ─────────────────────

  /**
   * Detects Axios timeout errors.
   * Axios sets error.code to 'ECONNABORTED' or 'ETIMEDOUT' on timeout.
   * Some Axios versions also include 'timeout' in the message.
   */
  private isTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const shaped = error as { code?: string; message?: string };
    return (
      shaped.code === 'ECONNABORTED' ||
      shaped.code === 'ETIMEDOUT' ||
      (typeof shaped.message === 'string' &&
        shaped.message.toLowerCase().includes('timeout'))
    );
  }

  /**
   * Extracts the HTTP status code from an Axios error response.
   * Returns null if the error has no response (e.g., network failure).
   */
  private extractHttpStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const shaped = error as { response?: { status?: number } };
    return typeof shaped.response?.status === 'number'
      ? shaped.response.status
      : null;
  }
}
