// tests/unit/loadConfig.test.ts
// Phase 1 DoD — Verification Checklist Item #4: loadConfig() test

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loadConfig.js';

describe('loadConfig', () => {
  // Store original env vars to restore after each test
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all SENTINEL_ vars before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SENTINEL_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  /**
   * Helper: set the minimum required env vars for a valid config.
   */
  function setRequiredEnv(): void {
    process.env.SENTINEL_RPC_ENDPOINT = 'https://api.avax-test.network/ext/bc/test/rpc';
    process.env.SENTINEL_METRICS_ENDPOINT = 'http://localhost:9650/ext/metrics';
  }

  // ── Required Variables ───────────────────────────────────────

  it('returns a valid AppConfig when both required vars are set', () => {
    setRequiredEnv();

    const config = loadConfig();

    expect(config.rpc.endpoint).toBe('https://api.avax-test.network/ext/bc/test/rpc');
    expect(config.metrics.endpoint).toBe('http://localhost:9650/ext/metrics');
  });

  it('throws when SENTINEL_RPC_ENDPOINT is missing', () => {
    process.env.SENTINEL_METRICS_ENDPOINT = 'http://localhost:9650/ext/metrics';
    // SENTINEL_RPC_ENDPOINT is NOT set

    expect(() => loadConfig()).toThrow('SENTINEL_RPC_ENDPOINT');
    expect(() => loadConfig()).toThrow('not set');
  });

  it('throws when SENTINEL_METRICS_ENDPOINT is missing', () => {
    process.env.SENTINEL_RPC_ENDPOINT = 'https://api.avax-test.network/ext/bc/test/rpc';
    // SENTINEL_METRICS_ENDPOINT is NOT set

    expect(() => loadConfig()).toThrow('SENTINEL_METRICS_ENDPOINT');
  });

  it('throws when a required var is empty string', () => {
    process.env.SENTINEL_RPC_ENDPOINT = '';
    process.env.SENTINEL_METRICS_ENDPOINT = 'http://localhost:9650/ext/metrics';

    expect(() => loadConfig()).toThrow('SENTINEL_RPC_ENDPOINT');
  });

  it('throws when a required var is whitespace only', () => {
    process.env.SENTINEL_RPC_ENDPOINT = '   ';
    process.env.SENTINEL_METRICS_ENDPOINT = 'http://localhost:9650/ext/metrics';

    expect(() => loadConfig()).toThrow('SENTINEL_RPC_ENDPOINT');
  });

  // ── Default Values ──────────────────────────────────────────

  it('applies correct defaults for all optional vars', () => {
    setRequiredEnv();

    const config = loadConfig();

    // RPC defaults
    expect(config.rpc.timeoutMs).toBe(5000);
    expect(config.rpc.retryCount).toBe(3);
    expect(config.rpc.retryBaseMs).toBe(500);

    // Metrics defaults
    expect(config.metrics.timeoutMs).toBe(5000);

    // Orchestrator defaults
    expect(config.orchestrator.tickIntervalMs).toBe(10000);

    // API defaults
    expect(config.api.port).toBe(3000);
    expect(config.api.host).toBe('0.0.0.0');

    // Logging defaults
    expect(config.logging.level).toBe('info');
  });

  // ── Optional Variable Overrides ─────────────────────────────

  it('reads optional vars from environment when set', () => {
    setRequiredEnv();
    process.env.SENTINEL_SOURCE_TIMEOUT_MS = '3000';
    process.env.SENTINEL_RPC_RETRY_COUNT = '5';
    process.env.SENTINEL_RPC_RETRY_BASE_MS = '250';
    process.env.SENTINEL_TICK_INTERVAL_MS = '30000';
    process.env.SENTINEL_API_PORT = '8080';
    process.env.SENTINEL_API_HOST = '127.0.0.1';
    process.env.SENTINEL_LOG_LEVEL = 'debug';

    const config = loadConfig();

    expect(config.rpc.timeoutMs).toBe(3000);
    expect(config.rpc.retryCount).toBe(5);
    expect(config.rpc.retryBaseMs).toBe(250);
    expect(config.metrics.timeoutMs).toBe(3000);
    expect(config.orchestrator.tickIntervalMs).toBe(30000);
    expect(config.api.port).toBe(8080);
    expect(config.api.host).toBe('127.0.0.1');
    expect(config.logging.level).toBe('debug');
  });

  // ── Validation ──────────────────────────────────────────────

  it('throws on non-integer value for SENTINEL_API_PORT', () => {
    setRequiredEnv();
    process.env.SENTINEL_API_PORT = 'not-a-number';

    expect(() => loadConfig()).toThrow('valid integer');
  });

  it('throws on invalid log level', () => {
    setRequiredEnv();
    process.env.SENTINEL_LOG_LEVEL = 'trace';

    expect(() => loadConfig()).toThrow('SENTINEL_LOG_LEVEL');
    expect(() => loadConfig()).toThrow('trace');
  });

  it('accepts all valid log levels (case-insensitive)', () => {
    setRequiredEnv();

    for (const level of ['debug', 'DEBUG', 'Info', 'WARN', 'Error']) {
      process.env.SENTINEL_LOG_LEVEL = level;
      const config = loadConfig();
      expect(config.logging.level).toBe(level.toLowerCase());
    }
  });

  // ── Immutability ────────────────────────────────────────────

  it('returns a frozen config object', () => {
    setRequiredEnv();
    const config = loadConfig();

    // Top-level freeze
    expect(Object.isFrozen(config)).toBe(true);

    // Nested freezes
    expect(Object.isFrozen(config.rpc)).toBe(true);
    expect(Object.isFrozen(config.metrics)).toBe(true);
    expect(Object.isFrozen(config.orchestrator)).toBe(true);
    expect(Object.isFrozen(config.api)).toBe(true);
    expect(Object.isFrozen(config.logging)).toBe(true);
  });

  it('trims whitespace from required env vars', () => {
    process.env.SENTINEL_RPC_ENDPOINT = '  https://example.com/rpc  ';
    process.env.SENTINEL_METRICS_ENDPOINT = '  http://localhost:9650/ext/metrics  ';

    const config = loadConfig();
    expect(config.rpc.endpoint).toBe('https://example.com/rpc');
    expect(config.metrics.endpoint).toBe('http://localhost:9650/ext/metrics');
  });
});
