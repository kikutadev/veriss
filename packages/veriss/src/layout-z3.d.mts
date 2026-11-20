import type { LayoutSummary, LayoutDiagnostic, LayoutAffine } from './layout-contracts.d.ts';
export interface LayoutObligation {
    code: string;
    box?: string | undefined;
    path?: string | undefined;
    axis?: 'inline' | 'block' | undefined;
    variant?: number;
    scrollbarProfile?: string;
    domain: string;
    failure: string;
    available?: LayoutAffine;
    required?: LayoutAffine;
}
export interface LayoutModel<Scope extends Pick<LayoutSummary['scope'], 'axis'> = LayoutSummary['scope']> {
    version: 1;
    component: string;
    complete: boolean;
    assumptions: string[];
    scope: Scope;
    diagnostics: LayoutDiagnostic[];
    obligations: LayoutObligation[];
    sourceObligations: number;
    smt2: string;
    domain: string;
}
export interface LayoutProof {
    version: 1;
    component: string;
    status: 'verified' | 'violated' | 'unknown';
    complete: boolean;
    assumptions: string[];
    solver: {
        engine: 'z3-wasm';
        version?: string;
        result: 'sat' | 'unsat' | 'unknown';
    };
    diagnostics: LayoutDiagnostic[];
    witness?: {
        obligationIndex?: number;
        code: string;
        box?: string | undefined;
        path?: string | undefined;
        axis?: 'inline' | 'block' | undefined;
        variant?: number;
        scrollbarProfile?: string;
        viewport: number;
        viewportExact: string;
        viewportHeight?: number;
        viewportHeightExact?: string;
        available?: number;
        required?: number;
        availableExact?: string;
        requiredExact?: string;
    };
}
export type LayoutSolverAPI = Pick<Awaited<ReturnType<typeof import('z3-solver').init>>, 'Context'> & Partial<Pick<Awaited<ReturnType<typeof import('z3-solver').init>>, 'getVersionString'>>;
/** ∃ viewport, reachable structure, platform, obligation: required > available. */
export declare function createLayoutModel(report: LayoutSummary): LayoutModel;
export declare function verifyLayoutModel(model: LayoutModel<Pick<LayoutSummary["scope"], "axis">>, api: LayoutSolverAPI, options?: {
    timeoutMs?: number;
}): Promise<LayoutProof>;
