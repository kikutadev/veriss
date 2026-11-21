import type { LayoutSummary } from './layout-contracts.d.ts';
import type { EnvironmentProfile, GeometryEvidence, RelationalProof } from './relational-contract.mjs';
import type { WidthBranch, WidthTransitionSourceInput } from './layout/width-transition.mjs';
import type { LayoutIR } from './layout-contract.mjs';
import type { LayoutModel, LayoutProof, LayoutSolverAPI, LayoutObligation } from './layout-z3.mjs';
type Frozen<T> = T extends object ? {
    readonly [K in keyof T]: Frozen<T[K]>;
} : T;
export type NoShiftReference = string | {
    id: string;
    within?: string;
};
export interface NoShiftTarget {
    name: string;
    before: NoShiftReference;
    after: NoShiftReference;
}
export interface NoShiftInput {
    name: string;
    targets: readonly NoShiftTarget[];
}
/** Exact presence and border-rectangle equality at two modeled endpoints. */
export type NoShiftContract = Frozen<{
    version: 1;
    kind: 'noshift-contract';
    profile: 'noshift/1';
    name: string;
    targets: NoShiftTarget[];
}>;
export type TransitionIR = Frozen<{
    version: 1;
    kind: 'transition';
    before: LayoutIR;
    after: LayoutIR;
    complete: boolean;
    diagnostics: LayoutSummary['diagnostics'];
    assumptions: string[];
}>;
export type RectangleField = 'inlineStart' | 'blockStart' | 'inlineSize' | 'blockSize';
export interface TransitionObligationFact extends LayoutObligation {
    target?: string;
    beforePath?: string;
    afterPath?: string;
    field?: RectangleField;
}
export type TransitionObligation = Frozen<{
    version: 1;
    kind: 'transition-obligation';
    contract: NoShiftContract;
    transition: TransitionIR;
    coverage: LayoutModel;
    model: Omit<LayoutModel, 'obligations'> & {
        obligations: TransitionObligationFact[];
    };
}>;
export interface ExactPixels {
    value: number;
    exact: string;
}
export interface NoShiftChange {
    target: string;
    field: RectangleField;
    beforePath: string;
    afterPath: string;
    before: ExactPixels;
    after: ExactPixels;
    delta: ExactPixels;
}
export interface NoShiftProof {
    version: 1;
    status: 'verified' | 'violated' | 'unknown';
    contract: NoShiftContract;
    coverage: LayoutProof;
    proof: LayoutProof;
    change?: NoShiftChange;
}
/** Intent only: exact border-rectangle equality for explicitly matched targets. */
export declare function createNoShiftContract(input: NoShiftInput): NoShiftContract;
/** Extract both states before consulting any target contract. */
export declare function createTransitionIR(input: {
    before: LayoutSummary;
    after: LayoutSummary;
}): TransitionIR;
/** Coverage and equality are separate queries; missing geometry never proves equality. */
export declare function createTransitionObligation(contract: NoShiftContract, transition: TransitionIR): TransitionObligation;
export declare function verifyTransitionObligation(obligation: TransitionObligation, api: LayoutSolverAPI, options?: {
    timeoutMs?: number;
}): Promise<NoShiftProof>;
/** Exact endpoint invariants under a *declared* shared bounded affine progress.
 * This alone does not prove JavaScript/CSS implements that progress model. */
export interface SharedAffineInput {
    profile: EnvironmentProfile;
    from: string;
    to: string;
    evidence: readonly GeometryEvidence[];
    predicate: unknown;
    interpolation: {
        kind: string;
        easing: string;
        assumptions: readonly string[];
    };
}
export interface SharedAffineProof {
    status: 'verified' | 'violated' | 'unknown';
    reason?: string;
    assumptions: string[];
    endpoints?: RelationalProof;
    progress?: {
        min: string;
        max: string;
    };
}
export declare function verifyInterpolatedPredicate(input: SharedAffineInput): SharedAffineProof;
/** Independent CSS-source derivation, restricted to the closed fixed-width
 * component subset validated by deriveWidthTransition. No supplied geometry
 * facts or invented progress assumptions are accepted. */
export interface CSSWidthTransitionInput extends WidthTransitionSourceInput {
    predicate: unknown;
}
export interface CSSWidthTransitionProof extends SharedAffineProof {
    derivation?: {
        kind: 'fixed-width-transition';
        groups: WidthBranch[];
        easing: string;
        targets: string[];
    };
}
export declare function verifyCSSWidthTransition(input: CSSWidthTransitionInput): CSSWidthTransitionProof;
export {};
