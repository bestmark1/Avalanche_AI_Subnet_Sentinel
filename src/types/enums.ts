// src/types/enums.ts
// Verbatim from ARCHITECTURE.md Section 6.1

/** Log severity levels */
export enum LogLevel {
  DEBUG = 'debug',
  INFO  = 'info',
  WARN  = 'warn',
  ERROR = 'error',
}

/** Health status of a data source within a snapshot */
export enum SourceStatus {
  CURRENT = 'current',   // Data fetched successfully this cycle
  STALE   = 'stale',     // Using last-known-good; source failed this cycle
  UNKNOWN = 'unknown',   // No data has ever been fetched successfully
}

/** Alert severity derived from consecutive failure count */
export enum AlertSeverity {
  NONE     = 'none',
  WARNING  = 'warning',   // >= 3 consecutive failures
  CRITICAL = 'critical',  // >= 10 consecutive failures
}

/** Failure thresholds — centralized, not magic numbers */
export const FAILURE_THRESHOLDS = {
  WARN_AFTER:  3,
  ERROR_AFTER: 10,
} as const;

/** Timing constants (milliseconds) */
export const TIMING = {
  TICK_INTERVAL_MS:  10_000,
  SOURCE_TIMEOUT_MS:  5_000,
  RPC_RETRY_COUNT:    3,
  RPC_RETRY_BASE_MS:  500,
} as const;
