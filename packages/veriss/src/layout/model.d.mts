import type { LayoutModel, LayoutObligation } from '../layout-z3.mjs';
import type { LayoutSummary } from '../layout-contracts.d.ts';
type Base<Scope extends Pick<LayoutSummary['scope'], 'axis'>> = Pick<LayoutModel<Scope>, 'component' | 'scope' | 'complete' | 'assumptions' | 'diagnostics'>;
/** Shared bounded query encoding; predicates remain the caller's responsibility. */
export declare function obligationModel<Scope extends Pick<LayoutSummary['scope'], 'axis'>>(base: Base<Scope>, domain: string, input: readonly LayoutObligation[], { variables }?: {
    variables?: readonly string[];
}): LayoutModel<Scope>;
export {};
