import type { LayoutAffine, LayoutRange, LayoutSummary, LayoutScenarioIdentity, LayoutPosition, LayoutElement, LayoutRectangle, LayoutDiagnostic } from './layout-contracts.d.ts';
import type { LayoutModel, LayoutProof, LayoutSolverAPI } from './layout-z3.mjs';
import type { RelationalContractInput, RelationalContractIR, RelationalImplementation, RelationalObligationIR, RelationalProof, Observation } from './relational-contract.mjs';
export type { StateIR, StateInput, EnvironmentIR, EnvironmentProfile, EvidenceIR, GeometryEvidence, Operand, Predicate, Relation, RelationalContractIR, RelationalContractInput, RelationalImplementation, RelationalObligationIR, RelationalProof, Observation, UIModel, RelationalProofSession, RelationalCompositionImport, CompositionDependency, AllocationTransfer } from './relational-contract.mjs';
type Frozen<T> = T extends object ? {
    readonly [K in keyof T]: Frozen<T[K]>;
} : T;
export interface LayoutSpaceBinding {
    readonly name: string;
    readonly selector: string;
}
export interface LayoutOverlayBinding {
    readonly selector: string;
    readonly within: string;
}
interface ContractBase {
    component: string;
    /** Closed ranges for parent-allocated CSS px, not CSS declarations or viewport ranges. */
    requires: {
        inlineSize: {
            min: number;
            max: number;
        };
        blockSize: {
            min: number;
            max: number;
        };
    };
    ensures?: {
        inline: 'fit';
        block: 'fit';
    };
}
export type ContractInput = ContractBase & ({
    profile?: typeof SafeGrid.id;
    spaces?: never;
    overlays?: never;
} | {
    profile: typeof PositionedGrid.id;
    spaces: readonly LayoutSpaceBinding[];
    overlays: readonly LayoutOverlayBinding[];
});
export type ContractIR = Frozen<{
    version: 1;
    kind: 'contract';
    component: string;
    requires: {
        inlineSize: LayoutRange;
        blockSize: LayoutRange;
    };
    ensures: {
        inline: 'fit';
        block: 'fit';
    };
} & ({
    profile: typeof SafeGrid;
    spaces?: never;
    overlays?: never;
} | {
    profile: typeof PositionedGrid;
    spaces: LayoutSpaceBinding[];
    overlays: LayoutOverlayBinding[];
})>;
export type LayoutIRBox = Frozen<LayoutScenarioIdentity & LayoutPosition & {
    box: string;
    path: string;
    range: LayoutRange;
    heightRange?: LayoutRange | undefined;
    layoutRect?: LayoutRectangle | null;
    region?: LayoutSummary['sizes'][number]['region'];
    boxSizing: 'border-box' | 'content-box';
    /** In-flow: Grid area. Explicit absolute: CSS-resolved used border rectangle. */
    allocated: {
        inline: LayoutAffine;
        block?: LayoutAffine;
    };
    border: {
        inline: LayoutAffine;
        block?: LayoutAffine;
    };
    content: {
        inline: LayoutAffine;
        block?: LayoutAffine;
    };
    padding?: {
        inline: LayoutAffine;
        block?: LayoutAffine;
    };
}>;
/** Trusted CSS extraction, constructed without a ContractIR; not a browser semantics proof. */
export type LayoutIR = Frozen<{
    version: 1;
    kind: 'layout';
    component: string;
    scope: LayoutSummary['scope'];
    cases: LayoutScenarioIdentity[];
    boxes: LayoutIRBox[];
    presence: LayoutSummary['policies'];
    checks: LayoutSummary['checks'];
    elements: LayoutElement[];
    errors: LayoutSummary['diagnostics'];
    diagnostics: LayoutSummary['diagnostics'];
    complete: boolean;
    geometryComplete: boolean;
    assumptions: string[];
    bindings: NonNullable<LayoutSummary['layoutBindings']>;
}>;
/** Explicit native box path binding; v1 does not replace child bodies with summaries. */
export interface ChildLayoutBinding {
    readonly path: string;
    readonly contract: ContractIR;
}
export interface LayoutDependency {
    readonly component: string;
    readonly path: string;
}
export interface LayoutPlacementTransfer {
    readonly caller: string;
    readonly path: string;
    readonly cases: readonly LayoutScenarioIdentity[];
    readonly allocation: 'used-border-box';
}
export type ObligationIR = Frozen<{
    version: 1;
    kind: 'obligation';
    contract: ContractIR;
    model: LayoutModel;
} & ({
    operation: 'conformance';
    implementation: LayoutIR;
    children: readonly ChildLayoutBinding[];
    coverage: LayoutModel;
    instance?: {
        path: string;
    };
    dependencies?: LayoutDependency[];
    placementTransfers?: LayoutPlacementTransfer[];
} | {
    operation: 'refinement';
    previous: ContractIR;
})>;
export interface ContractProof {
    version: 1;
    status: 'verified' | 'violated' | 'unknown';
    operation: ObligationIR['operation'];
    contract: ContractIR;
    /** Coverage must verify before conformance is attempted. */
    coverage?: LayoutProof;
    proof: LayoutProof;
    instance?: {
        readonly path: string;
    };
    dependencies?: readonly LayoutDependency[];
    placementTransfers?: readonly LayoutPlacementTransfer[];
}
export type UIContractIR = ContractIR | RelationalContractIR;
export type UIObligationIR = ObligationIR | RelationalObligationIR;
export type UIContractProof = ContractProof | RelationalProof;
export { createStateIR, createEnvironmentIR, createEvidenceIR, layoutGeometry, verifyUI, verifyRelationalObligation, createRelationalProofSession } from './relational-contract.mjs';
export declare function copyDiagnostic(d: Frozen<LayoutDiagnostic>): LayoutDiagnostic;
export declare function solverModel(model: Frozen<LayoutModel>): LayoutModel<Pick<LayoutSummary['scope'], 'axis'>>;
export declare const SafeGrid: {
    readonly id: "safe-grid/1";
    readonly containers: "grid";
    readonly positioning: "in-flow";
    readonly boxSizing: "border-box";
    readonly geometry: "piecewise-affine";
    readonly overflowPolicies: readonly ["fit"];
};
export declare const PositionedGrid: {
    readonly id: "positioned-grid/1";
    readonly positioning: "local-absolute";
    readonly containers: "grid";
    readonly boxSizing: "border-box";
    readonly geometry: "piecewise-affine";
    readonly overflowPolicies: readonly ["fit"];
};
export declare function createContractIR(input: ContractInput): ContractIR;
export declare function createContractIR(input: RelationalContractInput): RelationalContractIR;
/** Extract implementation facts without consulting a ContractIR. */
export declare function createLayoutIR(report: LayoutSummary): LayoutIR;
export declare function createObligationIR(contract: ContractIR, implementation: LayoutIR, options?: {
    children?: readonly ChildLayoutBinding[];
}): ObligationIR;
export declare function createObligationIR(contract: RelationalContractIR, implementation: RelationalImplementation): RelationalObligationIR;
/** Check an actual allocation against Requires; never use Requires to prune inputs. */
export declare function createInstanceObligationIR(contract: ContractIR, implementation: LayoutIR, options: {
    path: string;
    cases?: readonly LayoutScenarioIdentity[];
}): ObligationIR;
/** Bind source declarations to concrete boxes after structural expansion. */
export declare function createDeclaredObligations(implementation: LayoutIR): readonly ObligationIR[];
/** Both v1 contracts guarantee Fit; replacement must accept every old input. */
export declare function createRefinementObligationIR(previous: ContractIR, next: ContractIR): ObligationIR;
export declare function verifyObligationIR(obligation: ObligationIR, api: LayoutSolverAPI, options?: {
    timeoutMs?: number;
}): Promise<ContractProof>;
export declare function verifyObligationIR(obligation: RelationalObligationIR, api?: undefined, options?: {
    observations?: readonly Observation[];
}): Promise<RelationalProof>;
