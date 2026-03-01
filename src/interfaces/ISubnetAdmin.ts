// src/interfaces/ISubnetAdmin.ts
// Verbatim from ARCHITECTURE.md Section 6.6

/**
 * ISubnetAdmin — Subnet Fee Configuration Manager
 *
 * Step 1: STUB — All methods return null/false.
 * Step 2: Will use eth_feeConfig RPC to read and propose fee changes.
 *
 * Defined now so the Orchestrator can accept this dependency
 * without refactoring when Step 2 is implemented.
 */
export interface FeeConfig {
  readonly gasLimit: number;
  readonly targetBlockRate: number;
  readonly minBaseFee: string;               // Wei as decimal string
  readonly targetGas: number;
  readonly baseFeeChangeDenominator: number;
  readonly minBlockGasCost: number;
  readonly maxBlockGasCost: number;
  readonly blockGasCostStep: number;
}

export interface ISubnetAdmin {
  /** Step 1: Returns null. Step 2: Calls eth_feeConfig. */
  getFeeConfig(): Promise<FeeConfig | null>;

  /** Step 1: Returns false. Step 2: Checks admin API availability. */
  isAvailable(): Promise<boolean>;
}
