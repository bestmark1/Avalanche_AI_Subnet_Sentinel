// src/config/loadConfig.ts
// Reads environment variables, validates required fields, applies defaults.
// Returns a frozen AppConfig object.

import type { AppConfig } from './AppConfig.js';
import { TIMING } from '../types/enums.js';

/**
 * Reads a required environment variable.
 * Throws a descriptive error if the variable is missing or empty.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `[CONFIG ERROR] Required environment variable "${name}" is not set. ` +
      `See .env.example for documentation.`
    );
  }
  return value.trim();
}

/**
 * Reads an optional environment variable with a fallback default.
 * Returns the env value as a string, or the default if not set.
 */
function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

/**
 * Parses an optional environment variable as an integer.
 * Returns the default if not set or if parsing fails.
 */
function optionalInt(name: string, defaultValue: number): number {
  const raw = optionalEnv(name, String(defaultValue));
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `[CONFIG ERROR] Environment variable "${name}" must be a valid integer. ` +
      `Received: "${raw}"`
    );
  }
  return parsed;
}

/**
 * Validates that the log level is one of the allowed values.
 */
function validateLogLevel(level: string): string {
  const allowed = ['debug', 'info', 'warn', 'error'];
  const normalized = level.toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(
      `[CONFIG ERROR] SENTINEL_LOG_LEVEL must be one of: ${allowed.join(', ')}. ` +
      `Received: "${level}"`
    );
  }
  return normalized;
}

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
export function loadConfig(): AppConfig {
  const config: AppConfig = {
    rpc: {
      endpoint:    requireEnv('SENTINEL_RPC_ENDPOINT'),
      timeoutMs:   optionalInt('SENTINEL_SOURCE_TIMEOUT_MS', TIMING.SOURCE_TIMEOUT_MS),
      retryCount:  optionalInt('SENTINEL_RPC_RETRY_COUNT', TIMING.RPC_RETRY_COUNT),
      retryBaseMs: optionalInt('SENTINEL_RPC_RETRY_BASE_MS', TIMING.RPC_RETRY_BASE_MS),
    },
    metrics: {
      endpoint:  requireEnv('SENTINEL_METRICS_ENDPOINT'),
      timeoutMs: optionalInt('SENTINEL_SOURCE_TIMEOUT_MS', TIMING.SOURCE_TIMEOUT_MS),
    },
    orchestrator: {
      tickIntervalMs: optionalInt('SENTINEL_TICK_INTERVAL_MS', TIMING.TICK_INTERVAL_MS),
    },
    api: {
      port: optionalInt('SENTINEL_API_PORT', 3000),
      host: optionalEnv('SENTINEL_API_HOST', '0.0.0.0'),
    },
    logging: {
      level: validateLogLevel(optionalEnv('SENTINEL_LOG_LEVEL', 'info')),
    },
  };

  // Deep freeze the config to prevent any runtime mutation
  Object.freeze(config);
  Object.freeze(config.rpc);
  Object.freeze(config.metrics);
  Object.freeze(config.orchestrator);
  Object.freeze(config.api);
  Object.freeze(config.logging);

  return config;
}
