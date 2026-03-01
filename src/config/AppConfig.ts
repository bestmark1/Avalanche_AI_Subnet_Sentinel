// src/config/AppConfig.ts
// Verbatim from ARCHITECTURE.md Section 7.2

/**
 * AppConfig — Application Configuration Interface
 *
 * All configuration is read from environment variables at startup
 * via loadConfig(). The resulting object is frozen (immutable).
 *
 * See .env.example and ARCHITECTURE.md Appendix B for variable names.
 */
export interface AppConfig {
  readonly rpc: {
    readonly endpoint: string;           // SENTINEL_RPC_ENDPOINT (required)
    readonly timeoutMs: number;          // Default: 5000
    readonly retryCount: number;         // Default: 3
    readonly retryBaseMs: number;        // Default: 500
  };
  readonly metrics: {
    readonly endpoint: string;           // SENTINEL_METRICS_ENDPOINT (required)
    readonly timeoutMs: number;          // Default: 5000
  };
  readonly orchestrator: {
    readonly tickIntervalMs: number;     // Default: 10000
  };
  readonly api: {
    readonly port: number;               // Default: 3000
    readonly host: string;               // Default: "0.0.0.0"
  };
  readonly logging: {
    readonly level: string;              // Default: "info"
  };
}
