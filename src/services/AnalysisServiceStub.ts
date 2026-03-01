// src/services/AnalysisServiceStub.ts
// Step 1 stub — implements IAnalysisService with no-op methods.
// Will be replaced by threshold-based detection in Step 2,
// then LLM/RAG pipeline in Step 3+.

import type { SubnetSnapshot } from '../types/models.js';
import type { IAnalysisService, AnalysisResult } from '../interfaces/IAnalysisService.js';

/**
 * AnalysisServiceStub — Placeholder for AI/LLM Anomaly Detection
 *
 * analyze() returns null (no analysis performed).
 * isReady() returns false (no AI engine loaded).
 *
 * This stub exists so the Orchestrator can invoke the analysis step
 * after each snapshot assembly without future refactoring.
 */
export class AnalysisServiceStub implements IAnalysisService {
  public async analyze(_snapshot: SubnetSnapshot): Promise<AnalysisResult | null> {
    // Step 1: No-op. The snapshot is ignored.
    // Step 2+: Will perform anomaly detection here.
    return null;
  }

  public async isReady(): Promise<boolean> {
    return false;
  }
}
