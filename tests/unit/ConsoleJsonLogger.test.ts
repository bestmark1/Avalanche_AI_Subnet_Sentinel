// tests/unit/ConsoleJsonLogger.test.ts
// Phase 1 DoD — Verification Checklist Item #3: Logger manual test

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleJsonLogger } from '../../src/logging/ConsoleJsonLogger.js';

describe('ConsoleJsonLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // Helper: parse the first (or Nth) JSON line written to console.log
  function getLogEntry(callIndex: number = 0): Record<string, unknown> {
    const raw = consoleSpy.mock.calls[callIndex]?.[0] as string;
    expect(raw).toBeDefined();
    return JSON.parse(raw) as Record<string, unknown>;
  }

  // ── Basic Output Format ──────────────────────────────────────

  it('emits a valid NDJSON line with all required fields', () => {
    const logger = new ConsoleJsonLogger('debug', 'main', '');
    logger.info('service_starting', { version: '1.0.0' });

    expect(consoleSpy).toHaveBeenCalledTimes(1);

    const entry = getLogEntry();
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('level', 'info');
    expect(entry).toHaveProperty('traceId', '');
    expect(entry).toHaveProperty('component', 'main');
    expect(entry).toHaveProperty('message', 'service_starting');
    expect(entry).toHaveProperty('data');
    expect((entry.data as Record<string, unknown>).version).toBe('1.0.0');
  });

  it('produces a valid ISO-8601 timestamp', () => {
    const logger = new ConsoleJsonLogger('debug');
    logger.info('test');

    const entry = getLogEntry();
    const timestamp = entry.timestamp as string;
    expect(() => new Date(timestamp)).not.toThrow();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('omits the data field when no data is provided', () => {
    const logger = new ConsoleJsonLogger('debug');
    logger.info('no_data_message');

    const entry = getLogEntry();
    expect(entry).not.toHaveProperty('data');
  });

  // ── Log Levels ───────────────────────────────────────────────

  it('emits all four log levels with correct level strings', () => {
    const logger = new ConsoleJsonLogger('debug');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(consoleSpy).toHaveBeenCalledTimes(4);
    expect(getLogEntry(0).level).toBe('debug');
    expect(getLogEntry(1).level).toBe('info');
    expect(getLogEntry(2).level).toBe('warn');
    expect(getLogEntry(3).level).toBe('error');
  });

  it('suppresses debug logs when minLevel is "info"', () => {
    const logger = new ConsoleJsonLogger('info');

    logger.debug('should_be_suppressed');
    logger.info('should_appear');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(getLogEntry(0).message).toBe('should_appear');
  });

  it('suppresses debug and info when minLevel is "warn"', () => {
    const logger = new ConsoleJsonLogger('warn');

    logger.debug('suppressed');
    logger.info('suppressed');
    logger.warn('visible');
    logger.error('visible');

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(getLogEntry(0).level).toBe('warn');
    expect(getLogEntry(1).level).toBe('error');
  });

  it('only emits error when minLevel is "error"', () => {
    const logger = new ConsoleJsonLogger('error');

    logger.debug('no');
    logger.info('no');
    logger.warn('no');
    logger.error('yes');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(getLogEntry(0).level).toBe('error');
  });

  // ── Child Logger & traceId Correlation ───────────────────────

  it('child() creates a logger with the specified component and traceId', () => {
    const parent = new ConsoleJsonLogger('debug', 'main', '');
    const child = parent.child({ component: 'orchestrator', traceId: 'abc-123' });

    child.warn('test_warning', { key: 'value' });

    const entry = getLogEntry();
    expect(entry.component).toBe('orchestrator');
    expect(entry.traceId).toBe('abc-123');
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('test_warning');
    expect((entry.data as Record<string, unknown>).key).toBe('value');
  });

  it('child() inherits parent traceId when none provided', () => {
    const parent = new ConsoleJsonLogger('debug', 'main', 'parent-trace-id');
    const child = parent.child({ component: 'rpc-provider' });

    child.info('inherited');

    const entry = getLogEntry();
    expect(entry.traceId).toBe('parent-trace-id');
    expect(entry.component).toBe('rpc-provider');
  });

  it('child() overrides parent traceId when a new one is provided', () => {
    const parent = new ConsoleJsonLogger('debug', 'main', 'old-trace');
    const child = parent.child({ component: 'collector', traceId: 'new-trace' });

    child.info('overridden');

    const entry = getLogEntry();
    expect(entry.traceId).toBe('new-trace');
  });

  it('child() inherits the parent minLevel', () => {
    const parent = new ConsoleJsonLogger('warn', 'main', '');
    const child = parent.child({ component: 'test' });

    child.debug('suppressed');
    child.info('suppressed');
    child.warn('visible');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(getLogEntry(0).level).toBe('warn');
  });

  // ── Full Architecture Scenario (DoD Item #3) ────────────────

  it('matches the exact ARCHITECTURE.md DoD scenario', () => {
    // Step a: Instantiate with level "debug"
    const logger = new ConsoleJsonLogger('debug');

    // Step b: Call logger.info
    logger.info('service_starting', { version: '1.0.0' });

    // Step c: Create a child logger
    const child = logger.child({ component: 'test', traceId: 'abc-123' });

    // Step d: Call child.warn
    child.warn('test_warning', { key: 'value' });

    // Verify two lines were emitted
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    // Line 1: parent logger
    const line1 = getLogEntry(0);
    expect(line1.level).toBe('info');
    expect(line1.traceId).toBe('');
    expect(line1.component).toBe('main');
    expect(line1.message).toBe('service_starting');
    expect((line1.data as Record<string, unknown>).version).toBe('1.0.0');

    // Line 2: child logger
    const line2 = getLogEntry(1);
    expect(line2.level).toBe('warn');
    expect(line2.traceId).toBe('abc-123');
    expect(line2.component).toBe('test');
    expect(line2.message).toBe('test_warning');
    expect((line2.data as Record<string, unknown>).key).toBe('value');
  });

  // ── Edge Cases ───────────────────────────────────────────────

  it('throws on invalid log level in constructor', () => {
    expect(() => new ConsoleJsonLogger('trace')).toThrow('Invalid log level');
  });

  it('handles empty data object', () => {
    const logger = new ConsoleJsonLogger('debug');
    logger.info('empty_data', {});

    const entry = getLogEntry();
    expect(entry.data).toEqual({});
  });
});
