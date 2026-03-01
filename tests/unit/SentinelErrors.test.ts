// tests/unit/SentinelErrors.test.ts
// Verifies custom error types, prototype chain, and instanceof checks

import { describe, it, expect } from 'vitest';
import {
  ProviderError,
  CollectorError,
  CollectorTimeoutError,
  MetricParseError,
} from '../../src/errors/SentinelErrors.js';

describe('ProviderError', () => {
  it('sets name, message, attempt, and maxAttempts', () => {
    const err = new ProviderError('RPC call failed', 2, 3);

    expect(err.name).toBe('ProviderError');
    expect(err.message).toBe('RPC call failed');
    expect(err.attempt).toBe(2);
    expect(err.maxAttempts).toBe(3);
    expect(err.cause).toBeUndefined();
  });

  it('is an instanceof Error', () => {
    const err = new ProviderError('fail', 1, 3);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderError);
  });

  it('stores a cause error when provided', () => {
    const cause = new Error('network timeout');
    const err = new ProviderError('RPC failed', 3, 3, cause);

    expect(err.cause).toBe(cause);
    expect(err.cause?.message).toBe('network timeout');
  });
});

describe('CollectorError', () => {
  it('sets name, message, and metricName', () => {
    const err = new CollectorError('fetch failed', 'cpu_usage');

    expect(err.name).toBe('CollectorError');
    expect(err.message).toBe('fetch failed');
    expect(err.metricName).toBe('cpu_usage');
  });

  it('is an instanceof Error', () => {
    const err = new CollectorError('fail', 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CollectorError);
  });
});

describe('CollectorTimeoutError', () => {
  it('builds a descriptive message from timeoutMs', () => {
    const err = new CollectorTimeoutError(5000);

    expect(err.name).toBe('CollectorTimeoutError');
    expect(err.message).toBe('Metrics fetch timed out after 5000ms');
    expect(err.timeoutMs).toBe(5000);
    expect(err.metricName).toBe('timeout');
  });

  it('is an instanceof CollectorError and Error', () => {
    const err = new CollectorTimeoutError(5000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CollectorError);
    expect(err).toBeInstanceOf(CollectorTimeoutError);
  });
});

describe('MetricParseError', () => {
  it('builds a descriptive message from metricName', () => {
    const err = new MetricParseError('avalanche_node_cpu_usage');

    expect(err.name).toBe('MetricParseError');
    expect(err.message).toBe(
      'Metric "avalanche_node_cpu_usage" not found in Prometheus response body'
    );
    expect(err.metricName).toBe('avalanche_node_cpu_usage');
  });

  it('is an instanceof CollectorError and Error', () => {
    const err = new MetricParseError('test_metric');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CollectorError);
    expect(err).toBeInstanceOf(MetricParseError);
  });

  it('is NOT an instanceof CollectorTimeoutError', () => {
    const err = new MetricParseError('test_metric');
    expect(err).not.toBeInstanceOf(CollectorTimeoutError);
  });
});
