// src/services/SubnetAdminStub.ts
// Step 1 stub — implements ISubnetAdmin with no-op methods.
// Will be replaced by a real implementation in Step 2 (eth_feeConfig RPC).

import type { ISubnetAdmin, FeeConfig } from '../interfaces/ISubnetAdmin.js';

/**
 * SubnetAdminStub — Placeholder for Subnet Fee Configuration
 *
 * All methods return null/false. This stub exists so the Orchestrator
 * can accept ISubnetAdmin as a dependency without refactoring when
 * the real implementation is plugged in during Step 2.
 */
export class SubnetAdminStub implements ISubnetAdmin {
  public async getFeeConfig(): Promise<FeeConfig | null> {
    return null;
  }

  public async isAvailable(): Promise<boolean> {
    return false;
  }
}
