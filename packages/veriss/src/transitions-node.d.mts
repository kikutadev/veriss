import type { LayoutSummary } from './layout-contracts.d.ts';
import type { NoShiftContract, NoShiftProof } from './transitions.mjs';
/** Build-only helper; Workers call the pure verifier with their own Z3 API. */
export declare function verifyNoShift(before: LayoutSummary, after: LayoutSummary, contract: NoShiftContract, options?: {
    timeoutMs?: number;
}): Promise<NoShiftProof>;
