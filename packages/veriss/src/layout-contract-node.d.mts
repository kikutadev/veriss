import type { ObligationIR, ContractProof } from './layout-contract.mjs';
import type { RelationalObligationIR, RelationalProof, Observation } from './relational-contract.mjs';
import type { LayoutSummary } from './layout-contracts.d.ts';
/** Build-only convenience; browser Workers supply their own Z3 API instead. */
export declare function verifyContractObligation(obligation: ObligationIR, options?: {
    timeoutMs?: number;
}): Promise<ContractProof>;
export declare function verifyContractObligation(obligation: RelationalObligationIR, options?: {
    observations?: readonly Observation[];
}): Promise<RelationalProof>;
export declare function verifyDeclaredLayouts(report: LayoutSummary, options?: {
    timeoutMs?: number;
}): Promise<ContractProof[]>;
