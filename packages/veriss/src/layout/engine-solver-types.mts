// Internal recursive solver boundaries, not the public input schema.
import type {InlineBox} from './engine-inline.mjs';
import type {EngineStyle} from './engine-style.mjs';
import type {EdgeStyle} from './engine-edges.mjs';
import type {TableBox,TableStyle} from './engine-table.mjs';
import type {Region,Affine2} from './region.mjs';
import type {Dimensions} from './engine-types.mjs';
export interface SolverBox extends InlineBox,Omit<TableBox,'children'|'inline'|'contract'|'tag'|'label'|'path'|'text'|'colSpan'|'rowSpan'|'tableCell'> {
  children:SolverBox[];inline?:SolverBox[];
  $foldedInline?:boolean;$starts?:{geometry:number;sizes:number};
}
export type SolverStyle=EngineStyle & EdgeStyle & TableStyle & {
  $collapsedTop?:boolean;$collapsedBottom?:boolean;
  'container-type':string;
};
export interface SolverAncestor {
  box:SolverBox;style:SolverStyle;names?:readonly string[];type?:string;
  inline?:Affine2|null;block?:Affine2|null;contentOrigin?:Dimensions|null;paddingOrigin?:Dimensions|null;
  paddingInline?:Affine2;paddingBlock?:Affine2|null;positioned?:boolean;clipped?:boolean;clipScope?:boolean;subgrid?:boolean;
}
export interface SolverChild {box:SolverBox;style:SolverStyle;inherited?:SolverStyle|undefined}
export interface ChildState {region:Region;children:SolverChild[];contents?:SolverStyle;$responsiveCollapse?:boolean}
export type ResolveStyle=(box:SolverBox,region:Region,ancestors:readonly SolverAncestor[],inherited:SolverStyle|undefined,emit:boolean,gridItem?:boolean,state?:ReadonlySet<string>)=>{region:Region;style:SolverStyle}[];
