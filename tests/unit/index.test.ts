// tests/unit/index.test.ts
// Smoke tests for the composition root (src/index.ts).
// Validates that all dependencies can be wired together without runtime errors.
//
// Strategy:
//   - vi.mock() with vi.hoisted() for all dependencies
//   - Import the module ONCE in beforeAll (triggers main())
//   - Flush microtasks to let async main() complete
//   - Assert on captured mock calls across all tests
//   - Shutdown tests fire captured signal handlers and assert cleanup

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// ── Hoisted Mocks ───────────────────────────────────────────────

const {
  mockLoadConfig,
  mockServerStart,
  mockServerStop,
  mockOrchestratorStart,
  mockOrchestratorStop,
  mockProviderDestroy,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockServerStart: vi.fn(),
  mockServerStop: vi.fn(),
  mockOrchestratorStart: vi.fn(),
  mockOrchestratorStop: vi.fn(),
  mockProviderDestroy: vi.fn(),
}));

// ── Module Mocks ────────────────────────────────────────────────

vi.mock('../../src/config/loadConfig.js', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/logging/ConsoleJsonLogger.js', () => ({
  ConsoleJsonLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('../../src/store/InMemoryStateStore.js', () => ({
  InMemoryStateStore: vi.fn().mockImplementation(() => ({
    updateSnapshot: vi.fn(),
    getCurrentSnapshot: vi.fn().mockReturnValue(null),
    getTickCount: vi.fn().mockReturnValue(0),
  })),
}));

vi.mock('../../src/services/EthersRpcProvider.js', () => ({
  EthersRpcProvider: vi.fn().mockImplementation(() => ({
    getGasMetrics: vi.fn().mockResolvedValue({}),
    isConnected: vi.fn().mockResolvedValue(true),
    destroy: mockProviderDestroy,
  })),
}));

vi.mock('../../src/services/PrometheusMetricsCollector.js', () => ({
  PrometheusMetricsCollector: vi.fn().mockImplementation(() => ({
    collectNodeMetrics: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../src/services/SubnetAdminStub.js', () => ({
  SubnetAdminStub: vi.fn().mockImplementation(() => ({
    getFeeConfig: vi.fn().mockResolvedValue(null),
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('../../src/services/AnalysisServiceStub.js', () => ({
  AnalysisServiceStub: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue(null),
    isReady: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('../../src/api/ExpressServer.js', () => ({
  ExpressServer: vi.fn().mockImplementation(() => ({
    start: mockServerStart,
    stop: mockServerStop,
    getApp: vi.fn(),
  })),
}));

vi.mock('../../src/core/PollingOrchestrator.js', () => ({
  PollingOrchestrator: vi.fn().mockImplementation(() => ({
    start: mockOrchestratorStart,
    stop: mockOrchestratorStop,
    isRunning: vi.fn().mockReturnValue(true),
    triggerTick: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── Test Constants ──────────────────────────────────────────────

const VALID_CONFIG = {
  rpc: { endpoint: 'https://rpc.test', timeoutMs: 5000, retryCount: 3, retryBaseMs: 500 },
  metrics: { endpoint: 'https://metrics.test', timeoutMs: 5000 },
  orchestrator: { tickIntervalMs: 10_000 },
  api: { port: 3000, host: '0.0.0.0' },
  logging: { level: 'info' },
};

// ── Helpers ─────────────────────────────────────────────────────

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ── Tests ───────────────────────────────────────────────────────

describe('index.ts (Composition Root)', () => {
  // Captured signal handlers from process.once
  const signalHandlers = new Map<string, (...args: unknown[]) => void>();

  beforeAll(async () => {
    // Configure mocks BEFORE import triggers main()
    mockLoadConfig.mockReturnValue(VALID_CONFIG);
    mockServerStart.mockResolvedValue({});
    mockServerStop.mockResolvedValue(undefined);
    mockProviderDestroy.mockResolvedValue(undefined);

    // Capture process.once handlers
    vi.spyOn(process, 'once').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((event: string, listener: (...args: any[]) => void) => {
        signalHandlers.set(event, listener);
        return process;
      }) as typeof process.once
    );

    // Prevent actual process exit
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Import triggers module evaluation → main().catch(...) fires
    await import('../../src/index.js');

    // Flush microtask queue so async main() completes
    await flushPromises();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ── Startup Tests ───────────────────────────────────────────

  it('should call loadConfig on startup', () => {
    expect(mockLoadConfig).toHaveBeenCalledOnce();
  });

  it('should start the Express server', () => {
    expect(mockServerStart).toHaveBeenCalledOnce();
  });

  it('should start the orchestrator', () => {
    expect(mockOrchestratorStart).toHaveBeenCalledOnce();
  });

  it('should register SIGINT and SIGTERM handlers via process.once', () => {
    expect(process.once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('should have captured both signal handlers', () => {
    expect(signalHandlers.get('SIGINT')).toBeDefined();
    expect(signalHandlers.get('SIGTERM')).toBeDefined();
  });

  // ── Shutdown Tests ──────────────────────────────────────────

  // These tests fire the captured signal handlers.
  // They run in order and modify shared mock call counts.

  it('should stop orchestrator, server, and provider on SIGINT', async () => {
    const sigintHandler = signalHandlers.get('SIGINT')!;
    sigintHandler();
    await flushPromises();

    expect(mockOrchestratorStop).toHaveBeenCalled();
    expect(mockServerStop).toHaveBeenCalled();
    expect(mockProviderDestroy).toHaveBeenCalled();
  });

  it('should call process.exit(0) after graceful shutdown', () => {
    // process.exit(0) was called by the SIGINT handler in the previous test
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
