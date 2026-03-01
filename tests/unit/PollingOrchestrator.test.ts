// tests/unit/PollingOrchestrator.test.ts
// Comprehensive tests for PollingOrchestrator — tick logic, partial state,
// failure tracking, alert escalation, scheduling, and lifecycle.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingOrchestrator } from '../../src/core/PollingOrchestrator.js';
import type { OrchestratorConfig } from '../../src/core/PollingOrchestrator.js';
import type { IProvider } from '../../src/interfaces/IProvider.js';
import type { ICollector } from '../../src/interfaces/ICollector.js';
import type { IStateStore } from '../../src/interfaces/IStateStore.js';
import type { ILogger } from '../../src/interfaces/ILogger.js';
import type { ISubnetAdmin } from '../../src/interfaces/ISubnetAdmin.js';
import type {
  IAiPipeline,
  IThresholdEvaluator,
  IAnalysisScheduler,
  IAiAnalysisService,
} from '../../src/interfaces/IAiPipeline.js';
import type { RpcData, NodeMetricsData, SubnetSnapshot } from '../../src/types/models.js';
import { SourceStatus, AlertSeverity } from '../../src/types/enums.js';

// ── Test Constants ──────────────────────────────────────────────

const MOCK_RPC_DATA: RpcData = {
  gasPrice: '0x174876e800',
  maxPriorityFeePerGas: '0x3b9aca00',
  blockNumber: 42_000,
  walletBalanceAvax: null,
};

const MOCK_METRICS_DATA: NodeMetricsData = {
  cpuUsage: 45.2,
  networkLatency: 12.5,
};

const TEST_CONFIG: OrchestratorConfig = {
  tickIntervalMs: 10_000,
};

// ── Mock Factories ──────────────────────────────────────────────

function createMockLogger(): ILogger {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
}

function createMockProvider(
  overrides: Partial<IProvider> = {}
): IProvider {
  return {
    getGasMetrics: vi.fn<() => Promise<RpcData>>().mockResolvedValue(MOCK_RPC_DATA),
    isConnected: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    destroy: vi.fn<() => Promise<void>>().mockResolvedValue(),
    ...overrides,
  };
}

function createMockCollector(
  overrides: Partial<ICollector> = {}
): ICollector {
  return {
    collectNodeMetrics: vi.fn<() => Promise<NodeMetricsData>>().mockResolvedValue(MOCK_METRICS_DATA),
    ...overrides,
  };
}

function createMockStore(): IStateStore {
  let tickCount = 0;
  let snapshot: SubnetSnapshot | null = null;

  return {
    updateSnapshot: vi.fn((s: SubnetSnapshot) => {
      snapshot = s;
      tickCount++;
    }),
    getCurrentSnapshot: vi.fn(() => snapshot),
    getTickCount: vi.fn(() => tickCount),
  };
}

function createMockAdmin(): ISubnetAdmin {
  return {
    getFeeConfig: vi.fn().mockResolvedValue(null),
    isAvailable: vi.fn().mockResolvedValue(false),
  };
}

function createMockEvaluator(
  overrides: Partial<IThresholdEvaluator> = {}
): IThresholdEvaluator {
  return {
    evaluate: vi.fn().mockReturnValue({ breached: false, violations: [], evaluatedAt: Date.now() }),
    ...overrides,
  };
}

function createMockScheduler(
  overrides: Partial<IAnalysisScheduler> = {}
): IAnalysisScheduler {
  return {
    shouldTrigger: vi.fn().mockReturnValue({ trigger: false }),
    ...overrides,
  };
}

function createMockAiService(
  overrides: Partial<IAiAnalysisService> = {}
): IAiAnalysisService {
  return {
    enqueue: vi.fn(),
    ...overrides,
  };
}

function createMockPipeline(overrides: Partial<IAiPipeline> = {}): IAiPipeline {
  return {
    evaluator: createMockEvaluator(),
    scheduler: createMockScheduler(),
    service: createMockAiService(),
    ...overrides,
  };
}

// ── Helper: Create orchestrator with all defaults ──

interface OrchestratorDeps {
  provider: IProvider;
  collector: ICollector;
  store: IStateStore;
  logger: ILogger;
  admin: ISubnetAdmin;
  pipeline: IAiPipeline;
  config: OrchestratorConfig;
}

function createOrchestrator(overrides: Partial<OrchestratorDeps> = {}): {
  orchestrator: PollingOrchestrator;
  deps: OrchestratorDeps;
} {
  const deps: OrchestratorDeps = {
    provider: createMockProvider(),
    collector: createMockCollector(),
    store: createMockStore(),
    logger: createMockLogger(),
    admin: createMockAdmin(),
    pipeline: createMockPipeline(),
    config: TEST_CONFIG,
    ...overrides,
  };

  const orchestrator = new PollingOrchestrator(
    deps.provider,
    deps.collector,
    deps.store,
    deps.logger,
    deps.admin,
    deps.pipeline,
    deps.config
  );

  return { orchestrator, deps };
}

// ── Tests ───────────────────────────────────────────────────────

describe('PollingOrchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Provide a stable randomUUID for assertions
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('test-trace-id-0001'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should report isRunning=false before start', () => {
      const { orchestrator } = createOrchestrator();
      expect(orchestrator.isRunning()).toBe(false);
    });

    it('should report isRunning=true after start', () => {
      const { orchestrator } = createOrchestrator();
      orchestrator.start();
      expect(orchestrator.isRunning()).toBe(true);
      orchestrator.stop();
    });

    it('should report isRunning=false after stop', () => {
      const { orchestrator } = createOrchestrator();
      orchestrator.start();
      orchestrator.stop();
      expect(orchestrator.isRunning()).toBe(false);
    });

    it('start() should be idempotent — calling twice logs a warning', () => {
      const { orchestrator, deps } = createOrchestrator();
      orchestrator.start();
      orchestrator.start();

      // The child logger is what gets the warn call
      const childLogger = (deps.logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value as ILogger;
      expect(childLogger.warn).toHaveBeenCalledWith('orchestrator_already_running');
      orchestrator.stop();
    });

    it('stop() should clear the timer and prevent next tick', async () => {
      const { orchestrator, deps } = createOrchestrator();
      orchestrator.start();

      // Let the first tick fire (delay 0)
      await vi.advanceTimersByTimeAsync(0);

      // Stop before the next tick fires
      orchestrator.stop();

      // Advance well past the tick interval
      await vi.advanceTimersByTimeAsync(30_000);

      // Only 1 tick should have executed (the immediate one)
      expect(deps.store.updateSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────
  // triggerTick (manual tick)
  // ────────────────────────────────────────────────────────

  describe('triggerTick()', () => {
    it('should execute a single tick and update the store', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      expect(deps.provider.getGasMetrics).toHaveBeenCalledOnce();
      expect(deps.collector.collectNodeMetrics).toHaveBeenCalledOnce();
      expect(deps.store.updateSnapshot).toHaveBeenCalledOnce();
    });

    it('should generate a traceId for the snapshot', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.traceId).toBe('test-trace-id-0001');
    });

    it('should populate timestamp as ISO-8601', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should set tickNumber from store.getTickCount() + 1', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      // Before tick, getTickCount was 0, so tickNumber = 1
      expect(snapshot.tickNumber).toBe(1);
    });

    it('should pass snapshot to analysis service when scheduler triggers', async () => {
      // The scheduler must return trigger=true for enqueue to be called
      const alertContext = {
        type: 'alert' as const,
        violations: [],
        dedupKey: 'test-key',
      };
      const pipeline = createMockPipeline({
        evaluator: createMockEvaluator({
          evaluate: vi.fn().mockReturnValue({ breached: true, violations: [], evaluatedAt: Date.now() }),
        }),
        scheduler: createMockScheduler({
          shouldTrigger: vi.fn().mockReturnValue({ trigger: true, context: alertContext }),
        }),
      });
      const { orchestrator, deps } = createOrchestrator({ pipeline });
      await orchestrator.triggerTick();

      expect(deps.pipeline.service.enqueue).toHaveBeenCalledOnce();
      const [passedSnapshot] = (deps.pipeline.service.enqueue as ReturnType<typeof vi.fn>)
        .mock.calls[0] as [SubnetSnapshot, typeof alertContext];
      expect(passedSnapshot.traceId).toBe('test-trace-id-0001');
    });
  });

  // ────────────────────────────────────────────────────────
  // Happy path — both sources succeed
  // ────────────────────────────────────────────────────────

  describe('happy path (both sources succeed)', () => {
    it('should include RPC data in snapshot', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.rpc).toEqual(MOCK_RPC_DATA);
    });

    it('should include metrics data in snapshot', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.nodeMetrics).toEqual(MOCK_METRICS_DATA);
    });

    it('should mark both sources as CURRENT with NONE severity', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.CURRENT);
      expect(snapshot.sources.rpc.alertSeverity).toBe(AlertSeverity.NONE);
      expect(snapshot.sources.rpc.consecutiveFailures).toBe(0);
      expect(snapshot.sources.nodeMetrics.status).toBe(SourceStatus.CURRENT);
      expect(snapshot.sources.nodeMetrics.alertSeverity).toBe(AlertSeverity.NONE);
    });
  });

  // ────────────────────────────────────────────────────────
  // Partial failure — RPC fails, metrics succeeds
  // ────────────────────────────────────────────────────────

  describe('partial failure (RPC fails, metrics succeeds)', () => {
    it('should set rpc=null and nodeMetrics=data on first failure', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('RPC timeout')),
      });
      const { orchestrator, deps } = createOrchestrator({ provider });
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;

      // RPC has never succeeded → UNKNOWN, data is null
      expect(snapshot.rpc).toBeNull();
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.UNKNOWN);
      expect(snapshot.sources.rpc.consecutiveFailures).toBe(1);

      // Metrics succeeded
      expect(snapshot.nodeMetrics).toEqual(MOCK_METRICS_DATA);
      expect(snapshot.sources.nodeMetrics.status).toBe(SourceStatus.CURRENT);
    });

    it('should log a WARN for the failed source', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('RPC timeout')),
      });
      const logger = createMockLogger();
      const { orchestrator } = createOrchestrator({ provider, logger });
      await orchestrator.triggerTick();

      // The child logger is what gets the warn call
      const childLogger = (logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value as ILogger;
      expect(childLogger.warn).toHaveBeenCalledWith('source_failure', {
        source: 'rpc',
        error: 'RPC timeout',
        consecutiveFailures: 1,
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // Partial failure — Metrics fails, RPC succeeds
  // ────────────────────────────────────────────────────────

  describe('partial failure (metrics fails, RPC succeeds)', () => {
    it('should set nodeMetrics=null and rpc=data on first failure', async () => {
      const collector = createMockCollector({
        collectNodeMetrics: vi.fn().mockRejectedValue(new Error('Metrics timeout')),
      });
      const { orchestrator, deps } = createOrchestrator({ collector });
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;

      expect(snapshot.nodeMetrics).toBeNull();
      expect(snapshot.sources.nodeMetrics.status).toBe(SourceStatus.UNKNOWN);
      expect(snapshot.sources.nodeMetrics.consecutiveFailures).toBe(1);

      expect(snapshot.rpc).toEqual(MOCK_RPC_DATA);
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.CURRENT);
    });
  });

  // ────────────────────────────────────────────────────────
  // Both sources fail
  // ────────────────────────────────────────────────────────

  describe('both sources fail', () => {
    it('should set both data fields to null and both statuses to UNKNOWN', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('RPC down')),
      });
      const collector = createMockCollector({
        collectNodeMetrics: vi.fn().mockRejectedValue(new Error('Metrics down')),
      });
      const { orchestrator, deps } = createOrchestrator({ provider, collector });
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;

      expect(snapshot.rpc).toBeNull();
      expect(snapshot.nodeMetrics).toBeNull();
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.UNKNOWN);
      expect(snapshot.sources.nodeMetrics.status).toBe(SourceStatus.UNKNOWN);
    });

    it('should still update the store (never crash)', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('RPC down')),
      });
      const collector = createMockCollector({
        collectNodeMetrics: vi.fn().mockRejectedValue(new Error('Metrics down')),
      });
      const { orchestrator, deps } = createOrchestrator({ provider, collector });
      await orchestrator.triggerTick();

      expect(deps.store.updateSnapshot).toHaveBeenCalledOnce();
    });
  });

  // ────────────────────────────────────────────────────────
  // Stale data — failure AFTER a previous success
  // ────────────────────────────────────────────────────────

  describe('stale data (failure after previous success)', () => {
    it('should return last-known-good RPC data with STALE status', async () => {
      const getGasMetrics = vi.fn<() => Promise<RpcData>>()
        .mockResolvedValueOnce(MOCK_RPC_DATA)         // tick 1: success
        .mockRejectedValueOnce(new Error('RPC flap')); // tick 2: failure

      const { orchestrator, deps } = createOrchestrator({
        provider: createMockProvider({ getGasMetrics }),
      });

      // Tick 1 — success
      await orchestrator.triggerTick();

      // Tick 2 — RPC fails, but should use last-known-good
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[1][0] as SubnetSnapshot;

      // Last-known-good data preserved
      expect(snapshot.rpc).toEqual(MOCK_RPC_DATA);
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.STALE);
      expect(snapshot.sources.rpc.consecutiveFailures).toBe(1);
      expect(snapshot.sources.rpc.lastErrorMessage).toBe('RPC flap');
    });

    it('should return last-known-good metrics data with STALE status', async () => {
      const collectNodeMetrics = vi.fn<() => Promise<NodeMetricsData>>()
        .mockResolvedValueOnce(MOCK_METRICS_DATA)
        .mockRejectedValueOnce(new Error('Metrics flap'));

      const { orchestrator, deps } = createOrchestrator({
        collector: createMockCollector({ collectNodeMetrics }),
      });

      await orchestrator.triggerTick();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[1][0] as SubnetSnapshot;

      expect(snapshot.nodeMetrics).toEqual(MOCK_METRICS_DATA);
      expect(snapshot.sources.nodeMetrics.status).toBe(SourceStatus.STALE);
      expect(snapshot.sources.nodeMetrics.consecutiveFailures).toBe(1);
    });

    it('should reset to CURRENT after a recovery', async () => {
      const getGasMetrics = vi.fn<() => Promise<RpcData>>()
        .mockResolvedValueOnce(MOCK_RPC_DATA)           // tick 1: ok
        .mockRejectedValueOnce(new Error('RPC flap'))   // tick 2: fail
        .mockResolvedValueOnce(MOCK_RPC_DATA);          // tick 3: recovered

      const { orchestrator, deps } = createOrchestrator({
        provider: createMockProvider({ getGasMetrics }),
      });

      await orchestrator.triggerTick(); // ok
      await orchestrator.triggerTick(); // fail → STALE
      await orchestrator.triggerTick(); // recovered → CURRENT

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[2][0] as SubnetSnapshot;

      expect(snapshot.rpc).toEqual(MOCK_RPC_DATA);
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.CURRENT);
      expect(snapshot.sources.rpc.consecutiveFailures).toBe(0);
      expect(snapshot.sources.rpc.alertSeverity).toBe(AlertSeverity.NONE);
    });
  });

  // ────────────────────────────────────────────────────────
  // Alert escalation
  // ────────────────────────────────────────────────────────

  describe('alert escalation', () => {
    it('should escalate to WARNING after 3 consecutive failures', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('down')),
      });
      const { orchestrator, deps } = createOrchestrator({ provider });

      for (let i = 0; i < 3; i++) {
        await orchestrator.triggerTick();
      }

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[2][0] as SubnetSnapshot;

      expect(snapshot.sources.rpc.consecutiveFailures).toBe(3);
      expect(snapshot.sources.rpc.alertSeverity).toBe(AlertSeverity.WARNING);
    });

    it('should escalate to CRITICAL after 10 consecutive failures', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('down')),
      });
      const { orchestrator, deps } = createOrchestrator({ provider });

      for (let i = 0; i < 10; i++) {
        await orchestrator.triggerTick();
      }

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[9][0] as SubnetSnapshot;

      expect(snapshot.sources.rpc.consecutiveFailures).toBe(10);
      expect(snapshot.sources.rpc.alertSeverity).toBe(AlertSeverity.CRITICAL);
    });

    it('should log error level at CRITICAL threshold', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('down')),
      });
      const logger = createMockLogger();
      const { orchestrator } = createOrchestrator({ provider, logger });

      for (let i = 0; i < 10; i++) {
        await orchestrator.triggerTick();
      }

      const childLogger = (logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value as ILogger;
      expect(childLogger.error).toHaveBeenCalledWith('source_failure_critical', {
        source: 'rpc',
        error: 'down',
        consecutiveFailures: 10,
      });
    });

    it('should log warn level at WARNING threshold', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('down')),
      });
      const logger = createMockLogger();
      const { orchestrator } = createOrchestrator({ provider, logger });

      for (let i = 0; i < 3; i++) {
        await orchestrator.triggerTick();
      }

      const childLogger = (logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value as ILogger;
      expect(childLogger.warn).toHaveBeenCalledWith('source_failure_warning', {
        source: 'rpc',
        error: 'down',
        consecutiveFailures: 3,
      });
    });

    it('should reset severity to NONE after recovery from CRITICAL', async () => {
      const getGasMetrics = vi.fn<() => Promise<RpcData>>();

      // 10 failures then 1 success
      for (let i = 0; i < 10; i++) {
        getGasMetrics.mockRejectedValueOnce(new Error('down'));
      }
      getGasMetrics.mockResolvedValueOnce(MOCK_RPC_DATA);

      const { orchestrator, deps } = createOrchestrator({
        provider: createMockProvider({ getGasMetrics }),
      });

      for (let i = 0; i < 11; i++) {
        await orchestrator.triggerTick();
      }

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[10][0] as SubnetSnapshot;

      expect(snapshot.sources.rpc.consecutiveFailures).toBe(0);
      expect(snapshot.sources.rpc.alertSeverity).toBe(AlertSeverity.NONE);
      expect(snapshot.sources.rpc.status).toBe(SourceStatus.CURRENT);
    });
  });

  // ────────────────────────────────────────────────────────
  // Scheduling (setTimeout loop)
  // ────────────────────────────────────────────────────────

  describe('scheduling', () => {
    it('should fire first tick immediately (delay 0)', async () => {
      const { orchestrator, deps } = createOrchestrator();
      orchestrator.start();

      // Advance by 0ms — the first tick should fire
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.store.updateSnapshot).toHaveBeenCalledOnce();
      orchestrator.stop();
    });

    it('should fire second tick after tickIntervalMs', async () => {
      const { orchestrator, deps } = createOrchestrator();
      orchestrator.start();

      // First tick (immediate)
      await vi.advanceTimersByTimeAsync(0);
      expect(deps.store.updateSnapshot).toHaveBeenCalledTimes(1);

      // Advance by tickIntervalMs → second tick
      await vi.advanceTimersByTimeAsync(10_000);
      expect(deps.store.updateSnapshot).toHaveBeenCalledTimes(2);

      orchestrator.stop();
    });

    it('should fire 3 ticks over 2 intervals', async () => {
      const { orchestrator, deps } = createOrchestrator();
      orchestrator.start();

      // tick 1 (immediate)
      await vi.advanceTimersByTimeAsync(0);
      // tick 2
      await vi.advanceTimersByTimeAsync(10_000);
      // tick 3
      await vi.advanceTimersByTimeAsync(10_000);

      expect(deps.store.updateSnapshot).toHaveBeenCalledTimes(3);
      orchestrator.stop();
    });

    it('should not schedule next tick after stop()', async () => {
      const { orchestrator, deps } = createOrchestrator();
      orchestrator.start();

      await vi.advanceTimersByTimeAsync(0); // tick 1
      orchestrator.stop();

      await vi.advanceTimersByTimeAsync(60_000); // way past multiple intervals
      expect(deps.store.updateSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────
  // Analysis service integration
  // ────────────────────────────────────────────────────────

  describe('analysis service', () => {
    it('should not crash if pipeline evaluator throws', async () => {
      // Simulate a pipeline-level failure (evaluator throws unexpectedly)
      const pipeline = createMockPipeline({
        evaluator: createMockEvaluator({
          evaluate: vi.fn().mockImplementation(() => { throw new Error('AI engine crash'); }),
        }),
      });

      const { orchestrator, deps } = createOrchestrator({ pipeline });
      await orchestrator.triggerTick();

      // Tick completed successfully despite pipeline failure
      expect(deps.store.updateSnapshot).toHaveBeenCalledOnce();
    });

    it('should log ERROR if pipeline component throws', async () => {
      // The orchestrator wraps the entire pipeline block in try/catch and logs ERROR
      const pipeline = createMockPipeline({
        evaluator: createMockEvaluator({
          evaluate: vi.fn().mockImplementation(() => { throw new Error('AI engine crash'); }),
        }),
      });
      const logger = createMockLogger();

      const { orchestrator } = createOrchestrator({ pipeline, logger });
      await orchestrator.triggerTick();

      const childLogger = (logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value as ILogger;
      expect(childLogger.error).toHaveBeenCalledWith('ai_pipeline_error', expect.objectContaining({
        error: 'AI engine crash',
      }));
    });
  });

  // ────────────────────────────────────────────────────────
  // Error handling — non-Error rejection reasons
  // ────────────────────────────────────────────────────────

  describe('non-Error rejection reasons', () => {
    it('should handle string rejection reason from provider', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue('string error'),
      });
      const { orchestrator, deps } = createOrchestrator({ provider });
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.sources.rpc.lastErrorMessage).toBe('string error');
    });

    it('should handle numeric rejection reason from collector', async () => {
      const collector = createMockCollector({
        collectNodeMetrics: vi.fn().mockRejectedValue(503),
      });
      const { orchestrator, deps } = createOrchestrator({ collector });
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;
      expect(snapshot.sources.nodeMetrics.lastErrorMessage).toBe('503');
    });
  });

  // ────────────────────────────────────────────────────────
  // Catastrophic safety net
  // ────────────────────────────────────────────────────────

  describe('catastrophic safety net', () => {
    it('should survive a store.updateSnapshot() throw and continue loop', async () => {
      const store = createMockStore();
      (store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => { throw new Error('store exploded'); })
        .mockImplementation((s: SubnetSnapshot) => { /* normal on retry */ void s; });

      const logger = createMockLogger();
      const { orchestrator } = createOrchestrator({ store, logger });

      orchestrator.start();

      // First tick — store throws → caught by safety net
      await vi.advanceTimersByTimeAsync(0);

      const childLogger = (logger.child as ReturnType<typeof vi.fn>).mock.results[0]?.value as ILogger;
      expect(childLogger.error).toHaveBeenCalledWith('tick_catastrophic_failure', {
        error: 'store exploded',
      });

      // The loop should still be alive — second tick
      await vi.advanceTimersByTimeAsync(10_000);
      // store.updateSnapshot called at least for the second tick attempt
      expect(store.updateSnapshot).toHaveBeenCalledTimes(2);

      orchestrator.stop();
    });
  });

  // ────────────────────────────────────────────────────────
  // SourceHealth field tracking
  // ────────────────────────────────────────────────────────

  describe('SourceHealth field tracking', () => {
    it('should set lastSuccessAt on success and clear lastErrorMessage', async () => {
      const { orchestrator, deps } = createOrchestrator();
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;

      expect(snapshot.sources.rpc.lastSuccessAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(snapshot.sources.rpc.lastErrorMessage).toBeNull();
      expect(snapshot.sources.rpc.lastFailureAt).toBeNull();
    });

    it('should set lastFailureAt and lastErrorMessage on failure', async () => {
      const provider = createMockProvider({
        getGasMetrics: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      const { orchestrator, deps } = createOrchestrator({ provider });
      await orchestrator.triggerTick();

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as SubnetSnapshot;

      expect(snapshot.sources.rpc.lastFailureAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(snapshot.sources.rpc.lastErrorMessage).toBe('timeout');
      expect(snapshot.sources.rpc.lastSuccessAt).toBeNull();
    });

    it('should preserve lastSuccessAt after failure (for STALE tracking)', async () => {
      const getGasMetrics = vi.fn<() => Promise<RpcData>>()
        .mockResolvedValueOnce(MOCK_RPC_DATA)
        .mockRejectedValueOnce(new Error('blip'));

      const { orchestrator, deps } = createOrchestrator({
        provider: createMockProvider({ getGasMetrics }),
      });

      await orchestrator.triggerTick(); // success
      await orchestrator.triggerTick(); // failure

      const snapshot = (deps.store.updateSnapshot as ReturnType<typeof vi.fn>)
        .mock.calls[1][0] as SubnetSnapshot;

      // Both timestamps present
      expect(snapshot.sources.rpc.lastSuccessAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(snapshot.sources.rpc.lastFailureAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
