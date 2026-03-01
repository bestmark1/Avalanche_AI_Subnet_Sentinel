"use strict";
// src/services/SubnetAdminStub.ts
// Step 1 stub — implements ISubnetAdmin with no-op methods.
// Will be replaced by a real implementation in Step 2 (eth_feeConfig RPC).
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubnetAdminStub = void 0;
/**
 * SubnetAdminStub — Placeholder for Subnet Fee Configuration
 *
 * All methods return null/false. This stub exists so the Orchestrator
 * can accept ISubnetAdmin as a dependency without refactoring when
 * the real implementation is plugged in during Step 2.
 */
class SubnetAdminStub {
    async getFeeConfig() {
        return null;
    }
    async isAvailable() {
        return false;
    }
}
exports.SubnetAdminStub = SubnetAdminStub;
//# sourceMappingURL=SubnetAdminStub.js.map