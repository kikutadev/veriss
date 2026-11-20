export { phrasingTags } from './tree.mjs';
import type { BoxTree, TreeDiagnostic } from './tree.mjs';
import type { LayoutOptions, LayoutSummary } from './layout-contracts.d.ts';
/** A deliberately small static-HTML adapter, with no DOM or browser dependency. */
export declare function analyzeHTML(html: string, options: LayoutOptions): LayoutSummary;
export declare function htmlBoxTree(html: string): {
    tree: BoxTree;
    diagnostics: TreeDiagnostic[];
};
