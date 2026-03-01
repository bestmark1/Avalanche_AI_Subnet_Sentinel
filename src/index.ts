// src/index.ts
// Composition Root — Manual Dependency Injection (ADR-003).
// Wires all components, starts the system, handles graceful shutdown.

import { loadConfig } from './config/loadConfig.js';
import { ConsoleJsonLogger } from './logging/ConsoleJsonLogger.js';
import { InMemoryStateStore } from './store/InMemoryStateStore.js';
import { EthersRpcProvider } from './services/EthersRpcProvider.js';
import { PrometheusMetricsCollector } from './services/PrometheusMetricsCollector.js';
import { SubnetAdminStub } from './services/SubnetAdminStub.js';
import { TelegramNotifier } from './services/TelegramNotifier.js';
import { TelegramListener } from './services/TelegramListener.js';
import { SystemAutoHealer } from './services/SystemAutoHealer.js';
import { DeepgramTranscriber } from './services/DeepgramTranscriber.js';
import { ExpressServer } from './api/ExpressServer.js';
import type { ServerConfig } from './api/ExpressServer.js';
import { PollingOrchestrator } from './core/PollingOrchestrator.js';
import { ThresholdEvaluator } from './core/ThresholdEvaluator.js';
import { AnalysisScheduler } from './core/AnalysisScheduler.js';
import { AiAnalysisService } from './core/AiAnalysisService.js';
import { HealingCoordinator } from './core/HealingCoordinator.js';
import type { IAiPipeline } from './interfaces/IAiPipeline.js';
import type { INotifier } from './interfaces/INotifier.js';
import type { IMessenger } from './interfaces/IMessenger.js';
import type { ITranscriber } from './interfaces/ITranscriber.js';
import type { IAiAnalysisConfig } from './types/config.types.js';

/**
 * Application version — injected into ServerConfig for /health endpoint.
 * Follows semver. Updated manually per release.
 */
const APP_VERSION = '1.0.0';

// ── AI Configuration Defaults ──────────────────────────────────────────────
//
// All AI config fields are optional with sensible production defaults.
// ANTHROPIC_API_KEY is the only field with no meaningful default — sentinel
// will start without it, but every LLM call will fail gracefully and be logged.
//
// Threshold defaults mirror the architecture document recommendations:
//   CPU:            80%   (warn on sustained high load)
//   Memory:         85%   (leave headroom for GC and burst)
//   RPC failures:    1    (any RPC failure is worth investigating)
//   Gas fee:        50    gwei (spike detection)
//   Validator:      95%   uptime minimum
//   Block delay:   500    ms (> 0.5s = potential sync issue)
//   Min peers:       5    (below 5 = isolation risk)
//   Min AVAX:        0.5  AVAX (enough for a few transactions / validator upkeep)

const AI_DEFAULTS = {
  MODEL: 'claude-sonnet-4-5',
  MAX_RETRIES: 2,
  TIMEOUT_MS: 15_000,
  DAILY_SUMMARY_INTERVAL_MS: 86_400_000,  // 24 hours
  ALERT_DEDUP_WINDOW_MS: 300_000,         // 5 minutes
  THRESHOLD_CPU_PERCENT: 80,
  THRESHOLD_MEMORY_PERCENT: 85,
  THRESHOLD_RPC_FAILURES: 1,
  THRESHOLD_GAS_FEE_GWEI: 50,
  THRESHOLD_VALIDATOR_UPTIME_PERCENT: 95,
  THRESHOLD_BLOCK_DELAY_MS: 500,
  THRESHOLD_MIN_PEERS: 5,
  THRESHOLD_MIN_AVAX_BALANCE: 0.5,
} as const;

/**
 * Reads an optional environment variable as a positive integer.
 * Falls back to `defaultValue` if the variable is absent or unparseable.
 */
function readOptionalInt(envVar: string, defaultValue: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Reads an optional environment variable as a positive float.
 * Falls back to `defaultValue` if the variable is absent, unparseable,
 * or not a finite positive number.
 *
 * Used for threshold values that are naturally fractional (e.g. AVAX balances).
 */
function readOptionalFloat(envVar: string, defaultValue: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = parseFloat(raw.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Builds the IAiAnalysisConfig from environment variables.
 *
 * Every field has a sensible default — the sentinel runs without any of these
 * set, degrading gracefully: LLM calls fail+log but the polling loop continues.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY                        — Anthropic API key (no default)
 *   SENTINEL_AI_MODEL                        — Claude model string
 *   SENTINEL_AI_MAX_RETRIES                  — SDK retry count on transient errors
 *   SENTINEL_AI_TIMEOUT_MS                   — Per-call timeout in ms
 *   SENTINEL_DAILY_SUMMARY_INTERVAL_MS       — 24h summary interval override
 *   SENTINEL_ALERT_DEDUP_WINDOW_MS           — Alert dedup suppression window
 *   SENTINEL_THRESHOLD_CPU_PERCENT           — CPU usage threshold (%)
 *   SENTINEL_THRESHOLD_MEMORY_PERCENT        — Memory usage threshold (%)
 *   SENTINEL_THRESHOLD_RPC_FAILURES          — Consecutive RPC failure threshold
 *   SENTINEL_THRESHOLD_GAS_FEE_GWEI          — Gas priority fee threshold (gwei)
 *   SENTINEL_THRESHOLD_VALIDATOR_UPTIME_PCT  — Validator uptime minimum (%)
 *   SENTINEL_THRESHOLD_BLOCK_DELAY_MS        — Block processing delay threshold
 *   SENTINEL_THRESHOLD_MIN_PEERS             — Minimum peer count threshold
 *   SENTINEL_THRESHOLD_MIN_AVAX_BALANCE      — Minimum wallet AVAX balance (default 0.5)
 *   AUTO_HEAL_COMMAND                        — Shell command to run on critical status.
 *                                              Empty or absent = auto-healing disabled.
 */
function buildAiConfig(): IAiAnalysisConfig {
  return {
    apiKey: process.env['ANTHROPIC_API_KEY']?.trim() ?? '',
    model: process.env['SENTINEL_AI_MODEL']?.trim() ?? AI_DEFAULTS.MODEL,
    // maxTokens on the config is an upper bound; AiAnalysisService uses
    // per-call values: 1024 for alerts, 2048 for summaries.
    maxTokens: 2048,
    maxRetries: readOptionalInt('SENTINEL_AI_MAX_RETRIES', AI_DEFAULTS.MAX_RETRIES),
    timeoutMs: readOptionalInt('SENTINEL_AI_TIMEOUT_MS', AI_DEFAULTS.TIMEOUT_MS),
    dailySummaryIntervalMs: readOptionalInt(
      'SENTINEL_DAILY_SUMMARY_INTERVAL_MS',
      AI_DEFAULTS.DAILY_SUMMARY_INTERVAL_MS,
    ),
    alertDeduplicationWindowMs: readOptionalInt(
      'SENTINEL_ALERT_DEDUP_WINDOW_MS',
      AI_DEFAULTS.ALERT_DEDUP_WINDOW_MS,
    ),
    thresholds: {
      cpuUsagePercent:        readOptionalInt('SENTINEL_THRESHOLD_CPU_PERCENT',   AI_DEFAULTS.THRESHOLD_CPU_PERCENT),
      memoryUsagePercent:     readOptionalInt('SENTINEL_THRESHOLD_MEMORY_PERCENT', AI_DEFAULTS.THRESHOLD_MEMORY_PERCENT),
      rpcConsecutiveFailures: readOptionalInt('SENTINEL_THRESHOLD_RPC_FAILURES',  AI_DEFAULTS.THRESHOLD_RPC_FAILURES),
      gasPriorityFeeGwei:     readOptionalInt('SENTINEL_THRESHOLD_GAS_FEE_GWEI',  AI_DEFAULTS.THRESHOLD_GAS_FEE_GWEI),
      validatorUptimePercent: readOptionalInt('SENTINEL_THRESHOLD_VALIDATOR_UPTIME_PCT', AI_DEFAULTS.THRESHOLD_VALIDATOR_UPTIME_PERCENT),
      blockProcessingDelayMs: readOptionalInt('SENTINEL_THRESHOLD_BLOCK_DELAY_MS', AI_DEFAULTS.THRESHOLD_BLOCK_DELAY_MS),
      minPeerCount:           readOptionalInt('SENTINEL_THRESHOLD_MIN_PEERS',     AI_DEFAULTS.THRESHOLD_MIN_PEERS),
      minAvaxBalance:         readOptionalFloat('SENTINEL_THRESHOLD_MIN_AVAX_BALANCE', AI_DEFAULTS.THRESHOLD_MIN_AVAX_BALANCE),
    },
    autoHeal: {
      command: process.env['AUTO_HEAL_COMMAND']?.trim() ?? '',
    },
  };
}

/**
 * main() — Application entry point.
 *
 * Startup sequence:
 *   1.  Load and validate configuration from environment variables
 *   2.  Instantiate logger (must be first — everything else logs through it)
 *   3.  Build AI configuration from environment variables
 *   4.  Instantiate state store
 *   5.  Instantiate data sources (RPC provider with optional wallet address,
 *       metrics collector)
 *   6.  Instantiate admin stub (replaced in a future Step)
 *   7.  Instantiate Telegram notifier (optional — only if TELEGRAM_BOT_TOKEN
 *       and TELEGRAM_CHAT_ID are both set). The single TelegramNotifier instance
 *       serves both the INotifier role (structured AI alerts to AiAnalysisService)
 *       and the IMessenger role (plain-text heal status to HealingCoordinator).
 *   8.  Instantiate AI pipeline (ThresholdEvaluator, AnalysisScheduler,
 *       conditional SystemAutoHealer, HealingCoordinator, AiAnalysisService)
 *   9.  Instantiate DeepgramTranscriber (optional — only if DEEPGRAM_API_KEY is set)
 *       and Telegram listener (optional — only if TELEGRAM_BOT_TOKEN is set).
 *       The transcriber is wired into the listener for voice message handling.
 *   10. Instantiate Express API server
 *   11. Instantiate orchestrator (wires all dependencies)
 *   12. Start API server (begin accepting /health and /status requests)
 *   13. Start orchestrator (begin the 10s polling loop)
 *   14. Start Telegram listener (begin interactive command + voice loop, if enabled)
 *   15. Register SIGINT/SIGTERM handlers for graceful shutdown
 *
 * Shutdown sequence (SIGINT or SIGTERM):
 *   1. Stop orchestrator (in-flight tick completes, no new tick fires)
 *   2. Stop Telegram listener (signal loop to exit)
 *   3. Stop Express server (close HTTP listener, drain connections)
 *   4. Destroy RPC provider (release ethers.js resources)
 *   5. Log shutdown complete
 *   6. Exit process with code 0
 *
 * ADR-003: Manual DI — no framework. The composition root is the ONLY
 * place where concrete classes are referenced. Every other module depends
 * only on interfaces.
 */
async function main(): Promise<void> {
  // ── Step 1: Configuration ──────────────────────────────────────────────────
  const config = loadConfig();

  // ── Step 2: Logger ─────────────────────────────────────────────────────────
  const logger = new ConsoleJsonLogger(config.logging.level);
  logger.info('sentinel_starting', {
    version: APP_VERSION,
    rpcEndpoint: config.rpc.endpoint,
    metricsEndpoint: config.metrics.endpoint,
    tickIntervalMs: config.orchestrator.tickIntervalMs,
    apiPort: config.api.port,
  });

  // ── Step 3: AI Configuration ───────────────────────────────────────────────
  const aiConfig = buildAiConfig();

  // Warn early if the API key is absent — every LLM call will fail at runtime,
  // but the sentinel will still run and monitor without interruption.
  if (aiConfig.apiKey === '') {
    logger.warn('ai_api_key_missing', {
      message:
        'ANTHROPIC_API_KEY is not set. AI analysis calls will fail gracefully. ' +
        'Set ANTHROPIC_API_KEY in your .env file to enable LLM integration.',
    });
  }

  logger.info('ai_config_loaded', {
    model: aiConfig.model,
    dailySummaryIntervalMs: aiConfig.dailySummaryIntervalMs,
    alertDeduplicationWindowMs: aiConfig.alertDeduplicationWindowMs,
    thresholds: aiConfig.thresholds,
    autoHealEnabled: aiConfig.autoHeal.command !== '',
  });

  // ── Step 4: State Store ────────────────────────────────────────────────────
  const store = new InMemoryStateStore();

  // ── Step 5: Data Sources ───────────────────────────────────────────────────
  //
  // WALLET_ADDRESS — optional Ethereum-format address to monitor for AVAX balance.
  // When set, EthersRpcProvider calls eth_getBalance on each tick (soft-fail).
  // The balance is included in SubnetSnapshot.walletBalanceAvax and evaluated
  // against the minAvaxBalance threshold.
  const walletAddress = process.env['WALLET_ADDRESS']?.trim() ?? null;
  const walletAddressNormalized =
    walletAddress !== null && walletAddress !== '' ? walletAddress : null;

  if (walletAddressNormalized !== null) {
    logger.info('wallet_monitoring_enabled', {
      address: walletAddressNormalized,
      minAvaxBalance: aiConfig.thresholds.minAvaxBalance,
    });
  }

  const provider = new EthersRpcProvider(
    config.rpc,
    logger,
    undefined,               // jitterFn — use default (0.5 + Math.random() * 0.5)
    walletAddressNormalized, // walletAddress — null = skip balance check
  );
  const collector = new PrometheusMetricsCollector(config.metrics, logger);

  // ── Step 6: Admin Stub ─────────────────────────────────────────────────────
  // Retained as a constructor dependency so a future Step can wire the real
  // ISubnetAdmin implementation without refactoring the composition root.
  const admin = new SubnetAdminStub();

  // ── Step 7: Telegram Notifier + Messenger (optional) ───────────────────────
  //
  // A single TelegramNotifier instance satisfies two interfaces:
  //   INotifier  — receives structured AnalysisResult alerts from AiAnalysisService
  //   IMessenger — receives plain-text heal status messages from HealingCoordinator
  //
  // Both roles are undefined when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is absent.
  //
  // Required env vars:
  //   TELEGRAM_BOT_TOKEN — Bot token from @BotFather (e.g. "123456:ABC-DEF...")
  //   TELEGRAM_CHAT_ID   — Target chat/channel ID (e.g. "-1001234567890")
  const telegramBotToken = process.env['TELEGRAM_BOT_TOKEN']?.trim();
  const telegramChatId = process.env['TELEGRAM_CHAT_ID']?.trim();

  const telegramNotifier: TelegramNotifier | undefined =
    telegramBotToken !== undefined && telegramBotToken !== '' &&
    telegramChatId   !== undefined && telegramChatId   !== ''
      ? new TelegramNotifier(telegramBotToken, telegramChatId)
      : undefined;

  // Assign the single instance to both interface roles; undefined when unconfigured.
  const notifier: INotifier | undefined = telegramNotifier;
  const messenger: IMessenger | undefined = telegramNotifier;

  if (telegramNotifier !== undefined) {
    logger.info('telegram_notifier_enabled', { chatId: telegramChatId });
  }

  // ── Step 8: AI Pipeline ────────────────────────────────────────────────────
  //
  // ThresholdEvaluator — pure, stateless "Dumb Guard"
  //   Filters noise locally before any LLM call. Zero I/O, synchronous.
  //   Evaluates: cpu, rpc_failures, gas_priority_fee, wallet_balance_low.
  //
  // AnalysisScheduler — stateful gatekeeper
  //   Deduplicates alerts by metric set (5-min window for most metrics;
  //   24h window for wallet_balance_low to prevent chronic-low-balance spam).
  //   Emits one proactive summary every dailySummaryIntervalMs.
  //
  // SystemAutoHealer — executes shell commands on critical status (optional)
  //   Instantiated only when AUTO_HEAL_COMMAND is non-empty.
  //   Command-presence IS the kill-switch — no boolean flag required.
  //
  // HealingCoordinator — observes AI results, dispatches heal + status message
  //   Owns all post-analysis side effects (SRP). AiAnalysisService calls
  //   coordinator.evaluate() synchronously; async healing is internal.
  //
  // AiAnalysisService — "Smart Detective"
  //   Calls Anthropic via Tool Calling (forced tool_use for reliable JSON).
  //   Fire-and-forget: enqueue() returns void; errors logged in processJob().
  const evaluator = new ThresholdEvaluator(aiConfig.thresholds);
  const scheduler = new AnalysisScheduler({
    alertDeduplicationWindowMs: aiConfig.alertDeduplicationWindowMs,
    dailySummaryIntervalMs: aiConfig.dailySummaryIntervalMs,
  });

  const healCommand = aiConfig.autoHeal.command;
  const healer = healCommand !== '' ? new SystemAutoHealer(logger) : undefined;

  if (healer !== undefined) {
    logger.info('auto_heal_enabled', { command: healCommand });
  }

  const coordinator = new HealingCoordinator(
    logger,
    healer,
    messenger,
    healCommand !== '' ? healCommand : undefined,
  );

  // AiAnalysisService accepts ISchedulerFeedback — the narrow write-back contract.
  // AnalysisScheduler satisfies it (implements ISchedulerFeedback).
  const aiService = new AiAnalysisService(
    aiConfig,
    scheduler,
    store,
    logger,
    notifier,
    coordinator,
  );

  // Assemble the IAiPipeline object — the single DI token the orchestrator sees.
  // The composition root is the ONLY place that knows these are concrete classes.
  const pipeline: IAiPipeline = {
    evaluator,
    scheduler,
    service: aiService,
  };

  // ── Step 9: Deepgram Transcriber + Telegram Listener (optional) ────────────
  //
  // DeepgramTranscriber — converts OGG voice messages to text via Deepgram API.
  //   Instantiated only when DEEPGRAM_API_KEY is set.
  //   Implements ITranscriber; wired into TelegramListener as optional dependency.
  //   When absent, voice messages received by TelegramListener are silently ignored.
  //
  // TelegramListener — interactive command + voice handler.
  //   Requires only TELEGRAM_BOT_TOKEN (responds to whichever chat sends commands).
  //   Accepts optional ITranscriber for voice pipeline.
  //
  // Required env vars:
  //   TELEGRAM_BOT_TOKEN — Bot token from @BotFather
  //   DEEPGRAM_API_KEY   — Deepgram API key (optional; enables voice transcription)
  const deepgramApiKey = process.env['DEEPGRAM_API_KEY']?.trim();
  const transcriber: ITranscriber | undefined =
    deepgramApiKey !== undefined && deepgramApiKey !== ''
      ? new DeepgramTranscriber(deepgramApiKey, logger)
      : undefined;

  if (transcriber !== undefined) {
    logger.info('deepgram_transcriber_enabled');
  }

  // ── onRestartRequest — closure wired into the "🔄 Restart Node" inline button ──
  //
  // TelegramListener does not depend on IAutoHealer directly (Interface Segregation
  // Principle). Instead, the composition root provides a narrow () => Promise<boolean>
  // callback so TelegramListener has no knowledge of shell commands or the healer.
  //
  // The callback is defined only when both healer AND healCommand are present:
  //   healer === undefined  → AUTO_HEAL_COMMAND not set; button shows "not configured"
  //   healCommand === ''    → same guard (belt-and-suspenders; healer implies command)
  //
  // Both are constants after construction — the closure captures stable references.
  const onRestartRequest: (() => Promise<boolean>) | undefined =
    healer !== undefined && healCommand !== ''
      ? (): Promise<boolean> => healer.attemptHeal(healCommand)
      : undefined;

  const telegramListener: TelegramListener | undefined =
    telegramBotToken !== undefined && telegramBotToken !== ''
      ? new TelegramListener(
          telegramBotToken,
          store,
          logger,
          transcriber,
          onRestartRequest,
        )
      : undefined;

  if (telegramListener !== undefined) {
    logger.info('telegram_listener_enabled', {
      restartEnabled: onRestartRequest !== undefined,
    });
  }

  // ── Step 10: API Server ────────────────────────────────────────────────────
  const serverConfig: ServerConfig = {
    port: config.api.port,
    host: config.api.host,
    version: APP_VERSION,
  };
  const server = new ExpressServer(store, logger, serverConfig);

  // ── Step 11: Orchestrator ──────────────────────────────────────────────────
  const orchestrator = new PollingOrchestrator(
    provider,
    collector,
    store,
    logger,
    admin,
    pipeline,
    { tickIntervalMs: config.orchestrator.tickIntervalMs },
  );

  // ── Step 12: Start API Server ──────────────────────────────────────────────
  await server.start();

  // ── Step 13: Start Orchestrator ────────────────────────────────────────────
  orchestrator.start();

  // ── Step 14: Start Telegram Listener ──────────────────────────────────────
  telegramListener?.start();

  logger.info('sentinel_ready', {
    version: APP_VERSION,
    apiHost: config.api.host,
    apiPort: config.api.port,
    aiEnabled: aiConfig.apiKey !== '',
    telegramNotifierEnabled: notifier !== undefined,
    telegramListenerEnabled: telegramListener !== undefined,
    voiceTranscriptionEnabled: transcriber !== undefined,
    walletMonitoringEnabled: walletAddressNormalized !== null,
    autoHealEnabled: healer !== undefined,
    telegramRestartEnabled: onRestartRequest !== undefined,
  });

  // ── Step 15: Graceful Shutdown ─────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('sentinel_shutdown_initiated', { signal });

    try {
      // 1. Stop orchestrator — no new ticks, in-flight tick drains
      orchestrator.stop();

      // 2. Stop Telegram listener — signals the poll loop to exit after
      //    the current long-poll request resolves (up to 30s)
      telegramListener?.stop();

      // 3. Stop API server — close HTTP listener
      await server.stop();

      // 4. Destroy RPC provider — release ethers.js resources
      await provider.destroy();

      logger.info('sentinel_shutdown_complete', { signal });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('sentinel_shutdown_error', { signal, error: message });
    }

    process.exit(0);
  };

  // Register once per signal to prevent double-shutdown
  process.once('SIGINT',  () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
main().catch((err: unknown) => {
  // This catch fires only if loadConfig() throws (missing required env vars)
  // or if the startup sequence itself fails catastrophically.
  // eslint-disable-next-line no-console
  console.error('[FATAL] Sentinel failed to start:', err);
  process.exit(1);
});
