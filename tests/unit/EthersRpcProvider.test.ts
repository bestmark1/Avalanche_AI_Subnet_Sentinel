// tests/unit/EthersRpcProvider.test.ts
// Phase 2 DoD — all 7 verification checklist items + SRE critiques

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EthersRpcProvider } from '../../src/services/EthersRpcProvider.js';
import { ProviderError } from '../../src/errors/SentinelErrors.js';
import type { ILogger } from '../../src/interfaces/ILogger.js';
import type { AppConfig } from '../../src/config/AppConfig.js';

// ── Mock ethers.js ─────────────────────────────────────────────────
// We mock the entire ethers module so no real RPC calls are made.
// The mock provider's `send` method is what we control in each test.

const mockSend = vi.fn();
const mockDestroy = vi.fn();

vi.mock('ethers', () => ({
  JsonRpcProvider: vi.fn().mockImplementation(() => ({
    send: mockSend,
    destroy: mockDestroy,
  })),
}));

// ── Logger mock ────────────────────────────────────────────────────
// Captures all log calls so we can assert on retry warnings, etc.

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
      // Return the same mock so all logs are captured in one place
      return logger;
    },
  };

  return logger;
}

// ── Test config ────────────────────────────────────────────────────

function createTestConfig(overrides?: Partial<AppConfig['rpc']>): AppConfig['rpc'] {
  return {
    endpoint: 'https://api.avax-test.network/ext/bc/test/rpc',
    timeoutMs: 5000,
    retryCount: 3,
    retryBaseMs: 500,
    ...overrides,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Creates an error that looks like an ethers.js error with a code property */
function ethersError(message: string, code: string): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

/** Creates an error with an HTTP status code */
function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

/**
 * Silences Node's unhandled-rejection warning for promises we
 * intentionally let reject during fake-timer advancement.
 * Returns the original promise so all assertions still work.
 */
function allowReject<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {});
  return p;
}

/** No-jitter function — returns 1.0 so delays are deterministic in tests */
const NO_JITTER = (): number => 1.0;

// ════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════

describe('EthersRpcProvider', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSend.mockReset();
    mockDestroy.mockReset();
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── DoD #2: SUCCESS path ─────────────────────────────────────

  describe('getGasMetrics() — SUCCESS path', () => {
    it('returns correct RpcData shape when all 3 required RPC calls succeed', async () => {
      // Arrange: required calls return valid hex strings; Chainlink eth_call returns
      // a well-formed ABI-encoded latestRoundData() response.
      //
      // latestRoundData() ABI layout (5 × 32-byte words, hex without 0x prefix):
      //   word 0 [0..63]:    roundId       = 1
      //   word 1 [64..127]:  answer        = 0x9502F900 (2_500_000_000 = $25.00, 8 dec)
      //   word 2 [128..191]: startedAt     = 0
      //   word 3 [192..255]: updatedAt     = 0x65561480 (1_700_000_000)
      //   word 4 [256..319]: answeredInRound = 1
      // Hex verification:
      //   answer    = 0x9502F900 = 2_500_000_000  → 2_500_000_000 / 1e8 = 25.0
      //   updatedAt = 0x6553F100 = 1_700_000_000  (2023-11-14T22:13:20.000Z)
      const CHAINLINK_RESPONSE =
        '0x' +
        '0000000000000000000000000000000000000000000000000000000000000001' + // roundId
        '000000000000000000000000000000000000000000000000000000009502F900' + // answer ($25.00)
        '0000000000000000000000000000000000000000000000000000000000000000' + // startedAt
        '000000000000000000000000000000000000000000000000000000006553F100' + // updatedAt (1_700_000_000)
        '0000000000000000000000000000000000000000000000000000000000000001';  // answeredInRound

      mockSend
        .mockResolvedValueOnce('0x3B9ACA00')    // eth_gasPrice
        .mockResolvedValueOnce('0x59682F00')    // eth_maxPriorityFeePerGas
        .mockResolvedValueOnce('0x1A4F2E')      // eth_blockNumber
        .mockResolvedValueOnce(CHAINLINK_RESPONSE); // eth_call → Chainlink

      const provider = new EthersRpcProvider(createTestConfig(), logger);

      // Act
      const result = await provider.getGasMetrics();

      // Assert: correct shape and values
      expect(result).toEqual({
        gasPrice:             '0x3B9ACA00',
        maxPriorityFeePerGas: '0x59682F00',
        blockNumber:          0x1A4F2E,         // 1724206 in decimal
        walletBalanceAvax:    null,             // no WALLET_ADDRESS configured
        avaxUsdPrice:         25.0,             // 2_500_000_000 / 1e8
        chainlinkUpdatedAt:   1_700_000_000,    // 0x65561480
      });

      // Assert: 3 required + 1 Chainlink eth_call = 4 total mock send() calls
      expect(mockSend).toHaveBeenCalledTimes(4);
      expect(mockSend).toHaveBeenNthCalledWith(1, 'eth_gasPrice', []);
      expect(mockSend).toHaveBeenNthCalledWith(2, 'eth_maxPriorityFeePerGas', []);
      expect(mockSend).toHaveBeenNthCalledWith(3, 'eth_blockNumber', []);
      expect(mockSend).toHaveBeenNthCalledWith(4, 'eth_call', [
        { to: '0x0A77230d17318075983913bC2145CE16C8c82163', data: '0x50d25bcd' },
        'latest',
      ]);
    });

    it('returns null Chainlink fields when eth_call fails (soft-fail)', async () => {
      // Arrange: required calls succeed; Chainlink eth_call rejects
      mockSend
        .mockResolvedValueOnce('0x1')   // eth_gasPrice
        .mockResolvedValueOnce('0x2')   // eth_maxPriorityFeePerGas
        .mockResolvedValueOnce('0x3')   // eth_blockNumber
        .mockRejectedValueOnce(new Error('eth_call reverted'));  // Chainlink

      const provider = new EthersRpcProvider(createTestConfig(), logger);

      // Act — must NOT throw even though Chainlink rejected
      const result = await provider.getGasMetrics();

      // Assert: Chainlink fields are null; required fields are still populated
      expect(result.gasPrice).toBe('0x1');
      expect(result.avaxUsdPrice).toBeNull();
      expect(result.chainlinkUpdatedAt).toBeNull();
    });

    it('returns null Chainlink fields when response hex is too short (malformed)', async () => {
      mockSend
        .mockResolvedValueOnce('0x1')
        .mockResolvedValueOnce('0x2')
        .mockResolvedValueOnce('0x3')
        .mockResolvedValueOnce('0xdeadbeef'); // too short — not a valid ABI response

      const provider = new EthersRpcProvider(createTestConfig(), logger);
      const result = await provider.getGasMetrics();

      expect(result.avaxUsdPrice).toBeNull();
      expect(result.chainlinkUpdatedAt).toBeNull();

      // The malformed-response warning should be logged
      const malformedLogs = logger.calls.filter(
        (c) => c.message === 'chainlink_response_malformed'
      );
      expect(malformedLogs).toHaveLength(1);
    });

    it('logs rpc_fetch_start and rpc_fetch_success on clean success', async () => {
      mockSend
        .mockResolvedValueOnce('0x1')
        .mockResolvedValueOnce('0x2')
        .mockResolvedValueOnce('0x3');

      const provider = new EthersRpcProvider(createTestConfig(), logger);
      await provider.getGasMetrics();

      const messages = logger.calls.map((c) => c.message);
      expect(messages).toContain('rpc_fetch_start');
      expect(messages).toContain('rpc_fetch_success');
    });

    it('converts blockNumber from hex to decimal number', async () => {
      mockSend
        .mockResolvedValueOnce('0x0')
        .mockResolvedValueOnce('0x0')
        .mockResolvedValueOnce('0xFF');     // 255 in decimal

      const provider = new EthersRpcProvider(createTestConfig(), logger);
      const result = await provider.getGasMetrics();

      expect(result.blockNumber).toBe(255);
      expect(typeof result.blockNumber).toBe('number');
    });
  });

  // ── DoD #3: RETRY path ───────────────────────────────────────

  describe('getGasMetrics() — RETRY path', () => {
    it('succeeds after 2 retries when eth_gasPrice fails twice then succeeds', async () => {
      // Arrange: eth_gasPrice fails twice, succeeds on 3rd attempt
      mockSend
        .mockRejectedValueOnce(new Error('network error'))     // attempt 1 — fail
        .mockRejectedValueOnce(new Error('network error'))     // attempt 2 — fail
        .mockResolvedValueOnce('0xAA')                         // attempt 3 — success
        .mockResolvedValueOnce('0xBB')                         // eth_maxPriorityFeePerGas
        .mockResolvedValueOnce('0xCC');                         // eth_blockNumber

      // Inject NO_JITTER so delays are deterministic
      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 10 }),
        logger,
        NO_JITTER
      );

      // Act: advance timers for the backoff delays
      const promise = provider.getGasMetrics();

      // Advance past retry delay 1 (10ms * 2^0 * 1.0 = 10ms)
      await vi.advanceTimersByTimeAsync(10);
      // Advance past retry delay 2 (10ms * 2^1 * 1.0 = 20ms)
      await vi.advanceTimersByTimeAsync(20);

      const result = await promise;

      // Assert: operation succeeded
      expect(result.gasPrice).toBe('0xAA');
      expect(result.maxPriorityFeePerGas).toBe('0xBB');

      // Assert: exactly 2 retry warnings logged for eth_gasPrice
      const retryLogs = logger.calls.filter(
        (c) => c.message === 'rpc_fetch_retry' && c.method === 'warn'
      );
      expect(retryLogs).toHaveLength(2);

      // Verify retry log contents
      expect(retryLogs[0].data?.attempt).toBe(1);
      expect(retryLogs[0].data?.method).toBe('eth_gasPrice');
      expect(retryLogs[1].data?.attempt).toBe(2);
      expect(retryLogs[1].data?.method).toBe('eth_gasPrice');
    });

    it('retries with correct exponential backoff delays (no jitter)', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('fail'))   // attempt 1
        .mockRejectedValueOnce(new Error('fail'))   // attempt 2
        .mockResolvedValueOnce('0x1')                // attempt 3 succeeds
        .mockResolvedValueOnce('0x2')
        .mockResolvedValueOnce('0x3');

      // Inject NO_JITTER so delays are deterministic for assertion
      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 100 }),
        logger,
        NO_JITTER
      );

      const promise = provider.getGasMetrics();

      // First retry: 100ms * 2^0 * 1.0 = 100ms delay
      await vi.advanceTimersByTimeAsync(100);
      // Second retry: 100ms * 2^1 * 1.0 = 200ms delay
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result.gasPrice).toBe('0x1');

      // Verify logged delays match the exponential formula (with jitter = 1.0)
      const retryLogs = logger.calls.filter((c) => c.message === 'rpc_fetch_retry');
      expect(retryLogs[0].data?.delayMs).toBe(100);   // 100 * 2^0 * 1.0
      expect(retryLogs[1].data?.delayMs).toBe(200);   // 100 * 2^1 * 1.0
    });

    it('applies jitter factor to backoff delays (SRE critique #2)', async () => {
      mockSend
        .mockRejectedValueOnce(new Error('fail'))   // attempt 1
        .mockRejectedValueOnce(new Error('fail'))   // attempt 2
        .mockResolvedValueOnce('0x1')                // attempt 3 succeeds
        .mockResolvedValueOnce('0x2')
        .mockResolvedValueOnce('0x3');

      // Inject a deterministic jitter of 0.75 to verify multiplication
      const JITTER_075 = (): number => 0.75;
      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 100 }),
        logger,
        JITTER_075
      );

      const promise = provider.getGasMetrics();

      // First retry: round(100 * 2^0 * 0.75) = round(75) = 75ms
      await vi.advanceTimersByTimeAsync(75);
      // Second retry: round(100 * 2^1 * 0.75) = round(150) = 150ms
      await vi.advanceTimersByTimeAsync(150);

      const result = await promise;
      expect(result.gasPrice).toBe('0x1');

      const retryLogs = logger.calls.filter((c) => c.message === 'rpc_fetch_retry');
      expect(retryLogs[0].data?.delayMs).toBe(75);    // round(100 * 1 * 0.75)
      expect(retryLogs[1].data?.delayMs).toBe(150);   // round(200 * 0.75)
    });
  });

  // ── DoD #4: ALL RETRIES EXHAUSTED ────────────────────────────

  describe('getGasMetrics() — ALL RETRIES EXHAUSTED', () => {
    it('throws ProviderError with correct attempt/maxAttempts after 3 failures', async () => {
      // Arrange: eth_gasPrice fails all 3 attempts
      mockSend.mockRejectedValue(new Error('persistent failure'));

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());

      // Advance timers to clear all backoff delays
      await vi.advanceTimersByTimeAsync(100);

      // Assert: throws ProviderError with correct properties
      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(ProviderError);
      expect(caught!.attempt).toBe(3);
      expect(caught!.maxAttempts).toBe(3);
      expect(caught!.message).toContain('eth_gasPrice');
      expect(caught!.message).toContain('3 attempts');
      // cause is preserved (check by value — mock boundary may alter prototype)
      expect(caught!.cause).toBeDefined();
      expect(caught!.cause?.message).toBe('persistent failure');
    });

    it('logs rpc_fetch_failed when all retries are exhausted', async () => {
      mockSend.mockRejectedValue(new Error('fail'));

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(100);

      // Consume the rejection
      try { await promise; } catch { /* expected */ }

      const failedLogs = logger.calls.filter((c) => c.message === 'rpc_fetch_failed');
      expect(failedLogs).toHaveLength(1);
      expect(failedLogs[0].data?.method).toBe('eth_gasPrice');
      expect(failedLogs[0].data?.totalAttempts).toBe(3);
    });

    it('fails on second RPC call while first succeeded', async () => {
      // eth_gasPrice succeeds, eth_maxPriorityFeePerGas fails all retries
      mockSend
        .mockResolvedValueOnce('0xAA')                           // gasPrice OK
        .mockRejectedValueOnce(new Error('fail'))                // maxPriority attempt 1
        .mockRejectedValueOnce(new Error('fail'))                // maxPriority attempt 2
        .mockRejectedValueOnce(new Error('persistent'));         // maxPriority attempt 3

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(100);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);
      expect(caught!.message).toContain('eth_maxPriorityFeePerGas');
    });
  });

  // ── DoD #5: TIMEOUT path ─────────────────────────────────────

  describe('getGasMetrics() — TIMEOUT path', () => {
    it('aborts when the operation exceeds timeoutMs', async () => {
      // Arrange: RPC call never resolves (hangs forever)
      mockSend.mockImplementation(
        () => new Promise(() => {
          /* never resolves */
        })
      );

      const provider = new EthersRpcProvider(
        createTestConfig({ timeoutMs: 100, retryBaseMs: 10 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());

      // Advance past the 100ms timeout
      await vi.advanceTimersByTimeAsync(150);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);
      expect(caught!.message).toContain('aborted');
    });

    it('aborts during a retry backoff sleep if timeout fires', async () => {
      // First attempt fails, then during the backoff sleep the timeout fires
      mockSend.mockRejectedValueOnce(new Error('transient'));
      // Second call never gets to execute because timeout fires during sleep

      const provider = new EthersRpcProvider(
        createTestConfig({
          timeoutMs: 50,     // 50ms total timeout
          retryBaseMs: 200,  // 200ms backoff delay (longer than timeout)
        }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());

      // Advance time: attempt 1 fails instantly, then backoff starts (200ms),
      // but timeout fires at 50ms into the backoff
      await vi.advanceTimersByTimeAsync(60);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);
    });
  });

  // ── DoD #6: isConnected() ────────────────────────────────────

  describe('isConnected()', () => {
    it('returns true when eth_chainId succeeds', async () => {
      mockSend.mockResolvedValueOnce('0xa869'); // Fuji chain ID

      const provider = new EthersRpcProvider(createTestConfig(), logger);
      const result = await provider.isConnected();

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith('eth_chainId', []);
    });

    it('returns false when eth_chainId fails (does NOT throw)', async () => {
      mockSend.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const provider = new EthersRpcProvider(createTestConfig(), logger);
      const result = await provider.isConnected();

      expect(result).toBe(false);
    });

    it('logs the connectivity check result', async () => {
      mockSend.mockResolvedValueOnce('0xa869');

      const provider = new EthersRpcProvider(createTestConfig(), logger);
      await provider.isConnected();

      const checkLogs = logger.calls.filter(
        (c) => c.message === 'rpc_connectivity_check'
      );
      expect(checkLogs).toHaveLength(1);
      expect(checkLogs[0].data?.connected).toBe(true);
      expect(checkLogs[0].data?.chainId).toBe('0xa869');
    });

    it('returns false when RPC hangs past the 3s connectivity timeout (SRE critique #1)', async () => {
      // Arrange: eth_chainId never resolves — simulates a hung TCP connection
      mockSend.mockImplementation(
        () => new Promise(() => { /* never resolves */ })
      );

      const provider = new EthersRpcProvider(createTestConfig(), logger);

      const promise = provider.isConnected();

      // Advance past the 3000ms connectivity timeout
      await vi.advanceTimersByTimeAsync(3_100);

      const result = await promise;

      // Assert: returns false (not hang, not throw)
      expect(result).toBe(false);

      // Assert: logs the timeout
      const checkLogs = logger.calls.filter(
        (c) => c.message === 'rpc_connectivity_check'
      );
      expect(checkLogs).toHaveLength(1);
      expect(checkLogs[0].data?.connected).toBe(false);
      expect((checkLogs[0].data?.error as string)).toContain('timed out');
    });
  });

  // ── destroy() ────────────────────────────────────────────────

  describe('destroy()', () => {
    it('calls provider.destroy() and logs success', async () => {
      const provider = new EthersRpcProvider(createTestConfig(), logger);
      await provider.destroy();

      expect(mockDestroy).toHaveBeenCalledTimes(1);

      const destroyLogs = logger.calls.filter(
        (c) => c.message === 'rpc_provider_destroyed'
      );
      expect(destroyLogs).toHaveLength(1);
    });

    it('does not throw if provider.destroy() fails', async () => {
      mockDestroy.mockImplementation(() => {
        throw new Error('destroy failed');
      });

      const provider = new EthersRpcProvider(createTestConfig(), logger);

      // Should not throw
      await expect(provider.destroy()).resolves.toBeUndefined();

      // But should log a warning
      const warnLogs = logger.calls.filter(
        (c) => c.message === 'rpc_provider_destroy_failed'
      );
      expect(warnLogs).toHaveLength(1);
    });
  });

  // ── Error Classification ─────────────────────────────────────

  describe('error classification — retryable vs non-retryable', () => {
    it('does NOT retry on INVALID_ARGUMENT errors', async () => {
      mockSend.mockRejectedValue(ethersError('bad arg', 'INVALID_ARGUMENT'));

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(50);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);

      // Should fail on first attempt — no retries
      expect(mockSend).toHaveBeenCalledTimes(1);

      const nonRetryLogs = logger.calls.filter(
        (c) => c.message === 'rpc_fetch_non_retryable'
      );
      expect(nonRetryLogs).toHaveLength(1);
    });

    it('does NOT retry on UNSUPPORTED_OPERATION errors', async () => {
      mockSend.mockRejectedValue(
        ethersError('unsupported', 'UNSUPPORTED_OPERATION')
      );

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(50);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);
      expect(mockSend).toHaveBeenCalledTimes(1); // No retries
    });

    it('DOES retry on HTTP 429 (rate limited)', async () => {
      const rateLimitErr = httpError('Too Many Requests', 429);

      mockSend
        .mockRejectedValueOnce(rateLimitErr)     // attempt 1 — 429
        .mockResolvedValueOnce('0x1')             // attempt 2 — success (eth_gasPrice)
        .mockResolvedValueOnce('0x2')             // eth_maxPriorityFeePerGas
        .mockResolvedValueOnce('0x3');            // eth_blockNumber
      // 5th call (Chainlink eth_call) returns undefined → caught softly → null

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = provider.getGasMetrics();
      await vi.advanceTimersByTimeAsync(50);

      const result = await promise;
      expect(result.gasPrice).toBe('0x1');
      expect(mockSend).toHaveBeenCalledTimes(5); // 1 fail + 3 success + 1 Chainlink
    });

    it('DOES retry on HTTP 503 (server error)', async () => {
      const serverErr = httpError('Service Unavailable', 503);

      mockSend
        .mockRejectedValueOnce(serverErr)
        .mockResolvedValueOnce('0x1')
        .mockResolvedValueOnce('0x2')
        .mockResolvedValueOnce('0x3');

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = provider.getGasMetrics();
      await vi.advanceTimersByTimeAsync(50);

      const result = await promise;
      expect(result.gasPrice).toBe('0x1');
    });

    it('DOES retry on NETWORK_ERROR', async () => {
      mockSend
        .mockRejectedValueOnce(ethersError('socket hang up', 'NETWORK_ERROR'))
        .mockResolvedValueOnce('0x1')
        .mockResolvedValueOnce('0x2')
        .mockResolvedValueOnce('0x3');

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = provider.getGasMetrics();
      await vi.advanceTimersByTimeAsync(50);

      const result = await promise;
      expect(result.gasPrice).toBe('0x1');
    });

    it('does NOT retry on HTTP 400 (bad request — client error)', async () => {
      mockSend.mockRejectedValue(httpError('Bad Request', 400));

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(50);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);
      expect(mockSend).toHaveBeenCalledTimes(1); // No retries
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles retryCount of 1 (no retries at all)', async () => {
      mockSend.mockRejectedValue(new Error('fail'));

      const provider = new EthersRpcProvider(
        createTestConfig({ retryCount: 1, retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(50);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeInstanceOf(ProviderError);
      expect(caught!.attempt).toBe(1);
      expect(caught!.maxAttempts).toBe(1);

      // No retry logs — only 1 attempt
      const retryLogs = logger.calls.filter((c) => c.message === 'rpc_fetch_retry');
      expect(retryLogs).toHaveLength(0);
    });

    it('preserves the original error as cause in ProviderError', async () => {
      const originalError = new Error('ECONNREFUSED: connection refused');
      mockSend.mockRejectedValue(originalError);

      const provider = new EthersRpcProvider(
        createTestConfig({ retryBaseMs: 1 }),
        logger,
        NO_JITTER
      );

      const promise = allowReject(provider.getGasMetrics());
      await vi.advanceTimersByTimeAsync(100);

      let caught: ProviderError | undefined;
      try {
        await promise;
      } catch (error) {
        caught = error as ProviderError;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(ProviderError);
      // Check cause by value — mock boundary may alter Error prototype
      expect(caught!.cause).toBeDefined();
      expect(caught!.cause?.message).toBe('ECONNREFUSED: connection refused');
    });
  });
});
