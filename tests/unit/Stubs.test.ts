// tests/unit/Stubs.test.ts
// Phase 1 DoD — Verification Checklist Item #5: Stubs test

import { describe, it, expect } from 'vitest';
import { SubnetAdminStub } from '../../src/services/SubnetAdminStub.js';
import { AnalysisServiceStub } from '../../src/services/AnalysisServiceStub.js';
import type { SubnetSnapshot } from '../../src/types/models.js';
import { SourceStatus, AlertSeverity } from '../../src/types/enums.js';

describe('SubnetAdminStub', () => {
  it('getFeeConfig() resolves to null', async () => {
    const stub = new SubnetAdminStub();
    const result = await stub.getFeeConfig();
    expect(result).toBeNull();
  });

  it('isAvailable() resolves to false', async () => {
    const stub = new SubnetAdminStub();
    const result = await stub.isAvailable();
    expect(result).toBe(false);
  });

  it('implements ISubnetAdmin interface (type check)', () => {
    const stub = new SubnetAdminStub();
    // Verify the methods exist and are functions
    expect(typeof stub.getFeeConfig).toBe('function');
    expect(typeof stub.isAvailable).toBe('function');
  });
});

describe('AnalysisServiceStub', () => {
  // Create a minimal valid snapshot for testing
  const mockSnapshot: SubnetSnapshot = {
    traceId: 'test-trace-id',
    timestamp: new Date().toISOString(),
    tickNumber: 1,
    rpc: {
      gasPrice: '0x3B9ACA00',
      maxPriorityFeePerGas: '0x59682F00',
      blockNumber: 12345,
    },
    nodeMetrics: {
      cpuUsage: 42.7,
      networkLatency: 15.3,
    },
    sources: {
      rpc: {
        status: SourceStatus.CURRENT,
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
        alertSeverity: AlertSeverity.NONE,
      },
      nodeMetrics: {
        status: SourceStatus.CURRENT,
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
        alertSeverity: AlertSeverity.NONE,
      },
    },
  };

  it('analyze() resolves to null', async () => {
    const stub = new AnalysisServiceStub();
    const result = await stub.analyze(mockSnapshot);
    expect(result).toBeNull();
  });

  it('isReady() resolves to false', async () => {
    const stub = new AnalysisServiceStub();
    const result = await stub.isReady();
    expect(result).toBe(false);
  });

  it('analyze() accepts any valid SubnetSnapshot without throwing', async () => {
    const stub = new AnalysisServiceStub();

    // With null data fields (partial snapshot)
    const partialSnapshot: SubnetSnapshot = {
      ...mockSnapshot,
      rpc: null,
      nodeMetrics: null,
      sources: {
        rpc: {
          ...mockSnapshot.sources.rpc,
          status: SourceStatus.UNKNOWN,
        },
        nodeMetrics: {
          ...mockSnapshot.sources.nodeMetrics,
          status: SourceStatus.UNKNOWN,
        },
      },
    };

    const result = await stub.analyze(partialSnapshot);
    expect(result).toBeNull();
  });

  it('implements IAnalysisService interface (type check)', () => {
    const stub = new AnalysisServiceStub();
    expect(typeof stub.analyze).toBe('function');
    expect(typeof stub.isReady).toBe('function');
  });
});
