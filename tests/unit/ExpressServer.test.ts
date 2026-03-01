// tests/unit/ExpressServer.test.ts
// Phase 4 DoD #6–#8 + Architect critique #2: ServerConfig with injected version

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ExpressServer } from '../../src/api/ExpressServer.js';
import type { ServerConfig } from '../../src/api/ExpressServer.js';
import { InMemoryStateStore } from '../../src/store/InMemoryStateStore.js';
import { SourceStatus, AlertSeverity } from '../../src/types/enums.js';
import type { ILogger } from '../../src/interfaces/ILogger.js';
import type { SubnetSnapshot } from '../../src/types/models.js';

// ── Logger mock ──────────────────────────────────────────────────

function createMockLogger(): ILogger {
  const noop = (): void => {};
  const logger: ILogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child(_context: { component: string; traceId?: string }): ILogger {
      return logger;
    },
  };
  return logger;
}

// ── Test config (uses ServerConfig, NOT AppConfig['api']) ────────

const TEST_SERVER_CONFIG: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  version: '1.0.0',
};

// ── Snapshot factory ─────────────────────────────────────────────

function createSnapshot(overrides?: Partial<SubnetSnapshot>): SubnetSnapshot {
  return {
    traceId: 'trace-api-test-001',
    timestamp: '2026-02-25T14:00:00.000Z',
    tickNumber: 1,
    rpc: {
      gasPrice: '0x3B9ACA00',
      maxPriorityFeePerGas: '0x59682F00',
      blockNumber: 1724206,
    },
    nodeMetrics: {
      cpuUsage: 42.7,
      networkLatency: 15.3,
    },
    sources: {
      rpc: {
        status: SourceStatus.CURRENT,
        lastSuccessAt: '2026-02-25T14:00:00.000Z',
        lastFailureAt: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
        alertSeverity: AlertSeverity.NONE,
      },
      nodeMetrics: {
        status: SourceStatus.CURRENT,
        lastSuccessAt: '2026-02-25T14:00:00.000Z',
        lastFailureAt: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
        alertSeverity: AlertSeverity.NONE,
      },
    },
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════

describe('ExpressServer', () => {
  let store: InMemoryStateStore;
  let logger: ILogger;

  beforeEach(() => {
    store = new InMemoryStateStore();
    logger = createMockLogger();
  });

  // ── DoD #6: GET /health ────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with { status: "ok" }', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('includes uptime as a number', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes the version from ServerConfig (not hardcoded)', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(res.body.version).toBe('1.0.0');
    });

    it('reflects a custom version string injected via config', async () => {
      const customConfig: ServerConfig = {
        ...TEST_SERVER_CONFIG,
        version: '2.5.0-beta.1',
      };
      const server = new ExpressServer(store, logger, customConfig);

      const res = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(res.body.version).toBe('2.5.0-beta.1');
    });

    it('returns Content-Type application/json', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      await request(server.getApp())
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);
    });
  });

  // ── DoD #7: GET /status with NO snapshot ───────────────────────

  describe('GET /status — no snapshot (initializing)', () => {
    it('returns 503 when no snapshot has been stored', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(503);

      expect(res.body.error).toBe('no_snapshot_available');
    });

    it('includes a human-readable message', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(503);

      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);
    });
  });

  // ── DoD #8: GET /status WITH snapshot ──────────────────────────

  describe('GET /status — with snapshot', () => {
    it('returns 200 with the snapshot when one exists', async () => {
      const snapshot = createSnapshot();
      store.updateSnapshot(snapshot);

      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(200);

      expect(res.body.snapshot).toBeDefined();
      expect(res.body.snapshot.traceId).toBe('trace-api-test-001');
      expect(res.body.snapshot.tickNumber).toBe(1);
    });

    it('snapshot contains rpc data', async () => {
      store.updateSnapshot(createSnapshot());

      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(200);

      expect(res.body.snapshot.rpc).toEqual({
        gasPrice: '0x3B9ACA00',
        maxPriorityFeePerGas: '0x59682F00',
        blockNumber: 1724206,
      });
    });

    it('snapshot contains nodeMetrics data', async () => {
      store.updateSnapshot(createSnapshot());

      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(200);

      expect(res.body.snapshot.nodeMetrics).toEqual({
        cpuUsage: 42.7,
        networkLatency: 15.3,
      });
    });

    it('snapshot contains sources with health status', async () => {
      store.updateSnapshot(createSnapshot());

      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(200);

      expect(res.body.snapshot.sources.rpc.status).toBe('current');
      expect(res.body.snapshot.sources.nodeMetrics.status).toBe('current');
      expect(res.body.snapshot.sources.rpc.consecutiveFailures).toBe(0);
    });

    it('returns the LATEST snapshot after overwrite', async () => {
      store.updateSnapshot(createSnapshot({ traceId: 'old', tickNumber: 1 }));
      store.updateSnapshot(createSnapshot({ traceId: 'new', tickNumber: 2 }));

      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(200);

      expect(res.body.snapshot.traceId).toBe('new');
      expect(res.body.snapshot.tickNumber).toBe(2);
    });

    it('handles snapshot with null rpc and nodeMetrics', async () => {
      store.updateSnapshot(createSnapshot({
        rpc: null,
        nodeMetrics: null,
      }));

      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      const res = await request(server.getApp())
        .get('/status')
        .expect(200);

      expect(res.body.snapshot.rpc).toBeNull();
      expect(res.body.snapshot.nodeMetrics).toBeNull();
      expect(res.body.snapshot.sources).toBeDefined();
    });
  });

  // ── Extra: unknown routes ──────────────────────────────────────

  describe('unknown routes', () => {
    it('returns 404 for unregistered paths', async () => {
      const server = new ExpressServer(store, logger, TEST_SERVER_CONFIG);

      await request(server.getApp())
        .get('/nonexistent')
        .expect(404);
    });
  });
});
