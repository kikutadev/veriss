import type {LayoutAffine,LayoutRectangle,LayoutScrollbarProfile,LayoutBoxContract,MediaFeatures} from './layout-contracts.d.ts';
import type {LayoutSolverAPI} from './layout-z3.mjs';
import type {LayoutIR} from './layout-contract.mjs';
type Frozen<T> = T extends object ? {readonly [K in keyof T]:Frozen<T[K]>} : T;
export type Exact = string;
export type Status = 'verified'|'violated'|'unknown';
export interface StateTransition {from:string;event:string;to:string;profiles?:readonly string[]}
export interface StateInput {initial:string;states:readonly string[];transitions:readonly StateTransition[]}
export type StateIR=Frozen<StateInput & {version:1;kind:'state'}>;
export interface EnvironmentProfile {
  id:string; viewport:{min:number;max:number;height:{min:number;max:number}};
  mediaFeatures?:MediaFeatures;
  safeArea?:Partial<Record<'top'|'right'|'bottom'|'left',number>>;
  ua?:'chromium'|'firefox'|'webkit'; dpr?:number; scrollbar?:LayoutScrollbarProfile;
  input?:'touch'|'mouse'|'keyboard'|'mixed'; fontProfile?:string; assumptions?:readonly string[];
}
export type EnvironmentIR=Frozen<{version:1;kind:'environment';profiles:EnvironmentProfile[]}>;
export type RectangleField=keyof LayoutRectangle|'inlineEnd'|'blockEnd';
export type Operand=Exact|{target:string;field:RectangleField;endpoint?:'before'|'after'}|
  {environment:'width'|'height'|'safeLeft'|'safeRight'|'safeTop'|'safeBottom'}|
  {op:'add';items:readonly Operand[]}|{op:'scale';factor:Exact;item:Operand};
export type Predicate=
  {op:'compare';relation:'lt'|'le'|'eq'|'ge'|'gt'|'ne';left:Operand;right:Operand}|
  {op:'all'|'any';items:readonly Predicate[]}|{op:'not';item:Predicate}|
  {op:'use';name:string;bind:Readonly<Record<string,string>>};
type ContractCondition={id:string;states?:readonly string[];profiles?:readonly string[]};
export type Relation=ContractCondition & (
  {kind:'predicate';predicate:Predicate;event?:string}|
  {kind:'within-viewport';target:string}|
  {kind:'contains'|'disjoint';target:string;other:string}|
  {kind:'min-size';target:string;width:number;height:number}|
  {kind:'stable';target:string;event:string}|
  {kind:'max-occupancy';target:string;overlays:readonly string[];max:Exact}|
  {kind:'action';event:string}
);
export interface RelationalContractInput {
  component:string;profile:'relational/1';contracts:readonly Relation[];definitions?:Readonly<Record<string,Predicate>>;
}
export type RelationalContractIR=Frozen<{version:1;kind:'contract';component:string;profile:{id:'relational/1'};contracts:Relation[]}>;
export interface GeometryEvidence {
  state:string;profile:string;profileKey?:string;target:string;source:'dom'|'local-dom'|'scene'|'external';assumptions:readonly string[];
  axes?:readonly ['inline']|readonly ['block'];
  rows?:readonly {rect:Partial<LayoutRectangle>;constraints?:readonly (LayoutAffine & {strict:boolean})[]}[];reason?:string;
}
export type EvidenceIR=Frozen<{version:1;kind:'evidence';entries:GeometryEvidence[]}>;
export interface RelationalImplementation {state:StateIR;environment:EnvironmentIR;evidence:EvidenceIR}
export type RelationalObligationIR=Frozen<{version:1;kind:'obligation';operation:'relational';contract:RelationalContractIR;implementation:RelationalImplementation;cases:{contract:string;profile:string;transition:{from:string;to?:string;event?:string};targets:{state:string;target:string;endpoint:string}[]}[]}>;
export type Observation={state:string;profile:string;width:number;height:number;rects?:Readonly<Record<string,{x:number;y:number;width:number;height:number}>>;event?:string;to?:string;passed?:boolean};
export interface AllocationTransfer {profile:string;state:string;width:LayoutAffine;height:LayoutAffine;inlineStart:LayoutAffine;blockStart:LayoutAffine}
export interface CompositionDependency {component:string;contract:string;bind:Readonly<Record<string,string>>;transfer?:AllocationTransfer}
export interface RelationCase {method?:'composition';dependencies?:CompositionDependency[];state?:string;profile:string;to?:string;event?:string;status:Status;coverage?:{status:'verified'|'unknown'};sources?:string[];assumptions?:string[];reason?:string;witness?:{width:Exact;height:Exact}}
export interface RelationResult {id:string;kind:Relation['kind'];status:Status;cases:RelationCase[];observations:{status:'passed'|'failed'|'unknown';sample:Observation;after?:Observation;reason?:string}[];reason?:string}
export interface RelationalProof {
  version:1;operation:'relational';contract:RelationalContractIR;state:StateIR;environment:EnvironmentIR;status:Status;outcome:'verified'|'failed'|'unknown';
  observationDiagnostics:{code:string;message:string;sample:Observation}[];observationStatus:'sampled'|'failed'|'incomplete'|'not-run';observationCoverage:{state:string;profile:string;samples:number}[];
  reachable:string[];unreachable:string[];reachability:{profile:string;states:string[]}[];assumptions:string[];contracts:RelationResult[];
}
export interface UIModel extends StateInput {version:1;component?:string;profiles:readonly EnvironmentProfile[];contracts:readonly Relation[];definitions?:Readonly<Record<string,Predicate>>}
export function createStateIR(input:StateInput):StateIR;
export function createEnvironmentIR(profiles:readonly EnvironmentProfile[]):EnvironmentIR;
export function createEvidenceIR(entries:readonly GeometryEvidence[]):EvidenceIR;
export function createRelationalContractIR(input:RelationalContractInput):RelationalContractIR;
export function createRelationalObligationIR(contract:RelationalContractIR,implementation:RelationalImplementation):RelationalObligationIR;
export function verifyRelationalObligation(obligation:RelationalObligationIR,options?:{observations?:readonly Observation[]}):RelationalProof;
export function verifyUI(input:{model:UIModel;evidence?:readonly GeometryEvidence[];observations?:readonly Observation[]}):RelationalProof;
export function layoutGeometry(input:{state:string;profile:EnvironmentProfile;layout:LayoutIR;targets:readonly string[];paths?:Readonly<Record<string,string>>;local?:{assumptions:readonly string[];origin?:Pick<LayoutRectangle,'inlineStart'|'blockStart'>}}):GeometryEvidence[];
export function profileKey(profile:EnvironmentProfile):string;


export interface RelationalCompositionImport {
  obligation:RelationalObligationIR;contract:string;bind:Readonly<Record<string,string>>;transfer?:AllocationTransfer;
}
export interface RelationalProofSession {
  verify(obligation:RelationalObligationIR,options?:{observations?:readonly Observation[]}):RelationalProof;
  verifyUI(input:{model:UIModel;evidence?:readonly GeometryEvidence[];observations?:readonly Observation[]}):RelationalProof;
  compose(obligation:RelationalObligationIR,imports:readonly RelationalCompositionImport[],api:LayoutSolverAPI,options?:{timeoutMs?:number;observations?:readonly Observation[]}):Promise<RelationalProof>;
  stats():{entries:number;keyBytes:number;hits:number;misses:number;evictions:number};
  clear():void;
}
/** trustedStorage must be verifier-owned, authenticated and version-bound. Never use untrusted data. */
export function createRelationalProofSession(options?:{maxEntries?:number;maxKeyBytes?:number;trustedStorage?:{get(key:string):number|undefined;set(key:string,cost:number):void}}):RelationalProofSession;
