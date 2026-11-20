import type {LayoutSummary} from './layout-contracts.d.ts';
import type {LayoutIR} from './layout-contract.mjs';
import type {LayoutModel,LayoutProof,LayoutSolverAPI,LayoutObligation} from './layout-z3.mjs';
type Frozen<T>=T extends object ? {readonly [K in keyof T]:Frozen<T[K]>} : T;

export type NoShiftReference=string|{id:string;within?:string};
export interface NoShiftTarget {name:string;before:NoShiftReference;after:NoShiftReference}
export interface NoShiftInput {name:string;targets:readonly NoShiftTarget[]}
/** Exact presence and border-rectangle equality at two modeled endpoints. */
export type NoShiftContract=Frozen<{version:1;kind:'noshift-contract';profile:'noshift/1';name:string;targets:NoShiftTarget[]}>;
export type TransitionIR=Frozen<{
  version:1;kind:'transition';before:LayoutIR;after:LayoutIR;
  complete:boolean;diagnostics:LayoutSummary['diagnostics'];assumptions:string[];
}>;
export type RectangleField='inlineStart'|'blockStart'|'inlineSize'|'blockSize';
export interface TransitionObligationFact extends LayoutObligation {
  target?:string;beforePath?:string;afterPath?:string;field?:RectangleField;
}
export type TransitionObligation=Frozen<{
  version:1;kind:'transition-obligation';contract:NoShiftContract;transition:TransitionIR;
  coverage:LayoutModel;model:Omit<LayoutModel,'obligations'> & {obligations:TransitionObligationFact[]};
}>;
export interface ExactPixels {value:number;exact:string}
export interface NoShiftChange {
  target:string;field:RectangleField;beforePath:string;afterPath:string;
  before:ExactPixels;after:ExactPixels;delta:ExactPixels;
}
export interface NoShiftProof {
  version:1;status:'verified'|'violated'|'unknown';contract:NoShiftContract;
  coverage:LayoutProof;proof:LayoutProof;change?:NoShiftChange;
}
export function createNoShiftContract(input:NoShiftInput):NoShiftContract;
export function createTransitionIR(input:{before:LayoutSummary;after:LayoutSummary}):TransitionIR;
export function createTransitionObligation(contract:NoShiftContract,transition:TransitionIR):TransitionObligation;
export function verifyTransitionObligation(obligation:TransitionObligation,api:LayoutSolverAPI,options?:{timeoutMs?:number}):Promise<NoShiftProof>;

/** Conditional proof; caller establishes that all referenced coordinates
 * interpolate with the same bounded progress at each fixed viewport. */
export function verifyInterpolatedPredicate(input:{
 profile:import('./relational-contract.mjs').EnvironmentProfile;
 from:string;to:string;
 evidence:readonly import('./relational-contract.mjs').GeometryEvidence[];
 predicate:import('./relational-contract.mjs').Predicate;
 interpolation:{kind:'shared-affine';easing:string;assumptions:readonly string[]};
}):{status:'verified'|'violated'|'unknown';reason?:string;assumptions:readonly string[];endpoints?:import('./relational-contract.mjs').RelationalProof;progress?:{min:string;max:string}};

/** Derive a fixed-width interpolation from a closed standards component and
 * paired explicit CSS state rules. Unsupported dependencies return Unknown. */
export function verifyCSSWidthTransition(input:{
 html:string;css:string;profile:import('./relational-contract.mjs').EnvironmentProfile;
 target:string;stateAttribute:string;from:string;to:string;predicate:import('./relational-contract.mjs').Predicate;
}):ReturnType<typeof verifyInterpolatedPredicate>&{derivation?:{kind:'fixed-width-transition';groups:readonly {context:string;before:string;after:string}[];easing:string;targets:readonly string[]}};
