// src/core/AiAnalysisService.ts
// "Smart Detective" — invokes the Anthropic LLM via Tool Calling and converts
// the structured response into a typed AnalysisResult.
//
// Concurrency model: fire-and-forget.
//   enqueue() is synchronous and returns void.
//   processJob() runs async without blocking the 10s polling tick.
//   cancelPendingSummary() is GUARANTEED to be called in the finally block of
//   processJob() when a summary job fails, preventing AnalysisScheduler deadlock.

import Anthropic from '@anthropic-ai/sdk';

import type { IAiAnalysisService, ISchedulerFeedback } from '../interfaces/IAiPipeline.js';
import type { IStateStore } from '../interfaces/IStateStore.js';
import type { INotifier } from '../interfaces/INotifier.js';
import type { IAiAnalysisConfig } from '../types/config.types.js';
import type { AnalysisResult, AlertAnalysisResult, SummaryAnalysisResult } from '../types/analysis.types.js';
import type { TriggerContext, AlertTriggerContext, SummaryTriggerContext } from '../types/trigger.types.js';
import type { SubnetSnapshot } from '../types/models.js';
import type { ThresholdViolation } from '../types/threshold.types.js';
import type { ILogger } from '../interfaces/ILogger.js';
import { HealingCoordinator } from './HealingCoordinator.js';

// ── Tool Schema ──────────────────────────────────────────────────────────────

/**
 * Single Anthropic tool definition shared across alert and summary calls.
 *
 * tool_choice: { type: 'tool', name: 'report_analysis' } forces the LLM to
 * always call this tool — no prose fallback. Structured output reliability
 * increases from ~85% (prompt-only JSON) to ~99.5% with forced tool use.
 *
 * The input_schema mirrors AnalysisResult fields. maxLength constraints on
 * string fields prevent LLM verbosity from inflating token costs.
 */
const REPORT_ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'report_analysis',
  description:
    'Report a structured health analysis of the Avalanche subnet. ' +
    'Always call this tool — never respond with prose.',
  input_schema: {
    type: 'object' as const,
    required: ['status', 'reason', 'recommendation', 'confidence'],
    properties: {
      status: {
        type: 'string',
        enum: ['healthy', 'degraded', 'critical'],
        description: 'Overall subnet health status.',
      },
      reason: {
        type: 'string',
        maxLength: 500,
        description: 'Technical, concise explanation of the assessed status.',
      },
      recommendation: {
        type: 'string',
        maxLength: 500,
        description: 'One concrete, actionable step the operator should take.',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description:
          'Self-reported confidence. Use "low" when telemetry is limited or ambiguous.',
      },
      // Alert-only fields
      urgency: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description:
          'Alert urgency (1=monitor, 3=attention required within 1h, 5=immediate action). ' +
          'Required for alert analyses only.',
      },
      // Summary-only fields
      trends: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description:
          'Up to 5 notable trends observed across the coverage period. ' +
          'Required for summary analyses only.',
      },
      forwardRisks: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description:
          'Up to 5 forward-looking risk items for the next 24h. ' +
          'Required for summary analyses only.',
      },
    },
  },
};

// ── Module-Level Pure Helpers ────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return (
    'You are an expert Avalanche blockchain node operator and SRE. ' +
    'You analyze real-time subnet telemetry and provide concise, actionable health assessments. ' +
    'You MUST call the report_analysis tool. Do not respond with prose. ' +
    'Be technically precise. Assume the operator has advanced blockchain knowledge.'
  );
}

function buildCompactSnapshot(snapshot: SubnetSnapshot): string {
  const lines: string[] = [
    `Snapshot timestamp: ${snapshot.timestamp}`,
    `Tick: ${snapshot.tickNumber}`,
  ];

  if (snapshot.rpc !== null) {
    lines.push(
      `RPC block: ${snapshot.rpc.blockNumber}`,
      `Gas price: ${snapshot.rpc.gasPrice} (wei hex)`,
      `Max priority fee: ${snapshot.rpc.maxPriorityFeePerGas} (wei hex)`,
    );

    // ── Chainlink Oracle (Anomaly Radar) ──────────────────────────────────
    // Include AVAX/USD price and oracle freshness for the LLM.
    // A stale oracle timestamp (> 3600s) may indicate the node is network-isolated
    // and cannot reach Chainlink infrastructure — a key signal for network partition.
    if (snapshot.rpc.avaxUsdPrice !== null) {
      lines.push(`AVAX/USD price: $${snapshot.rpc.avaxUsdPrice.toFixed(2)} (Chainlink)`);
    } else {
      lines.push('AVAX/USD price: unavailable (Chainlink oracle call failed)');
    }

    if (snapshot.rpc.chainlinkUpdatedAt !== null) {
      const nowSec    = Math.floor(Date.now() / 1000);
      const ageSec    = nowSec - snapshot.rpc.chainlinkUpdatedAt;
      const updatedAt = new Date(snapshot.rpc.chainlinkUpdatedAt * 1000).toISOString();

      if (ageSec > 3600) {
        // Oracle data older than 1 hour — flag as potentially stale
        const ageMin = Math.round(ageSec / 60);
        lines.push(
          `Chainlink oracle updated: ${updatedAt}` +
          ` (${ageMin}min ago — STALE, may indicate network isolation or oracle issue)`,
        );
      } else {
        lines.push(`Chainlink oracle updated: ${updatedAt} (${ageSec}s ago)`);
      }
    } else {
      lines.push('Chainlink oracle updated: unavailable');
    }
  } else {
    lines.push('RPC data: unavailable (source stale)');
  }

  if (snapshot.nodeMetrics !== null) {
    lines.push(
      `CPU usage: ${snapshot.nodeMetrics.cpuUsage.toFixed(1)}%`,
      `Network latency: ${snapshot.nodeMetrics.networkLatency.toFixed(0)}ms`,
    );
  } else {
    lines.push('Node metrics: unavailable (source stale)');
  }

  lines.push(
    `RPC source: ${snapshot.sources.rpc.status} ` +
      `(${snapshot.sources.rpc.consecutiveFailures} consecutive failures)`,
    `Metrics source: ${snapshot.sources.nodeMetrics.status} ` +
      `(${snapshot.sources.nodeMetrics.consecutiveFailures} consecutive failures)`,
  );

  return lines.join('\n');
}

function buildViolationsList(violations: ThresholdViolation[]): string {
  return violations
    .map(
      (v) =>
        `  - ${v.metric}: observed=${v.observedValue} threshold=${v.thresholdValue} ` +
        `direction=${v.direction} (active for ${v.ticksActive} tick(s))`,
    )
    .join('\n');
}

function buildAlertUserMessage(
  ctx: AlertTriggerContext,
  snapshot: SubnetSnapshot,
): string {
  return (
    'ALERT: Threshold violations detected on the Avalanche subnet.\n\n' +
    'Active violations:\n' +
    buildViolationsList(ctx.violations) +
    '\n\nCurrent telemetry:\n' +
    buildCompactSnapshot(snapshot) +
    '\n\nAnalyze the root cause. Assess urgency (1–5). ' +
    'Provide a targeted recommendation. Call report_analysis with your findings.'
  );
}

function buildSummaryUserMessage(
  ctx: SummaryTriggerContext,
  snapshot: SubnetSnapshot,
): string {
  return (
    `PROACTIVE 24H SUMMARY\nCoverage window: ${ctx.coverageFrom} → ${ctx.coverageTo}\n\n` +
    'Latest telemetry snapshot:\n' +
    buildCompactSnapshot(snapshot) +
    '\n\nSynthesize the subnet health over this period. ' +
    'Identify trends and forward-looking risks for the next 24 hours. ' +
    'Call report_analysis with your findings.'
  );
}

// ── Validation Helpers ───────────────────────────────────────────────────────

function getString(input: Record<string, unknown>, key: string): string {
  const val = input[key];
  if (typeof val !== 'string') {
    throw new Error(`Tool response missing or invalid string field: "${key}"`);
  }
  return val;
}

function getStringEnum<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const val = getString(input, key);
  if (!allowed.includes(val as T)) {
    throw new Error(
      `Tool response field "${key}" has invalid value "${val}". Allowed: ${allowed.join(', ')}`,
    );
  }
  return val as T;
}

function getOptionalIntRange(
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const val = input[key];
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'number' || !Number.isInteger(val) || val < min || val > max) {
    throw new Error(
      `Tool response field "${key}" must be an integer in [${min}, ${max}], got: ${JSON.stringify(val)}`,
    );
  }
  return val;
}

function getOptionalStringArray(
  input: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const val = input[key];
  if (val === undefined || val === null) return undefined;
  if (!Array.isArray(val) || !val.every((item) => typeof item === 'string')) {
    throw new Error(
      `Tool response field "${key}" must be an array of strings, got: ${JSON.stringify(val)}`,
    );
  }
  return val as string[];
}

// ── AiAnalysisService ────────────────────────────────────────────────────────

/**
 * AiAnalysisService — The "Smart Detective"
 *
 * Receives trigger decisions from AnalysisScheduler and executes LLM calls
 * via the Anthropic SDK using forced Tool Calling for structured output.
 *
 * Concurrency contract:
 *   - enqueue() is synchronous, returns void (fire-and-forget).
 *   - processJob() runs async; the polling tick does NOT await it.
 *   - processJob() GUARANTEES cancelPendingSummary() in its finally block
 *     when a summary job fails, preventing indefinite AnalysisScheduler deadlock.
 *
 * Storage:
 *   - On success, the AnalysisResult is handed off to IStateStore.setLastAnalysis().
 *   - The store owns the result and serves it to GET /status via getLatestState().
 *   - AiAnalysisService holds no local analysis state.
 *
 * Notifications:
 *   - If an INotifier is provided, sendAlert() is called fire-and-forget after
 *     the store write. Notifier errors are caught and logged; they never block
 *     or fail the LLM job itself.
 *
 * Post-analysis coordination:
 *   - If a HealingCoordinator is provided, evaluate() is called synchronously
 *     after the notification dispatch. The coordinator owns all auto-healing and
 *     status-messaging side effects (SRP).
 *
 * SOLID:
 *   - Single Responsibility: LLM invocation and response parsing only.
 *   - Dependency Inversion: depends on interfaces (ILogger, IStateStore,
 *     ISchedulerFeedback, INotifier) and one concrete coordinator.
 */
export class AiAnalysisService implements IAiAnalysisService {
  private readonly client: Anthropic;
  private readonly config: IAiAnalysisConfig;
  private readonly scheduler: ISchedulerFeedback;
  private readonly store: IStateStore;
  private readonly notifier: INotifier | undefined;
  private readonly coordinator: HealingCoordinator | undefined;
  private readonly logger: ILogger;

  constructor(
    config: IAiAnalysisConfig,
    scheduler: ISchedulerFeedback,
    store: IStateStore,
    logger: ILogger,
    notifier?: INotifier,
    coordinator?: HealingCoordinator,
  ) {
    this.config = config;
    this.scheduler = scheduler;
    this.store = store;
    this.notifier = notifier;
    this.coordinator = coordinator;
    this.logger = logger.child({ component: 'ai-analysis-service' });

    this.client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries,
      timeout: config.timeoutMs,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget entry point.
   *
   * Schedules an async LLM analysis job without blocking the caller.
   * The orchestrator calls this and immediately returns to its next tick.
   *
   * @param snapshot — The SubnetSnapshot assembled this tick (provides telemetry)
   * @param context  — The TriggerContext from AnalysisScheduler (alert or summary)
   */
  public enqueue(snapshot: SubnetSnapshot, context: TriggerContext): void {
    void this.processJob(snapshot, context);
  }

  /**
   * Performs a lightweight API connectivity check.
   * Sends a minimal message and returns true if the SDK responds without error.
   * Used during startup to fail-fast on bad API keys or network issues.
   */
  public async isReady(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── Private: Job Lifecycle ──────────────────────────────────────────────────

  /**
   * Async job runner — the body of the fire-and-forget pattern.
   *
   * Guarantees:
   *   - On summary SUCCESS: scheduler.recordSummaryTimestamp() is called to advance
   *     the 24h clock and lift the in-flight guard.
   *   - On summary FAILURE: scheduler.cancelPendingSummary() is called in the
   *     finally block to prevent deadlock and activate the backoff cooldown.
   *   - Alert jobs do NOT interact with the summary state machine.
   *
   * Notification:
   *   - If a notifier is configured, sendAlert() is dispatched fire-and-forget
   *     after the store write. sendAlert() never rejects (INotifier contract),
   *     but an extra .catch() guard is applied defensively.
   *
   * Post-analysis coordination:
   *   - coordinator.evaluate() is called synchronously after notification dispatch.
   *     Any async healing is launched as a detached promise inside the coordinator.
   *
   * Error isolation:
   *   - All exceptions are caught and logged; none propagate to the event loop.
   *   - A failed job does not affect the next polling tick.
   */
  private async processJob(
    snapshot: SubnetSnapshot,
    context: TriggerContext,
  ): Promise<void> {
    const isSummary = context.type === 'summary';
    let succeeded = false;

    this.logger.info('llm_job_started', {
      type: context.type,
      ...(context.type === 'alert' ? { dedupKey: context.dedupKey } : {}),
    });

    try {
      const result = await this.callLlm(snapshot, context);
      this.store.setLastAnalysis(result);
      succeeded = true;

      if (isSummary) {
        this.scheduler.recordSummaryTimestamp(Date.now());
      }

      this.logger.info('llm_job_completed', {
        type: context.type,
        status: result.status,
        confidence: result.confidence,
        inputTokens: result.tokenUsage.inputTokens,
        outputTokens: result.tokenUsage.outputTokens,
      });

      // ── Notification (fire-and-forget, error-isolated) ────────────────────
      if (this.notifier !== undefined) {
        void this.notifier.sendAlert(result).catch((err: unknown) => {
          this.logger.error('notifier_error', {
            type: context.type,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // ── Post-analysis coordination (synchronous entry; async heal inside) ─
      // evaluate() is a no-op when status !== 'critical' or healer is absent.
      this.coordinator?.evaluate(result);
    } catch (err) {
      this.logger.error('llm_job_failed', {
        type: context.type,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Guarantee: if a summary job did not succeed, release the pending guard
      // and activate the failure backoff. Without this, AnalysisScheduler would
      // never emit another summary trigger for the lifetime of the process.
      if (isSummary && !succeeded) {
        this.scheduler.cancelPendingSummary();
      }
    }
  }

  // ── Private: LLM Invocation ──────────────────────────────────────────────

  /**
   * Executes the Anthropic API call with forced Tool Calling.
   *
   * Alert:   temperature=0.1, max_tokens=1024 (deterministic root-cause analysis)
   * Summary: temperature=0.3, max_tokens=2048 (synthetic trend reasoning, more creative)
   *
   * tool_choice: { type: 'tool', name: 'report_analysis' } forces the LLM to
   * always call report_analysis rather than emitting prose — structured output
   * reliability increases from ~85% to ~99.5%.
   *
   * @throws Error if the API call fails or the tool response fails validation
   */
  private async callLlm(
    snapshot: SubnetSnapshot,
    context: TriggerContext,
  ): Promise<AnalysisResult> {
    const isAlert = context.type === 'alert';

    const userMessage = isAlert
      ? buildAlertUserMessage(context as AlertTriggerContext, snapshot)
      : buildSummaryUserMessage(context as SummaryTriggerContext, snapshot);

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: isAlert ? 1024 : 2048,
      temperature: isAlert ? 0.1 : 0.3,
      system: buildSystemPrompt(),
      tools: [REPORT_ANALYSIS_TOOL],
      tool_choice: { type: 'tool' as const, name: 'report_analysis' },
      messages: [{ role: 'user', content: userMessage }],
    });

    return this.parseToolResponse(response, context);
  }

  /**
   * Validates the Anthropic SDK response and builds a typed AnalysisResult.
   *
   * Expects exactly one tool_use content block named 'report_analysis'.
   * Validates all required fields via strict helper functions that throw
   * descriptive errors on malformed input — errors propagate to processJob()
   * and are caught + logged there.
   *
   * @throws Error on any structural or type validation failure
   */
  private parseToolResponse(
    response: Anthropic.Message,
    context: TriggerContext,
  ): AnalysisResult {
    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'report_analysis',
    );

    if (toolBlock === undefined) {
      throw new Error(
        `LLM response missing expected tool_use block "report_analysis". ` +
          `Stop reason: ${response.stop_reason}. ` +
          `Content types: ${response.content.map((b) => b.type).join(', ')}`,
      );
    }

    const input = toolBlock.input as Record<string, unknown>;

    // ── Shared base fields ───────────────────────────────────────────────────
    const status = getStringEnum(input, 'status', [
      'healthy',
      'degraded',
      'critical',
    ] as const);
    const reason = getString(input, 'reason');
    const recommendation = getString(input, 'recommendation');
    const confidence = getStringEnum(input, 'confidence', [
      'low',
      'medium',
      'high',
    ] as const);
    const producedAt = new Date().toISOString();

    const tokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    // ── Alert ────────────────────────────────────────────────────────────────
    if (context.type === 'alert') {
      const urgencyRaw = getOptionalIntRange(input, 'urgency', 1, 5);
      if (urgencyRaw === undefined) {
        throw new Error(
          'Tool response missing required field "urgency" for alert analysis',
        );
      }
      const urgency = urgencyRaw as 1 | 2 | 3 | 4 | 5;

      const result: AlertAnalysisResult = {
        analysisType: 'alert',
        producedAt,
        status,
        reason,
        recommendation,
        confidence,
        tokenUsage,
        urgency,
        triggeredBy: (context as AlertTriggerContext).violations,
        dedupKey: (context as AlertTriggerContext).dedupKey,
      };
      return result;
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const summaryCtx = context as SummaryTriggerContext;
    const trends = getOptionalStringArray(input, 'trends') ?? [];
    const forwardRisks = getOptionalStringArray(input, 'forwardRisks') ?? [];

    const result: SummaryAnalysisResult = {
      analysisType: 'summary',
      producedAt,
      status,
      reason,
      recommendation,
      confidence,
      tokenUsage,
      coverageWindow: {
        from: summaryCtx.coverageFrom,
        to: summaryCtx.coverageTo,
      },
      trends,
      forwardRisks,
    };
    return result;
  }
}
