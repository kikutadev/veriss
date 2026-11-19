// Usage: node tools/game-ui-check.mjs game-ui.json
// Manifest contains model, optional evidence/observations, and DOM documents.
// A geometry proof, runtime failure and Unknown have separate result fields.
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {verifyGameUI,domGeometry} from '../packages/adapter-core/src/game-ui.mjs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';
try{
  const file=process.argv[2];
  if(!file||process.argv.length!==3)throw Error('usage: game-ui-check.mjs manifest.json');
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
  const report=verifyGameUI({model,evidence:[...evidence,...derived],observations});
  console.log(JSON.stringify(report,null,2));
  process.exitCode=report.outcome==='failed'?1:report.outcome==='unknown'?2:0;
}catch(e){console.error(e.message);process.exitCode=2}
