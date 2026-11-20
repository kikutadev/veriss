// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import {analyzeInput} from './analyze.mjs';
import type {BoxTree} from './tree.mjs';
import type {LayoutOptions,LayoutSummary} from './layout-contracts.d.ts';
export type {BoxTree} from './tree.mjs';
export type * from './layout-contracts.d.ts';

/** Static box model only. This module never renders or executes UI code. */
export function analyzeLayout(tree:BoxTree,options:LayoutOptions):LayoutSummary {
  return analyzeInput(tree,options);
}

// Form-control UA profiles per browser (the ua layout option) and the smallest reset that makes them agree.
export { uaProfiles, resolveUAProfile } from './layout/ua-profile.mjs';
export { suggestReset } from './layout/ua-reset.mjs';
