import type { BoxTree } from './tree.mjs';
import type { LayoutOptions, LayoutSummary } from './layout-contracts.d.ts';
export type { BoxTree } from './tree.mjs';
export type * from './layout-contracts.d.ts';
/** Static box model only. This module never renders or executes UI code. */
export declare function analyzeLayout(tree: BoxTree, options: LayoutOptions): LayoutSummary;
export { uaProfiles, resolveUAProfile } from './layout/ua-profile.mjs';
export { suggestReset } from './layout/ua-reset.mjs';
