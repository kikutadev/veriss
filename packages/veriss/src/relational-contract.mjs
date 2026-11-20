// Relational UI contracts over a finite declared state graph and exact piecewise-affine
// CSS-pixel geometry. Runtime observations are intentionally not proof evidence.
import {q,exact,cmp,sub} from './layout/linear.mjs';
import {rational} from './layout/smt.mjs';
import {rectangle,clip,partition,scalar,diff,sum,sample,times,affine as serializeAffine} from './layout/region.mjs';
import {occupancyFailure} from './layout/occupancy.mjs';
import {expandPredicate,predicateTargets,predicateRegions} from './layout/relational-predicate.mjs';
import {verifyPredicateImplication} from './layout/relational-implication.mjs';

const zero=q(0), neg=a=>times(a,q(-1));
const axes=['inlineStart','blockStart','inlineSize','blockSize'];
const read=v=>rational(v);
const affine=a=>({x:read(a.coefficient),y:read(a.heightCoefficient??'0'),b:read(a.constant)});
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128;
const ensure=(v,msg)=>{if(!v)throw new TypeError(msg)};
const list=(v,max)=>Array.isArray(v)&&v.length<=max;
const unique=v=>new Set(v).size===v.length;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e6;
const range=r=>r&&finite(r.min)&&finite(r.max)&&r.min>0&&r.min<=r.max;
const cond=(r,cs)=>cs.reduce((out,[a,s])=>out&&clip(out,a,s),r);
export const profileKey=p=>JSON.stringify([p.viewport.min,p.viewport.max,p.viewport.height.min,p.viewport.height.max,...['top','right','bottom','left'].map(k=>p.safeArea?.[k]??0),p.ua??'chromium',p.dpr??null,p.scrollbar?.name??'overlay',p.scrollbar?.inlineSize??0,p.scrollbar?.blockSize??0,p.scrollbar?.thinInlineSize??null,p.scrollbar?.thinBlockSize??null,p.input??null,p.fontProfile??null,p.assumptions??[]]);
const domainOf=p=>rectangle({min:q(p.viewport.min),max:q(p.viewport.max)},{min:q(p.viewport.height.min),max:q(p.viewport.height.max)});
function minusRegion(region,cs) {
  let rem=region;const out=[];
  for(const [a,s] of cs){if(!rem)break;const p=partition(rem,a,s?'>':'>=');out.push(...p.no);rem=p.yes[0]}
  return out;
}
// All built-in linear relations lower to the same serializable predicate AST.
const equal=(a,b,fields=axes)=>fields.flatMap(k=>{const d=diff(a[k],b[k]);return [[[d,true]],[[neg(d),true]]]});
const compare=(relation,left,right)=>({op:'compare',relation,left,right});
const all=items=>({op:'all',items}),any=items=>({op:'any',items});
const ref=(target,field,endpoint)=>({target,field,...(endpoint?{endpoint}:{})});
const num=v=>exact(q(v));
function rulePredicate(c){
 const a=field=>ref(c.target,field),b=field=>ref(c.other,field);
 switch(c.kind){
  case 'predicate':return c.predicate;
  case 'within-viewport':return all([['inlineStart','safeLeft','ge'],['blockStart','safeTop','ge'],['inlineEnd','safeRight','le'],['blockEnd','safeBottom','le']].map(([field,environment,op])=>compare(op,a(field),{environment})));
  case 'contains':return all(['inline','block'].flatMap(k=>[compare('le',a(k+'Start'),b(k+'Start')),compare('ge',a(k+'End'),b(k+'End'))]));
  case 'disjoint':return any(['inline','block'].flatMap(k=>[compare('le',a(k+'End'),b(k+'Start')),compare('le',b(k+'End'),a(k+'Start')),compare('eq',a(k+'Size'),'0'),compare('eq',b(k+'Size'),'0')]));
  case 'min-size':return all([compare('ge',a('inlineSize'),num(c.width)),compare('ge',a('blockSize'),num(c.height))]);
  case 'stable':return all(axes.map(k=>compare('eq',ref(c.target,k,'before'),ref(c.target,k,'after'))));
  default:return null;
 }
}
const ruleRefs=(c,predicate)=>predicate?predicateTargets(predicate):c.kind==='max-occupancy'?[c.target,...c.overlays].map(target=>['before',target]):[];
const own=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const selection=(v,limit)=>v===undefined||list(v,limit)&&v.length>0&&v.every(id)&&unique(v);
function validateState({initial,states,transitions}){
 ensure(list(states,64)&&states.every(id)&&unique(states)&&states.includes(initial),'Invalid state graph');
 ensure(list(transitions,256)&&transitions.every(t=>own(t,['from','event','to','profiles'])&&states.includes(t.from)&&states.includes(t.to)&&id(t.event)&&selection(t.profiles,16))&&unique(transitions.map(t=>JSON.stringify([t.from,t.event,t.to]))),'Invalid transitions');
}
function validateProfiles(profiles){
 ensure(list(profiles,16)&&profiles.length&&unique(profiles.map(p=>p?.id))&&profiles.every(p=>p&&id(p.id)&&range(p.viewport)&&range(p.viewport.height)&&Object.entries(p.safeArea??{}).every(([k,v])=>['left','right','top','bottom'].includes(k)&&Number.isInteger(v)&&v>=0&&v<=200)&&((p.safeArea?.left??0)+(p.safeArea?.right??0)<p.viewport.min)&&((p.safeArea?.top??0)+(p.safeArea?.bottom??0)<p.viewport.height.min)&&(!p.ua||['chromium','firefox','webkit'].includes(p.ua))&&(p.dpr===undefined||typeof p.dpr==='number'&&p.dpr>0&&p.dpr<100&&/^\d{1,2}(?:\.\d{1,3})?$/.test(String(p.dpr)))&&(p.scrollbar===undefined||p.scrollbar&&id(p.scrollbar.name)&&finite(p.scrollbar.inlineSize)&&finite(p.scrollbar.blockSize))),'Invalid profiles');
}
function validateContracts(contracts) {
 ensure(list(contracts,128)&&contracts.length&&unique(contracts.map(c=>c?.id)),'Invalid contracts');
 for(const c of contracts){
    ensure(c&&id(c.id)&&['within-viewport','contains','disjoint','min-size','stable','max-occupancy','action','predicate'].includes(c.kind),'Invalid contract kind');
    ensure((['action','predicate'].includes(c.kind)||id(c.target))&&(!['contains','disjoint'].includes(c.kind)||(id(c.other)&&c.target!==c.other))&&(!['stable','action'].includes(c.kind)||id(c.event))&&(c.event===undefined||id(c.event)),'Invalid contract targets/event');
    const args={'within-viewport':['target'],contains:['target','other'],disjoint:['target','other'],'min-size':['target','width','height'],stable:['target','event'],'max-occupancy':['target','overlays','max'],action:['event'],predicate:['predicate','event']}[c.kind];
    ensure(Object.keys(c).every(k=>['id','kind','states','profiles',...args].includes(k)),'Unknown contract field');
    ensure(selection(c.states,64)&&selection(c.profiles,16),'Invalid contract state/profile selection');
    if(c.kind==='min-size'){ensure(finite(c.width)&&finite(c.height),'Invalid minimum size');q(c.width);q(c.height)}
    if(c.kind==='max-occupancy')ensure(list(c.overlays,4)&&c.overlays.length&&c.overlays.every(id)&&unique(c.overlays)&&!c.overlays.includes(c.target)&&cmp(read(c.max),zero)>=0&&cmp(read(c.max),q(1))<=0,'Invalid occupancy');
 }
}
function validateBindings(model){
 const ids=new Set(model.profiles.map(p=>p.id));
 ensure(model.transitions.every(t=>!t.profiles||t.profiles.every(p=>ids.has(p))),'Unknown transition profile');
 ensure(model.contracts.every(c=>(!c.states||c.states.every(s=>model.states.includes(s)))&&(!c.profiles||c.profiles.every(p=>ids.has(p)))),'Unknown contract state/profile');
}
function reachableIn(model,profile){
 const transitions=model.transitions.filter(t=>!t.profiles||t.profiles.includes(profile));
 const states=[model.initial],seen=new Set(states);
 for(const s of states)for(const t of transitions)if(t.from===s&&!seen.has(t.to)){seen.add(t.to);states.push(t.to)}
 return {states,edges:transitions.filter(t=>seen.has(t.from))};
}
// Derive requirements from the expanded predicate, never from claimant-provided
// evidence metadata. End coordinates require both start and size.
function requiredFields(predicate,refs) {
 const need=refs.map(()=>new Set());
 if(!predicate)return refs.map(()=>axes);
 function visit(o){
  if(!o||typeof o!=='object')return;
  if(Object.hasOwn(o,'target')){
   const i=refs.findIndex(([endpoint,target])=>target===o.target&&endpoint===(o.endpoint??'before'));
   if(i<0)throw Error('Missing predicate target');
   if(o.field.endsWith('End'))for(const suffix of ['Start','Size'])need[i].add(o.field.replace(/End$/,suffix));
   else need[i].add(o.field);
  }else Object.values(o).forEach(visit);
 }
 visit(predicate);return need.map(s=>[...s]);
}
const evidenceFields=e=>e?.axes===undefined?axes:axes.filter(k=>e.axes.some(a=>k.startsWith(a)));
function prepare(entry,domain,budget,required=axes) {
  if(!entry)throw Error('missing geometry evidence');
  if(entry.reason)throw Error(entry.reason);
  if(!entry.rows?.length||entry.rows.length>128)throw Error('geometry row limit or empty geometry');
  const fields=evidenceFields(entry);
  if(required.some(k=>!fields.includes(k)))throw Error('Required geometry axis not proved');
  const rows=entry.rows.map(row=>{
    if(!list(row.constraints??[],64))throw Error('region constraint limit');
    const cs=(row.constraints??[]).map(c=>{if(typeof c.strict!=='boolean')throw Error('invalid strict constraint');return [affine(c),c.strict]});
    if(!row.rect||Object.keys(row.rect).length!==fields.length||fields.some(k=>!Object.hasOwn(row.rect,k)))throw Error('Geometry does not match declared axes');
    const rect=Object.fromEntries(fields.map(k=>[k,affine(row.rect[k])]));
    return {cs,rect,region:cond(domain,cs)};
  }).filter(r=>r.region);
  let gaps=[domain];
  for(const row of rows){
    if((budget.left-=gaps.length*Math.max(1,row.cs.length))<0)throw Error('coverage budget exceeded');
    gaps=gaps.flatMap(g=>minusRegion(g,row.cs));if(gaps.length>256)throw Error('coverage region limit exceeded');
    for(const k of fields.filter(k=>k.endsWith('Size')))if(clip(row.region,neg(row.rect[k]),true))throw Error('negative rectangle dimension');
    if(!gaps.length)break;
  }
  if(gaps.length)throw Error('geometry does not cover profile');
  // Even redundant rows must have valid dimensions and agree on shared domains.
  for(let i=0;i<rows.length;i++){
    const a=rows[i];
    for(const k of fields.filter(k=>k.endsWith('Size')))if(clip(a.region,neg(a.rect[k]),true))throw Error('negative rectangle dimension');
    for(const b of rows.slice(i+1)){
      if(--budget.left<0)throw Error('consistency budget exceeded');
      const both=cond(a.region,b.cs);
      if(both&&equal(a.rect,b.rect,fields).some(p=>cond(both,p)))throw Error('contradictory geometry');
    }
  }
  return rows;
}
function cross(domain,groups,budget,visit,index=0,rects=[]) {
  if(index===groups.length)return visit(domain,rects);
  for(const row of groups[index]){
    if(--budget.left<0)throw Error('geometry comparison budget exceeded');
    const common=cond(domain,row.cs);if(!common)continue;
    const bad=cross(common,groups,budget,visit,index+1,[...rects,row.rect]);if(bad)return bad;
  }
  return null;
}
function failure(c,p,predicate,refs,region,rects,budget){
 if(predicate){
  const failures=predicateRegions(predicate,region,new Map(refs.map((r,i)=>[JSON.stringify(r),rects[i]])),p,false,budget);
  return failures.length?sample(failures[0]):null;
 }
 return occupancyFailure(region,rects[0],rects.slice(1),read(c.max),budget);
}
// Browser coordinates are finite IEEE-754 numbers, not authored CSS
// decimals. Convert the sampled value exactly, without expanding the
// accepted CSS number grammar or rounding a real sampled violation away.
function sampledRational(value){
 if(value===0)return zero;
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,value);
 const raw=bits.getBigUint64(0),exp=Number((raw>>52n)&2047n);
 const mantissa=(raw&((1n<<52n)-1n))+(exp?1n<<52n:0n);
 const shift=(exp||1)-1023-52,n=raw>>63n?-mantissa:mantissa;
 return shift>=0?{n:n<<BigInt(shift),d:1n}:{n,d:1n<<BigInt(-shift)};
}
function observedGeometry(c,p,observations,instances,predicate,refs) {
 if(c.kind==='action')return [];
 const out=[];
 const required=requiredFields(predicate,refs);
 const rect=(o,target,fields)=>{
   if(!o?.rects||!Object.hasOwn(o.rects,target))return null;
   const r=o.rects[target];
   return Object.fromEntries(fields.map(k=>[k,scalar(sampledRational(r[['x','y','width','height'][axes.indexOf(k)]]))]));
 };
 const candidates=observations.filter(o=>o.profile===p.id&&o.rects);
 for(const t of instances)for(const o of candidates.filter(o=>o.state===t.from)){
   try{
     // A single point observation cannot establish both endpoints of a self transition.
     const afters=candidates.filter(n=>n!==o&&n.state===t.to&&n.width===o.width&&n.height===o.height);
     const rectangles=refs.map(([endpoint,target],i)=>rect(endpoint==='after'?(afters.length===1?afters[0]:null):o,target,required[i]));
     if(rectangles.some(v=>!v)){out.push({status:'unknown',sample:o,reason:'missing sampled target or unambiguous matching endpoint'});continue}
     if(t.to===t.from&&refs.some(r=>r[0]==='after')){out.push({status:'unknown',sample:o,reason:'self-transition needs paired observations'});continue}
     const x=sampledRational(o.width),y=sampledRational(o.height),reg=rectangle({min:x,max:x},{min:y,max:y});
     const failed=failure(c,p,predicate,refs,reg,rectangles,{left:30000});
     out.push({status:failed?'failed':'passed',sample:o,...(refs.some(r=>r[0]==='after')?{after:afters[0]}:{})});
   }catch(e){out.push({status:'unknown',sample:o,reason:e.message})}
 }
 return out;
}
// Strip only identity labels; their mapping is checked separately. Everything
// affecting the actual rectangle or its provenance remains in the cache key.
function evidenceValue(e){
 if(!e)return null;
 const {state,profile,target,...rest}=e;
 return rest;
}
function mapPredicate(value,bind){
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(v=>mapPredicate(v,bind));
 if(Object.hasOwn(value,'target'))return {...value,target:bind(value.target,value.endpoint??'before')};
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapPredicate(v,bind)]));
}
const caseKey=(contract,profile,transition)=>JSON.stringify([contract,profile,transition]);
function arithmeticKey(c,p,predicate,refs,used){
 const names=new Map(refs.map(([endpoint,target],i)=>[JSON.stringify([endpoint,target]),String(i)]));
 const expr=predicate?mapPredicate(predicate,(target,endpoint)=>names.get(JSON.stringify([endpoint,target]))):{kind:c.kind,max:c.max};
 return JSON.stringify([p,expr,used.map(evidenceValue)]);
}
function evaluateRelational({model,evidence=[],observations=[],compiledCases,cache,derived}) {
  ensure(list(evidence,4096)&&list(observations,4096),'Evidence limit exceeded');
  const key=(s,p,t)=>JSON.stringify([s,p,t]);
  const entries=new Map(), assumptions=new Set(['Declared state graph and supplied geometry are trusted abstractions of implementation; profiles describe unscrolled CSS pixels, not paint or hit testing. DOM evidence uses a closed author cascade and the declared scrollbar profile (overlay by default).']);
  for(const e of evidence) {
    ensure(e&&model.states.includes(e.state)&&model.profiles.some(p=>p.id===e.profile)&&id(e.target)&&['dom','local-dom','scene','external'].includes(e.source)&&Array.isArray(e.assumptions)&&e.assumptions.every(a=>typeof a==='string'&&a.trim())&&(e.source==='dom'||e.assumptions.length),'Invalid geometry evidence');
    const p=model.profiles.find(p=>p.id===e.profile);
    ensure(e.profileKey===undefined||e.profileKey===profileKey(p),'Geometry evidence profile mismatch');
    const k=key(e.state,e.profile,e.target);
    ensure(!entries.has(k),'Duplicate geometry evidence');entries.set(k,e);
  }
  const byProfile=new Map(model.profiles.map(p=>[p.id,reachableIn(model,p.id)]));
  const reachable=[...new Set([...byProfile.values()].flatMap(v=>v.states))],seen=new Set(reachable);
  for(const o of observations){
    ensure(o&&model.states.includes(o.state)&&model.profiles.some(p=>p.id===o.profile&&finite(o.width)&&finite(o.height)&&o.width>=p.viewport.min&&o.width<=p.viewport.max&&o.height>=p.viewport.height.min&&o.height<=p.viewport.height.max),'Invalid observation position');
    ensure((o.event!==undefined||o.rects!==undefined)&&(o.event===undefined||id(o.event)&&typeof o.passed==='boolean'&&(o.to===undefined||model.states.includes(o.to))),'Invalid observation action');
    if(o.rects!==undefined)ensure(o.rects&&Object.getPrototypeOf(o.rects)===Object.prototype&&Object.entries(o.rects).every(([k,r])=>id(k)&&r&&['x','y','width','height'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&Math.abs(r[k])<=1e6&&(k==='x'||k==='y'||r[k]>=0))),'Invalid observed rectangles');
  }
  const observationDiagnostics=[];
  for(const o of observations){
    const permitted=byProfile.get(o.profile);
    if(!permitted.states.includes(o.state)||o.event&&o.passed&&!permitted.edges.some(t=>t.from===o.state&&t.event===o.event&&t.to===o.to))
      observationDiagnostics.push({code:'E_UI_OBSERVED_STATE',message:'observed state or successful transition is outside the declared graph',sample:o});
  }
  const reports=model.contracts.map(c=>{
    const cases=[],observed=[],predicate=rulePredicate(c),refs=ruleRefs(c,predicate);
    for(const p of model.profiles) {
      if(c.profiles&&!c.profiles.includes(p.id))continue;
      const domain=domainOf(p),budget={left:30000},edges=byProfile.get(p.id).edges;
      const obligations=compiledCases.filter(v=>v.contract===c.id&&v.profile===p.id);
      const instances=obligations.map(v=>v.transition);
      observed.push(...observedGeometry(c,p,observations,instances,predicate,refs));
      if(!instances.length){cases.push({profile:p.id,status:'unknown',coverage:{status:'unknown'},reason:'no reachable applicable state or transition'});continue}
      for(const obligation of obligations){
        const t=obligation.transition;
        const base={state:t.from,profile:p.id,...(t.to?{to:t.to,event:t.event}:{})};
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
        const hit=cache?.get(cacheKey,budget.left);
        if(hit!==undefined){
          budget.left-=hit;
          cases.push({...meta,coverage:{status:'verified'},status:'verified'});
          continue;
        }
        const remaining=budget.left;
        let covered=false;
        try{
          const fields=requiredFields(predicate,refs);
          const groups=used.map((e,i)=>prepare(e,domain,budget,fields[i]));covered=true;
          const bad=cross(domain,groups,budget,(reg,rects)=>failure(c,p,predicate,refs,reg,rects,budget));
          if(!bad)cache?.set(cacheKey,remaining-budget.left);
          cases.push({...meta,coverage:{status:'verified'},status:bad?'violated':'verified',...(bad?{witness:{width:exact(bad.x),height:exact(bad.y)}}:{})});
        }catch(e){cases.push({...meta,coverage:{status:covered?'verified':'unknown'},status:'unknown',reason:e.message})}
      }
    }
    const status=cases.some(c=>c.status==='violated')?'violated':!cases.length||cases.some(c=>c.status==='unknown')?'unknown':'verified';
    return {id:c.id,kind:c.kind,status,cases,observations:observed,...(!cases.length?{reason:'no reachable applicable state or transition'}:{})};
  });
  const status=reports.some(r=>r.status==='violated')?'violated':reports.some(r=>r.status==='unknown')?'unknown':'verified';
  const observationStatus=observationDiagnostics.length||reports.some(r=>r.observations.some(o=>o.status==='failed'))?'failed':reports.some(r=>r.observations.some(o=>o.status==='unknown'))?'incomplete':reports.some(r=>r.observations.length)?'sampled':'not-run';
  const observationCoverage=model.profiles.flatMap(p=>byProfile.get(p.id).states.map(state=>({state,profile:p.id,samples:observations.filter(o=>o.state===state&&o.profile===p.id).length})));
  return {version:1,status,observationDiagnostics,observationCoverage,reachability:model.profiles.map(p=>({profile:p.id,states:byProfile.get(p.id).states})),outcome:status==='violated'||observationStatus==='failed'?'failed':status==='unknown'||observationStatus==='incomplete'?'unknown':'verified',reachable,unreachable:model.states.filter(s=>!seen.has(s)),assumptions:[...assumptions],contracts:reports,observationStatus};
}


const immutable=value=>{
 const seen=new Set();
 const copy=o=>{
  if(o===null||typeof o==='string'||typeof o==='boolean'||typeof o==='number'&&Number.isFinite(o))return o;
  ensure(o&&typeof o==='object'&&(Array.isArray(o)||[Object.prototype,null].includes(Object.getPrototypeOf(o)))&&!seen.has(o),'IR requires finite acyclic JSON data');
  seen.add(o);
  const v=Array.isArray(o)?o.map(copy):Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined).map(([k,v])=>[k,copy(v)]));
  seen.delete(o);return Object.freeze(v);
 };
 return copy(value);
};
export function createStateIR({initial,states,transitions}) {
 validateState({initial,states,transitions});
 return immutable({version:1,kind:'state',initial,states,transitions});
}
export function createEnvironmentIR(profiles) {
 validateProfiles(profiles);
 for(const p of profiles){
  ensure(own(p,['id','viewport','safeArea','ua','dpr','scrollbar','assumptions','input','fontProfile']),'Unknown environment field');
  ensure(own(p.viewport,['min','max','height'])&&own(p.viewport.height,['min','max']),'Invalid viewport shape');
  ensure(p.input===undefined||['touch','mouse','keyboard','mixed'].includes(p.input),'Invalid input profile');
  ensure(p.fontProfile===undefined||id(p.fontProfile),'Invalid font profile');
  ensure(p.assumptions===undefined||Array.isArray(p.assumptions)&&p.assumptions.every(a=>typeof a==='string'&&a.trim()),'Invalid environment assumptions');
  for(const v of [p.viewport.min,p.viewport.max,p.viewport.height.min,p.viewport.height.max])q(v);
  if(p.scrollbar)ensure(own(p.scrollbar,['name','inlineSize','blockSize','thinInlineSize','thinBlockSize'])&&['thinInlineSize','thinBlockSize'].every(k=>p.scrollbar[k]===undefined||finite(p.scrollbar[k])),'Invalid scrollbar profile');
 }
 return immutable({version:1,kind:'environment',profiles});
}
export function createEvidenceIR(entries) {
 ensure(list(entries,4096),'Evidence limit exceeded');
 ensure(entries.every(e=>own(e,['state','profile','profileKey','target','source','assumptions','rows','reason','axes'])&&(e.axes===undefined||Array.isArray(e.axes)&&e.axes.length===1&&['inline','block'].includes(e.axes[0]))&&id(e.state)&&id(e.profile)&&id(e.target)&&['dom','local-dom','scene','external'].includes(e.source)&&Array.isArray(e.assumptions)&&e.assumptions.every(a=>typeof a==='string'&&a.trim())&&(e.source==='dom'||e.assumptions.length)),'Invalid geometry evidence');
 return immutable({version:1,kind:'evidence',entries});
}
export function createRelationalContractIR(input) {
 ensure(own(input,['component','profile','contracts','definitions'])&&input.profile==='relational/1'&&id(input.component)&&list(input.contracts,128)&&input.contracts.length,'Invalid relational contract');
 const defs=input.definitions??{};
 ensure(defs&&typeof defs==='object'&&!Array.isArray(defs)&&Object.keys(defs).length<=128,'Invalid predicate definitions');
 const contracts=input.contracts.map(c=>c?.kind==='predicate'?{...c,predicate:expandPredicate(c.predicate,defs,c.event)}:c);
 validateContracts(contracts);
 return immutable({version:1,kind:'contract',component:input.component,profile:{id:'relational/1'},contracts});
}
export function createRelationalObligationIR(contract,implementation) {
 ensure(contract?.kind==='contract'&&contract.version===1&&contract.profile?.id==='relational/1','Invalid relational ContractIR');
 contract=createRelationalContractIR({component:contract.component,profile:'relational/1',contracts:contract.contracts});
 ensure(implementation?.state?.kind==='state'&&implementation.environment?.kind==='environment'&&implementation.evidence?.kind==='evidence'&&[implementation.state,implementation.environment,implementation.evidence].every(v=>v.version===1),'Expected StateIR, EnvironmentIR and EvidenceIR');
 const state=createStateIR(implementation.state),environment=createEnvironmentIR(implementation.environment.profiles),evidence=createEvidenceIR(implementation.evidence.entries);
 const model={version:1,initial:state.initial,states:state.states,transitions:state.transitions,profiles:environment.profiles,contracts:contract.contracts};
 validateBindings(model);
 const cases=[];
 for(const p of environment.profiles){
  const reachable=reachableIn(model,p.id);
  for(const c of contract.contracts){
   if(c.profiles&&!c.profiles.includes(p.id))continue;
   const refs=ruleRefs(c,rulePredicate(c));
   const instances=c.event?reachable.edges.filter(t=>t.event===c.event):reachable.states.map(from=>({from}));
   for(const transition of instances)if(!c.states||c.states.includes(transition.from))cases.push({contract:c.id,profile:p.id,transition,targets:refs.map(([endpoint,target])=>({state:endpoint==='after'?transition.to:transition.from,target,endpoint}))});
  }
 }
 ensure(cases.length<=32768,'Relational obligation case limit exceeded');
 return immutable({version:1,kind:'obligation',operation:'relational',contract,implementation:{state,environment,evidence},cases});
}
function canonicalObligation(obligation){
 ensure(obligation?.operation==='relational'&&obligation.kind==='obligation'&&obligation.version===1,'Invalid relational ObligationIR');
 // Reconstruct at the serialized IR boundary: never trust edited obligation cases.
 return createRelationalObligationIR(obligation.contract,obligation.implementation);
}
function verifyCanonical(canonical,{observations=[]}={},cache,derived){
 const {state,environment,evidence}=canonical.implementation;
 const model={version:1,initial:state.initial,states:state.states,transitions:state.transitions,profiles:environment.profiles,contracts:canonical.contract.contracts};
 return {...evaluateRelational({model,evidence:evidence.entries,observations,compiledCases:canonical.cases,cache,derived}),operation:'relational',contract:canonical.contract,state,environment};
}
export function verifyRelationalObligation(obligation,options){
 return verifyCanonical(canonicalObligation(obligation),options);
}

/** A process-local proof session. External proof reports are never accepted.
 * Exact case dependencies permit reuse even when a different target ID is
 * bound to identical geometry. The original proof work charge is retained.
 */
export function createRelationalProofSession({maxEntries=1024,maxKeyBytes=4_000_000}={}){
 ensure(Number.isSafeInteger(maxEntries)&&maxEntries>0&&maxEntries<=16384&&Number.isSafeInteger(maxKeyBytes)&&maxKeyBytes>0&&maxKeyBytes<=64_000_000,'Invalid proof cache limits');
 const entries=new Map(),solverIds=new WeakMap();let size=0,hits=0,misses=0,evictions=0,nextSolver=0;
 const remove=k=>{size-=k.length*2;entries.delete(k)};
 const cache={
  get(k,remaining){
   if(!entries.has(k)||entries.get(k)>remaining){misses++;return undefined}
   const cost=entries.get(k);entries.delete(k);entries.set(k,cost);hits++;return cost;
  },
  set(k,cost){
   const bytes=k.length*2;if(bytes>maxKeyBytes)return;
   if(entries.has(k))remove(k);
   while(entries.size>=maxEntries||size+bytes>maxKeyBytes){remove(entries.keys().next().value);evictions++}
   entries.set(k,cost);size+=bytes;
  }
 };
 // Premises and goals are recompiled at their public IR boundaries. No
 // externally submitted proof, cache key or implication result is trusted.
 const verify=(obligation,options)=>verifyCanonical(canonicalObligation(obligation),options,cache);
 const compose=async(obligation,imports,api,options={})=>{
  const canonical=canonicalObligation(obligation);
  ensure(list(imports,32),'Composition import limit');
  const {environment,evidence}=canonical.implementation;
  const factKey=(s,p,t)=>JSON.stringify([s,p,t]);
  const index=facts=>new Map(facts.entries.map(e=>[factKey(e.state,e.profile,e.target),e]));
  const parentFacts=index(evidence),seenSources=new Map();
  const children=imports.map(item=>{
   ensure(own(item,['obligation','contract','bind'])&&id(item.contract)&&item.bind&&typeof item.bind==='object'&&!Array.isArray(item.bind)&&Object.entries(item.bind).every(([a,b])=>id(a)&&id(b)),'Invalid composition import');
   if(!seenSources.has(item.obligation)){
    const source=canonicalObligation(item.obligation);
    seenSources.set(item.obligation,{source,report:verifyCanonical(source,{},cache),facts:index(source.implementation.evidence)});
   }
   const {source,report,facts}=seenSources.get(item.obligation);
   const claim=source.contract.contracts.find(c=>c.id===item.contract);
   ensure(claim,'Unknown imported contract');
   const predicate=rulePredicate(claim);
   ensure(predicate&&!claim.event,'Only state-invariant linear predicates may be imported');
   const refs=ruleRefs(claim,predicate);
   ensure(refs.every(([endpoint,t])=>endpoint==='before'&&Object.hasOwn(item.bind,t))&&Object.keys(item.bind).length===new Set(refs.map(r=>r[1])).size,'Incomplete or extraneous target binding');
   const proof=report.contracts.find(c=>c.id===claim.id);
   return {source,claim,predicate,refs,proof,facts,bind:Object.fromEntries(Object.entries(item.bind))};
  });
  const derived=new Map(),implications=new Map();let solverCalls=0;
  const solver=api?.Context;
  if(typeof solver==='function'&&!solverIds.has(solver))solverIds.set(solver,++nextSolver);
  // Composition is an optimization: a failed implication never constitutes
  // an implementation counterexample. Check the original geometry instead.
  for(const goal of canonical.contract.contracts){
   const predicate=rulePredicate(goal);
   if(!predicate||goal.event)continue;
   const refs=ruleRefs(goal,predicate);
   for(const inst of canonical.cases.filter(c=>c.contract===goal.id)){
    const p=environment.profiles.find(p=>p.id===inst.profile),s=inst.transition.from;
    const premises=[],dependencies=[],assumptions=[],sources=[],covered=new Set();
    for(const child of children){
     const cp=child.source.implementation.environment.profiles.find(v=>v.id===p.id);
     if(!cp||JSON.stringify(cp)!==JSON.stringify(p))continue;
     const result=child.proof.cases.find(v=>v.state===s&&v.profile===p.id&&!v.event&&v.status==='verified'&&v.coverage?.status==='verified');
     if(!result)continue;
     const mapped=child.refs.map(([,t])=>[t,child.bind[t]]);
     if(!mapped.every(([from,to])=>{
      const a=child.facts.get(factKey(s,p.id,from)),b=parentFacts.get(factKey(s,p.id,to));
      return a&&b&&JSON.stringify(evidenceValue(a))===JSON.stringify(evidenceValue(b));
     }))continue;
     mapped.forEach(([,to])=>covered.add(to));
     premises.push(mapPredicate(child.predicate,t=>child.bind[t]));
     assumptions.push(...result.assumptions);sources.push(...result.sources);
     dependencies.push({component:child.source.contract.component,contract:child.claim.id,bind:child.bind});
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
 return Object.freeze({verify,compose,verifyUI:({observations=[],...input})=>verifyCanonical(uiObligation(input),{observations},cache),stats:()=>({entries:entries.size,keyBytes:size,hits,misses,evictions}),clear:()=>{entries.clear();size=0;hits=misses=evictions=0}});
}
function uiObligation({model,evidence=[]}) {
 ensure(own(model,['version','component','initial','states','transitions','profiles','contracts','definitions'])&&model.version===1,'Invalid UI model version/fields');
 const {initial,states,transitions,profiles,contracts,definitions}=model;
 const contract=createRelationalContractIR({component:model.component??'Document',profile:'relational/1',contracts,definitions});
 return createRelationalObligationIR(contract,{state:createStateIR({initial,states,transitions}),environment:createEnvironmentIR(profiles),evidence:createEvidenceIR(evidence)});
}
export function verifyUI({observations=[],...input}){
 return verifyCanonical(uiObligation(input),{observations});
}
/** Existing LayoutIR -> evidence, independent of the authored contract.
 * Environment binding is trusted: the report does not contain every UA/font
 * setting. The adapter that ran the analysis supplies the actual profile.
 */
export function layoutGeometry({state,profile,layout,targets,local,paths={}}) {
 ensure(list(targets,128)&&targets.every(id)&&unique(targets),'Invalid DOM targets');
 if(local)ensure(Array.isArray(local.assumptions)&&local.assumptions.length&&local.assumptions.every(a=>typeof a==='string'&&a.trim()),'Local geometry needs boundary assumptions');
 return targets.map(target=>{
  const base={state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:[...(layout.assumptions??[]),'LayoutIR is bound by the producer to the declared UA, fonts, viewport, safe insets and platform profile.',...(local?.assumptions??[])]};
  if(layout.kind!=='layout'||layout.version!==1||!layout.geometryComplete||layout.cases.length!==1||layout.scope.hostInset||layout.scope.hostBlockInset)return {...base,reason:'CSS geometry incomplete or not a single closed layout case: '+(layout.diagnostics?.[0]?.message??'model incomplete')};
  const actual=layout.scope.scrollbarProfiles;
  const expected=profile.scrollbar??{name:'overlay',inlineSize:0,blockSize:0};
  if(actual?.length&&(actual.length!==1||['name','inlineSize','blockSize','thinInlineSize','thinBlockSize'].some(k=>actual[0][k]!==expected[k])))return {...base,reason:'layout scrollbar profile differs from environment'};
  const candidates=[...new Set(layout.elements.filter(e=>Object.hasOwn(paths,target)?e.path===paths[target]:e.id===target||e.targets?.includes(target)&&e.targetIdentity!=='unknown').map(e=>e.path))];
  if(candidates.length!==1)return {...base,reason:'DOM target not unique'};
  try{
   const rows=layout.boxes.filter(r=>r.path===candidates[0]&&r.rect).map(r=>{
    const constraints=[...(r.region?.constraints??[])];
    for(const [axis,range] of [['coefficient',r.range],['heightCoefficient',r.heightRange]]){
     if(!range)throw Error('Missing range');
     constraints.push({coefficient:'0',heightCoefficient:'0',[axis]:'1',constant:exact(sub(zero,read(range.minExact))),strict:!range.minInclusive},{coefficient:'0',heightCoefficient:'0',[axis]:'-1',constant:range.maxExact,strict:!range.maxInclusive});
    }
    const rect={...r.rect};
    if(local?.origin)for(const k of ['inlineStart','blockStart'])rect[k]=serializeAffine(sum(affine(rect[k]),affine(local.origin[k])));
    return {rect,constraints};
   });
   return {...base,rows};
  }catch(e){return {...base,reason:'CSS rectangle extraction: '+e.message}}
 });
}
