// Usage: node tools/ui-check.mjs [--independent-first] manifest.json
import {checkUIManifest} from './ui-manifest.mjs';
import {createGeometrySession} from '../packages/adapter-core/src/ui-contracts.mjs';
import {createRelationalProofSession} from '../packages/veriss/src/layout-contract.mjs';
try {
  const args=process.argv.slice(2),preferIndependent=args[0]==='--independent-first';
  if(preferIndependent)args.shift();
  const [file]=args;
  if(!file||args.length!==1)throw Error('usage: ui-check.mjs [--independent-first] manifest.json');
  const report=await checkUIManifest(file,{geometrySession:createGeometrySession({preferIndependent}),session:createRelationalProofSession()});
  console.log(JSON.stringify(report,null,2));
  process.exitCode=report.outcome==='failed'?1:report.outcome==='unknown'?2:0;
}catch(e){console.error(e.message);process.exitCode=2}
