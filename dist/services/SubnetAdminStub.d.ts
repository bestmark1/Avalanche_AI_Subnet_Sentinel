import type { ISubnetAdmin, FeeConfig } from '../interfaces/ISubnetAdmin.js';
/**
 * SubnetAdminStub — Placeholder for Subnet Fee Configuration
 *
 * All methods return null/false. This stub exists so the Orchestrator
 * can accept ISubnetAdmin as a dependency without refactoring when
 * the real implementation is plugged in during Step 2.
 */
export declare class SubnetAdminStub implements ISubnetAdmin {
    getFeeConfig(): Promise<FeeConfig | null>;
    isAvailable(): Promise<boolean>;
}
//# sourceMappingURL=SubnetAdminStub.d.ts.map