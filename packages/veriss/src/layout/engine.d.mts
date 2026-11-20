import type { SolverBox } from './engine-solver-types.mjs';
import type { EngineOptions } from './input.mjs';
import type { TreeDiagnostic } from '../tree.mjs';
import type { LayoutScrollbarProfile } from '../layout-contracts.d.ts';
import type { EngineReport } from './engine-report.mjs';
export declare function analyzeBoxTree(root: SolverBox, options: EngineOptions, scrollbarProfile: LayoutScrollbarProfile | undefined, budget: {
    remaining: number;
}, inlineSheets?: readonly {
    css: string;
    file: string;
}[], inputDiagnostics?: readonly TreeDiagnostic[], preferences?: readonly string[]): EngineReport;
