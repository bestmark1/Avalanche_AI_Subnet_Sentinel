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
        readonly endpoint: string;
        readonly timeoutMs: number;
        readonly retryCount: number;
        readonly retryBaseMs: number;
    };
    readonly metrics: {
        readonly endpoint: string;
        readonly timeoutMs: number;
    };
    readonly orchestrator: {
        readonly tickIntervalMs: number;
    };
    readonly api: {
        readonly port: number;
        readonly host: string;
    };
    readonly logging: {
        readonly level: string;
    };
}
//# sourceMappingURL=AppConfig.d.ts.map