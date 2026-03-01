import type { ICollector } from '../interfaces/ICollector.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { NodeMetricsData } from '../types/models.js';
import type { AppConfig } from '../config/AppConfig.js';
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
export declare class PrometheusMetricsCollector implements ICollector {
    private readonly client;
    private readonly logger;
    private readonly endpoint;
    private readonly timeoutMs;
    constructor(config: AppConfig['metrics'], logger: ILogger);
    /**
     * Fetches the Prometheus metrics endpoint and regex-parses the
     * two target metrics.
     *
     * @returns NodeMetricsData with cpuUsage and networkLatency
     * @throws {CollectorTimeoutError} if the HTTP request exceeds timeoutMs
     * @throws {MetricParseError} if a metric line is missing or its value is NaN
     * @throws {CollectorError} for any other HTTP/network failure
     */
    collectNodeMetrics(): Promise<NodeMetricsData>;
    /**
     * Classifies Axios errors into structured CollectorError subclasses.
     * Logs all failures as WARN (metrics are auxiliary, not critical).
     *
     * @throws {CollectorTimeoutError} on Axios timeout (ECONNABORTED / ETIMEDOUT)
     * @throws {CollectorError} on any other HTTP or network failure
     */
    private handleFetchError;
    /**
     * Applies both regex patterns to the Prometheus text body.
     * Extracts cpuUsage and networkLatency as parsed floats.
     *
     * @throws {MetricParseError} if a metric line is missing or its value is NaN
     */
    private parseMetrics;
    /**
     * Applies a single regex to the body and returns the parsed float.
     *
     * @param body       Raw Prometheus exposition text
     * @param metricName Human-readable metric name (for error messages)
     * @param pattern    Regex with a named capture group "value"
     * @returns          The parsed float value
     * @throws {MetricParseError} if the regex doesn't match or parseFloat yields NaN
     */
    private extractFloat;
    /**
     * Detects Axios timeout errors.
     * Axios sets error.code to 'ECONNABORTED' or 'ETIMEDOUT' on timeout.
     * Some Axios versions also include 'timeout' in the message.
     */
    private isTimeoutError;
    /**
     * Extracts the HTTP status code from an Axios error response.
     * Returns null if the error has no response (e.g., network failure).
     */
    private extractHttpStatus;
}
//# sourceMappingURL=PrometheusMetricsCollector.d.ts.map