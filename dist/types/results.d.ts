import type { RpcData, NodeMetricsData } from './models.js';
/** Generic result wrapper — mirrors Promise.allSettled but strongly typed */
export interface CollectorSuccess<T> {
    readonly status: 'fulfilled';
    readonly data: T;
    readonly durationMs: number;
}
export interface CollectorFailure {
    readonly status: 'rejected';
    readonly reason: string;
    readonly durationMs: number;
}
export type CollectorResult<T> = CollectorSuccess<T> | CollectorFailure;
/** Specific result aliases for clarity in the orchestrator */
export type RpcCollectorResult = CollectorResult<RpcData>;
export type MetricsCollectorResult = CollectorResult<NodeMetricsData>;
//# sourceMappingURL=results.d.ts.map