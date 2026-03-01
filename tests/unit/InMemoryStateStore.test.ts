// tests/unit/InMemoryStateStore.test.ts
// Phase 4 DoD #2–#5 + Architect critique #1: structuredClone isolation

import { describe, it, expect } from 'vitest';
import { InMemoryStateStore } from '../../src/store/InMemoryStateStore.js';
import { SourceStatus, AlertSeverity } from '../../src/types/enums.js';
import type { SubnetSnapshot } from '../../src/types/models.js';

// ── Helper: create a valid SubnetSnapshot ────────────────────────

function createSnapshot(overrides?: Partial<SubnetSnapshot>): SubnetSnapshot {
  return {
    traceId: 'trace-aaa-111',
    timestamp: '2026-02-25T12:00:00.000Z',
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
        lastSuccessAt: '2026-02-25T12:00:00.000Z',
        lastFailureAt: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
        alertSeverity: AlertSeverity.NONE,
      },
      nodeMetrics: {
        status: SourceStatus.CURRENT,
        lastSuccessAt: '2026-02-25T12:00:00.000Z',
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

describe('InMemoryStateStore', () => {

  // ── DoD #2: INITIAL STATE ──────────────────────────────────────

  describe('initial state', () => {
    it('getCurrentSnapshot() returns null before any update', () => {
      const store = new InMemoryStateStore();
      expect(store.getCurrentSnapshot()).toBeNull();
    });

    it('getTickCount() returns 0 before any update', () => {
      const store = new InMemoryStateStore();
      expect(store.getTickCount()).toBe(0);
    });
  });

  // ── DoD #3: UPDATE AND READ ────────────────────────────────────

  describe('updateSnapshot() and getCurrentSnapshot()', () => {
    it('stores and returns the snapshot with correct data', () => {
      const store = new InMemoryStateStore();
      const snapshot = createSnapshot();

      store.updateSnapshot(snapshot);

      const result = store.getCurrentSnapshot();
      expect(result).not.toBeNull();
      expect(result!.traceId).toBe('trace-aaa-111');
      expect(result!.timestamp).toBe('2026-02-25T12:00:00.000Z');
      expect(result!.tickNumber).toBe(1);
      expect(result!.rpc).toEqual({
        gasPrice: '0x3B9ACA00',
        maxPriorityFeePerGas: '0x59682F00',
        blockNumber: 1724206,
      });
      expect(result!.nodeMetrics).toEqual({
        cpuUsage: 42.7,
        networkLatency: 15.3,
      });
    });

    it('increments tickCount to 1 after first update', () => {
      const store = new InMemoryStateStore();
      store.updateSnapshot(createSnapshot());
      expect(store.getTickCount()).toBe(1);
    });
  });

  // ── DoD #4: IMMUTABILITY ───────────────────────────────────────

  describe('immutability (Object.freeze)', () => {
    it('top-level snapshot properties are frozen (throws in strict mode)', () => {
      const store = new InMemoryStateStore();
      store.updateSnapshot(createSnapshot());
      const result = store.getCurrentSnapshot()!;

      expect(() => {
        (result as { tickNumber: number }).tickNumber = 999;
      }).toThrow(TypeError);

      expect(result.tickNumber).toBe(1);
    });

    it('nested rpc object is frozen', () => {
      const store = new InMemoryStateStore();
      store.updateSnapshot(createSnapshot());
      const result = store.getCurrentSnapshot()!;

      expect(() => {
        (result.rpc as { gasPrice: string }).gasPrice = '0xHACKED';
      }).toThrow(TypeError);

      expect(result.rpc!.gasPrice).toBe('0x3B9ACA00');
    });

    it('nested nodeMetrics object is frozen', () => {
      const store = new InMemoryStateStore();
      store.updateSnapshot(createSnapshot());
      const result = store.getCurrentSnapshot()!;

      expect(() => {
        (result.nodeMetrics as { cpuUsage: number }).cpuUsage = 0;
      }).toThrow(TypeError);

      expect(result.nodeMetrics!.cpuUsage).toBe(42.7);
    });

    it('nested sources.rpc object is frozen', () => {
      const store = new InMemoryStateStore();
      store.updateSnapshot(createSnapshot());
      const result = store.getCurrentSnapshot()!;

      expect(() => {
        (result.sources.rpc as { consecutiveFailures: number }).consecutiveFailures = 999;
      }).toThrow(TypeError);

      expect(result.sources.rpc.consecutiveFailures).toBe(0);
    });

    it('nested sources.nodeMetrics object is frozen', () => {
      const store = new InMemoryStateStore();
      store.updateSnapshot(createSnapshot());
      const result = store.getCurrentSnapshot()!;

      expect(() => {
        (result.sources.nodeMetrics as { status: string }).status = 'hacked';
      }).toThrow(TypeError);

      expect(result.sources.nodeMetrics.status).toBe(SourceStatus.CURRENT);
    });
  });

  // ── DoD #5: OVERWRITE ──────────────────────────────────────────

  describe('overwrite (latest wins)', () => {
    it('second update replaces the first snapshot', () => {
      const store = new InMemoryStateStore();

      const snapshotA = createSnapshot({ traceId: 'trace-A', tickNumber: 1 });
      const snapshotB = createSnapshot({ traceId: 'trace-B', tickNumber: 2 });

      store.updateSnapshot(snapshotA);
      store.updateSnapshot(snapshotB);

      const result = store.getCurrentSnapshot()!;
      expect(result.traceId).toBe('trace-B');
      expect(result.tickNumber).toBe(2);
    });

    it('tickCount is 2 after two updates', () => {
      const store = new InMemoryStateStore();

      store.updateSnapshot(createSnapshot({ traceId: 'A' }));
      store.updateSnapshot(createSnapshot({ traceId: 'B' }));

      expect(store.getTickCount()).toBe(2);
    });

    it('tickCount increments monotonically over many updates', () => {
      const store = new InMemoryStateStore();

      for (let i = 0; i < 10; i++) {
        store.updateSnapshot(createSnapshot({ traceId: `trace-${i}` }));
      }

      expect(store.getTickCount()).toBe(10);
      expect(store.getCurrentSnapshot()!.traceId).toBe('trace-9');
    });
  });

  // ── Architect critique #1: structuredClone isolation ────────────

  describe('caller isolation (structuredClone)', () => {
    it('does NOT freeze the callers original object', () => {
      const store = new InMemoryStateStore();
      const original = createSnapshot();

      store.updateSnapshot(original);

      // The caller's reference must still be mutable
      expect(Object.isFrozen(original)).toBe(false);

      // Prove it: mutating the caller's object must NOT throw
      (original as { tickNumber: number }).tickNumber = 999;
      expect(original.tickNumber).toBe(999);
    });

    it('mutating the callers object after store does NOT affect the stored copy', () => {
      const store = new InMemoryStateStore();
      const original = createSnapshot({ traceId: 'original' });

      store.updateSnapshot(original);

      // Mutate the caller's object
      (original as { traceId: string }).traceId = 'mutated';

      // Stored copy must be unaffected
      const stored = store.getCurrentSnapshot()!;
      expect(stored.traceId).toBe('original');
    });

    it('stored snapshot is a distinct object from the callers reference', () => {
      const store = new InMemoryStateStore();
      const original = createSnapshot();

      store.updateSnapshot(original);
      const stored = store.getCurrentSnapshot()!;

      // Different identity
      expect(stored).not.toBe(original);
      // Same data
      expect(stored.traceId).toBe(original.traceId);
    });

    it('nested objects are also cloned, not shared references', () => {
      const store = new InMemoryStateStore();
      const original = createSnapshot();

      store.updateSnapshot(original);

      // Mutate the caller's nested object
      (original.rpc as { gasPrice: string }).gasPrice = '0xMUTATED';

      // Stored nested object must be unaffected
      const stored = store.getCurrentSnapshot()!;
      expect(stored.rpc!.gasPrice).toBe('0x3B9ACA00');
    });
  });

  // ── Extra: null data fields ────────────────────────────────────

  describe('snapshots with null data fields', () => {
    it('stores a snapshot with rpc=null and nodeMetrics=null', () => {
      const store = new InMemoryStateStore();

      const snapshot = createSnapshot({
        rpc: null,
        nodeMetrics: null,
      });

      store.updateSnapshot(snapshot);
      const result = store.getCurrentSnapshot()!;

      expect(result.rpc).toBeNull();
      expect(result.nodeMetrics).toBeNull();
      expect(result.sources.rpc.status).toBe(SourceStatus.CURRENT);
    });
  });
});
