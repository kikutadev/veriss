import type { LayoutSummary } from './layout-contracts.d.ts';
import type { LayoutProof } from './layout-z3.mjs';
/** Ephemeral solver owns and tears down its Wasm threads, including failures. */
export declare function verifyLayoutReport(report: LayoutSummary, options?: {
    timeoutMs?: number;
}): Promise<LayoutProof>;
