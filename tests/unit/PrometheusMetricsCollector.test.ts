// tests/unit/PrometheusMetricsCollector.test.ts
// Phase 3 DoD — all 8 verification checklist items

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrometheusMetricsCollector } from '../../src/services/PrometheusMetricsCollector.js';
import {
  CollectorError,
  CollectorTimeoutError,
  MetricParseError,
} from '../../src/errors/SentinelErrors.js';
import type { ILogger } from '../../src/interfaces/ILogger.js';
import type { AppConfig } from '../../src/config/AppConfig.js';

// ── Mock Axios ───────────────────────────────────────────────────
// vi.mock is hoisted above all imports, so we must use vi.hoisted()
// to declare mock functions that the factory can reference safely.

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: mockGet,
    }),
  },
}));

// ── Logger mock ──────────────────────────────────────────────────

function createMockLogger(): ILogger & {
  calls: { method: string; message: string; data?: Record<string, unknown> }[];
} {
  const calls: { method: string; message: string; data?: Record<string, unknown> }[] = [];

  const logger: ILogger & { calls: typeof calls } = {
    calls,
    debug(message: string, data?: Record<string, unknown>) {
      calls.push({ method: 'debug', message, data });
    },
    info(message: string, data?: Record<string, unknown>) {
      calls.push({ method: 'info', message, data });
    },
    warn(message: string, data?: Record<string, unknown>) {
      calls.push({ method: 'warn', message, data });
    },
    error(message: string, data?: Record<string, unknown>) {
      calls.push({ method: 'error', message, data });
    },
    child(_context: { component: string; traceId?: string }): ILogger {
      return logger;
    },
  };

  return logger;
}

// ── Test config ──────────────────────────────────────────────────

function createTestConfig(
  overrides?: Partial<AppConfig['metrics']>
): AppConfig['metrics'] {
  return {
    endpoint: 'http://localhost:9650/ext/metrics',
    timeoutMs: 5000,
    ...overrides,
  };
}

// ── Sample Prometheus text blobs ─────────────────────────────────

/** Standard Prometheus text with both metrics present (decimal values) */
const PROMETHEUS_STANDARD = `
# HELP avalanche_node_cpu_usage Current CPU usage
# TYPE avalanche_node_cpu_usage gauge
avalanche_node_cpu_usage 42.7
# HELP avalanche_node_network_latency Network latency in ms
# TYPE avalanche_node_network_latency gauge
avalanche_node_network_latency 15.3
# HELP some_other_metric Some other metric
# TYPE some_other_metric counter
some_other_metric 9999
`.trim();

/** Prometheus text with scientific notation values */
const PROMETHEUS_SCIENTIFIC = `
# HELP avalanche_node_cpu_usage Current CPU usage
# TYPE avalanche_node_cpu_usage gauge
avalanche_node_cpu_usage 4.27e+01
# HELP avalanche_node_network_latency Network latency in ms
# TYPE avalanche_node_network_latency gauge
avalanche_node_network_latency 1.53E+01
`.trim();

/** Prometheus text with ONLY latency — CPU metric is missing */
const PROMETHEUS_MISSING_CPU = `
# HELP avalanche_node_network_latency Network latency in ms
# TYPE avalanche_node_network_latency gauge
avalanche_node_network_latency 15.3
# HELP some_other_metric Some other metric
some_other_metric 42
`.trim();

/** Prometheus text with ONLY cpu — latency metric is missing */
const PROMETHEUS_MISSING_LATENCY = `
# HELP avalanche_node_cpu_usage Current CPU usage
# TYPE avalanche_node_cpu_usage gauge
avalanche_node_cpu_usage 42.7
# HELP some_other_metric Some other metric
some_other_metric 99
`.trim();

/** Prometheus text with integer values (no decimal point) */
const PROMETHEUS_INTEGERS = `
avalanche_node_cpu_usage 85
avalanche_node_network_latency 7
`.trim();

/** Prometheus text with zero values */
const PROMETHEUS_ZEROES = `
avalanche_node_cpu_usage 0
avalanche_node_network_latency 0.0
`.trim();

// ════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════

describe('PrometheusMetricsCollector', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockGet.mockReset();
    logger = createMockLogger();
  });

  // ── DoD #2: SUCCESSFUL PARSE ─────────────────────────────────

  describe('collectNodeMetrics() — SUCCESSFUL PARSE', () => {
    it('returns correct NodeMetricsData from standard Prometheus text', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_STANDARD });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);
      const result = await collector.collectNodeMetrics();

      expect(result).toEqual({
        cpuUsage: 42.7,
        networkLatency: 15.3,
      });
    });

    it('logs metrics_fetch_start and metrics_fetch_success', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_STANDARD });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);
      await collector.collectNodeMetrics();

      const messages = logger.calls.map((c) => c.message);
      expect(messages).toContain('metrics_fetch_start');
      expect(messages).toContain('metrics_fetch_success');
    });

    it('parses integer values without decimal points', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_INTEGERS });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);
      const result = await collector.collectNodeMetrics();

      expect(result.cpuUsage).toBe(85);
      expect(result.networkLatency).toBe(7);
    });

    it('handles zero values correctly', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_ZEROES });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);
      const result = await collector.collectNodeMetrics();

      expect(result.cpuUsage).toBe(0);
      expect(result.networkLatency).toBe(0);
    });
  });

  // ── DoD #3: SCIENTIFIC NOTATION ──────────────────────────────

  describe('collectNodeMetrics() — SCIENTIFIC NOTATION', () => {
    it('correctly parses scientific notation (e.g., 4.27e+01 → 42.7)', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_SCIENTIFIC });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);
      const result = await collector.collectNodeMetrics();

      expect(result.cpuUsage).toBeCloseTo(42.7, 5);
      expect(result.networkLatency).toBeCloseTo(15.3, 5);
    });

    it('handles lowercase and uppercase E in exponent', async () => {
      const body = [
        'avalanche_node_cpu_usage 1.5e-1',
        'avalanche_node_network_latency 2.0E+2',
      ].join('\n');
      mockGet.mockResolvedValueOnce({ data: body });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);
      const result = await collector.collectNodeMetrics();

      expect(result.cpuUsage).toBeCloseTo(0.15, 5);
      expect(result.networkLatency).toBeCloseTo(200, 5);
    });
  });

  // ── DoD #4: MISSING CPU METRIC ───────────────────────────────

  describe('collectNodeMetrics() — MISSING CPU METRIC', () => {
    it('throws MetricParseError when avalanche_node_cpu_usage is absent', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_MISSING_CPU });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: MetricParseError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as MetricParseError;
      }

      expect(caught).toBeInstanceOf(MetricParseError);
      expect(caught!.metricName).toBe('avalanche_node_cpu_usage');
    });

    it('logs metrics_parse_missing as WARN (not ERROR)', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_MISSING_CPU });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      try { await collector.collectNodeMetrics(); } catch { /* expected */ }

      const parseLogs = logger.calls.filter(
        (c) => c.message === 'metrics_parse_missing' && c.method === 'warn'
      );
      expect(parseLogs).toHaveLength(1);
      expect(parseLogs[0].data?.metricName).toBe('avalanche_node_cpu_usage');
    });
  });

  // ── DoD #5: MISSING LATENCY METRIC ───────────────────────────

  describe('collectNodeMetrics() — MISSING LATENCY METRIC', () => {
    it('throws MetricParseError when avalanche_node_network_latency is absent', async () => {
      mockGet.mockResolvedValueOnce({ data: PROMETHEUS_MISSING_LATENCY });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: MetricParseError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as MetricParseError;
      }

      expect(caught).toBeInstanceOf(MetricParseError);
      expect(caught!.metricName).toBe('avalanche_node_network_latency');
    });
  });

  // ── DoD #6: TIMEOUT ──────────────────────────────────────────

  describe('collectNodeMetrics() — TIMEOUT', () => {
    it('throws CollectorTimeoutError on Axios ECONNABORTED', async () => {
      const timeoutErr = new Error('timeout of 5000ms exceeded');
      (timeoutErr as Error & { code: string }).code = 'ECONNABORTED';
      mockGet.mockRejectedValueOnce(timeoutErr);

      const collector = new PrometheusMetricsCollector(
        createTestConfig({ timeoutMs: 5000 }),
        logger
      );

      let caught: CollectorTimeoutError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as CollectorTimeoutError;
      }

      expect(caught).toBeInstanceOf(CollectorTimeoutError);
      expect(caught!.timeoutMs).toBe(5000);
    });

    it('throws CollectorTimeoutError on Axios ETIMEDOUT', async () => {
      const timeoutErr = new Error('connect ETIMEDOUT');
      (timeoutErr as Error & { code: string }).code = 'ETIMEDOUT';
      mockGet.mockRejectedValueOnce(timeoutErr);

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: CollectorTimeoutError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as CollectorTimeoutError;
      }

      expect(caught).toBeInstanceOf(CollectorTimeoutError);
    });

    it('logs metrics_fetch_timeout as WARN', async () => {
      const timeoutErr = new Error('timeout of 5000ms exceeded');
      (timeoutErr as Error & { code: string }).code = 'ECONNABORTED';
      mockGet.mockRejectedValueOnce(timeoutErr);

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      try { await collector.collectNodeMetrics(); } catch { /* expected */ }

      const timeoutLogs = logger.calls.filter(
        (c) => c.message === 'metrics_fetch_timeout' && c.method === 'warn'
      );
      expect(timeoutLogs).toHaveLength(1);
      expect(timeoutLogs[0].data?.timeoutMs).toBe(5000);
    });
  });

  // ── DoD #7: NETWORK ERROR ────────────────────────────────────

  describe('collectNodeMetrics() — NETWORK ERROR', () => {
    it('throws CollectorError (not CollectorTimeoutError) on ECONNREFUSED', async () => {
      const networkErr = new Error('connect ECONNREFUSED 127.0.0.1:9650');
      (networkErr as Error & { code: string }).code = 'ECONNREFUSED';
      mockGet.mockRejectedValueOnce(networkErr);

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: CollectorError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as CollectorError;
      }

      expect(caught).toBeInstanceOf(CollectorError);
      // Must NOT be the timeout subclass
      expect(caught).not.toBeInstanceOf(CollectorTimeoutError);
      expect(caught!.metricName).toBe('http');
    });

    it('throws CollectorError on HTTP 404 response', async () => {
      const notFoundErr = new Error('Request failed with status code 404');
      (notFoundErr as Error & { response: { status: number } }).response = {
        status: 404,
      };
      mockGet.mockRejectedValueOnce(notFoundErr);

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: CollectorError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as CollectorError;
      }

      expect(caught).toBeInstanceOf(CollectorError);
      expect(caught).not.toBeInstanceOf(CollectorTimeoutError);
    });

    it('logs metrics_fetch_failed with httpStatus as WARN', async () => {
      const serverErr = new Error('Request failed with status code 500');
      (serverErr as Error & { response: { status: number } }).response = {
        status: 500,
      };
      mockGet.mockRejectedValueOnce(serverErr);

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      try { await collector.collectNodeMetrics(); } catch { /* expected */ }

      const failLogs = logger.calls.filter(
        (c) => c.message === 'metrics_fetch_failed' && c.method === 'warn'
      );
      expect(failLogs).toHaveLength(1);
      expect(failLogs[0].data?.httpStatus).toBe(500);
    });
  });

  // ── DoD #8: EMPTY RESPONSE BODY ──────────────────────────────

  describe('collectNodeMetrics() — EMPTY RESPONSE BODY', () => {
    it('throws MetricParseError for the first metric on empty string', async () => {
      mockGet.mockResolvedValueOnce({ data: '' });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: MetricParseError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as MetricParseError;
      }

      expect(caught).toBeInstanceOf(MetricParseError);
      expect(caught!.metricName).toBe('avalanche_node_cpu_usage');
    });

    it('throws MetricParseError on response with only comments/headers', async () => {
      const headersOnly = [
        '# HELP some_metric Some metric',
        '# TYPE some_metric gauge',
        'some_metric 42',
      ].join('\n');
      mockGet.mockResolvedValueOnce({ data: headersOnly });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: MetricParseError | undefined;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error as MetricParseError;
      }

      expect(caught).toBeInstanceOf(MetricParseError);
      expect(caught!.metricName).toBe('avalanche_node_cpu_usage');
    });
  });

  // ── Extra: error hierarchy correctness ────────────────────────

  describe('error class hierarchy', () => {
    it('CollectorTimeoutError is a subclass of CollectorError', async () => {
      const timeoutErr = new Error('timeout');
      (timeoutErr as Error & { code: string }).code = 'ECONNABORTED';
      mockGet.mockRejectedValueOnce(timeoutErr);

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: unknown;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error;
      }

      // CollectorTimeoutError extends CollectorError extends Error
      expect(caught).toBeInstanceOf(CollectorTimeoutError);
      expect(caught).toBeInstanceOf(CollectorError);
      expect(caught).toBeInstanceOf(Error);
    });

    it('MetricParseError is a subclass of CollectorError', async () => {
      mockGet.mockResolvedValueOnce({ data: '' });

      const collector = new PrometheusMetricsCollector(createTestConfig(), logger);

      let caught: unknown;
      try {
        await collector.collectNodeMetrics();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(MetricParseError);
      expect(caught).toBeInstanceOf(CollectorError);
      expect(caught).toBeInstanceOf(Error);
    });
  });
});
