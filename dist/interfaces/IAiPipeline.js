"use strict";
// src/interfaces/IAiPipeline.ts
// Dependency-Inversion contracts for the "Dumb Guard + Smart Detective" AI pipeline.
//
// WHY these interfaces exist:
//   PollingOrchestrator previously depended directly on ThresholdEvaluator,
//   AnalysisScheduler, and AiAnalysisService (concrete classes). This violated DIP:
//   a high-level policy module (the 10s heartbeat loop) was coupled to low-level
//   implementation details (Anthropic SDK internals, Map dedup logic, etc.).
//
//   These interfaces sever that coupling. The orchestrator now depends only on the
//   narrow contracts it actually uses — three method signatures. The concrete classes
//   are referenced exclusively in the composition root (src/index.ts).
//
// WHY SchedulerDecision lives in trigger.types.ts (not here):
//   IAiPipeline.ts imports SchedulerDecision. AnalysisScheduler.ts imports IAiPipeline.ts
//   to implement IAnalysisScheduler. If SchedulerDecision were defined here, that would
//   create: IAiPipeline → AnalysisScheduler → IAiPipeline (circular). Moving the type
//   to trigger.types.ts breaks the cycle.
//
// WHY ISchedulerFeedback is separate from IAnalysisScheduler:
//   Interface Segregation Principle. AiAnalysisService only needs the two write-back
//   methods (recordSummaryTimestamp + cancelPendingSummary). Exposing the full
//   IAnalysisScheduler contract (shouldTrigger) to AiAnalysisService would give it
//   the ability to trigger its own LLM calls — an unintended capability that would
//   be invisible to the orchestrator and bypass all dedup/backoff logic.
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=IAiPipeline.js.map