import {readFileSync} from 'node:fs';
import {dirname,resolve,extname} from 'node:path';
import {verifyUI,domGeometry,createGeometrySession} from '../packages/adapter-core/src/ui-contracts.mjs';
import {verifyFiniteUI} from '../packages/adapter-core/src/finite-state.mjs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';
import type {GeometryEvidence,Observation,RelationalProofSession,RelationalProof,EnvironmentProfile} from '../packages/veriss/src/layout-contract.mjs';
import {record,array,string,strings,stringRecord,objectRecord,profiles,uiModel} from './ui-input.mjs';

type GeometrySession=ReturnType<typeof createGeometrySession>;
type FiniteAnalysis={status:string;reason?:string};
type ManifestReport=RelationalProof & {finiteAnalysis?:FiniteAnalysis} | {status:'unknown';outcome:'unknown';reason?:string;operation?:never;finiteAnalysis:FiniteAnalysis};

export async function checkUIManifest(file:string,{session,geometrySession}: {session?:RelationalProofSession;geometrySession?:GeometrySession}={}):Promise<ManifestReport> {
  const path=(rel:string)=>resolve(dirname(file),rel),read=(rel:string)=>readFileSync(path(rel),'utf8');
  const parsed:unknown=JSON.parse(readFileSync(file,'utf8'));
  const manifest=record(parsed,'manifest');
  const {model,evidence=[],observations=[],documents=[],finiteComponent}=manifest;
  const docs=array(documents,'document list'), supplied=array(evidence,'evidence') as GeometryEvidence[], samples=array(observations,'observations') as Observation[];
  // The proof engine validates serialized evidence and observations; samples
  // are not promoted to proof by the CLI.
  if(finiteComponent){
    const finite=record(finiteComponent,'finite component'),m=record(model,'model');
    if(docs.length||supplied.length||m.version!==1||Object.keys(m).some(k=>!['version','profiles','contracts'].includes(k))||Object.keys(finite).some(k=>!['source','css','targets','boxes','defaultFontSize','fonts'].includes(k)))throw Error('Finite component must supply its own state graph and geometry');
    const loaders={'.jsx':async()=> (await import('../packages/react-adapter/src/index.mjs')).deriveReactState,'.tsx':async()=> (await import('../packages/react-adapter/src/index.mjs')).deriveReactState,'.vue':async()=> (await import('../packages/vue-adapter/src/index.mjs')).deriveVueState,'.svelte':async()=> (await import('../packages/svelte-adapter/src/index.mjs')).deriveSvelteState};
    const source=string(finite.source,'component source'),ext=extname(source);
    if(ext!=='.jsx'&&ext!=='.tsx'&&ext!=='.vue'&&ext!=='.svelte')throw Error('Unsupported finite component format');
    const analysis:FiniteAnalysis=(await loaders[ext]())(read(source));
    let boxes=finite.boxes===undefined?undefined:objectRecord(finite.boxes,'boxes'),knownFonts:string[]|undefined;
    if(finite.fonts){
      const fonts=Object.fromEntries(Object.entries(stringRecord(finite.fonts,'fonts')).map(([family,file])=>[family,{file:path(file)}]));
      boxes=(await loadTextMetrics({fonts})).resolveBoxes(boxes??{});knownFonts=Object.keys(fonts);
    }
    // The legacy JS inference treats its default [] as never[]. The
    // actual adapter forwards these point observations to the proof engine.
    const finiteVerify=verifyFiniteUI as (analysis:FiniteAnalysis,options:{profiles:EnvironmentProfile[];contracts:unknown[];targets:string[];css?:string;geometrySession:GeometrySession|undefined;proofSession:RelationalProofSession|undefined;boxes:Record<string,object>|undefined;knownFonts:string[]|undefined;defaultFontSize:unknown;observations?:Observation[]|undefined})=>RelationalProof|{status:'unknown';outcome:'unknown';reason?:string;operation?:never};
    const result:RelationalProof|{status:'unknown';outcome:'unknown';reason?:string;operation?:never}=finiteVerify(analysis,{...m,profiles:profiles(m.profiles),contracts:array(m.contracts,'contracts'),targets:strings(finite.targets,'targets'),css:finite.css?read(string(finite.css,'CSS')):'',boxes,knownFonts,defaultFontSize:finite.defaultFontSize,observations:samples,geometrySession,proofSession:session});
    return {...result,finiteAnalysis:analysis};
  }
  if(docs.length>256)throw Error('Invalid document list');
  const checkedModel=uiModel(model);
  const derived:GeometryEvidence[]=[];
  for(const value of docs){
    const d=record(value,'document'),profile=checkedModel.profiles.find(p=>p.id===d.profile);
    if(!profile)throw Error('Unknown document profile');
    let boxes=d.boxes===undefined?undefined:objectRecord(d.boxes,'boxes'),knownFonts:string[]|undefined;
    if(d.fonts){
      const fonts=Object.fromEntries(Object.entries(stringRecord(d.fonts,'fonts')).map(([family,file])=>[family,{file:path(file)}]));
      const metrics=await loadTextMetrics({fonts});
      boxes=metrics.resolveBoxes(boxes??{});knownFonts=Object.keys(fonts);
    }
    derived.push(...(geometrySession?.domGeometry??domGeometry)({...d,state:string(d.state,'document state'),targets:strings(d.targets,'document targets'),profile,html:read(string(d.html,'HTML')),css:read(string(d.css,'CSS')),...(boxes?{boxes}:{}),...(knownFonts?{knownFonts}:{})}));
  }
  return (session?.verifyUI??verifyUI)({model:checkedModel,evidence:[...supplied,...derived],observations:samples});
}
