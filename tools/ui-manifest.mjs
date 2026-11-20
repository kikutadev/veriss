import {readFileSync} from 'node:fs';
import {dirname,resolve,extname} from 'node:path';
import {verifyUI,domGeometry} from '../packages/adapter-core/src/ui-contracts.mjs';
import {verifyFiniteUI} from '../packages/adapter-core/src/finite-state.mjs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';

export async function checkUIManifest(file,{session,geometrySession}={}) {
  const path=rel=>resolve(dirname(file),rel),read=rel=>readFileSync(path(rel),'utf8');
  const manifest=JSON.parse(readFileSync(file,'utf8'));
  const {model,evidence=[],observations=[],documents=[],finiteComponent}=manifest;
  if(finiteComponent){
    if(documents.length||evidence.length||!model||model.version!==1||Object.keys(model).some(k=>!['version','profiles','contracts'].includes(k))||Object.keys(finiteComponent).some(k=>!['source','css','targets','boxes','defaultFontSize','fonts'].includes(k)))throw Error('Finite component must supply its own state graph and geometry');
    const loaders={'.jsx':async()=> (await import('../packages/react-adapter/src/index.mjs')).deriveReactState,'.tsx':async()=> (await import('../packages/react-adapter/src/index.mjs')).deriveReactState,'.vue':async()=> (await import('../packages/vue-adapter/src/index.mjs')).deriveVueState,'.svelte':async()=> (await import('../packages/svelte-adapter/src/index.mjs')).deriveSvelteState};
    const load=loaders[extname(finiteComponent.source)];if(!load)throw Error('Unsupported finite component format');
    const analysis=(await load())(read(finiteComponent.source));
    let boxes=finiteComponent.boxes,knownFonts;
    if(finiteComponent.fonts){
      const fonts=Object.fromEntries(Object.entries(finiteComponent.fonts).map(([family,file])=>[family,{file:path(file)}]));
      boxes=(await loadTextMetrics({fonts})).resolveBoxes(boxes??{});knownFonts=Object.keys(fonts);
    }
    const result=verifyFiniteUI(analysis,{...model,targets:finiteComponent.targets,css:finiteComponent.css?read(finiteComponent.css):'',boxes,knownFonts,defaultFontSize:finiteComponent.defaultFontSize,observations,geometrySession,proofSession:session});
    return {...result,finiteAnalysis:analysis};
  }
  if(!Array.isArray(documents)||documents.length>256)throw Error('Invalid document list');
  const derived=[];
  for(const d of documents){
    const profile=model.profiles.find(p=>p.id===d.profile);
    if(!profile)throw Error('Unknown document profile');
    let boxes=d.boxes,knownFonts;
    if(d.fonts){
      const fonts=Object.fromEntries(Object.entries(d.fonts).map(([family,file])=>[family,{file:path(file)}]));
      const metrics=await loadTextMetrics({fonts});
      boxes=metrics.resolveBoxes(boxes??{});knownFonts=Object.keys(fonts);
    }
    derived.push(...(geometrySession?.domGeometry??domGeometry)({...d,profile,html:read(d.html),css:read(d.css),boxes,knownFonts}));
  }
  return (session?.verifyUI??verifyUI)({model,evidence:[...evidence,...derived],observations});
}
