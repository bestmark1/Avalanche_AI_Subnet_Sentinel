import type { SubnetSnapshot } from '../types/models.js';
/**
 * IAnalysisService — AI/LLM Anomaly Detection
 *
 * Step 1: STUB — analyze() returns null.
 * Step 2+: Threshold-based anomaly detection.
 * Step 3+: LLM/RAG pipeline for context-aware analysis.
 *
 * Defined now so the Orchestrator can invoke it after each
 * snapshot assembly without future refactoring.
 */
export interface AnalysisResult {
    readonly anomalyDetected: boolean;
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly description: string;
    readonly recommendedAction: string | null;
    readonly confidence: number;
}
export interface IAnalysisService {
    /** Step 1: Returns null. Step 2+: Analyzes snapshot for anomalies. */
    analyze(snapshot: SubnetSnapshot): Promise<AnalysisResult | null>;
    /** Step 1: Returns false. Step 2+: Checks if AI engine is loaded. */
    isReady(): Promise<boolean>;
}
//# sourceMappingURL=IAnalysisService.d.ts.map