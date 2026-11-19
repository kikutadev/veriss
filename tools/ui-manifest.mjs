import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {verifyUI,domGeometry} from '../packages/adapter-core/src/ui-contracts.mjs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';

export async function checkUIManifest(file) {
  const path=rel=>resolve(dirname(file),rel),read=rel=>readFileSync(path(rel),'utf8');
  const manifest=JSON.parse(readFileSync(file,'utf8'));
  const {model,evidence=[],observations=[],documents=[]}=manifest;
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
    derived.push(...domGeometry({...d,profile,html:read(d.html),css:read(d.css),boxes,knownFonts}));
  }
  return verifyUI({model,evidence:[...evidence,...derived],observations});
}
