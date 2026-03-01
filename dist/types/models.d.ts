import { SourceStatus, AlertSeverity } from './enums.js';
/** Metadata tracking the health of a single data source */
export interface SourceHealth {
    readonly status: SourceStatus;
    readonly lastSuccessAt: string | null;
    readonly lastFailureAt: string | null;
    readonly lastErrorMessage: string | null;
    readonly consecutiveFailures: number;
    readonly alertSeverity: AlertSeverity;
}
/** Data returned by the RPC Provider */
export interface RpcData {
    readonly gasPrice: string;
    readonly maxPriorityFeePerGas: string;
    readonly blockNumber: number;
    /**
     * AVAX balance of the configured wallet address.
     * null when WALLET_ADDRESS is not set or the eth_getBalance call failed.
     * Populated by EthersRpcProvider.fetchWalletBalanceAvax() (soft-fail).
     */
    readonly walletBalanceAvax: number | null;
    /**
     * AVAX/USD spot price sourced from the Chainlink AVAX/USD aggregator on C-Chain.
     * Decoded from latestRoundData().answer (int256, 8 decimal places).
     * null when the eth_call failed, the response was malformed, or the result was non-finite.
     * Populated by EthersRpcProvider.fetchChainlinkPrice() (soft-fail).
     */
    readonly avaxUsdPrice: number | null;
    /**
     * Unix timestamp (seconds) of the last Chainlink oracle round update.
     * Decoded from latestRoundData().updatedAt (uint256).
     * Useful for detecting network partition: a very stale timestamp may indicate
     * the node cannot reach Chainlink infrastructure.
     * null when the eth_call failed or the value was non-finite.
     */
    readonly chainlinkUpdatedAt: number | null;
}
/** Data returned by the Metrics Collector after regex parsing */
export interface NodeMetricsData {
    readonly cpuUsage: number;
    readonly networkLatency: number;
}
/** The unified snapshot the system produces every tick */
export interface SubnetSnapshot {
    readonly traceId: string;
    readonly timestamp: string;
    readonly tickNumber: number;
    readonly rpc: RpcData | null;
    readonly nodeMetrics: NodeMetricsData | null;
    /**
     * AVAX balance of the configured wallet address, mirrored from rpc.walletBalanceAvax.
     * null when rpc is null, WALLET_ADDRESS is not set, or the balance fetch failed.
     * Kept as a top-level field so ThresholdEvaluator can access it without null-guarding
     * the full RpcData object (which may be stale-cached from a prior tick's gas data).
     */
    readonly walletBalanceAvax: number | null;
    readonly sources: {
        readonly rpc: SourceHealth;
        readonly nodeMetrics: SourceHealth;
    };
}
/** Structured log entry emitted to stdout as NDJSON */
export interface LogEntry {
    readonly timestamp: string;
    readonly level: string;
    readonly traceId: string;
    readonly component: string;
    readonly message: string;
    readonly data?: Record<string, unknown>;
}
//# sourceMappingURL=models.d.ts.map