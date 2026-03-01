import type { NodeMetricsData } from '../types/models.js';
/**
 * ICollector — Prometheus Metrics Scraper & Regex Parser
 *
 * Responsibilities:
 *   - Fetches raw Prometheus text from /ext/metrics via Axios
 *   - Parses two specific metrics using named-capture-group regex:
 *       CPU:     /^avalanche_node_cpu_usage\s+(?<value>[\d.]+(?:e[+-]?\d+)?)/m
 *       Latency: /^avalanche_node_network_latency\s+(?<value>[\d.]+(?:e[+-]?\d+)?)/m
 *   - Enforces 5s request timeout via Axios config
 *   - Does NOT retry within a tick (single attempt)
 *   - Returns strongly-typed NodeMetricsData or throws
 *
 * SOLID Alignment:
 *   - Single Responsibility: Only handles metrics fetching & text parsing
 *   - Interface Segregation: No concern with RPC data
 *   - Dependency Inversion: Orchestrator depends on ICollector, not Axios
 */
export interface ICollector {
    /**
     * Fetches /ext/metrics and regex-parses the target metrics.
     *
     * @throws {CollectorTimeoutError} if the 5s timeout is exceeded
     * @throws {MetricParseError} if a required metric is not found in the response
     * @throws {CollectorError} if the HTTP request fails for any other reason
     */
    collectNodeMetrics(): Promise<NodeMetricsData>;
}
//# sourceMappingURL=ICollector.d.ts.map