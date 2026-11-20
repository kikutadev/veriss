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
export type RelationalContractIR=Frozen<{version:1;kind:'contract';component:string;profile:{id:'relational/1'};contracts:CanonicalRelation[]}>;
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
// Relational UI contracts over a finite declared state graph and exact piecewise-affine
// CSS-pixel geometry. Runtime observations are intentionally not proof evidence.
import {validMediaFeatures,mediaFeatureEntries} from './layout/conditions.mjs';
import {q,exact,cmp,sub} from './layout/linear.mjs';
import {rational} from './layout/smt.mjs';
import {rectangle,clip,partition,scalar,diff,sum,sample,times,affine as serializeAffine} from './layout/region.mjs';
import {occupancyFailure} from './layout/occupancy.mjs';
import {expandPredicate,predicateTargets,predicateRegions} from './layout/relational-predicate.mjs';
import {verifyPredicateImplication} from './layout/relational-implication.mjs';

import type {Rational} from './layout/linear.mjs';
import type {Region,Affine2,Point} from './layout/region.mjs';
import type {AffineRectangle,WorkBudget} from './layout/occupancy.mjs';
import type {ExpandedPredicate,Comparison} from './layout/relational-predicate.mjs';
type CanonicalRelation=Exclude<Relation,{kind:'predicate'}>|(Omit<Extract<Relation,{kind:'predicate'}>,'predicate'> & {predicate:ExpandedPredicate});
type CanonicalModel=Omit<UIModel,'contracts'> & {contracts:readonly CanonicalRelation[]};
type Endpoint='before'|'after';
type Reference=[Endpoint,string];
type Field=keyof LayoutRectangle;
type PartialRect=Partial<AffineRectangle>;
type Constraint=readonly [Affine2,boolean];
type Prepared={cs:Constraint[];rect:PartialRect;region:Region};
type Transition={from:string;to?:string;event?:string};
type CompiledCase=RelationalObligationIR['cases'][number];
type Observed=RelationResult['observations'][number];
type Derivation={assumptions:string[];sources:string[];dependencies:CompositionDependency[]};
type Cache={get(k:string,remaining:number):number|undefined;set(k:string,cost:number):void};
type VerificationOptions={observations?:readonly Observation[]};
type UIInput={model:UIModel;evidence?:readonly GeometryEvidence[];observations?:readonly Observation[]};
type TransferMapping={mappedEvidence(e:GeometryEvidence):GeometryEvidence;rewrite(v:ExpandedPredicate,bind:Readonly<Record<string,string>>):ExpandedPredicate;domain:Region};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
function need<T>(value:T,message='Missing required evidence'):NonNullable<T> {if(value===undefined||value===null)throw Error(message);return value}
function mutableField<K extends keyof T,T>(value:T,k:K):NonNullable<T[K]> {return need(value[k],'Missing rectangle field '+String(k))}
const zero=q(0), neg=(a:Affine2)=>times(a,q(-1));
const axes:readonly Field[]=['inlineStart','blockStart','inlineSize','blockSize'];
const read=(v:unknown)=>rational(v);
const affine=(a:LayoutAffine):Affine2=>({x:read(a.coefficient),y:read(a.heightCoefficient??'0'),b:read(a.constant)});
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
function ensure(v:unknown,msg:string):asserts v{if(!v)throw new TypeError(msg)}
const list=(v:unknown,max:number):boolean=>Array.isArray(v)&&v.length<=max;
const unique=(v:readonly unknown[])=>new Set(v).size===v.length;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e6;
const range=(r:{min:number;max:number})=>r&&finite(r.min)&&finite(r.max)&&r.min>0&&r.min<=r.max;
const cond=(r:Region,cs:readonly Constraint[])=>cs.reduce<Region|null>((out,[a,s])=>out&&clip(out,a,s),r);
export const profileKey=(p:EnvironmentProfile)=>JSON.stringify([p.viewport.min,p.viewport.max,p.viewport.height.min,p.viewport.height.max,...(['top','right','bottom','left'] as const).map(k=>p.safeArea?.[k]??0),p.ua??'chromium',p.dpr??null,p.scrollbar?.name??'overlay',p.scrollbar?.inlineSize??0,p.scrollbar?.blockSize??0,p.scrollbar?.thinInlineSize??null,p.scrollbar?.thinBlockSize??null,p.input??null,p.fontProfile??null,p.assumptions??[],...(mediaFeatureEntries(p.mediaFeatures).length?[mediaFeatureEntries(p.mediaFeatures)]:[])]);
const domainOf=(p:EnvironmentProfile)=>rectangle({min:q(p.viewport.min),max:q(p.viewport.max)},{min:q(p.viewport.height.min),max:q(p.viewport.height.max)});
function minusRegion(region:Region,cs:readonly Constraint[]):Region[] {
  let rem:Region|undefined=region;const out:Region[]=[];
  for(const [a,s] of cs){if(!rem)break;const p=partition(rem,a,s?'>':'>=');out.push(...p.no);rem=p.yes[0]}
  return out;
}
// All built-in linear relations lower to the same serializable predicate AST.
const equal=(a:PartialRect,b:PartialRect,fields=axes):Constraint[][]=>fields.flatMap(k=>{const d=diff(mutableField(a,k),mutableField(b,k));return [[[d,true]],[[neg(d),true]]]});
const compare=(relation:Comparison,left:Operand,right:Operand):ExpandedPredicate=>({op:'compare',relation,left,right});
const all=(items:readonly ExpandedPredicate[]):ExpandedPredicate=>({op:'all',items}),any=(items:readonly ExpandedPredicate[]):ExpandedPredicate=>({op:'any',items});
const ref=(target:string,field:RectangleField,endpoint?:Endpoint):Operand=>({target,field,...(endpoint?{endpoint}:{})});
const num=(v:number)=>exact(q(v));
function rulePredicate(c:CanonicalRelation):ExpandedPredicate|null{
 const a=(field:RectangleField)=>ref(need('target' in c?c.target:undefined,'Missing target'),field),b=(field:RectangleField)=>ref(need('other' in c?c.other:undefined,'Missing other target'),field);
 switch(c.kind){
  case 'predicate':return c.predicate;
  case 'within-viewport':return all(([['inlineStart','safeLeft','ge'],['blockStart','safeTop','ge'],['inlineEnd','safeRight','le'],['blockEnd','safeBottom','le']] as const).map(([field,environment,op])=>compare(op,a(field),{environment})));
  case 'contains':return all((['inline','block'] as const).flatMap(k=>[compare('le',a(`${k}Start`),b(`${k}Start`)),compare('ge',a(`${k}End`),b(`${k}End`))]));
  case 'disjoint':return any((['inline','block'] as const).flatMap(k=>[compare('le',a(`${k}End`),b(`${k}Start`)),compare('le',b(`${k}End`),a(`${k}Start`)),compare('eq',a(`${k}Size`),'0'),compare('eq',b(`${k}Size`),'0')]));
  case 'min-size':return all([compare('ge',a('inlineSize'),num(c.width)),compare('ge',a('blockSize'),num(c.height))]);
  case 'stable':return all(axes.map(k=>compare('eq',ref(c.target,k,'before'),ref(c.target,k,'after'))));
  default:return null;
 }
}
const ruleRefs=(c:CanonicalRelation,predicate:ExpandedPredicate|null):Reference[]=>predicate?predicateTargets(predicate):c.kind==='max-occupancy'?[c.target,...c.overlays].map(target=>['before',target]):[];
const own=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const selection=(v:unknown,limit:number)=>v===undefined||Array.isArray(v)&&v.length<=limit&&v.length>0&&v.every(id)&&unique(v);
function validateState({initial,states,transitions}:StateInput){
 ensure(list(states,64)&&states.every(id)&&unique(states)&&states.includes(initial),'Invalid state graph');
 ensure(list(transitions,256)&&transitions.every(t=>own(t,['from','event','to','profiles'])&&states.includes(t.from)&&states.includes(t.to)&&id(t.event)&&selection(t.profiles,16))&&unique(transitions.map(t=>JSON.stringify([t.from,t.event,t.to]))),'Invalid transitions');
}
function validateProfiles(profiles:readonly EnvironmentProfile[]){
 ensure(list(profiles,16)&&profiles.length&&unique(profiles.map(p=>p?.id))&&profiles.every(p=>p&&id(p.id)&&range(p.viewport)&&range(p.viewport.height)&&Object.entries(p.safeArea??{}).every(([k,v])=>['left','right','top','bottom'].includes(k)&&Number.isInteger(v)&&v>=0&&v<=200)&&((p.safeArea?.left??0)+(p.safeArea?.right??0)<p.viewport.min)&&((p.safeArea?.top??0)+(p.safeArea?.bottom??0)<p.viewport.height.min)&&(!p.ua||['chromium','firefox','webkit'].includes(p.ua))&&(p.dpr===undefined||typeof p.dpr==='number'&&p.dpr>0&&p.dpr<100&&/^\d{1,2}(?:\.\d{1,3})?$/.test(String(p.dpr)))&&(p.scrollbar===undefined||p.scrollbar&&id(p.scrollbar.name)&&finite(p.scrollbar.inlineSize)&&finite(p.scrollbar.blockSize))),'Invalid profiles');
}
function validateContracts(contracts:readonly CanonicalRelation[]) {
 ensure(list(contracts,128)&&contracts.length&&unique(contracts.map(c=>c?.id)),'Invalid contracts');
 for(const c of contracts){
    ensure(c&&id(c.id)&&['within-viewport','contains','disjoint','min-size','stable','max-occupancy','action','predicate'].includes(c.kind),'Invalid contract kind');
    ensure(((c.kind==='action'||c.kind==='predicate')||id(c.target))&&(!(c.kind==='contains'||c.kind==='disjoint')||(id(c.other)&&c.target!==c.other))&&(!(c.kind==='stable'||c.kind==='action')||id(c.event))&&(!('event' in c)||c.event===undefined||id(c.event)),'Invalid contract targets/event');
    const args={'within-viewport':['target'],contains:['target','other'],disjoint:['target','other'],'min-size':['target','width','height'],stable:['target','event'],'max-occupancy':['target','overlays','max'],action:['event'],predicate:['predicate','event']}[c.kind];
    ensure(Object.keys(c).every(k=>['id','kind','states','profiles',...args].includes(k)),'Unknown contract field');
    ensure(selection(c.states,64)&&selection(c.profiles,16),'Invalid contract state/profile selection');
    if(c.kind==='min-size'){ensure(finite(c.width)&&finite(c.height),'Invalid minimum size');q(c.width);q(c.height)}
    if(c.kind==='max-occupancy')ensure(list(c.overlays,4)&&c.overlays.length&&c.overlays.every(id)&&unique(c.overlays)&&!c.overlays.includes(c.target)&&cmp(read(c.max),zero)>=0&&cmp(read(c.max),q(1))<=0,'Invalid occupancy');
 }
}
function validateBindings(model:CanonicalModel){
 const ids=new Set(model.profiles.map(p=>p.id));
 ensure(model.transitions.every(t=>!t.profiles||t.profiles.every(p=>ids.has(p))),'Unknown transition profile');
 ensure(model.contracts.every(c=>(!c.states||c.states.every(s=>model.states.includes(s)))&&(!c.profiles||c.profiles.every(p=>ids.has(p)))),'Unknown contract state/profile');
}
function reachableIn(model:CanonicalModel,profile:string){
 const transitions=model.transitions.filter(t=>!t.profiles||t.profiles.includes(profile));
 const states=[model.initial],seen=new Set(states);
 for(const s of states)for(const t of transitions)if(t.from===s&&!seen.has(t.to)){seen.add(t.to);states.push(t.to)}
 return {states,edges:transitions.filter(t=>seen.has(t.from))};
}
// Derive requirements from the expanded predicate, never from claimant-provided
// evidence metadata. End coordinates require both start and size.
function requiredFields(predicate:ExpandedPredicate|null,refs:readonly Reference[]):readonly (readonly Field[])[] {
 const needFields=refs.map(()=>new Set<Field>());
 if(!predicate)return refs.map(()=>axes);
 function operand(o:Operand):void {
  if(typeof o==='string'||'environment' in o)return;
  if('target' in o){
   const i=refs.findIndex(([endpoint,target])=>target===o.target&&endpoint===(o.endpoint??'before'));
   const fields=need(needFields[i],'Missing predicate target');
   if(o.field==='inlineEnd'){fields.add('inlineStart');fields.add('inlineSize')}
   else if(o.field==='blockEnd'){fields.add('blockStart');fields.add('blockSize')}
   else fields.add(o.field);
  }else if(o.op==='add')o.items.forEach(operand);else operand(o.item);
 }
 function visit(p:ExpandedPredicate):void {
  if(p.op==='compare'){operand(p.left);operand(p.right)}
  else if(p.op==='not')visit(p.item);else p.items.forEach(visit);
 }
 visit(predicate);return needFields.map(s=>[...s]);
}
const evidenceFields=(e:GeometryEvidence|undefined)=>e?.axes===undefined?axes:axes.filter(k=>e.axes?.some(a=>k.startsWith(a)));
function prepare(entry:GeometryEvidence|undefined,domain:Region,budget:WorkBudget,required:readonly Field[]=axes):Prepared[] {
  if(!entry)throw Error('missing geometry evidence');
  if(entry.reason)throw Error(entry.reason);
  if(!entry.rows?.length||entry.rows.length>128)throw Error('geometry row limit or empty geometry');
  const fields=evidenceFields(entry);
  if(required.some(k=>!fields.includes(k)))throw Error('Required geometry axis not proved');
  const rows=entry.rows.map(row=>{
    if(!list(row.constraints??[],64))throw Error('region constraint limit');
    const cs=(row.constraints??[]).map(c=>{if(typeof c.strict!=='boolean')throw Error('invalid strict constraint');return [affine(c),c.strict] as const});
    if(!row.rect||Object.keys(row.rect).length!==fields.length||fields.some(k=>!Object.hasOwn(row.rect,k)))throw Error('Geometry does not match declared axes');
    const rect:PartialRect={};
    for(const k of fields)Object.assign(rect,{[k]:affine(mutableField(row.rect,k))});
    const region=cond(domain,cs);
    return region?[{cs,rect,region}]:[];
  }).flat();
  let gaps=[domain];
  for(const row of rows){
    if((budget.left-=gaps.length*Math.max(1,row.cs.length))<0)throw Error('coverage budget exceeded');
    gaps=gaps.flatMap(g=>minusRegion(g,row.cs));if(gaps.length>256)throw Error('coverage region limit exceeded');
    for(const k of fields.filter(k=>k.endsWith('Size')))if(clip(row.region,neg(mutableField(row.rect,k)),true))throw Error('negative rectangle dimension');
    if(!gaps.length)break;
  }
  if(gaps.length)throw Error('geometry does not cover profile');
  // Even redundant rows must have valid dimensions and agree on shared domains.
  for(let i=0;i<rows.length;i++){
    const a=need(rows[i]);
    for(const k of fields.filter(k=>k.endsWith('Size')))if(clip(a.region,neg(mutableField(a.rect,k)),true))throw Error('negative rectangle dimension');
    for(const b of rows.slice(i+1)){
      if(--budget.left<0)throw Error('consistency budget exceeded');
      const both=cond(a.region,b.cs);
      if(both&&equal(a.rect,b.rect,fields).some(p=>cond(both,p)))throw Error('contradictory geometry');
    }
  }
  return rows;
}
function cross(domain:Region,groups:readonly Prepared[][],budget:WorkBudget,visit:(region:Region,rects:readonly PartialRect[])=>Point|null,index=0,rects:readonly PartialRect[]=[]):Point|null {
  if(index===groups.length)return visit(domain,rects);
  for(const row of need(groups[index])){
    if(--budget.left<0)throw Error('geometry comparison budget exceeded');
    const common=cond(domain,row.cs);if(!common)continue;
    const bad=cross(common,groups,budget,visit,index+1,[...rects,row.rect]);if(bad)return bad;
  }
  return null;
}
function failure(c:CanonicalRelation,p:EnvironmentProfile,predicate:ExpandedPredicate|null,refs:readonly Reference[],region:Region,rects:readonly PartialRect[],budget:WorkBudget):Point|null{
 if(predicate){
  const failures=predicateRegions(predicate,region,new Map(refs.map((r,i)=>[JSON.stringify(r),need(rects[i])])),p,false,budget);
  return failures.length?sample(need(failures[0])):null;
 }
 if(c.kind!=='max-occupancy')throw Error('Unsupported non-linear predicate');
 const full=(r:PartialRect):AffineRectangle=>({inlineStart:mutableField(r,'inlineStart'),blockStart:mutableField(r,'blockStart'),inlineSize:mutableField(r,'inlineSize'),blockSize:mutableField(r,'blockSize')});
 return occupancyFailure(region,full(need(rects[0])),rects.slice(1).map(full),read(c.max),budget);
}
// Browser coordinates are finite IEEE-754 numbers, not authored CSS
// decimals. Convert the sampled value exactly, without expanding the
// accepted CSS number grammar or rounding a real sampled violation away.
function sampledRational(value:number):Rational{
 if(value===0)return zero;
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,value);
 const raw=bits.getBigUint64(0),exp=Number((raw>>52n)&2047n);
 const mantissa=(raw&((1n<<52n)-1n))+(exp?1n<<52n:0n);
 const shift=(exp||1)-1023-52,n=raw>>63n?-mantissa:mantissa;
 return shift>=0?{n:n<<BigInt(shift),d:1n}:{n,d:1n<<BigInt(-shift)};
}
function observedGeometry(c:CanonicalRelation,p:EnvironmentProfile,observations:readonly Observation[],instances:readonly Transition[],predicate:ExpandedPredicate|null,refs:readonly Reference[]):Observed[] {
 if(c.kind==='action')return [];
 const out:Observed[]=[];
 const required=requiredFields(predicate,refs);
 const rect=(o:Observation|null|undefined,target:string,fields:readonly Field[]):PartialRect|null=>{
   if(!o?.rects||!Object.hasOwn(o.rects,target))return null;
   const r=need(o.rects[target]);
   const coordinate={inlineStart:r.x,blockStart:r.y,inlineSize:r.width,blockSize:r.height};
   const result:PartialRect={};for(const k of fields)Object.assign(result,{[k]:scalar(sampledRational(coordinate[k]))});
   return result;
 };
 const candidates=observations.filter(o=>o.profile===p.id&&o.rects);
 for(const t of instances)for(const o of candidates.filter(o=>o.state===t.from)){
   try{
     // A single point observation cannot establish both endpoints of a self transition.
     const afters=candidates.filter(n=>n!==o&&n.state===t.to&&n.width===o.width&&n.height===o.height);
     const rectangles=refs.map(([endpoint,target],i)=>rect(endpoint==='after'?(afters.length===1?afters[0]:null):o,target,need(required[i])));
     if(!rectangles.every((v):v is PartialRect=>v!==null)){out.push({status:'unknown',sample:o,reason:'missing sampled target or unambiguous matching endpoint'});continue}
     if(t.to===t.from&&refs.some(r=>r[0]==='after')){out.push({status:'unknown',sample:o,reason:'self-transition needs paired observations'});continue}
     const x=sampledRational(o.width),y=sampledRational(o.height),reg=rectangle({min:x,max:x},{min:y,max:y});
     const failed=failure(c,p,predicate,refs,reg,rectangles,{left:30000});
     out.push({status:failed?'failed':'passed',sample:o,...(refs.some(r=>r[0]==='after')?{after:need(afters[0])}:{})});
   }catch(e){out.push({status:'unknown',sample:o,reason:errorMessage(e)})}
 }
 return out;
}
// Strip only identity labels; their mapping is checked separately. Everything
// affecting the actual rectangle or its provenance remains in the cache key.
function evidenceValue(e:GeometryEvidence|undefined){
 if(!e)return null;
 const {state,profile,target,...rest}=e;
 return rest;
}
function mapOperands(value:ExpandedPredicate,transform:(o:Operand)=>Operand):ExpandedPredicate {
 const operand=(o:Operand):Operand=>{
  if(typeof o==='string'||'target' in o||'environment' in o)return transform(o);
  return o.op==='add'?{...o,items:o.items.map(operand)}:{...o,item:operand(o.item)};
 };
 if(value.op==='compare')return {...value,left:operand(value.left),right:operand(value.right)};
 if(value.op==='not')return {...value,item:mapOperands(value.item,transform)};
 return {...value,items:value.items.map(v=>mapOperands(v,transform))};
}
function mapPredicate(value:ExpandedPredicate,bind:(target:string,endpoint:Endpoint)=>string):ExpandedPredicate {
 return mapOperands(value,o=>typeof o!=='string'&&'target' in o?{...o,target:bind(o.target,o.endpoint??'before')}:o);
}
// An affine change of input dimensions and translation of the coordinate
// origin. The map is checked against the current evidence, never trusted as
// an assertion of layout equivalence.
function readTransfer(input:AllocationTransfer):AllocationTransfer{
 ensure(own(input,['profile','state','width','height','inlineStart','blockStart'])&&id(input.profile)&&id(input.state),'Invalid allocation transfer');
 for(const k of ['width','height','inlineStart','blockStart'] as const){
  ensure(own(input[k],['coefficient','heightCoefficient','constant']),'Invalid affine allocation');
  affine(input[k]);
 }
 return immutable(input);
}
function transferGeometry(transfer:AllocationTransfer,child:EnvironmentProfile,parent:EnvironmentProfile):TransferMapping|null{
 const {id:ci,viewport:cv,...ce}=child,{id:pi,viewport:pv,...pe}=parent;
 if(JSON.stringify(ce)!==JSON.stringify(pe))return null;
 const w=affine(transfer.width),h=affine(transfer.height),x=affine(transfer.inlineStart),y=affine(transfer.blockStart),domain=domainOf(parent);
 for(const [a,r] of [[w,cv],[h,cv.height]] as const)
  if(clip(domain,diff(scalar(r.min),a),true)||clip(domain,diff(a,scalar(r.max)),true))return null;
 const substitute=(a:Affine2)=>sum(scalar(a.b),sum(times(w,a.x),times(h,a.y)));
 const mappedEvidence=(e:GeometryEvidence):GeometryEvidence=>({...e,...(e.rows?{rows:e.rows.map(r=>({
  rect:Object.fromEntries(axes.map(k=>[k,serializeAffine(sum(substitute(affine(mutableField(r.rect,k))),k==='inlineStart'?x:k==='blockStart'?y:scalar(0)))])),
  constraints:(r.constraints??[]).map(c=>({...serializeAffine(substitute(affine(c))),strict:c.strict}))
 }))}: {})});
 const operand=(a:Affine2):Operand=>({op:'add',items:[exact(a.b),{op:'scale',factor:exact(a.x),item:{environment:'width'}},{op:'scale',factor:exact(a.y),item:{environment:'height'}}]});
 const safe=child.safeArea??{};
 const env={width:w,height:h,safeLeft:scalar(safe.left??0),safeTop:scalar(safe.top??0),safeRight:diff(w,scalar(safe.right??0)),safeBottom:diff(h,scalar(safe.bottom??0))};
 function rewrite(v:ExpandedPredicate,bind:Readonly<Record<string,string>>):ExpandedPredicate {
  return mapOperands(v,o=>{
   if(typeof o==='string')return o;
   if('environment' in o)return operand(env[o.environment]);
   if('target' in o){
    const ref:Operand={...o,target:need(bind[o.target],'Missing transfer binding')};
    const origin=['inlineStart','inlineEnd'].includes(o.field)?x:['blockStart','blockEnd'].includes(o.field)?y:null;
    return origin?{op:'add',items:[ref,operand(neg(origin))]}:ref;
   }
   return o;
  });
 }
 return {mappedEvidence,rewrite,domain};
}
function sameTransferredGeometry(mapping:TransferMapping,source:GeometryEvidence|undefined,destination:GeometryEvidence|undefined,budget:WorkBudget){
 if(!source||!destination)return false;
 try{
  const a=prepare(mapping.mappedEvidence(source),mapping.domain,budget),b=prepare(destination,mapping.domain,budget);
  for(const r of a)for(const t of b){
   if(--budget.left<0)throw Error('transfer budget exceeded');
   const common=cond(r.region,t.cs);
   if(common&&equal(r.rect,t.rect).some(p=>cond(common,p)))return false;
  }
  return true;
 }catch{return false}
}
const caseKey=(contract:string,profile:string,transition:Transition)=>JSON.stringify([contract,profile,transition]);
function arithmeticKey(c:CanonicalRelation,p:EnvironmentProfile,predicate:ExpandedPredicate|null,refs:readonly Reference[],used:readonly (GeometryEvidence|undefined)[]){
 const names=new Map(refs.map(([endpoint,target],i)=>[JSON.stringify([endpoint,target]),String(i)]));
 const expr=predicate?mapPredicate(predicate,(target,endpoint)=>need(names.get(JSON.stringify([endpoint,target])))):{kind:c.kind,...(c.kind==='max-occupancy'?{max:c.max}:{})};
 return JSON.stringify([p,expr,used.map(evidenceValue)]);
}
function evaluateRelational({model,evidence=[],observations=[],compiledCases,cache,derived}:{model:CanonicalModel;evidence?:readonly GeometryEvidence[];observations?:readonly Observation[];compiledCases:readonly CompiledCase[];cache?:Cache|undefined;derived?:ReadonlyMap<string,Derivation>|undefined}):Omit<RelationalProof,'operation'|'contract'|'state'|'environment'> {
  ensure(list(evidence,4096)&&list(observations,4096),'Evidence limit exceeded');
  const key=(s:string,p:string,t:string)=>JSON.stringify([s,p,t]);
  const entries=new Map<string,GeometryEvidence>(), assumptions=new Set(['Declared state graph and supplied geometry are trusted abstractions of implementation; profiles describe unscrolled CSS pixels, not paint or hit testing. DOM evidence uses a closed author cascade and the declared scrollbar profile (overlay by default).']);
  for(const e of evidence) {
    ensure(e&&model.states.includes(e.state)&&model.profiles.some(p=>p.id===e.profile)&&id(e.target)&&['dom','local-dom','scene','external'].includes(e.source)&&Array.isArray(e.assumptions)&&e.assumptions.every(a=>typeof a==='string'&&a.trim())&&(e.source==='dom'||e.assumptions.length),'Invalid geometry evidence');
    const p=need(model.profiles.find(p=>p.id===e.profile));
    ensure((e.profileKey===undefined?!(mediaFeatureEntries(p.mediaFeatures).length&&['dom','local-dom'].includes(e.source)):e.profileKey===profileKey(p)),'Geometry evidence profile mismatch');
    const k=key(e.state,e.profile,e.target);
    ensure(!entries.has(k),'Duplicate geometry evidence');entries.set(k,e);
  }
  const byProfile=new Map(model.profiles.map(p=>[p.id,reachableIn(model,p.id)]));
  const reachable=[...new Set([...byProfile.values()].flatMap(v=>v.states))],seen=new Set(reachable);
  for(const o of observations){
    ensure(o&&model.states.includes(o.state)&&model.profiles.some(p=>p.id===o.profile&&finite(o.width)&&finite(o.height)&&o.width>=p.viewport.min&&o.width<=p.viewport.max&&o.height>=p.viewport.height.min&&o.height<=p.viewport.height.max),'Invalid observation position');
    ensure((o.event!==undefined||o.rects!==undefined)&&(o.event===undefined||id(o.event)&&typeof o.passed==='boolean'&&(o.to===undefined||model.states.includes(o.to))),'Invalid observation action');
    if(o.rects!==undefined)ensure(o.rects&&Object.getPrototypeOf(o.rects)===Object.prototype&&Object.entries(o.rects).every(([k,r])=>id(k)&&r&&(['x','y','width','height'] as const).every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&Math.abs(r[k])<=1e6&&(k==='x'||k==='y'||r[k]>=0))),'Invalid observed rectangles');
  }
  const observationDiagnostics:RelationalProof['observationDiagnostics']=[];
  for(const o of observations){
    const permitted=need(byProfile.get(o.profile));
    if(!permitted.states.includes(o.state)||o.event&&o.passed&&!permitted.edges.some(t=>t.from===o.state&&t.event===o.event&&t.to===o.to))
      observationDiagnostics.push({code:'E_UI_OBSERVED_STATE',message:'observed state or successful transition is outside the declared graph',sample:o});
  }
  const reports=model.contracts.map((c):RelationResult=>{
    const cases:RelationCase[]=[],observed:Observed[]=[],predicate=rulePredicate(c),refs=ruleRefs(c,predicate);
    for(const p of model.profiles) {
      if(c.profiles&&!c.profiles.includes(p.id))continue;
      const domain=domainOf(p),budget={left:30000},edges=need(byProfile.get(p.id)).edges;
      const obligations=compiledCases.filter(v=>v.contract===c.id&&v.profile===p.id);
      const instances=obligations.map(v=>v.transition);
      observed.push(...observedGeometry(c,p,observations,instances,predicate,refs));
      if(!instances.length){cases.push({profile:p.id,status:'unknown',coverage:{status:'unknown'},reason:'no reachable applicable state or transition'});continue}
      for(const obligation of obligations){
        const t=obligation.transition;
        const base={state:t.from,profile:p.id,...(t.to?{to:t.to,...(t.event!==undefined?{event:t.event}:{})}:{})};
        if(c.kind==='action'){
          const samples=observations.filter(o=>o.state===t.from&&o.profile===p.id&&o.event===t.event);
          // A nondeterministic event may reach any declared successor.
          for(const o of samples)if(!observed.some(x=>x.sample===o)){
            const allowed=edges.some(e=>e.from===o.state&&e.event===o.event&&e.to===o.to);
            observed.push({status:o.passed&&allowed?'passed':'failed',sample:o});
          }
          cases.push({...base,status:'unknown',coverage:{status:'unknown'},reason:'action reachability requires runtime evidence; sampling cannot prove all inputs'});continue;
        }
        const used=obligation.targets.map(({state,target})=>entries.get(key(state,p.id,target)));
        const localAssumptions=[...new Set([...(p.assumptions??[]),...(p.input?['Input profile '+p.input+' is caller-supplied, not an inferred CSS media environment.']:[]),...(p.fontProfile?['Font profile '+p.fontProfile+' is caller-supplied.']:[]),...used.flatMap(e=>e?.assumptions??[])])];localAssumptions.forEach(a=>assumptions.add(a));
        const meta={...base,sources:used.map(e=>e?.source??'missing'),assumptions:localAssumptions};
        const derivation=derived?.get(caseKey(c.id,p.id,t));
        if(derivation){
          derivation.assumptions.forEach(a=>assumptions.add(a));
          cases.push({...meta,assumptions:[...new Set([...meta.assumptions,...derivation.assumptions])],sources:[...meta.sources,...derivation.sources],
            status:'verified',coverage:{status:'verified'},method:'composition',dependencies:derivation.dependencies});
          continue;
        }
        const cacheKey=cache?arithmeticKey(c,p,predicate,refs,used):null;
        const hit=cacheKey===null?undefined:cache?.get(cacheKey,budget.left);
        if(hit!==undefined){
          budget.left-=hit;
          cases.push({...meta,coverage:{status:'verified'},status:'verified'});
          continue;
        }
        const remaining=budget.left;
        let covered=false;
        try{
          const fields=requiredFields(predicate,refs);
          const groups=used.map((e,i)=>prepare(e,domain,budget,need(fields[i])));covered=true;
          const bad=cross(domain,groups,budget,(reg,rects)=>failure(c,p,predicate,refs,reg,rects,budget));
          if(!bad&&cacheKey!==null)cache?.set(cacheKey,remaining-budget.left);
          cases.push({...meta,coverage:{status:'verified'},status:bad?'violated':'verified',...(bad?{witness:{width:exact(bad.x),height:exact(bad.y)}}:{})});
        }catch(e){cases.push({...meta,coverage:{status:covered?'verified':'unknown'},status:'unknown',reason:errorMessage(e)})}
      }
    }
    const status=cases.some(c=>c.status==='violated')?'violated':!cases.length||cases.some(c=>c.status==='unknown')?'unknown':'verified';
    return {id:c.id,kind:c.kind,status,cases,observations:observed,...(!cases.length?{reason:'no reachable applicable state or transition'}:{})};
  });
  const status=reports.some(r=>r.status==='violated')?'violated':reports.some(r=>r.status==='unknown')?'unknown':'verified';
  const observationStatus=observationDiagnostics.length||reports.some(r=>r.observations.some(o=>o.status==='failed'))?'failed':reports.some(r=>r.observations.some(o=>o.status==='unknown'))?'incomplete':reports.some(r=>r.observations.length)?'sampled':'not-run';
  const observationCoverage=model.profiles.flatMap(p=>need(byProfile.get(p.id)).states.map(state=>({state,profile:p.id,samples:observations.filter(o=>o.state===state&&o.profile===p.id).length})));
  return {version:1,status,observationDiagnostics,observationCoverage,reachability:model.profiles.map(p=>({profile:p.id,states:need(byProfile.get(p.id)).states})),outcome:status==='violated'||observationStatus==='failed'?'failed':status==='unknown'||observationStatus==='incomplete'?'unknown':'verified',reachable,unreachable:model.states.filter(s=>!seen.has(s)),assumptions:[...assumptions],contracts:reports,observationStatus};
}


function immutable<T>(value:T):T {
 const seen=new Set<object>();
 const validate=(o:unknown):void=>{
  if(o===null||typeof o==='string'||typeof o==='boolean'||typeof o==='number'&&Number.isFinite(o))return;
  ensure(o!==null&&typeof o==='object'&&(Array.isArray(o)||[Object.prototype,null].includes(Object.getPrototypeOf(o)))&&!seen.has(o),'IR requires finite acyclic JSON data');
  seen.add(o);
  if(Array.isArray(o))o.forEach((v:unknown)=>validate(v));else Object.values(o).filter(v=>v!==undefined).forEach(validate);
  seen.delete(o);
 };
 validate(value);
 const result=structuredClone(value);
 const freeze=(o:unknown):void=>{
  if(o===null||typeof o!=='object')return;
  if(!Array.isArray(o))for(const [key,v] of Object.entries(o))if(v===undefined)Reflect.deleteProperty(o,key);
  Object.values(o).forEach(freeze);Object.freeze(o);
 };
 freeze(result);return result;
}
export function createStateIR({initial,states,transitions}:StateInput):StateIR {
 validateState({initial,states,transitions});
 return immutable({version:1,kind:'state',initial,states,transitions});
}
export function createEnvironmentIR(profiles:readonly EnvironmentProfile[]):EnvironmentIR {
 validateProfiles(profiles);
 for(const p of profiles){
  ensure(own(p,['id','viewport','safeArea','ua','dpr','scrollbar','assumptions','input','fontProfile','mediaFeatures']),'Unknown environment field');
  ensure(own(p.viewport,['min','max','height'])&&own(p.viewport.height,['min','max']),'Invalid viewport shape');
  ensure(validMediaFeatures(p.mediaFeatures),'Invalid profile mediaFeatures');
  ensure(p.input===undefined||['touch','mouse','keyboard','mixed'].includes(p.input),'Invalid input profile');
  ensure(p.fontProfile===undefined||id(p.fontProfile),'Invalid font profile');
  ensure(p.assumptions===undefined||Array.isArray(p.assumptions)&&p.assumptions.every(a=>typeof a==='string'&&a.trim()),'Invalid environment assumptions');
  for(const v of [p.viewport.min,p.viewport.max,p.viewport.height.min,p.viewport.height.max])q(v);
  if(p.scrollbar)ensure(own(p.scrollbar,['name','inlineSize','blockSize','thinInlineSize','thinBlockSize'])&&(['thinInlineSize','thinBlockSize'] as const).every(k=>p.scrollbar?.[k]===undefined||finite(p.scrollbar[k])),'Invalid scrollbar profile');
 }
 return immutable({version:1,kind:'environment',profiles});
}
export function createEvidenceIR(entries:readonly GeometryEvidence[]):EvidenceIR {
 ensure(list(entries,4096),'Evidence limit exceeded');
 ensure(entries.every(e=>own(e,['state','profile','profileKey','target','source','assumptions','rows','reason','axes'])&&(e.axes===undefined||Array.isArray(e.axes)&&e.axes.length===1&&['inline','block'].includes(e.axes[0]))&&id(e.state)&&id(e.profile)&&id(e.target)&&['dom','local-dom','scene','external'].includes(e.source)&&Array.isArray(e.assumptions)&&e.assumptions.every(a=>typeof a==='string'&&a.trim())&&(e.source==='dom'||e.assumptions.length)),'Invalid geometry evidence');
 return immutable({version:1,kind:'evidence',entries});
}
export function createRelationalContractIR(input:RelationalContractInput):RelationalContractIR {
 ensure(own(input,['component','profile','contracts','definitions'])&&input.profile==='relational/1'&&id(input.component)&&list(input.contracts,128)&&input.contracts.length,'Invalid relational contract');
 const defs=input.definitions??{};
 ensure(defs&&typeof defs==='object'&&!Array.isArray(defs)&&Object.keys(defs).length<=128,'Invalid predicate definitions');
 const contracts=input.contracts.map(c=>c?.kind==='predicate'?{...c,predicate:expandPredicate(c.predicate,defs,c.event)}:c);
 validateContracts(contracts);
 return immutable({version:1,kind:'contract',component:input.component,profile:{id:'relational/1'},contracts});
}
export function createRelationalObligationIR(contract:RelationalContractIR,implementation:RelationalImplementation):RelationalObligationIR {
 ensure(contract?.kind==='contract'&&contract.version===1&&contract.profile?.id==='relational/1','Invalid relational ContractIR');
 contract=createRelationalContractIR({component:contract.component,profile:'relational/1',contracts:contract.contracts});
 ensure(implementation?.state?.kind==='state'&&implementation.environment?.kind==='environment'&&implementation.evidence?.kind==='evidence'&&[implementation.state,implementation.environment,implementation.evidence].every(v=>v.version===1),'Expected StateIR, EnvironmentIR and EvidenceIR');
 const state=createStateIR(implementation.state),environment=createEnvironmentIR(implementation.environment.profiles),evidence=createEvidenceIR(implementation.evidence.entries);
 const model:CanonicalModel={version:1,initial:state.initial,states:state.states,transitions:state.transitions,profiles:environment.profiles,contracts:contract.contracts};
 validateBindings(model);
 const cases:CompiledCase[]=[];
 for(const p of environment.profiles){
  const reachable=reachableIn(model,p.id);
  for(const c of contract.contracts){
   if(c.profiles&&!c.profiles.includes(p.id))continue;
   const refs=ruleRefs(c,rulePredicate(c));
   const instances:Transition[]='event' in c&&c.event?reachable.edges.filter(t=>t.event===c.event):reachable.states.map(from=>({from}));
   for(const transition of instances)if(!c.states||c.states.includes(transition.from))cases.push({contract:c.id,profile:p.id,transition,targets:refs.map(([endpoint,target])=>({state:endpoint==='after'?need(transition.to,'Missing transition endpoint'):transition.from,target,endpoint}))});
  }
 }
 ensure(cases.length<=32768,'Relational obligation case limit exceeded');
 return immutable({version:1,kind:'obligation',operation:'relational',contract,implementation:{state,environment,evidence},cases});
}
function canonicalObligation(obligation:RelationalObligationIR):RelationalObligationIR{
 ensure(obligation?.operation==='relational'&&obligation.kind==='obligation'&&obligation.version===1,'Invalid relational ObligationIR');
 // Reconstruct at the serialized IR boundary: never trust edited obligation cases.
 return createRelationalObligationIR(obligation.contract,obligation.implementation);
}
function verifyCanonical(canonical:RelationalObligationIR,{observations=[]}:VerificationOptions={},cache?:Cache,derived?:ReadonlyMap<string,Derivation>):RelationalProof{
 const {state,environment,evidence}=canonical.implementation;
 const model:CanonicalModel={version:1,initial:state.initial,states:state.states,transitions:state.transitions,profiles:environment.profiles,contracts:canonical.contract.contracts};
 return {...evaluateRelational({model,evidence:evidence.entries,observations,compiledCases:canonical.cases,cache,derived}),operation:'relational',contract:canonical.contract,state,environment};
}
export function verifyRelationalObligation(obligation:RelationalObligationIR,options?:VerificationOptions):RelationalProof{
 return verifyCanonical(canonicalObligation(obligation),options);
}

/** A process-local proof session. External proof reports are never accepted.
 * Exact case dependencies permit reuse even when a different target ID is
 * bound to identical geometry. The original proof work charge is retained.
 */
export function createRelationalProofSession({maxEntries=1024,maxKeyBytes=4_000_000,trustedStorage}:{maxEntries?:number;maxKeyBytes?:number;trustedStorage?:{get(key:string):number|undefined;set(key:string,cost:number):void}}={}):RelationalProofSession{
 ensure(Number.isSafeInteger(maxEntries)&&maxEntries>0&&maxEntries<=16384&&Number.isSafeInteger(maxKeyBytes)&&maxKeyBytes>0&&maxKeyBytes<=64_000_000,'Invalid proof cache limits');
 const entries=new Map<string,number>(),solverIds=new WeakMap<LayoutSolverAPI['Context'],number>();let size=0,hits=0,misses=0,evictions=0,nextSolver=0;
 const remove=(k:string)=>{size-=k.length*2;entries.delete(k)};
 const cache:Cache={
  get(k,remaining){
   if(!entries.has(k)&&k.startsWith('[')&&k.length*2<=maxKeyBytes&&trustedStorage){
    try{
     const cost=trustedStorage.get(k);
     if(cost!==undefined&&Number.isSafeInteger(cost)&&cost>=0&&cost<=30000)remember(k,cost);
    }catch{/* no persistent reuse */}
   }
   const cost=entries.get(k);
   if(cost===undefined||cost>remaining){misses++;return undefined}entries.delete(k);entries.set(k,cost);hits++;return cost;
  },
  set(k,cost){
   remember(k,cost);
   if(k.startsWith('[')&&k.length*2<=maxKeyBytes)try{trustedStorage?.set(k,cost)}catch{/* no persistent reuse */}
  }
 };
 function remember(k:string,cost:number){
   const bytes=k.length*2;if(bytes>maxKeyBytes)return;
   if(entries.has(k))remove(k);
   while(entries.size>=maxEntries||size+bytes>maxKeyBytes){remove(need(entries.keys().next().value));evictions++}
   entries.set(k,cost);size+=bytes;
 }
 // Premises and goals are recompiled at their public IR boundaries. No
 // externally submitted proof, cache key or implication result is trusted.
 const verify=(obligation:RelationalObligationIR,options?:VerificationOptions)=>verifyCanonical(canonicalObligation(obligation),options,cache);
 const compose:RelationalProofSession['compose']=async(obligation,imports,api,options={})=>{
  const canonical=canonicalObligation(obligation);
  ensure(list(imports,32),'Composition import limit');
  const {environment,evidence}=canonical.implementation;
  const factKey=(s:string,p:string,t:string)=>JSON.stringify([s,p,t]);
  const index=(facts:EvidenceIR)=>new Map(facts.entries.map(e=>[factKey(e.state,e.profile,e.target),e]));
  const parentFacts=index(evidence),seenSources=new Map<RelationalObligationIR,{source:RelationalObligationIR;report:RelationalProof;facts:ReturnType<typeof index>}>();
  const children=imports.map(item=>{
   ensure(own(item,['obligation','contract','bind','transfer'])&&id(item.contract)&&item.bind&&typeof item.bind==='object'&&!Array.isArray(item.bind)&&Object.entries(item.bind).every(([a,b])=>id(a)&&id(b)),'Invalid composition import');
   if(!seenSources.has(item.obligation)){
    const source=canonicalObligation(item.obligation);
    seenSources.set(item.obligation,{source,report:verifyCanonical(source,{},cache),facts:index(source.implementation.evidence)});
   }
   const {source,report,facts}=need(seenSources.get(item.obligation));
   const claim=source.contract.contracts.find(c=>c.id===item.contract);
   ensure(claim,'Unknown imported contract');
   const predicate=rulePredicate(claim);
   ensure(predicate&&!('event' in claim&&claim.event),'Only state-invariant linear predicates may be imported');
   const refs=ruleRefs(claim,predicate);
   ensure(refs.every(([endpoint,t])=>endpoint==='before'&&Object.hasOwn(item.bind,t))&&Object.keys(item.bind).length===new Set(refs.map(r=>r[1])).size,'Incomplete or extraneous target binding');
   const proof=need(report.contracts.find(c=>c.id===claim.id));
   return {source,claim,predicate,refs,proof,facts,bind:Object.fromEntries(Object.entries(item.bind)),transfer:item.transfer===undefined?undefined:readTransfer(item.transfer)};
  });
  const derived=new Map<string,Derivation>(),implications=new Map<string,boolean>(),transferBudget={left:100000};let solverCalls=0;
  const solver=api?.Context;
  if(typeof solver==='function'&&!solverIds.has(solver))solverIds.set(solver,++nextSolver);
  // Composition is an optimization: a failed implication never constitutes
  // an implementation counterexample. Check the original geometry instead.
  for(const goal of canonical.contract.contracts){
   const predicate=rulePredicate(goal);
   if(!predicate||('event' in goal&&goal.event))continue;
   const refs=ruleRefs(goal,predicate);
   for(const inst of canonical.cases.filter(c=>c.contract===goal.id)){
    const p=need(environment.profiles.find(p=>p.id===inst.profile)),s=inst.transition.from;
    const premises:ExpandedPredicate[]=[],dependencies:CompositionDependency[]=[],assumptions:string[]=[],sources:string[]=[],covered=new Set<string>();
    for(const child of children){
     const childState=child.transfer?.state??s,childProfile=child.transfer?.profile??p.id;
     const cp=child.source.implementation.environment.profiles.find(v=>v.id===childProfile);
     if(!cp||!child.transfer&&JSON.stringify(cp)!==JSON.stringify(p))continue;
     const mapping=child.transfer?transferGeometry(child.transfer,cp,p):null;
     if(child.transfer&&!mapping)continue;
     const result=child.proof.cases.find(v=>v.state===childState&&v.profile===childProfile&&!v.event&&v.status==='verified'&&v.coverage?.status==='verified');
     if(!result)continue;
     const mapped=child.refs.map(([,t])=>[t,need(child.bind[t])] as const);
     if(!mapped.every(([from,to])=>{
      const a=child.facts.get(factKey(childState,childProfile,from)),b=parentFacts.get(factKey(s,p.id,to));
      return mapping?sameTransferredGeometry(mapping,a,b,transferBudget):a&&b&&JSON.stringify(evidenceValue(a))===JSON.stringify(evidenceValue(b));
     }))continue;
     mapped.forEach(([,to])=>covered.add(to));
     premises.push(mapping?mapping.rewrite(child.predicate,child.bind):mapPredicate(child.predicate,t=>need(child.bind[t])));
     assumptions.push(...(result.assumptions??[]));sources.push(...(result.sources??[]));
     dependencies.push({component:child.source.contract.component,contract:child.claim.id,bind:child.bind,...(child.transfer?{transfer:child.transfer}:{})});
    }
    if(!premises.length||!refs.every(([,t])=>covered.has(t)))continue;
    if(refs.some(([,t])=>parentFacts.get(factKey(s,p.id,t))?.axes!==undefined))continue;
    // Bound extra solver work for a single call and reuse an identical
    // symbolic implication across state cases.
    const key=JSON.stringify([p,premises,predicate]);
    if(!implications.has(key)){
     if(implications.size>=128)continue;
     const memoKey='implication:'+solverIds.get(solver)+':'+key;
     const reusable=typeof solver==='function';
     if(reusable&&cache.get(memoKey,0)!==undefined)implications.set(key,true);
     else if(solverCalls>=16)implications.set(key,false);
     else try{
      solverCalls++;
      const result=(await verifyPredicateImplication(p,premises,predicate,api,{timeoutMs:options.timeoutMs??5000})).status==='verified';
      implications.set(key,result);
      if(result&&reusable)cache.set(memoKey,0);
     }catch{implications.set(key,false)}
    }
    if(implications.get(key))derived.set(caseKey(goal.id,p.id,inst.transition),{dependencies,assumptions,sources});
   }
  }
  return verifyCanonical(canonical,options,cache,derived);
 };
 return Object.freeze({verify,compose,verifyUI:({observations=[],...input}:UIInput)=>verifyCanonical(uiObligation(input),{observations},cache),stats:()=>({entries:entries.size,keyBytes:size,hits,misses,evictions}),clear:()=>{entries.clear();size=0;hits=misses=evictions=0}});
}
function uiObligation({model,evidence=[]}:UIInput):RelationalObligationIR {
 ensure(own(model,['version','component','initial','states','transitions','profiles','contracts','definitions'])&&model.version===1,'Invalid UI model version/fields');
 const {initial,states,transitions,profiles,contracts,definitions}=model;
 const contract=createRelationalContractIR({component:model.component??'Document',profile:'relational/1',contracts,...(definitions!==undefined?{definitions}:{})});
 return createRelationalObligationIR(contract,{state:createStateIR({initial,states,transitions}),environment:createEnvironmentIR(profiles),evidence:createEvidenceIR(evidence)});
}
export function verifyUI({observations=[],...input}:UIInput):RelationalProof{
 return verifyCanonical(uiObligation(input),{observations});
}
/** Existing LayoutIR -> evidence, independent of the authored contract.
 * Environment binding is trusted: the report does not contain every UA/font
 * setting. The adapter that ran the analysis supplies the actual profile.
 */
export function layoutGeometry({state,profile,layout,targets,local,paths={}}:{state:string;profile:EnvironmentProfile;layout:LayoutIR;targets:readonly string[];paths?:Readonly<Record<string,string>>;local?:{assumptions:readonly string[];origin?:Pick<LayoutRectangle,'inlineStart'|'blockStart'>}}):GeometryEvidence[] {
 ensure(list(targets,128)&&targets.every(id)&&unique(targets),'Invalid DOM targets');
 if(local)ensure(Array.isArray(local.assumptions)&&local.assumptions.length&&local.assumptions.every(a=>typeof a==='string'&&a.trim()),'Local geometry needs boundary assumptions');
 return targets.map((target):GeometryEvidence=>{
  const base:GeometryEvidence={state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:[...(layout.assumptions??[]),'LayoutIR is bound by the producer to the declared UA, fonts, viewport, safe insets and platform profile.',...(local?.assumptions??[])]};
  if(layout.kind!=='layout'||layout.version!==1||!layout.geometryComplete||layout.cases.length!==1||layout.scope.hostInset||layout.scope.hostBlockInset)return {...base,reason:'CSS geometry incomplete or not a single closed layout case: '+(layout.diagnostics?.[0]?.message??'model incomplete')};
  if(JSON.stringify(mediaFeatureEntries(layout.scope.mediaFeatures))!==JSON.stringify(mediaFeatureEntries(profile.mediaFeatures)))return {...base,reason:'layout mediaFeatures differ from environment'};
  const actual=layout.scope.scrollbarProfiles;
  const expected=profile.scrollbar??{name:'overlay',inlineSize:0,blockSize:0};
  if(actual?.length&&(actual.length!==1||(['name','inlineSize','blockSize','thinInlineSize','thinBlockSize'] as const).some(k=>actual[0]?.[k]!==expected[k])))return {...base,reason:'layout scrollbar profile differs from environment'};
  const candidates=[...new Set(layout.elements.filter(e=>Object.hasOwn(paths,target)?e.path===paths[target]:e.id===target||e.targets?.includes(target)&&e.targetIdentity!=='unknown').map(e=>e.path))];
  if(candidates.length!==1)return {...base,reason:'DOM target not unique'};
  try{
   const rows=layout.boxes.filter(r=>r.path===candidates[0]&&r.rect).map(r=>{
    const constraints=[...(r.region?.constraints??[])];
    for(const [axis,range] of [['coefficient',r.range],['heightCoefficient',r.heightRange]] as const){
     if(!range)throw Error('Missing range');
     constraints.push({coefficient:'0',heightCoefficient:'0',[axis]:'1',constant:exact(sub(zero,read(range.minExact))),strict:!range.minInclusive},{coefficient:'0',heightCoefficient:'0',[axis]:'-1',constant:range.maxExact,strict:!range.maxInclusive});
    }
    const rect={...need(r.rect)};
    if(local?.origin)for(const k of ['inlineStart','blockStart'] as const)rect[k]=serializeAffine(sum(affine(rect[k]),affine(local.origin[k])));
    return {rect,constraints};
   });
   return {...base,rows};
  }catch(e){return {...base,reason:'CSS rectangle extraction: '+errorMessage(e)}}
 });
}
