// Usage: node tools/ui-check.mjs manifest.json
import {checkUIManifest} from './ui-manifest.mjs';
try {
  const file=process.argv[2];
  if(!file||process.argv.length!==3)throw Error('usage: ui-check.mjs manifest.json');
  const report=await checkUIManifest(file);
  console.log(JSON.stringify(report,null,2));
  process.exitCode=report.outcome==='failed'?1:report.outcome==='unknown'?2:0;
}catch(e){console.error(e.message);process.exitCode=2}
