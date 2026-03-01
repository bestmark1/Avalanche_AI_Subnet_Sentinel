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
export declare class AnalysisServiceStub implements IAnalysisService {
    analyze(_snapshot: SubnetSnapshot): Promise<AnalysisResult | null>;
    isReady(): Promise<boolean>;
}
//# sourceMappingURL=AnalysisServiceStub.d.ts.map