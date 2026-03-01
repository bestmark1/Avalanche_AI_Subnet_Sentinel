import type { RpcData } from '../types/models.js';
/**
 * IProvider — Resilient RPC Wrapper
 *
 * Responsibilities:
 *   - Encapsulates ethers.js v6 JsonRpcProvider
 *   - Implements exponential-backoff retry (3 attempts, 500ms base)
 *   - Enforces 5s timeout per individual RPC call via AbortController
 *   - Returns strongly-typed RpcData or throws after all retries exhausted
 *
 * SOLID Alignment:
 *   - Single Responsibility: Only handles JSON-RPC communication
 *   - Open/Closed: New RPC methods added by extending, not modifying
 *   - Dependency Inversion: Orchestrator depends on IProvider, not ethers.js
 */
export interface IProvider {
    /**
     * Fetches eth_gasPrice, eth_maxPriorityFeePerGas, eth_blockNumber.
     * Each individual RPC call retries up to 3 times with exponential backoff.
     * Entire operation is bounded by SOURCE_TIMEOUT_MS (5s) via AbortController.
     *
     * @throws {ProviderError} if all retries exhausted or timeout exceeded
     */
    getGasMetrics(): Promise<RpcData>;
    /**
     * Checks RPC endpoint connectivity. Used at startup.
     * @returns true if a simple RPC call (eth_chainId) succeeds.
     */
    isConnected(): Promise<boolean>;
    /**
     * Releases ethers.js provider resources during graceful shutdown.
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=IProvider.d.ts.map