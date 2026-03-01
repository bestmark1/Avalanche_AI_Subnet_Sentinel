"use strict";
// src/services/AnalysisServiceStub.ts
// Step 1 stub — implements IAnalysisService with no-op methods.
// Will be replaced by threshold-based detection in Step 2,
// then LLM/RAG pipeline in Step 3+.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisServiceStub = void 0;
/**
 * AnalysisServiceStub — Placeholder for AI/LLM Anomaly Detection
 *
 * analyze() returns null (no analysis performed).
 * isReady() returns false (no AI engine loaded).
 *
 * This stub exists so the Orchestrator can invoke the analysis step
 * after each snapshot assembly without future refactoring.
 */
class AnalysisServiceStub {
    async analyze(_snapshot) {
        // Step 1: No-op. The snapshot is ignored.
        // Step 2+: Will perform anomaly detection here.
        return null;
    }
    async isReady() {
        return false;
    }
}
exports.AnalysisServiceStub = AnalysisServiceStub;
//# sourceMappingURL=AnalysisServiceStub.js.map