import type { IProvider } from '../interfaces/IProvider.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { RpcData } from '../types/models.js';
import type { AppConfig } from '../config/AppConfig.js';
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
export declare class EthersRpcProvider implements IProvider {
    private readonly provider;
    private readonly logger;
    private readonly timeoutMs;
    private readonly retryCount;
    private readonly retryBaseMs;
    private readonly jitterFn;
    private readonly walletAddress;
    constructor(config: AppConfig['rpc'], logger: ILogger, jitterFn?: () => number, walletAddress?: string | null);
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
    getGasMetrics(): Promise<RpcData>;
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
    isConnected(): Promise<boolean>;
    /**
     * Releases ethers.js provider resources during graceful shutdown.
     */
    destroy(): Promise<void>;
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
    private fetchWalletBalanceAvax;
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
    private fetchChainlinkPrice;
    /**
     * Converts a wei hex string to an AVAX float (1 AVAX = 1e18 wei).
     *
     * Returns null on any parse failure — callers treat null as "skip check".
     * Does NOT throw. Safe to call with untrusted RPC output.
     *
     * @param hexWei — e.g. "0x1BC16D674EC80000" (2 AVAX = 2_000_000_000_000_000_000 wei)
     * @returns AVAX as a floating-point number, or null if unparseable or non-finite
     */
    private static hexWeiToAvax;
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
    private fetchWithRetry;
    /**
     * Races a promise against the AbortSignal.
     * If the signal fires before the promise settles, rejects immediately.
     * Cleans up the abort listener in all cases to prevent memory leaks.
     */
    private raceAgainstAbort;
    /**
     * Sleeps for the specified duration but wakes immediately if the AbortSignal fires.
     * Prevents wasting backoff time when the global timeout has already expired.
     */
    private abortAwareSleep;
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
    private isRetryableError;
    /**
     * Attempts to extract an HTTP status code from an ethers.js error.
     * ethers v6 stores status in different places depending on the error type.
     */
    private extractHttpStatus;
}
//# sourceMappingURL=EthersRpcProvider.d.ts.map