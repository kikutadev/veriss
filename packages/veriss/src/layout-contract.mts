import type {LayoutAffine,LayoutRange,LayoutSummary,LayoutScenarioIdentity,LayoutPosition,LayoutElement,LayoutRectangle,LayoutDiagnostic,LayoutCSSOrigin,LayoutRegion} from './layout-contracts.d.ts';
import type {LayoutModel,LayoutProof,LayoutSolverAPI,LayoutObligation} from './layout-z3.mjs';
import type {RelationalContractInput,RelationalContractIR,RelationalImplementation,RelationalObligationIR,RelationalProof,Observation} from './relational-contract.mjs';
export type {StateIR,StateInput,EnvironmentIR,EnvironmentProfile,EvidenceIR,GeometryEvidence,Operand,Predicate,Relation,RelationalContractIR,RelationalContractInput,RelationalImplementation,RelationalObligationIR,RelationalProof,Observation,UIModel,RelationalProofSession,RelationalCompositionImport,CompositionDependency,AllocationTransfer} from './relational-contract.mjs';
type Frozen<T> = T extends object ? {readonly [K in keyof T]:Frozen<T[K]>} : T;
export interface LayoutSpaceBinding {readonly name:string;readonly selector:string}
export interface LayoutOverlayBinding {readonly selector:string;readonly within:string}
interface ContractBase {
  component:string;
  /** Closed ranges for parent-allocated CSS px, not CSS declarations or viewport ranges. */
  requires:{inlineSize:{min:number;max:number};blockSize:{min:number;max:number}};
  ensures?:{inline:'fit';block:'fit'};
}
export type ContractInput=ContractBase & (
  {profile?:typeof SafeGrid.id;spaces?:never;overlays?:never} |
  {profile:typeof PositionedGrid.id;spaces:readonly LayoutSpaceBinding[];overlays:readonly LayoutOverlayBinding[]}
);
export type ContractIR=Frozen<{
  version:1;kind:'contract';component:string;
  requires:{inlineSize:LayoutRange;blockSize:LayoutRange};ensures:{inline:'fit';block:'fit'};
} & (
  {profile:typeof SafeGrid;spaces?:never;overlays?:never} |
  {profile:typeof PositionedGrid;spaces:LayoutSpaceBinding[];overlays:LayoutOverlayBinding[]}
)>;
export type LayoutIRBox=Frozen<LayoutScenarioIdentity & LayoutPosition & {
  box:string;path:string;range:LayoutRange;heightRange?:LayoutRange|undefined;layoutRect?:LayoutRectangle|null;region?:LayoutSummary['sizes'][number]['region'];
  boxSizing:'border-box'|'content-box';
  /** In-flow: Grid area. Explicit absolute: CSS-resolved used border rectangle. */
  allocated:{inline:LayoutAffine;block?:LayoutAffine};
  border:{inline:LayoutAffine;block?:LayoutAffine};
  content:{inline:LayoutAffine;block?:LayoutAffine};
  padding?:{inline:LayoutAffine;block?:LayoutAffine};
}>;
/** Trusted CSS extraction, constructed without a ContractIR; not a browser semantics proof. */
export type LayoutIR=Frozen<{
  version:1;kind:'layout';component:string;scope:LayoutSummary['scope'];cases:LayoutScenarioIdentity[];
  boxes:LayoutIRBox[];presence:LayoutSummary['policies'];checks:LayoutSummary['checks'];
  elements:LayoutElement[];
  errors:LayoutSummary['diagnostics'];diagnostics:LayoutSummary['diagnostics'];complete:boolean;geometryComplete:boolean;assumptions:string[];
  bindings:NonNullable<LayoutSummary['layoutBindings']>;
}>;
/** Explicit native box path binding; v1 does not replace child bodies with summaries. */
export interface ChildLayoutBinding {readonly path:string;readonly contract:ContractIR}
export interface LayoutDependency {readonly component:string;readonly path:string}
export interface LayoutPlacementTransfer {
  readonly caller:string;readonly path:string;readonly cases:readonly LayoutScenarioIdentity[];readonly allocation:'used-border-box';
}
export type ObligationIR=Frozen<{
  version:1;kind:'obligation';contract:ContractIR;model:LayoutModel;
} & (
  {operation:'conformance';implementation:LayoutIR;children:readonly ChildLayoutBinding[];coverage:LayoutModel;instance?:{path:string};dependencies?:LayoutDependency[];placementTransfers?:LayoutPlacementTransfer[]} |
  {operation:'refinement';previous:ContractIR}
)>;
export interface ContractProof {
  version:1;status:'verified'|'violated'|'unknown';operation:ObligationIR['operation'];contract:ContractIR;
  /** Coverage must verify before conformance is attempted. */
  coverage?:LayoutProof;proof:LayoutProof;
  instance?:{readonly path:string};
  dependencies?:readonly LayoutDependency[];
  placementTransfers?:readonly LayoutPlacementTransfer[];
}
export type UIContractIR=ContractIR|RelationalContractIR;
export type UIObligationIR=ObligationIR|RelationalObligationIR;
export type UIContractProof=ContractProof|RelationalProof;
// Compile-time contracts. No CSS/parser/solver implementation is imported here.
import {q,exact,serializeRange} from './layout/linear.mjs';
import {affine,and,or,interval,region as encodeRegion} from './layout/smt.mjs';
import {createLayoutModel,verifyLayoutModel} from './layout-z3.mjs';
import {validatePositionedBindings,positionedObligations} from './layout/positioned-contract.mjs';
import {layoutInstances,directInstances,localLayout,exposedRoots,scopeLayout,parentPlacements,boxKey} from './layout/composition.mjs';
import {obligationModel as makeModel} from './layout/model.mjs';
import {validateTargetMetadata} from './layout/target-metadata.mjs';

import {createRelationalContractIR,createRelationalObligationIR,verifyRelationalObligation} from './relational-contract.mjs';
export {createStateIR,createEnvironmentIR,createEvidenceIR,layoutGeometry,verifyUI,verifyRelationalObligation,createRelationalProofSession} from './relational-contract.mjs';

type LayoutInstance={path:string;contract:ContractIR;cases:readonly LayoutScenarioIdentity[]};
type PositionedContract=Extract<ContractIR,{spaces:readonly LayoutSpaceBinding[]}>;
const isPositioned=(contract:ContractIR):contract is PositionedContract=>contract.profile.id===PositionedGrid.id;
const isRelational=(contract:UIContractIR):contract is RelationalContractIR=>contract.profile.id==='relational/1';
function region(row:{range:Frozen<LayoutRange>;heightRange?:Frozen<LayoutRange>|undefined;region?:Frozen<LayoutRegion>|undefined}):string {
  return encodeRegion({range:row.range,...(row.heightRange?{heightRange:row.heightRange}:{}),...(row.region?{region:{constraints:[...row.region.constraints]}}:{})});
}
function readLayoutRect(v:unknown):LayoutRectangle|null {
  const isAffine=(a:unknown):a is LayoutAffine=>object(a,['coefficient','constant','heightCoefficient'])&&typeof a.coefficient==='string'&&typeof a.constant==='string'&&(a.heightCoefficient===undefined||typeof a.heightCoefficient==='string');
  if(!object(v,['inlineStart','blockStart','inlineSize','blockSize'])||!isAffine(v.inlineStart)||!isAffine(v.inlineSize)||!isAffine(v.blockStart)||!isAffine(v.blockSize))return null;
  return {inlineStart:v.inlineStart,blockStart:v.blockStart,inlineSize:v.inlineSize,blockSize:v.blockSize};
}
export function copyDiagnostic(d:Frozen<LayoutDiagnostic>):LayoutDiagnostic {
  const {region,related,conflict,explanation,...rest}=d;
  const facts=(side:NonNullable<typeof explanation>['available'])=>side.facts.map(f=>{
    if(!('origin' in f))return {...f};
    const {overridden,dormant,...base}=f;
    const origin=({conditions,...css}:Frozen<LayoutCSSOrigin>):LayoutCSSOrigin=>({...css,...(conditions ? {conditions:[...conditions]} : {})});
    const origins=(entries:NonNullable<typeof overridden>)=>entries.map(({css})=>({css:origin(css)}));
    const extra={...(overridden ? {overridden:origins(overridden)} : {}),...(dormant ? {dormant:origins(dormant)} : {})};
    if(base.origin==='author')return {...base,css:origin(base.css),...extra};
    return {...base,...extra};
  });
  return {...rest,...(region ? {region:{vertices:[...region.vertices],constraints:[...region.constraints]}} : {}),
    ...(related ? {related:[...related]} : {}),...(conflict ? {conflict:{properties:[...conflict.properties],longhands:[...conflict.longhands]}} : {}),
    ...(explanation ? {explanation:{version:1,available:{facts:facts(explanation.available)},required:{facts:facts(explanation.required)}}} : {})};
}
export function solverModel(model:Frozen<LayoutModel>):LayoutModel<Pick<LayoutSummary['scope'],'axis'>> {
  return {...model,assumptions:[...model.assumptions],diagnostics:model.diagnostics.map(copyDiagnostic),obligations:[...model.obligations]};
}

const freeze=<T,>(value:T):T=>{if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const snapshot=<T,>(value:T):T=>freeze(structuredClone(value));
export const SafeGrid=freeze({id:'safe-grid/1',containers:'grid',positioning:'in-flow',boxSizing:'border-box',geometry:'piecewise-affine',overflowPolicies:['fit']} as const);
export const PositionedGrid=freeze({...SafeGrid,id:'positioned-grid/1',positioning:'local-absolute'} as const);
const isArray=(v:unknown):boolean=>Array.isArray(v);
const object=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key));
const identity=(row:LayoutScenarioIdentity)=>JSON.stringify([row.variant ?? null,row.scrollbarProfile ?? null]);
const metadata=(row:LayoutScenarioIdentity & {box?:string;path?:string;hoveredPath?:string})=>({box:row.box,path:row.path,...(row.hoveredPath ? {hoveredPath:row.hoveredPath} : {}),...(row.variant!==undefined ? {variant:row.variant} : {}),...(row.scrollbarProfile!==undefined ? {scrollbarProfile:row.scrollbarProfile} : {})});
const unknown=(code:string,message:string):LayoutDiagnostic=>({code,severity:'unknown',message});

const nonnegative=(v:unknown):v is number=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=1_000_000;
function range(input:unknown):LayoutRange {
  if(!object(input,['min','max']) || !nonnegative(input.min) || !nonnegative(input.max) || input.min>input.max) throw new TypeError('Invalid nonempty layout contract interval');
  return serializeRange({min:q(input.min),max:q(input.max),minInclusive:true,maxInclusive:true});
}
export function createContractIR(input:ContractInput):ContractIR;
export function createContractIR(input:RelationalContractInput):RelationalContractIR;
export function createContractIR(input:ContractInput|RelationalContractInput):UIContractIR {
  if(input?.profile==='relational/1')return createRelationalContractIR(input);
  if(!object(input,['component','profile','requires','ensures','spaces','overlays']) || typeof input.component!=='string' || !/^[A-Z][A-Za-z0-9_]{0,127}$/.test(input.component) ||
    input.profile!==undefined && ![SafeGrid.id,PositionedGrid.id].includes(input.profile) || !object(input.requires,['inlineSize','blockSize']) ||
    input.ensures!==undefined && (!object(input.ensures,['inline','block']) || input.ensures.inline!=='fit' || input.ensures.block!=='fit')) throw new TypeError('Invalid closed layout contract grammar');
  const base={version:1,kind:'contract',component:input.component,
    requires:{inlineSize:range(input.requires.inlineSize),blockSize:range(input.requires.blockSize)},ensures:{inline:'fit',block:'fit'}} as const;
  if(input.profile===PositionedGrid.id) {
    validatePositionedBindings(input.spaces,input.overlays);
    return snapshot({...base,profile:PositionedGrid,spaces:input.spaces,overlays:input.overlays});
  }
  if(input.spaces!==undefined || input.overlays!==undefined) throw new TypeError('SafeGrid has no space/overlay bindings');
  return snapshot({...base,profile:SafeGrid});
}

/** Extract implementation facts without consulting a ContractIR. */
export function createLayoutIR(report:LayoutSummary):LayoutIR {
  createLayoutModel(report); // Validate the existing exact SMT boundary too.
  if(!isArray(report.sizes) || !isArray(report.policies) || report.elements!==undefined && !isArray(report.elements) || report.sizes.length+report.checks.length+report.policies.length+(report.elements?.length ?? 0)>32768) throw new TypeError('Invalid layout fact count');
  for(const element of report.elements ?? []) validateTargetMetadata(element);
  const diagnostics=report.diagnostics.filter(d=>d.severity==='unknown');
  // A counterexample to a fit obligation is not a failure to compute geometry.
  // Restrict this to witnessed geometric violations, never syntax/model errors.
  const geometricViolation=report.status==='violated' && report.diagnostics.length>0 && report.diagnostics.every(d=>
    d.severity==='error' && d.witness && ['E_LAYOUT_ITEM_SIZE','E_LAYOUT_TRACKS','E_LAYOUT_ABSOLUTE_START','E_LAYOUT_ABSOLUTE_END','E_LAYOUT_ABSOLUTE_CLIPPED','E_LAYOUT_PAGE_OVERFLOW','E_LAYOUT_PROTRUSION'].includes(d.code));
  const geometryComplete=(report.status==='verified'||geometricViolation) && report.structure?.complete!==false && report.scope.axis==='both' && report.scope.blockSizing && !diagnostics.length;
  if(report.scope.axis!=='both' || !report.scope.blockSizing) diagnostics.push(unknown('U_LAYOUT_AXES','SafeGrid contracts require both dimensions'));
  if(report.policies.some(row=>row.overflow!=='fit') || report.checks.some(row=>!row.enforced)) diagnostics.push(unknown('U_LAYOUT_PROFILE','safe-grid/1 cannot import weakened overflow policies'));
  const variants=report.structure?.variants.map(({id})=>({variant:id})) ?? [{}];
  const platforms=report.scope.scrollbarProfiles?.map(({name})=>({scrollbarProfile:name})) ?? [{}];
  const cases=variants.flatMap(variant=>platforms.map(platform=>({...variant,...platform})));
  if(!cases.length || cases.length>2048) diagnostics.push(unknown('U_LAYOUT_COVERAGE','No complete finite layout cases'));
  // Unknown structural analysis can contain a diagnostic placeholder tree.
  // It is not an implementation case and must not become geometry evidence.
  const boxes:LayoutIRBox[]=(cases.length ? report.sizes : []).map(row=>({...metadata(row),box:row.box,path:row.path,range:row.range,heightRange:row.heightRange,region:row.region,boxSizing:row.boxSizing,
    ...(row.rect ? {rect:row.rect} : {}),
    ...('layoutRect' in row && row.layoutRect !== undefined ? {layoutRect:readLayoutRect(row.layoutRect)} : {}),
    ...(row.position ? {position:row.position} : {}),...(row.origin ? {origin:row.origin,...(row.containingBlock ? {containingBlock:row.containingBlock} : {})} : {}),
    ...(row.paddingInlineSize ? {padding:{inline:row.paddingInlineSize,...(row.paddingBlockSize ? {block:row.paddingBlockSize} : {})}} : {}),
    allocated:{inline:row.allocatedInlineSize,...(row.allocatedBlockSize ? {block:row.allocatedBlockSize} : {})},
    border:{inline:row.inlineSize,...(row.blockSize ? {block:row.blockSize} : {})},
    content:{inline:row.contentInlineSize,...(row.contentBlockSize ? {block:row.contentBlockSize} : {})}}));
  return snapshot({version:1,kind:'layout',component:report.component,scope:report.scope,cases,boxes,presence:cases.length ? report.policies : [],
    checks:cases.length ? report.checks : [],errors:cases.length ? report.diagnostics.filter(d=>d.severity==='error' && !d.witness) : [],
    elements:cases.length ? report.elements ?? [] : [],
    bindings:cases.length ? report.layoutBindings ?? [] : [],
    geometryComplete,complete:report.status!=='unknown' && report.structure?.complete!==false && !diagnostics.length,diagnostics,assumptions:report.assumptions});
}

function validateContract(contract:ContractIR) {
  const expected=contract?.profile?.id===PositionedGrid.id ? PositionedGrid : SafeGrid;
  const profile:unknown=contract?.profile;
  const validProfile=object(profile,Object.keys(expected)) && Object.entries(expected).every(([key,value])=>{
    const actual=profile[key];
    return Array.isArray(value) ? Array.isArray(actual) && actual.length===value.length && value.every((entry,i)=>actual[i]===entry) : actual===value;
  });
  if(!object(contract,['version','kind','component','profile','requires','ensures',...(expected===PositionedGrid ? ['spaces','overlays'] : [])]) || contract.kind!=='contract' || contract.version!==1 || !validProfile ||
    !object(contract.requires,['inlineSize','blockSize']) || !object(contract.ensures,['inline','block']) || contract.ensures.inline!=='fit' || contract.ensures.block!=='fit') throw new TypeError('Invalid ContractIR');
  for(const key of ['inlineSize','blockSize'] as const) {
    const value=contract.requires[key],canonical=range({min:value?.min,max:value?.max});
    if(!object(value,Object.keys(canonical)) || (['min','max','minInclusive','maxInclusive','minExact','maxExact'] as const).some(key=>canonical[key]!==value[key])) throw new TypeError('Invalid ContractIR interval');
  }
  if(expected===PositionedGrid) validatePositionedBindings(contract.spaces,contract.overlays);
}
function requires(contract:ContractIR,inputs:{inline:LayoutAffine;block:LayoutAffine}) {
  return and([...interval(contract.requires.inlineSize,affine(inputs.inline)),...interval(contract.requires.blockSize,affine(inputs.block))]);
}
const fullBox=(box:LayoutIRBox)=>box.border.inline && box.border.block && box.content.inline && box.content.block && box.allocated.inline && box.position!==undefined && ['static','relative','absolute'].includes(box.position);
export function createObligationIR(contract:ContractIR,implementation:LayoutIR,options?:{children?:readonly ChildLayoutBinding[]}):ObligationIR;
export function createObligationIR(contract:RelationalContractIR,implementation:RelationalImplementation):RelationalObligationIR;
export function createObligationIR(contract:UIContractIR,implementation:LayoutIR|RelationalImplementation,options:{children?:readonly ChildLayoutBinding[]}={}):UIObligationIR {
  if(isRelational(contract)){
    if(Object.keys(options).length || !('state' in implementation))throw new TypeError('Invalid relational implementation or options');
    return createRelationalObligationIR(contract,implementation);
  }
  if(!object(options,['children']) || !('kind' in implementation)) throw new TypeError('Invalid conformance options');
  return conformance(contract,implementation,{...(options.children!==undefined ? {children:options.children} : {}),requested:true});
}
function conformance(contract:ContractIR,implementation:LayoutIR,{children=[],path=contract.component,instance=false,context=implementation,depth=0,transfer=true,requested=false}:{children?:readonly ChildLayoutBinding[];path?:string;instance?:boolean;context?:LayoutIR;depth?:number;transfer?:boolean;requested?:boolean}={}):Extract<ObligationIR,{operation:'conformance'}> {
  if(depth>64) throw new RangeError('Layout composition depth limit exceeded');
  validateContract(contract);
  if(implementation?.kind!=='layout' || implementation.version!==1 || implementation.component!==contract.component) throw new TypeError('Contract and implementation component must match');
  if(!isArray(implementation.cases) || !implementation.cases.length && implementation.complete || implementation.cases.length>2048 || new Set(implementation.cases.map(identity)).size!==implementation.cases.length) throw new TypeError('Invalid LayoutIR cases');
  if((['boxes','presence','checks','errors','elements'] as const).some(key=>!isArray(implementation[key])) || (['boxes','presence','checks','errors','elements'] as const).reduce((n,key)=>n+implementation[key].length,0)>32768) throw new TypeError('Invalid LayoutIR fact count');
  if(!isArray(children) || children.length>256) throw new TypeError('Invalid child contract bindings');
  if(requested) {
    // An API-supplied interface occupies the caller slot just like source DSL.
    // This changes expected obligations only; implementation facts stay intact.
    context={...implementation,bindings:[...(implementation.bindings ?? []).filter(binding=>binding.path!==path),
      ...implementation.cases.map(scenario=>({...scenario,path,declaration:{contract,source:{start:0,end:0}}}))]};
  }
  const instances:LayoutInstance[]=layoutInstances(context),boundaries:LayoutInstance[]=directInstances(instances,path,implementation.cases);
  const local:LayoutIR=localLayout(implementation,boundaries),localKeys=new Set(local.boxes.map(boxKey));
  const placements:{parent:LayoutInstance;cases:readonly LayoutScenarioIdentity[]}[]=parentPlacements(context,instances,path,implementation.cases);
  const external=placements.flatMap(placement=>placement.cases.map(scenario=>({...scenario,path})));
  const externalKeys=new Set(external.map(boxKey));
  const inputs={inline:{coefficient:'1',constant:exact(q(-(implementation.scope.hostInset ?? 0)))},block:{coefficient:'0',heightCoefficient:'1',constant:exact(q(-(implementation.scope.hostBlockInset ?? 0)))}};
  const extractedDomain=and([...interval(implementation.scope.viewport,'width'),...(implementation.scope.viewport.height ? interval(implementation.scope.viewport.height,'height') : ['false'])]);
  const domain=instance ? extractedDomain : requires(contract,inputs),base={component:contract.component,scope:implementation.scope,complete:implementation.complete,diagnostics:implementation.diagnostics.map(copyDiagnostic),assumptions:[...implementation.assumptions]};
  const obligations:LayoutObligation[]=implementation.checks.filter(row=>row.code!=='E_LAYOUT_ITEM_SIZE').map(row=>({...metadata(row),code:row.code,axis:row.axis,domain:region(row),failure:`(> ${affine(row.required)} ${affine(row.available)})`,available:row.available,required:row.required}));
  for(const row of implementation.errors) obligations.push({...metadata(row),code:row.code,axis:row.axis,domain:row.range ? region({...row,range:row.range}) : 'true',failure:'true'});
  for(const box of implementation.boxes) {
    if(box.boxSizing!=='border-box') obligations.push({...metadata(box),code:'E_LAYOUT_PROFILE',domain:region(box),failure:'true'});
    if(contract.profile.id===SafeGrid.id && box.position==='absolute' && localKeys.has(boxKey(box)) && !externalKeys.has(boxKey(box))) obligations.push({...metadata(box),code:'E_LAYOUT_PROFILE',domain:region(box),failure:'true'});
    if(box.position==='absolute') for(const axis of ['inline','block'] as const) if(box.border[axis] && box.allocated[axis])
      obligations.push({...metadata(box),code:'E_LAYOUT_ABSOLUTE_ALLOCATION',axis,domain:region(box),failure:`(not (= ${affine(box.border[axis])} ${affine(box.allocated[axis])}))`});
    for(const axis of ['inline','block'] as const) if(box.border[axis] && box.allocated[axis]) obligations.push({...metadata(box),code:'E_LAYOUT_FIT',axis,
      domain:region(box),failure:`(> ${affine(box.border[axis])} ${affine(box.allocated[axis])})`,available:box.allocated[axis],required:box.border[axis]});
  }
  const coverage:LayoutObligation[]=[],groups=new Map<string,{scenario:LayoutScenarioIdentity;boxes:LayoutIRBox[];presence:LayoutIR['presence'][number][]}>(implementation.cases.map(item=>[identity(item),{scenario:item,boxes:[],presence:[]}]));
  const groupFor=(row:LayoutScenarioIdentity)=>{const group=groups.get(identity(row));if(!group)throw new TypeError('Layout facts contain an undeclared case');return group;};
  for(const row of implementation.boxes)groupFor(row).boxes.push(row);
  for(const row of implementation.presence)groupFor(row).presence.push(row);
  for(const row of [...implementation.checks,...implementation.errors])groupFor(row);
  for(const {scenario,...group} of groups.values()) {
    const {variant,scrollbarProfile}=scenario,caseMetadata={...(variant!==undefined ? {variant} : {}),...(scrollbarProfile!==undefined ? {scrollbarProfile} : {})};
    const paths=new Map<string,string[]>();for(const box of group.boxes) {const regions=paths.get(box.path) ?? [];if(fullBox(box))regions.push(region(box));paths.set(box.path,regions);}
    const root=group.boxes.filter(box=>box.path===path && fullBox(box) && box.allocated.block);
    coverage.push({...caseMetadata,code:'U_LAYOUT_COVERAGE',path,domain:'true',failure:`(not ${and([extractedDomain,or(root.map(region))])})`});
    for(const row of group.presence) coverage.push({...metadata(row),code:'U_LAYOUT_COVERAGE',domain:region(row),failure:`(not ${or(paths.get(row.path) ?? [])})`});
  }
  if(isPositioned(contract)) {
    const positioned=positionedObligations(contract,local,path,{exposed:exposedRoots(boundaries),external});
    obligations.push(...positioned.obligations);coverage.push(...positioned.coverage);
  }
  // A separately requested child proof must verify the caller's placement too.
  // Recursive parent checks already contain this transfer and do not repeat it.
  if(transfer) for(const {parent} of placements) {
    validateContract(parent.contract);
    if(!isPositioned(parent.contract))throw new TypeError('Invalid positioned caller');
    const parentScope:LayoutIR=scopeLayout(context,parent.contract,parent.path,parent.cases);
    const parentChildren:LayoutInstance[]=directInstances(instances,parent.path,parent.cases);
    const upstream:{parent:LayoutInstance;cases:readonly LayoutScenarioIdentity[]}[]=parentPlacements(context,instances,parent.path,parent.cases);
    const parentExternal=upstream.flatMap(p=>p.cases.map(scenario=>({...scenario,path:parent.path})));
    const positioned=positionedObligations(parent.contract,localLayout(parentScope,parentChildren),parent.path,{exposed:exposedRoots(parentChildren),external:parentExternal});
    obligations.push(...positioned.obligations);coverage.push(...positioned.coverage);
  }
  for(const binding of children) {
    if(!object(binding,['path','contract']) || typeof binding.path!=='string') throw new TypeError('Invalid child path binding');
    validateContract(binding.contract);
    const boxes=implementation.boxes.filter(box=>box.path===binding.path);
    if(!boxes.length) {if(instance && binding.path===path) continue;throw new TypeError(`Child contract path does not exist: ${binding.path}`);}
    for(const box of boxes) {
      if(box.position==='absolute' && !parentPlacements(context,instances,binding.path,[box]).length) {coverage.push({...metadata(box),code:'U_LAYOUT_ABSOLUTE_ALLOCATION',domain:region(box),failure:'true'});continue;}
      if(!box.allocated.inline || !box.allocated.block) {coverage.push({...metadata(box),code:'U_LAYOUT_COVERAGE',domain:region(box),failure:'true'});continue;}
      for(const [axis,key] of [['inline','inlineSize'],['block','blockSize']] as const) {
        const value=axis==='inline'?box.allocated.inline:box.allocated.block,range=binding.contract.requires[key];
        for(const [failure,available,required] of [
          [`(< ${affine(value)} ${affine(scalarRange(range.minExact))})`,value,scalarRange(range.minExact)],
          [`(> ${affine(value)} ${affine(scalarRange(range.maxExact))})`,scalarRange(range.maxExact),value],
        ] as const) obligations.push({...metadata(box),code:'E_LAYOUT_CHILD_REQUIRES',axis,domain:region(box),failure,available,required});
      }
    }
  }
  for(const child of boundaries) {
    const scoped:LayoutIR=scopeLayout(context,child.contract,child.path,child.cases);
    const dependency=conformance(child.contract,scoped,{path:child.path,instance:true,children:[{path:child.path,contract:child.contract}],context,depth:depth+1,transfer:false});
    obligations.push(...dependency.model.obligations);coverage.push(...dependency.coverage.obligations);
  }
  return snapshot({version:1,kind:'obligation',operation:'conformance',contract,implementation,children,...(instance ? {instance:{path}} : {}),
    ...(boundaries.length ? {dependencies:boundaries.map(child=>({component:child.contract.component,path:child.path}))} : {}),
    ...(placements.length ? {placementTransfers:placements.map(({parent,cases})=>({caller:parent.contract.component,path:parent.path,cases,allocation:'used-border-box'}))} : {}),
    coverage:makeModel(base,domain,coverage),model:makeModel(base,domain,obligations)});
}
const scalarRange=(constant:string):LayoutAffine=>({coefficient:'0',constant});

/** Check an actual allocation against Requires; never use Requires to prune inputs. */
export function createInstanceObligationIR(contract:ContractIR,implementation:LayoutIR,options:{path:string;cases?:readonly LayoutScenarioIdentity[]}):ObligationIR {
  if(!object(options,['path','cases'])) throw new TypeError('Invalid instance options');
  const {path,cases=implementation.cases}=options;
  validateContract(contract);
  if(typeof path!=='string' || !path) throw new TypeError('A native instance path is required');
  const scoped:LayoutIR=scopeLayout(implementation,contract,path,cases);
  return conformance(contract,scoped,{path,instance:true,children:[{path,contract}],context:implementation});
}

/** Bind source declarations to concrete boxes after structural expansion. */
export function createDeclaredObligations(implementation:LayoutIR):readonly ObligationIR[] {
  const instances:LayoutInstance[]=layoutInstances(implementation);
  return Object.freeze(instances.map(({path,contract,cases})=>createInstanceObligationIR(contract,implementation,{path,cases})));
}

/** Both v1 contracts guarantee Fit; replacement must accept every old input. */
export function createRefinementObligationIR(previous:ContractIR,next:ContractIR):ObligationIR {
  validateContract(previous);validateContract(next);
  if(previous.component!==next.component) throw new TypeError('Refinement component must match');
  if(previous.profile.id!==next.profile.id || JSON.stringify(previous.spaces)!==JSON.stringify(next.spaces) || JSON.stringify(previous.overlays)!==JSON.stringify(next.overlays)) throw new TypeError('Refinement requires identical profiles and positioned bindings');
  const inputs={inline:{coefficient:'1',constant:'0'},block:{coefficient:'0',heightCoefficient:'1',constant:'0'}};
  const scope:LayoutSummary['scope']={axis:'both',viewport:{...previous.requires.inlineSize,height:previous.requires.blockSize},hostInset:0,hostBlockInset:0,closedCSS:true,browserRounding:false,blockSizing:true};
  const base={component:next.component,scope,complete:true,diagnostics:[],assumptions:[]};
  return snapshot({version:1,kind:'obligation',operation:'refinement',contract:next,previous,
    model:makeModel(base,requires(previous,inputs),[{code:'E_LAYOUT_REFINEMENT',domain:'true',failure:`(not ${requires(next,inputs)})`}])});
}

export function verifyObligationIR(obligation:ObligationIR,api:LayoutSolverAPI,options?:{timeoutMs?:number}):Promise<ContractProof>;
export function verifyObligationIR(obligation:RelationalObligationIR,api?:undefined,options?:{observations?:readonly Observation[]}):Promise<RelationalProof>;
export async function verifyObligationIR(obligation:UIObligationIR,api?:LayoutSolverAPI,options?:{timeoutMs?:number;observations?:readonly Observation[]}):Promise<UIContractProof> {
  if(obligation?.operation==='relational')return verifyRelationalObligation(obligation,options);
  if(obligation?.kind!=='obligation' || obligation.version!==1 || !['conformance','refinement'].includes(obligation.operation)) throw new TypeError('Invalid ObligationIR');
  const verify=(model:Frozen<LayoutModel>):Promise<LayoutProof>=>api?verifyLayoutModel(solverModel(model),api,options):Promise.resolve({
    version:1,component:model.component,status:'unknown',complete:model.complete,assumptions:[...model.assumptions],
    solver:{engine:'z3-wasm',result:'unknown'},diagnostics:[...model.diagnostics.map(copyDiagnostic),unknown('U_LAYOUT_SOLVER','Missing layout solver API')],
  });
  let coverage:LayoutProof|undefined;
  const instance=obligation.operation==='conformance'?{...(obligation.instance?{instance:obligation.instance}:{}),...(obligation.dependencies?{dependencies:obligation.dependencies}:{}),...(obligation.placementTransfers?{placementTransfers:obligation.placementTransfers}:{})}:{};
  if(obligation.operation==='conformance') {
    coverage=await verify(obligation.coverage);
    if(coverage.status!=='verified') return {version:1,status:'unknown',operation:obligation.operation,contract:obligation.contract,...instance,coverage,
      proof:{...coverage,status:'unknown',complete:false,diagnostics:[...coverage.diagnostics,...(coverage.status==='violated' ? [unknown('U_LAYOUT_COVERAGE','Implementation facts do not cover every required input, box and case')] : [])]}};
  }
  const proof=await verify(obligation.model);
  return {version:1,status:proof.status,operation:obligation.operation,contract:obligation.contract,...instance,...(coverage ? {coverage} : {}),proof};
}
