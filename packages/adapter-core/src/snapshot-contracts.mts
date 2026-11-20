// Snapshot syntax adapter. Geometry coverage, relation predicates and witnesses
// are handled by the same public relational ContractIR profile as other UIs.
import {parse, type DefaultTreeAdapterTypes as Tree} from 'parse5';
import type {LayoutOptions} from '../../veriss/src/layout-contracts.d.ts';
import type {EnvironmentProfile, GeometryEvidence, Relation, UIModel, LayoutIR} from '@mizchi/veriss/contracts';
import type {AnalyzedState, Choices, ContractFinding, ContractUnknown} from './noshift.mjs';

interface Entry {path: string; on: string[]}
type MarkMap = Map<string, Entry[]>;
type SnapshotState = AnalyzedState & {id: string; ids: MarkMap; shifts: MarkMap};
type Pair = [SnapshotState, Entry[] | undefined, SnapshotState, Entry[] | undefined];
export type SnapshotContract = ({kind:'within-viewport'; target:string; other?:never} | {kind:'contains'|'disjoint'; target:string; other:string}) & {when?:Choices};
export interface SnapshotOptions {
  name: string; viewport?: LayoutOptions['viewport']; contracts?: SnapshotContract[];
  scrollbars?: LayoutOptions['scrollbars']; devicePixelRatios?: readonly number[];
  safeArea?: EnvironmentProfile['safeArea']; hostInset?:number; hostBlockInset?:number; ua?:EnvironmentProfile['ua'];
}

import {createLayoutIR,layoutGeometry,createRelationalProofSession} from '@mizchi/veriss/contracts';

const attr=(n:Tree.Element,k:string)=>n.attrs.find(a=>a.name===k)?.value;
const describe=(c:Choices)=>JSON.stringify(c);
const sameChoices=(a:Choices,b:Choices,on:string[])=>!on.length||Object.keys({...a,...b}).every(k=>a[k]===b[k]||on.includes(k));
function marks(html:string,name:string) {
  const ids:MarkMap=new Map(), shifts:MarkMap=new Map();
  const visit=(n:Tree.Element,path:string)=>{
    if(n.tagName) {
      const labels: [MarkMap,string|undefined][] = [[ids,attr(n,'id')],[shifts,attr(n,'data-noshift')]];
      for(const [map,label] of labels) if(label!==undefined) {
        const entries=map.get(label)??[];
        entries.push({path,on:(attr(n,'data-noshift-on')??'').split(/\s+/).filter(Boolean)});
        map.set(label,entries);
      }
    }
    (n.childNodes??[]).filter((c):c is Tree.Element=>'tagName' in c&&!(n.tagName==='html'&&c.tagName==='head')).forEach((c,i)=>visit(c,path+'/'+i));
  };
  const root=parse(html).childNodes.find((n):n is Tree.Element=>'tagName' in n && n.tagName==='html');
  if(!root)throw Error('Missing HTML root');
  visit(root,name);
  return {ids,shifts};
}
export function snapshotContracts(results:AnalyzedState[],{name,viewport,contracts=[],scrollbars,devicePixelRatios,safeArea,hostInset,hostBlockInset,ua}:SnapshotOptions) {
  const findings:ContractFinding[]=[],unknowns:ContractUnknown[]=[];
  const states=results.map((s,i)=>({...s,...marks(s.html,name),id:'s'+i}));
  const keys=new Set(states.flatMap(s=>[...s.shifts.keys()]));
  const unknown=(label:string,reason:string)=>unknowns.push({code:'U_SNAPSHOT_CONTRACT',message:label+': '+reason});
  if(!keys.size&&!contracts.length) return {findings,unknowns};
  if(!viewport?.height||(scrollbars?.length??0)>1||(devicePixelRatios?.length??0)>1||hostInset||hostBlockInset){
    unknown('snapshot geometry','requires two viewport axes, zero host insets and one scrollbar/DPR profile');return {findings,unknowns};
  }
  const profile:EnvironmentProfile={id:'snapshot',viewport:{...viewport,height:viewport.height},...(safeArea?{safeArea}:{}),...(ua?{ua}:{}),...(scrollbars?.[0]?{scrollbar:scrollbars[0]}:{}),...(devicePixelRatios?.[0]!==undefined?{dpr:devicePixelRatios[0]}:{})};
  const layouts=new Map<string,LayoutIR>(),session=createRelationalProofSession();
  function evidence(s:SnapshotState,entries:Record<string,Entry[]|undefined>):GeometryEvidence[] {
    try{
      let layout=layouts.get(s.id);
      if(!layout){layout=createLayoutIR(s.report);layouts.set(s.id,layout)}
      const targets=Object.keys(entries),paths:Record<string,string>={};
      for(const k of targets){const es=entries[k];if(es?.length===1&&es[0])paths[k]=es[0].path}
      return layoutGeometry({state:s.id,profile,layout,targets:targets.filter(k=>Object.hasOwn(paths,k)),paths});
    }catch{return []}
  }
  let budget=20000;
  function check(label:string,code:string,pairs:Pair[],kind:SnapshotContract['kind']|'stable') {
    let incomplete:string|undefined;
    // Each pair is an independent obligation. The full snapshot analyzer
    // preserves the original choices; no arbitrary JS reachability is inferred.
    for(const [a,ea,b,eb] of pairs) try {
      if(--budget<0)throw Error('snapshot comparison limit exceeded');
      const transition=kind==='stable',same=a===b;
      const base={id:'snapshot',target:'one',states:[a.id]};
      const contract:Relation=kind==='stable'?{...base,kind,event:'compare'}:kind==='within-viewport'?{...base,kind}:{...base,kind,other:'two'};
      const model:UIModel={version:1,initial:a.id,states:same?[a.id]:[a.id,b.id],transitions:transition?[{from:a.id,event:'compare',to:b.id}]:[],profiles:[profile],contracts:[contract]};
      const facts=transition?[...evidence(a,{one:ea}),...evidence(b,{one:eb})]:evidence(a,kind==='within-viewport'?{one:ea}:{one:ea,two:eb});
      const result=session.verifyUI({model,evidence:facts}).contracts[0];
      if(!result)throw Error('No relational proof result');
      const witness=result.cases.find(c=>c.witness)?.witness;
      if(witness) {
        findings.push({code,severity:'error',box:label,rule:'snapshot-contract',states:same?[a.choices]:[a.choices,b.choices],html:a.html,
          message:label+' violates its geometry contract at viewport '+witness.width+'px × '+witness.height+'px in '+describe(a.choices)+(same?'':' and '+describe(b.choices))});
        return;
      }
      if(result.status!=='verified')incomplete??=result.cases.find(c=>c.reason)?.reason??'incomplete relational proof';
    } catch(e) {incomplete??=e instanceof Error?e.message:String(e)}
    if(incomplete||!pairs.length)unknown(label,incomplete??'no comparable supplied state pair');
  }
  for(const key of keys) {
    const label='[data-noshift="'+key+'"]',holding=states.filter(s=>s.shifts.has(key));
    if(!key.trim()||holding.some(s=>s.shifts.get(key)?.length!==1||s.shifts.get(key)?.[0]?.path===name)){
      unknown(label,'requires a unique nonempty name on a non-root element');continue;
    }
    const pairs:Pair[]=[];
    for(let i=0;i<holding.length;i++)for(let j=i+1;j<holding.length;j++){
      const a=holding[i],b=holding[j];
      if(!a||!b)throw Error('Missing snapshot state');
      const ea=a.shifts.get(key),eb=b.shifts.get(key);
      if(ea?.[0]&&eb?.[0]&&sameChoices(a.choices,b.choices,[...ea[0].on,...eb[0].on]))pairs.push([a,ea,b,eb]);
    }
    check(label,'E_LAYOUT_NOSHIFT',pairs,'stable');
  }
  for(const c of contracts) {
    const label=c.kind+' #'+c.target+(c.other?' / #'+c.other:'');
    const pairs=states.filter(s=>!c.when||Object.entries(c.when).every(([k,v])=>s.choices[k]===v)).map((s):Pair=>[s,s.ids.get(c.target),s,c.other===undefined?undefined:s.ids.get(c.other)]);
    check(label,'E_SNAPSHOT_CONTRACT',pairs,c.kind);
  }
  return {findings,unknowns};
}
