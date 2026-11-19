// Explicit snapshot contracts. Reuse the core's exact convex-region arithmetic;
// unlike sampling, this checks the full two-dimensional domain, including edges.
import {parse} from 'parse5';
import {q,exact} from '@mizchi/veriss/src/layout/linear.mjs';
import {rational} from '@mizchi/veriss/src/layout/smt.mjs';
import {rectangle,clip,partition,scalar,width,height,diff,sum,sample,evaluate,times} from '@mizchi/veriss/src/layout/region.mjs';

const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const affine=a=>({x:rational(a.coefficient),y:rational(a.heightCoefficient??'0'),b:rational(a.constant)});
const constraints=(row)=>{
  const out=[];
  for(const [axis,r] of [[width,row.range],[height,row.heightRange]]) {
    if(!r) throw Error('missing two-axis layout region');
    out.push([diff(axis,scalar(rational(r.minExact))),!r.minInclusive],[diff(scalar(rational(r.maxExact)),axis),!r.maxInclusive]);
  }
  for(const c of row.region?.constraints??[]) out.push([affine(c),c.strict]);
  return out;
};
const cut=(region,conditions)=>conditions.reduce((r,[a,s])=>r&&clip(r,a,s),region);
function subtract(region,conditions) {
  const out=[];let remaining=region;
  for(const [a,s] of conditions) {
    if(!remaining) break;
    const p=partition(remaining,a,s?'>':'>=');
    out.push(...p.no);remaining=p.yes[0];
  }
  return out;
}
const axes=['inlineStart','blockStart','inlineSize','blockSize'];
const describe=c=>JSON.stringify(c);
const sameChoices=(a,b,on)=>!on.length||Object.keys({...a,...b}).every(k=>a[k]===b[k]||on.includes(k));
const neg=a=>times(a,q(-1));
const rectOf=r=>Object.fromEntries(axes.map(k=>[k,affine(r.rect[k])]));
const side=(r,axis)=>sum(r[axis+'Start'],r[axis+'Size']);
function marks(html,name) {
  const ids=new Map(), shifts=new Map();
  const visit=(n,path)=>{
    if(n.tagName) {
      for(const [map,label] of [[ids,attr(n,'id')],[shifts,attr(n,'data-noshift')]]) if(label!==undefined) {
        const entries=map.get(label)??[];
        entries.push({path,on:(attr(n,'data-noshift-on')??'').split(/\s+/).filter(Boolean)});
        map.set(label,entries);
      }
    }
    (n.childNodes??[]).filter(c=>c.tagName&&!(n.tagName==='html'&&c.tagName==='head')).forEach((c,i)=>visit(c,path+'/'+i));
  };
  visit(parse(html).childNodes.find(n=>n.tagName==='html'),name);
  return {ids,shifts};
}
function getRows(state,entry,domain) {
  if(entry?.length!==1||state.report.status!=='verified') throw Error('element not uniquely modeled in a verified state');
  const rows=(state.report.sizes??[]).filter(r=>r.path===entry[0].path&&r.rect).map(r=>({conditions:constraints(r),rect:rectOf(r)}));
  if(!rows.length||rows.length>256) throw Error('missing rectangle or region limit exceeded');
  let gaps=[domain];
  for(const row of rows) {
    gaps=gaps.flatMap(g=>subtract(g,row.conditions));
    if(gaps.length>256) throw Error('coverage limit exceeded');
    if(!gaps.length) break;
  }
  if(gaps.length) throw Error('rectangle does not cover the full viewport domain');
  return rows;
}
export function snapshotContracts(results,{name,viewport,contracts=[],scrollbars,devicePixelRatios,safeArea,hostInset,hostBlockInset}) {
  const findings=[],unknowns=[];
  const states=results.map(s=>({...s,...marks(s.html,name)}));
  const keys=new Set(states.flatMap(s=>[...s.shifts.keys()]));
  const unknown=(label,reason)=>unknowns.push({code:'U_SNAPSHOT_CONTRACT',message:label+': '+reason});
  if(!keys.size&&!contracts.length) return {findings,unknowns};
  if(!viewport?.height||(scrollbars?.length??0)>1||(devicePixelRatios?.length??0)>1||hostInset||hostBlockInset){
    unknown('snapshot geometry','requires two viewport axes, zero host insets and one scrollbar/DPR profile');return {findings,unknowns};
  }
  const domain=rectangle({min:q(viewport.min),max:q(viewport.max)},{min:q(viewport.height.min),max:q(viewport.height.max)});
  let budget=20000;
  function findFailure(rowsA,rowsB,predicates) {
    for(const a of rowsA) for(const b of rowsB) {
      if(--budget<0) throw Error('contract comparison budget exceeded');
      const common=cut(domain,[...a.conditions,...b.conditions]);if(!common) continue;
      for(const predicate of predicates(a.rect,b.rect)) {
        const bad=cut(common,predicate);
        if(bad) return sample(bad);
      }
    }
    return null;
  }
  function check(label,code,pairs,predicates) {
    let incomplete;
    for(const [a,ea,b,eb] of pairs) try {
      const aa=getRows(a,ea,domain),bb=getRows(b,eb,domain);
      const witness=findFailure(aa,bb,predicates);
      if(witness) {
        findings.push({code,severity:'error',box:label,rule:'snapshot-contract',states:a===b?[a.choices]:[a.choices,b.choices],html:a.html,
          message:label+' violates its geometry contract at viewport '+exact(witness.x)+'px × '+exact(witness.y)+'px in '+describe(a.choices)+(a===b?'':' and '+describe(b.choices))});
        return;
      }
    } catch(e) {incomplete??=e.message}
    if(incomplete||!pairs.length) unknown(label,incomplete??'no comparable supplied state pair');
  }
  for(const key of keys) {
    const label='[data-noshift="'+key+'"]',holding=states.filter(s=>s.shifts.has(key));
    if(!key.trim()||holding.some(s=>s.shifts.get(key).length!==1||s.shifts.get(key)[0].path===name)){
      unknown(label,'requires a unique nonempty name on a non-root element');continue;
    }
    const pairs=[];
    for(let i=0;i<holding.length;i++) for(let j=i+1;j<holding.length;j++) {
      const a=holding[i],b=holding[j],ea=a.shifts.get(key),eb=b.shifts.get(key);
      if(sameChoices(a.choices,b.choices,[...ea[0].on,...eb[0].on])) pairs.push([a,ea,b,eb]);
    }
    check(label,'E_LAYOUT_NOSHIFT',pairs,(a,b)=>axes.flatMap(k=>{const d=diff(a[k],b[k]);return [[[d,true]],[[neg(d),true]]]}));
  }
  for(const c of contracts) {
    const label=c.kind+' #'+c.target+(c.other?' / #'+c.other:'');
    const pairs=states.filter(s=>!c.when||Object.entries(c.when).every(([k,v])=>s.choices[k]===v)).map(s=>[s,s.ids.get(c.target),s,c.kind==='within-viewport'?s.ids.get(c.target):s.ids.get(c.other)]);
    const bounds=(a,b)=>['inline','block'].flatMap(k=>[[[diff(b[k+'Start'],a[k+'Start']),true]],[[diff(side(a,k),side(b,k)),true]]]);
    const viewportRect={inlineStart:scalar(safeArea?.left??0),blockStart:scalar(safeArea?.top??0),inlineSize:diff(width,scalar((safeArea?.left??0)+(safeArea?.right??0))),blockSize:diff(height,scalar((safeArea?.top??0)+(safeArea?.bottom??0)))};
    const predicates=c.kind==='within-viewport'?a=>bounds(a,viewportRect):c.kind==='contains'?(a,b)=>bounds(b,a):
      (a,b)=>[[...['inline','block'].flatMap(k=>[[diff(side(a,k),b[k+'Start']),true],[diff(side(b,k),a[k+'Start']),true],[a[k+'Size'],true],[b[k+'Size'],true]])]];
    check(label,'E_SNAPSHOT_CONTRACT',pairs,predicates);
  }
  return {findings,unknowns};
}
