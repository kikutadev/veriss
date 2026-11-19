// Game UI contracts over a finite declared state graph and exact piecewise-affine
// CSS-pixel geometry. Runtime observations are intentionally not proof evidence.
import {analyzeHTML} from '@mizchi/veriss/html';
import {q,exact,cmp,sub} from '@mizchi/veriss/src/layout/linear.mjs';
import {rational} from '@mizchi/veriss/src/layout/smt.mjs';
import {rectangle,clip,partition,scalar,width,height,diff,sum,sample,evaluate,times,affine as serializeAffine} from '@mizchi/veriss/src/layout/region.mjs';
import {occupancyFailure} from './game-ui-occupancy.mjs';

const zero=q(0), neg=a=>times(a,q(-1));
const axes=['inlineStart','blockStart','inlineSize','blockSize'];
const read=v=>rational(v);
const affine=a=>({x:read(a.coefficient),y:read(a.heightCoefficient??'0'),b:read(a.constant)});
const end=(r,k)=>sum(r[k+'Start'],r[k+'Size']);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128;
const ensure=(v,msg)=>{if(!v)throw new TypeError(msg)};
const list=(v,max)=>Array.isArray(v)&&v.length<=max;
const unique=v=>new Set(v).size===v.length;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e6;
const range=r=>r&&finite(r.min)&&finite(r.max)&&r.min>0&&r.min<=r.max;
const cond=(r,cs)=>cs.reduce((out,[a,s])=>out&&clip(out,a,s),r);
const profileKey=p=>JSON.stringify([p.viewport.min,p.viewport.max,p.viewport.height.min,p.viewport.height.max,...['top','right','bottom','left'].map(k=>p.safeArea?.[k]??0),p.ua??'chromium',p.dpr??null,p.scrollbar?.name??'overlay',p.scrollbar?.inlineSize??0,p.scrollbar?.blockSize??0,p.scrollbar?.thinInlineSize??null,p.scrollbar?.thinBlockSize??null]);
const domainOf=p=>rectangle({min:q(p.viewport.min),max:q(p.viewport.max)},{min:q(p.viewport.height.min),max:q(p.viewport.height.max)});
function minusRegion(region,cs) {
  let rem=region;const out=[];
  for(const [a,s] of cs){if(!rem)break;const p=partition(rem,a,s?'>':'>=');out.push(...p.no);rem=p.yes[0]}
  return out;
}
const bounds=(a,b)=>['inline','block'].flatMap(k=>[[[diff(b[k+'Start'],a[k+'Start']),true]],[[diff(end(a,k),end(b,k)),true]]]);
const overlap=(a,b)=>[['inline','block'].flatMap(k=>[[diff(end(a,k),b[k+'Start']),true],[diff(end(b,k),a[k+'Start']),true],[a[k+'Size'],true],[b[k+'Size'],true]])];
const equal=(a,b)=>axes.flatMap(k=>{const d=diff(a[k],b[k]);return [[[d,true]],[[neg(d),true]]]});
function safeRect(p) {
  const s=p.safeArea??{},x=s.left??0,y=s.top??0;
  return {inlineStart:scalar(x),blockStart:scalar(y),inlineSize:diff(width,sum(scalar(x),scalar(s.right??0))),blockSize:diff(height,sum(scalar(y),scalar(s.bottom??0)))};
}
function validate(model) {
  ensure(model?.version===1&&list(model.states,64)&&model.states.every(id)&&unique(model.states)&&model.states.includes(model.initial),'Invalid state graph');
  ensure(list(model.transitions,256)&&model.transitions.every(t=>t&&model.states.includes(t.from)&&model.states.includes(t.to)&&id(t.event))&&unique(model.transitions.map(t=>JSON.stringify([t.from,t.event,t.to]))),'Invalid transitions');
  ensure(list(model.profiles,16)&&model.profiles.length&&unique(model.profiles.map(p=>p?.id))&&model.profiles.every(p=>id(p.id)&&range(p.viewport)&&range(p.viewport.height)&&Object.entries(p.safeArea??{}).every(([k,v])=>['left','right','top','bottom'].includes(k)&&Number.isInteger(v)&&v>=0&&v<=200)&&((p.safeArea?.left??0)+(p.safeArea?.right??0)<p.viewport.min)&&((p.safeArea?.top??0)+(p.safeArea?.bottom??0)<p.viewport.height.min)&&(!p.ua||['chromium','firefox','webkit'].includes(p.ua))&&(p.dpr===undefined||typeof p.dpr==='number'&&p.dpr>0&&p.dpr<100&&/^\d{1,2}(?:\.\d{1,3})?$/.test(String(p.dpr)))&&(p.scrollbar===undefined||p.scrollbar&&id(p.scrollbar.name)&&finite(p.scrollbar.inlineSize)&&finite(p.scrollbar.blockSize))),'Invalid profiles');
  ensure(list(model.contracts,128)&&model.contracts.length&&unique(model.contracts.map(c=>c?.id)),'Invalid contracts');
  for(const c of model.contracts) {
    ensure(c&&id(c.id)&&['within-viewport','contains','disjoint','min-size','stable','max-occupancy','action'].includes(c.kind),'Invalid contract kind');
    ensure((c.kind==='action'||id(c.target))&&(!['contains','disjoint'].includes(c.kind)||(id(c.other)&&c.target!==c.other))&&(!['stable','action'].includes(c.kind)||id(c.event)),'Invalid contract targets/event');
    ensure(c.states===undefined||(list(c.states,64)&&c.states.every(s=>model.states.includes(s))&&unique(c.states)),'Invalid contract states');
    if(c.kind==='min-size')ensure(finite(c.width)&&finite(c.height),'Invalid minimum size');
    if(c.kind==='max-occupancy')ensure(list(c.overlays,4)&&c.overlays.length&&c.overlays.every(id)&&unique(c.overlays)&&!c.overlays.includes(c.target)&&cmp(read(c.max),zero)>=0&&cmp(read(c.max),q(1))<=0,'Invalid occupancy');
  }
}
function prepare(entry,domain,budget) {
  if(!entry)throw Error('missing geometry evidence');
  if(entry.reason)throw Error(entry.reason);
  if(!entry.rows?.length||entry.rows.length>128)throw Error('geometry row limit or empty geometry');
  const rows=entry.rows.map(row=>{
    if(!list(row.constraints??[],64))throw Error('region constraint limit');
    const cs=(row.constraints??[]).map(c=>{if(typeof c.strict!=='boolean')throw Error('invalid strict constraint');return [affine(c),c.strict]});
    const rect=Object.fromEntries(axes.map(k=>[k,affine(row.rect[k])]));
    return {cs,rect,region:cond(domain,cs)};
  }).filter(r=>r.region);
  let gaps=[domain];
  for(const row of rows){
    if((budget.left-=gaps.length*Math.max(1,row.cs.length))<0)throw Error('coverage budget exceeded');
    gaps=gaps.flatMap(g=>minusRegion(g,row.cs));if(gaps.length>256)throw Error('coverage region limit exceeded');
    for(const k of ['inlineSize','blockSize'])if(clip(row.region,neg(row.rect[k]),true))throw Error('negative rectangle dimension');
    if(!gaps.length)break;
  }
  if(gaps.length)throw Error('geometry does not cover profile');
  // Even redundant rows must have valid dimensions and agree on shared domains.
  for(let i=0;i<rows.length;i++){
    const a=rows[i];
    for(const k of ['inlineSize','blockSize'])if(clip(a.region,neg(a.rect[k]),true))throw Error('negative rectangle dimension');
    for(const b of rows.slice(i+1)){
      if(--budget.left<0)throw Error('consistency budget exceeded');
      const both=cond(a.region,b.cs);
      if(both&&equal(a.rect,b.rect).some(p=>cond(both,p)))throw Error('contradictory geometry');
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
function observedGeometry(c, p, observations, instances) {
  const out=[];
  if(c.kind==='action')return out;
  const point=o=>({x:q(o.width),y:q(o.height)});
  const rect=(o,target)=>{
    const r=o.rects?.[target];if(!r)return null;
    return Object.fromEntries(axes.map((k,i)=>[k,scalar(q(r[['x','y','width','height'][i]]))]));
  };
  const candidates=observations.filter(o=>o.profile===p.id&&o.rects);
  for(const t of instances)for(const o of candidates.filter(o=>o.state===t.from)){
    try{
      const a=rect(o,c.target);
      const matches=c.kind==='stable'?candidates.filter(n=>n.state===t.to&&n.width===o.width&&n.height===o.height):[o];
      if(matches.length!==1){out.push({status:'unknown',sample:o,reason:'stable observation requires one matching endpoint at the same viewport'});continue;}
      const after=matches[0];
      const b=c.kind==='stable'?after&&rect(after,c.target):c.other?rect(o,c.other):null;
      const overlays=c.overlays?.map(k=>rect(o,k));
      if(!a||(c.kind==='stable'||c.other)&&!b||overlays?.some(v=>!v)){out.push({status:'unknown',sample:o,reason:'missing sampled target or matching endpoint'});continue;}
      const at=point(o);
      const predicates=c.kind==='within-viewport'?bounds(a,safeRect(p)):c.kind==='contains'?bounds(b,a):c.kind==='disjoint'?overlap(a,b):c.kind==='stable'?equal(a,b):c.kind==='min-size'?[[[diff(scalar(c.width),a.inlineSize),true]],[[diff(scalar(c.height),a.blockSize),true]]]:null;
      const failed=predicates?predicates.some(cs=>cs.every(([v,strict])=>cmp(evaluate(v,at),zero)>=(strict?1:0))):!!occupancyFailure(rectangle({min:at.x,max:at.x},{min:at.y,max:at.y}),a,overlays,read(c.max),{left:30000});
      out.push({status:failed?'failed':'passed',sample:o,...(c.kind==='stable'?{after}: {})});
    }catch(e){out.push({status:'unknown',sample:o,reason:e.message})}
  }
  return out;
}
export function verifyGameUI({model,evidence=[],observations=[]}) {
  validate(model);
  ensure(list(evidence,4096)&&list(observations,4096),'Evidence limit exceeded');
  const key=(s,p,t)=>JSON.stringify([s,p,t]);
  const entries=new Map(), assumptions=new Set(['Declared state graph and supplied geometry are trusted abstractions of implementation; profiles describe unscrolled CSS pixels, not paint or hit testing. DOM evidence uses a closed author cascade and the declared scrollbar profile (overlay by default).']);
  for(const e of evidence) {
    ensure(e&&model.states.includes(e.state)&&model.profiles.some(p=>p.id===e.profile)&&id(e.target)&&['dom','local-dom','scene'].includes(e.source)&&Array.isArray(e.assumptions)&&e.assumptions.every(a=>typeof a==='string'&&a.trim())&&(e.source==='dom'||e.assumptions.length),'Invalid geometry evidence');
    const p=model.profiles.find(p=>p.id===e.profile);
    ensure(e.profileKey===undefined||e.profileKey===profileKey(p),'Geometry evidence profile mismatch');
    const k=key(e.state,e.profile,e.target);
    ensure(!entries.has(k),'Duplicate geometry evidence');entries.set(k,e);
  }
  const reachable=[model.initial],seen=new Set(reachable);
  for(const s of reachable)for(const t of model.transitions)if(t.from===s&&!seen.has(t.to)){seen.add(t.to);reachable.push(t.to)}
  const edges=model.transitions.filter(t=>seen.has(t.from));
  for(const o of observations){
    ensure(o&&model.states.includes(o.state)&&model.profiles.some(p=>p.id===o.profile&&finite(o.width)&&finite(o.height)&&o.width>=p.viewport.min&&o.width<=p.viewport.max&&o.height>=p.viewport.height.min&&o.height<=p.viewport.height.max),'Invalid observation position');
    ensure((o.event!==undefined||o.rects!==undefined)&&(o.event===undefined||id(o.event)&&typeof o.passed==='boolean'&&(o.to===undefined||model.states.includes(o.to))),'Invalid observation action');
    if(o.rects!==undefined)ensure(o.rects&&Object.getPrototypeOf(o.rects)===Object.prototype&&Object.entries(o.rects).every(([k,r])=>id(k)&&r&&['x','y','width','height'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&Math.abs(r[k])<=1e6&&(k==='x'||k==='y'||r[k]>=0))),'Invalid observed rectangles');
  }
  const reports=model.contracts.map(c=>{
    const cases=[],observed=[];
    const applicable=s=>!c.states||c.states.includes(s);
    for(const p of model.profiles) {
      const domain=domainOf(p),budget={left:30000};
      const instances=['stable','action'].includes(c.kind)?edges.filter(t=>t.event===c.event&&applicable(t.from)):reachable.filter(applicable).map(s=>({from:s}));
      observed.push(...observedGeometry(c,p,observations,instances));
      for(const t of instances){
        const base={state:t.from,profile:p.id,...(t.to?{to:t.to,event:t.event}:{})};
        if(c.kind==='action'){
          const samples=observations.filter(o=>o.state===t.from&&o.profile===p.id&&o.event===t.event);
          // A nondeterministic event may reach any declared successor.
          for(const o of samples)if(!observed.some(x=>x.sample===o)){
            const allowed=edges.some(e=>e.from===o.state&&e.event===o.event&&e.to===o.to);
            observed.push({status:o.passed&&allowed?'passed':'failed',sample:o});
          }
          cases.push({...base,status:'unknown',reason:'action reachability requires runtime evidence; sampling cannot prove all inputs'});continue;
        }
        const targets=[[t.from,c.target],...(c.kind==='stable'?[[t.to,c.target]]:c.other?[[t.from,c.other]]:c.overlays?c.overlays.map(o=>[t.from,o]):[])];
        const used=targets.map(([s,target])=>entries.get(key(s,p.id,target)));
        const localAssumptions=[...new Set(used.flatMap(e=>e?.assumptions??[]))];localAssumptions.forEach(a=>assumptions.add(a));
        const meta={...base,sources:used.map(e=>e?.source??'missing'),assumptions:localAssumptions};
        try{
          const groups=used.map(e=>prepare(e,domain,budget));
          const bad=cross(domain,groups,budget,(reg,[a,b,...rest])=>{
            if(c.kind==='max-occupancy')return occupancyFailure(reg,a,[b,...rest],read(c.max),budget);
            const predicates=c.kind==='within-viewport'?bounds(a,safeRect(p)):c.kind==='contains'?bounds(b,a):c.kind==='disjoint'?overlap(a,b):c.kind==='stable'?equal(a,b):[[[diff(scalar(c.width),a.inlineSize),true]],[[diff(scalar(c.height),a.blockSize),true]]];
            for(const predicate of predicates){const failure=cond(reg,predicate);if(failure)return sample(failure)}
            return null;
          });
          cases.push({...meta,status:bad?'violated':'verified',...(bad?{witness:{width:exact(bad.x),height:exact(bad.y)}}:{})});
        }catch(e){cases.push({...meta,status:'unknown',reason:e.message})}
      }
    }
    const status=cases.some(c=>c.status==='violated')?'violated':!cases.length||cases.some(c=>c.status==='unknown')?'unknown':'verified';
    return {id:c.id,kind:c.kind,status,cases,observations:observed,...(!cases.length?{reason:'no reachable applicable state or transition'}:{})};
  });
  const status=reports.some(r=>r.status==='violated')?'violated':reports.some(r=>r.status==='unknown')?'unknown':'verified';
  const observationStatus=reports.some(r=>r.observations.some(o=>o.status==='failed'))?'failed':reports.some(r=>r.observations.some(o=>o.status==='unknown'))?'incomplete':reports.some(r=>r.observations.length)?'sampled':'not-run';
  const observationCoverage=model.profiles.flatMap(p=>reachable.map(state=>({state,profile:p.id,samples:observations.filter(o=>o.state===state&&o.profile===p.id).length})));
  return {version:1,status,observationCoverage,outcome:status==='violated'||observationStatus==='failed'?'failed':status==='unknown'||observationStatus==='incomplete'?'unknown':'verified',reachable,unreachable:model.states.filter(s=>!seen.has(s)),assumptions:[...assumptions],contracts:reports,observationStatus};
}
// Derive evidence from CSS analysis, not the contract. Local documents are an
// explicit environment assumption, never automatically sliced from arbitrary CSS.
export function domGeometry({state,profile,html,css,targets,local,boxes,knownFonts,defaultFontSize}) {
  ensure(list(targets,128)&&targets.every(id)&&unique(targets),'Invalid DOM targets');
  if(local)ensure(Array.isArray(local.assumptions)&&local.assumptions.length&&local.assumptions.every(a=>typeof a==='string'&&a.trim()),'Local geometry needs boundary assumptions');
  let result;
  try{result=analyzeHTML(html,{css,viewport:profile.viewport,safeArea:profile.safeArea??{},...(profile.ua?{ua:profile.ua}:{}),scripting:'enabled',...(boxes?{boxes}:{}),...(knownFonts?{knownFonts}:{}),...(defaultFontSize?{defaultFontSize}:{}),scrollbars:[profile.scrollbar??{name:'overlay',inlineSize:0,blockSize:0}],...(profile.dpr?{devicePixelRatios:[profile.dpr]}:{})});}catch(e){return targets.map(target=>({state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:local?.assumptions??[],reason:'CSS model refused input: '+e.message}))}
  return targets.map(target=>{
    const base={state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:[...(result.assumptions??[]),...(local?.assumptions??[])]};
    if(result.status!=='verified')return {...base,reason:'CSS geometry '+result.status+': '+(result.diagnostics?.[0]?.message??'no complete model')};
    const paths=[...new Set((result.elements??[]).filter(e=>e.id===target).map(e=>e.path))];
    if(paths.length!==1)return {...base,reason:'DOM target not unique'};
    try{const rows=(result.sizes??[]).filter(r=>r.path===paths[0]&&r.rect).map(r=>{
      const constraints=[...(r.region?.constraints??[])];
      for(const [axis,range] of [['coefficient',r.range],['heightCoefficient',r.heightRange]]){
        if(!range)throw Error('Missing range');
        constraints.push({coefficient:'0',heightCoefficient:'0',[axis]:'1',constant:exact(sub(zero,read(range.minExact))),strict:!range.minInclusive},{coefficient:'0',heightCoefficient:'0',[axis]:'-1',constant:range.maxExact,strict:!range.maxInclusive});
      }
      const rect={...r.rect};
      if(local?.origin)for(const k of ['inlineStart','blockStart'])rect[k]=serializeAffine(sum(affine(rect[k]),affine(local.origin[k])));
      return {rect,constraints};
    });
    return {...base,rows};}catch(e){return {...base,reason:'CSS rectangle extraction: '+e.message}}
  });
}
