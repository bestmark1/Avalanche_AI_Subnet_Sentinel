// src/services/EthersRpcProvider.ts
// Implements IProvider — Resilient ethers.js v6 RPC wrapper.
// Exponential-backoff retry with jitter, AbortController timeout, structured logging.

import { JsonRpcProvider } from 'ethers';
import type { IProvider } from '../interfaces/IProvider.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { RpcData } from '../types/models.js';
import type { AppConfig } from '../config/AppConfig.js';
import { ProviderError } from '../errors/SentinelErrors.js';

/**
 * Error codes from ethers.js v6 that indicate a NON-retryable condition.
 * Any error NOT in this set is treated as retryable (network flicker, 429, 5xx, etc.).
 *
 * Rationale: for a monitoring system calling standard JSON-RPC methods
 * (eth_gasPrice, eth_blockNumber), the only non-retryable errors are
 * programming mistakes (bad arguments) or unsupported operations.
 * Everything else — network hiccups, rate limits, server errors — may recover.
 */
const NON_RETRYABLE_ERROR_CODES = new Set([
  'INVALID_ARGUMENT',
  'UNSUPPORTED_OPERATION',
  'NOT_IMPLEMENTED',
]);

/**
 * Hard timeout for the isConnected() health-check probe.
 * This is intentionally NOT configurable — it's a fast liveness check,
 * not a data-fetching operation. 3 seconds is generous for a single
 * eth_chainId round-trip on any non-broken network.
 */
const CONNECTIVITY_TIMEOUT_MS = 3_000;

// ── Chainlink Oracle Constants ────────────────────────────────────────────────

/**
 * Chainlink AVAX/USD Data Feed aggregator proxy on Avalanche C-Chain (mainnet).
 * Source: https://data.chain.link/feeds/avalanche/mainnet/avax-usd
 */
const CHAINLINK_AVAX_USD_ADDRESS = '0x0A77230d17318075983913bC2145DB16C7366156';

/**
 * 4-byte selector for `latestRoundData()`.
 * keccak256("latestRoundData()") = 0x50d25bcd...
 */
const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c';

/**
 * Minimum ABI-encoded response length for latestRoundData().
 *
 * latestRoundData() returns 5 values, each padded to 32 bytes:
 *   (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
 * Total: 5 × 32 = 160 bytes = 320 hex characters (excluding "0x" prefix).
 */
const CHAINLINK_RESPONSE_HEX_LENGTH = 320;

/**
 * EthersRpcProvider — Resilient RPC Wrapper
 *
 * Wraps ethers.js v6 JsonRpcProvider with:
 *   1. Exponential-backoff retry with jitter (configurable attempts & base delay)
 *   2. Per-operation AbortController timeout (configurable, default 5s)
 *   3. Bounded isConnected() probe with its own timeout (3s)
 *   4. Structured NDJSON logging with component scoping
 *   5. Optional wallet balance monitoring via eth_getBalance (soft-fail)
 *
 * The RPC calls within getGasMetrics() execute sequentially:
 *   1. eth_gasPrice               — required, retried
 *   2. eth_maxPriorityFeePerGas   — required, retried
 *   3. eth_blockNumber            — required, retried
 *   4. eth_getBalance             — optional (wallet balance), soft-fail
 *   5. eth_call → Chainlink       — informational (AVAX/USD price), soft-fail
 *
 * Calls 1–3 each have their OWN retry budget. ALL calls share a single
 * AbortController with a `timeoutMs` deadline. If the deadline fires mid-retry,
 * the operation aborts immediately — no wasted time.
 *
 * Wallet balance (eth_getBalance) is a soft-fail call:
 *   - Skipped entirely when walletAddress is null (not configured)
 *   - Any error (including abort timeout) is caught internally → returns null
 *   - Wallet balance failure never causes getGasMetrics() to throw
 *
 * Chainlink oracle (eth_call) is a soft-fail, single-attempt call:
 *   - Always executed — no external config flag required
 *   - Returns avaxUsdPrice and chainlinkUpdatedAt, or null/null on any failure
 *   - Uses raceAgainstAbort() for a single attempt (no retry budget wasted)
 *   - Chainlink failure never causes getGasMetrics() to throw
 *
 * Jitter strategy (SRE requirement):
 *   Each backoff delay is multiplied by a random factor in [0.5, 1.0).
 *   This prevents the "Thundering Herd" problem when multiple Sentinel
 *   instances retry against the same RPC endpoint simultaneously after
 *   a transient outage. The jitter factor is injected via constructor
 *   for deterministic testing.
 *
 * SOLID:
 *   - Single Responsibility: Only handles JSON-RPC communication + resilience
 *   - Dependency Inversion: Orchestrator depends on IProvider, never on ethers.js
 */
export class EthersRpcProvider implements IProvider {
  private readonly provider: JsonRpcProvider;
  private readonly logger: ILogger;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly retryBaseMs: number;
  private readonly jitterFn: () => number;
  private readonly walletAddress: string | null;

  constructor(
    config: AppConfig['rpc'],
    logger: ILogger,
    jitterFn: () => number = () => 0.5 + Math.random() * 0.5,
    walletAddress: string | null = null,
  ) {
    this.provider = new JsonRpcProvider(config.endpoint);
    this.logger = logger.child({ component: 'rpc-provider' });
    this.timeoutMs = config.timeoutMs;
    this.retryCount = config.retryCount;
    this.retryBaseMs = config.retryBaseMs;
    this.jitterFn = jitterFn;
    this.walletAddress = walletAddress;
  }

  /**
   * Fetches gas metrics, block number, and optional informational fields.
   *
   * Execution order (sequential, all sharing one AbortController deadline):
   *   1. eth_gasPrice               — retried, required
   *   2. eth_maxPriorityFeePerGas   — retried, required
   *   3. eth_blockNumber            — retried, required
   *   4. eth_getBalance             — soft-fail, skipped when walletAddress is null
   *   5. eth_call → Chainlink       — soft-fail, single attempt
   *
   * @returns RpcData with gas values, block number, wallet balance, and Chainlink price
   * @throws {ProviderError} if any of the first three calls exhausts all retries or timeout fires
   */
  public async getGasMetrics(): Promise<RpcData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger.debug('rpc_fetch_start');

      // ── Required calls — each with its own retry budget ───────────────────
      const gasPrice = await this.fetchWithRetry(
        'eth_gasPrice', [], controller.signal
      ) as string;

      const maxPriorityFeePerGas = await this.fetchWithRetry(
        'eth_maxPriorityFeePerGas', [], controller.signal
      ) as string;

      const blockNumberHex = await this.fetchWithRetry(
        'eth_blockNumber', [], controller.signal
      ) as string;

      // ── Soft-fail optional calls ───────────────────────────────────────────

      // Wallet balance — skipped when walletAddress is null, never throws
      const walletBalanceAvax = await this.fetchWalletBalanceAvax(controller.signal);

      // Chainlink AVAX/USD oracle — single attempt, never throws
      const { avaxUsdPrice, chainlinkUpdatedAt } =
        await this.fetchChainlinkPrice(controller.signal);

      const rpcData: RpcData = {
        gasPrice,
        maxPriorityFeePerGas,
        blockNumber: Number(blockNumberHex),
        walletBalanceAvax,
        avaxUsdPrice,
        chainlinkUpdatedAt,
      };

      this.logger.debug('rpc_fetch_success', {
        gasPrice: rpcData.gasPrice,
        maxPriorityFeePerGas: rpcData.maxPriorityFeePerGas,
        blockNumber: rpcData.blockNumber,
        walletBalanceAvax: rpcData.walletBalanceAvax,
        avaxUsdPrice: rpcData.avaxUsdPrice,
        chainlinkUpdatedAt: rpcData.chainlinkUpdatedAt,
      });

      return rpcData;
    } catch (error: unknown) {
      // If the abort signal fired, wrap the error with timeout context
      if (controller.signal.aborted && !(error instanceof ProviderError)) {
        throw new ProviderError(
          `RPC operation timed out after ${this.timeoutMs}ms`,
          0,
          this.retryCount,
          error instanceof Error ? error : undefined
        );
      }
      // ProviderError from fetchWithRetry — re-throw as-is
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Tests RPC endpoint connectivity by calling eth_chainId.
   * Used at startup to fail fast on misconfigured endpoints.
   *
   * Bounded by a strict 3s timeout via Promise.race to prevent
   * the caller from hanging indefinitely if the RPC endpoint
   * accepts the TCP connection but never responds (SRE critique #1).
   *
   * @returns true if the endpoint responds within 3s, false otherwise (never throws)
   */
  public async isConnected(): Promise<boolean> {
    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`isConnected timed out after ${CONNECTIVITY_TIMEOUT_MS}ms`)),
          CONNECTIVITY_TIMEOUT_MS
        );
      });

      const chainId = await Promise.race([
        this.provider.send('eth_chainId', []),
        timeoutPromise,
      ]) as string;

      this.logger.debug('rpc_connectivity_check', {
        connected: true,
        chainId,
      });
      return true;
    } catch (error: unknown) {
      this.logger.warn('rpc_connectivity_check', {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Releases ethers.js provider resources during graceful shutdown.
   */
  public async destroy(): Promise<void> {
    try {
      this.provider.destroy();
      this.logger.debug('rpc_provider_destroyed');
    } catch (error: unknown) {
      this.logger.warn('rpc_provider_destroy_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Private: Wallet Balance ────────────────────────────────────

  /**
   * Fetches the AVAX balance of the configured wallet address via eth_getBalance.
   *
   * Soft-fail contract:
   *   - Returns null immediately if walletAddress is null (not configured)
   *   - Returns null on ANY error (retry exhaustion, abort, parse failure)
   *   - Never throws — wallet balance is informational, not critical
   *
   * The call shares the parent AbortController signal, so it aborts cleanly
   * if the global RPC timeout fires before this call completes.
   *
   * @param signal — AbortSignal from the parent AbortController in getGasMetrics()
   * @returns AVAX balance as a float, or null on skip/failure
   */
  private async fetchWalletBalanceAvax(signal: AbortSignal): Promise<number | null> {
    if (this.walletAddress === null) return null;

    try {
      const hexWei = await this.fetchWithRetry(
        'eth_getBalance',
        [this.walletAddress, 'latest'],
        signal,
      ) as string;

      return EthersRpcProvider.hexWeiToAvax(hexWei);
    } catch {
      // Soft fail — wallet balance failure never propagates to getGasMetrics()
      return null;
    }
  }

  /**
   * Fetches the current AVAX/USD price from the Chainlink aggregator on C-Chain.
   *
   * Soft-fail contract:
   *   - Makes a single eth_call attempt (no retry loop) via raceAgainstAbort().
   *   - Returns { avaxUsdPrice: null, chainlinkUpdatedAt: null } on ANY failure:
   *     abort, malformed response, parse error, or non-finite value.
   *   - Never throws — Chainlink data is informational and must not block the tick.
   *
   * ABI decoding of latestRoundData() return value (5 × 32-byte words):
   *   word 0 [hex 0..63]:    roundId      (uint80)  — unused
   *   word 1 [hex 64..127]:  answer       (int256)  — price × 10^8
   *   word 2 [hex 128..191]: startedAt    (uint256) — unused
   *   word 3 [hex 192..255]: updatedAt    (uint256) — Unix timestamp (seconds)
   *   word 4 [hex 256..319]: answeredInRound (uint80) — unused
   *
   * Network partition signal:
   *   A significantly stale chainlinkUpdatedAt may indicate the node cannot
   *   reach Chainlink infrastructure. AiAnalysisService surfaces this fact
   *   to the LLM for root-cause analysis.
   *
   * @param signal — AbortSignal from the parent AbortController in getGasMetrics()
   * @returns { avaxUsdPrice, chainlinkUpdatedAt } or { null, null } on any failure
   */
  private async fetchChainlinkPrice(
    signal: AbortSignal,
  ): Promise<{ avaxUsdPrice: number | null; chainlinkUpdatedAt: number | null }> {
    const NULL_RESULT = { avaxUsdPrice: null, chainlinkUpdatedAt: null };

    try {
      const hexData = await this.raceAgainstAbort(
        this.provider.send('eth_call', [
          { to: CHAINLINK_AVAX_USD_ADDRESS, data: LATEST_ROUND_DATA_SELECTOR },
          'latest',
        ]),
        signal,
      ) as string;

      // Strip the "0x" prefix before slicing into 32-byte (64-char) words.
      const hex = typeof hexData === 'string' && hexData.startsWith('0x')
        ? hexData.slice(2)
        : String(hexData ?? '');

      if (hex.length < CHAINLINK_RESPONSE_HEX_LENGTH) {
        this.logger.warn('chainlink_response_malformed', {
          expectedLength: CHAINLINK_RESPONSE_HEX_LENGTH,
          actualLength: hex.length,
        });
        return NULL_RESULT;
      }

      // ── word 1: answer (int256) — AVAX/USD price with 8 decimal places ────
      const answerHex = hex.slice(64, 128);
      const answerBig = BigInt('0x' + answerHex);
      const avaxUsdPrice = Number(answerBig) / 1e8;

      // ── word 3: updatedAt (uint256) — Unix timestamp in seconds ──────────
      const updatedAtHex = hex.slice(192, 256);
      const updatedAtBig = BigInt('0x' + updatedAtHex);
      const chainlinkUpdatedAt = Number(updatedAtBig);

      // Guard against BigInt→Number overflow or NaN
      if (!Number.isFinite(avaxUsdPrice) || !Number.isFinite(chainlinkUpdatedAt)) {
        this.logger.warn('chainlink_decode_overflow', {
          answerHex,
          updatedAtHex,
        });
        return NULL_RESULT;
      }

      this.logger.debug('chainlink_price_fetched', {
        avaxUsdPrice,
        chainlinkUpdatedAt,
      });

      return { avaxUsdPrice, chainlinkUpdatedAt };
    } catch (err: unknown) {
      // Log at WARN so operators can diagnose Chainlink RPC failures in production.
      // Not ERROR because Chainlink data is informational — the tick continues normally.
      this.logger.warn('chainlink_fetch_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return NULL_RESULT;
    }
  }

  /**
   * Converts a wei hex string to an AVAX float (1 AVAX = 1e18 wei).
   *
   * Returns null on any parse failure — callers treat null as "skip check".
   * Does NOT throw. Safe to call with untrusted RPC output.
   *
   * @param hexWei — e.g. "0x1BC16D674EC80000" (2 AVAX = 2_000_000_000_000_000_000 wei)
   * @returns AVAX as a floating-point number, or null if unparseable or non-finite
   */
  private static hexWeiToAvax(hexWei: string): number | null {
    try {
      const wei = BigInt(hexWei);
      const avax = Number(wei) / 1e18;
      return Number.isFinite(avax) ? avax : null;
    } catch {
      return null;
    }
  }

  // ── Private: Retry Engine ──────────────────────────────────────

  /**
   * Executes a single JSON-RPC call with exponential-backoff retry + jitter.
   *
   * Retry timing (with default config: 3 attempts, 500ms base, jitter ∈ [0.5, 1.0)):
   *   Attempt 1: immediate
   *   Attempt 2: wait 500ms  × jitter  (base × 2^0 × jitter → 250..500ms)
   *   Attempt 3: wait 1000ms × jitter  (base × 2^1 × jitter → 500..1000ms)
   *   → All exhausted: throw ProviderError
   *
   * The jitter factor prevents the "Thundering Herd" problem when multiple
   * Sentinel instances retry simultaneously after a transient RPC outage
   * (SRE critique #2).
   *
   * The AbortSignal is checked:
   *   - Before each attempt (fail fast if deadline already passed)
   *   - During each RPC call (raced against abort promise)
   *   - During each backoff sleep (interrupted immediately on abort)
   *
   * @param method  JSON-RPC method name (e.g., "eth_gasPrice")
   * @param params  JSON-RPC parameters array
   * @param signal  AbortSignal from the parent AbortController
   * @returns       The raw JSON-RPC result value
   * @throws {ProviderError} on all retries exhausted, timeout, or non-retryable error
   */
  private async fetchWithRetry(
    method: string,
    params: unknown[],
    signal: AbortSignal
  ): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      // ── Pre-flight: abort check ──
      if (signal.aborted) {
        throw new ProviderError(
          `RPC call "${method}" aborted (timeout) before attempt ${attempt}`,
          attempt,
          this.retryCount,
          lastError
        );
      }

      try {
        // ── Execute: race RPC call against abort signal ──
        const result = await this.raceAgainstAbort(
          this.provider.send(method, params),
          signal
        );
        return result;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // ── Abort fired during the call ──
        if (signal.aborted) {
          throw new ProviderError(
            `RPC call "${method}" aborted (timeout) during attempt ${attempt}`,
            attempt,
            this.retryCount,
            lastError
          );
        }

        // ── Non-retryable error: fail immediately, don't waste attempts ──
        if (!this.isRetryableError(lastError)) {
          this.logger.error('rpc_fetch_non_retryable', {
            method,
            attempt,
            maxAttempts: this.retryCount,
            errorCode: (lastError as { code?: string }).code ?? 'UNKNOWN',
            error: lastError.message,
          });
          throw new ProviderError(
            `RPC call "${method}" failed with non-retryable error: ${lastError.message}`,
            attempt,
            this.retryCount,
            lastError
          );
        }

        // ── Retryable error: log + jittered backoff (unless last attempt) ──
        if (attempt < this.retryCount) {
          const baseDelay = this.retryBaseMs * Math.pow(2, attempt - 1);
          const delayMs = Math.round(baseDelay * this.jitterFn());
          this.logger.warn('rpc_fetch_retry', {
            method,
            attempt,
            maxAttempts: this.retryCount,
            nextAttempt: attempt + 1,
            delayMs,
            error: lastError.message,
          });
          await this.abortAwareSleep(delayMs, signal);
        }
      }
    }

    // ── All retries exhausted ──
    this.logger.warn('rpc_fetch_failed', {
      method,
      totalAttempts: this.retryCount,
      error: lastError?.message ?? 'Unknown error',
    });

    throw new ProviderError(
      `RPC call "${method}" failed after ${this.retryCount} attempts: ${lastError?.message ?? 'Unknown'}`,
      this.retryCount,
      this.retryCount,
      lastError
    );
  }

  // ── Private: Abort-Aware Primitives ────────────────────────────

  /**
   * Races a promise against the AbortSignal.
   * If the signal fires before the promise settles, rejects immediately.
   * Cleans up the abort listener in all cases to prevent memory leaks.
   */
  private raceAgainstAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(new Error('Aborted'));
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const onAbort = (): void => {
        if (!settled) {
          settled = true;
          reject(new Error('Aborted'));
        }
      };

      signal.addEventListener('abort', onAbort, { once: true });

      promise.then(
        (value) => {
          if (!settled) {
            settled = true;
            signal.removeEventListener('abort', onAbort);
            resolve(value);
          }
        },
        (error: unknown) => {
          if (!settled) {
            settled = true;
            signal.removeEventListener('abort', onAbort);
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Sleeps for the specified duration but wakes immediately if the AbortSignal fires.
   * Prevents wasting backoff time when the global timeout has already expired.
   */
  private abortAwareSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = (): void => {
        clearTimeout(timeoutId);
        reject(new Error('Aborted'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  // ── Private: Error Classification ─────────────────────────────

  /**
   * Determines whether an error is worth retrying.
   *
   * Retryable (returns true):
   *   - Network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, etc.)
   *   - HTTP 429 Too Many Requests (rate limiting)
   *   - HTTP 5xx Server Errors
   *   - ethers.js NETWORK_ERROR, SERVER_ERROR, TIMEOUT codes
   *   - Unknown/unclassified errors (retry cautiously)
   *
   * Non-retryable (returns false):
   *   - INVALID_ARGUMENT (programming error — will never succeed)
   *   - UNSUPPORTED_OPERATION (method doesn't exist)
   *   - NOT_IMPLEMENTED
   *   - HTTP 4xx (except 429) — client errors
   */
  private isRetryableError(error: Error): boolean {
    // Check ethers.js error code
    const ethersCode = (error as { code?: string }).code;
    if (ethersCode !== undefined && NON_RETRYABLE_ERROR_CODES.has(ethersCode)) {
      return false;
    }

    // Check HTTP status code (ethers wraps it in various places)
    const status = this.extractHttpStatus(error);
    if (status !== null) {
      // 429 = rate limited → retryable
      if (status === 429) return true;
      // 5xx = server error → retryable
      if (status >= 500) return true;
      // 4xx (except 429) = client error → non-retryable
      if (status >= 400) return false;
    }

    // Default: unknown errors are retryable (network flicker, DNS, etc.)
    return true;
  }

  /**
   * Attempts to extract an HTTP status code from an ethers.js error.
   * ethers v6 stores status in different places depending on the error type.
   */
  private extractHttpStatus(error: Error): number | null {
    // ethers v6 may store status in error.info.responseStatus or error.status
    const shaped = error as {
      status?: number;
      info?: { responseStatus?: number };
      error?: { status?: number };
    };

    if (typeof shaped.status === 'number') return shaped.status;
    if (typeof shaped.info?.responseStatus === 'number') return shaped.info.responseStatus;
    if (typeof shaped.error?.status === 'number') return shaped.error.status;

    return null;
  }
}
