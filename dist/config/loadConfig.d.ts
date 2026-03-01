import type { AppConfig } from './AppConfig.js';
/**
 * loadConfig — Reads all configuration from environment variables.
 *
 * Required variables:
 *   - SENTINEL_RPC_ENDPOINT
 *   - SENTINEL_METRICS_ENDPOINT
 *
 * Optional variables have sensible defaults (see ARCHITECTURE.md Appendix B).
 *
 * @returns A frozen, immutable AppConfig object.
 * @throws {Error} if required variables are missing or values are invalid.
 */
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=loadConfig.d.ts.map