// Transitional declaration for the still-JavaScript engine. Remove on migration of engine.mjs.
import type {NormalizedBox,TreeDiagnostic} from '../tree.mjs';
import type {LayoutScrollbarProfile,LayoutSummary} from '../layout-contracts.d.ts';
import type {EngineOptions} from './input.mjs';
export function analyzeBoxTree(root:NormalizedBox,options:EngineOptions,scrollbarProfile:LayoutScrollbarProfile|undefined,budget:{remaining:number},inlineSheets?:readonly {css:string;file:string}[],inputDiagnostics?:readonly TreeDiagnostic[],preferences?:readonly string[]):LayoutSummary;
