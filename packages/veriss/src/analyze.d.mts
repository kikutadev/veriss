import type { BoxTree, TreeDiagnostic } from './tree.mjs';
import type { LayoutOptions, LayoutSummary } from './layout-contracts.d.ts';
export declare function analyzeInput(tree: BoxTree, options: LayoutOptions, adapterDiagnostics?: readonly TreeDiagnostic[], preferences?: readonly string[]): LayoutSummary;
