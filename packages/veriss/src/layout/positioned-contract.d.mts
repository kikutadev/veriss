import type { LayoutIR, LayoutSpaceBinding, LayoutOverlayBinding } from '../layout-contract.mjs';
import type { LayoutScenarioIdentity, LayoutElement } from '../layout-contracts.d.ts';
import type { LayoutObligation } from '../layout-z3.mjs';
type PositionContract = {
    readonly spaces: readonly LayoutSpaceBinding[];
    readonly overlays: readonly LayoutOverlayBinding[];
};
type PathRow = LayoutScenarioIdentity & {
    path: string;
};
export declare function validatePositionedBindings(spaces: unknown, overlays: unknown): void;
export declare const matchesBindingSelector: (selector: string, element: Readonly<Pick<LayoutElement, "tag" | "id">> & {
    readonly classes: readonly string[];
}) => boolean;
/** Contract predicates use only independently extracted facts. */
export declare function positionedObligations(contract: PositionContract, implementation: LayoutIR, path: string, { exposed, external }?: {
    exposed?: readonly PathRow[];
    external?: readonly PathRow[];
}): {
    obligations: LayoutObligation[];
    coverage: LayoutObligation[];
};
export {};
