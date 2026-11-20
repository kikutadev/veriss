// Measure whole CLI invocations, including Node startup, fingerprinting,
// input parsing, disk IO and exact proof verification. All files regenerated.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'veriss-bench-persist-'));
try{
 const targets=Array.from({length:12},(_,i)=>'button'+i);
 const html='<!doctype html><html lang="en"><head><title>Settings</title></head><body><main>'+targets.map(t=>'<div id="'+t+'" role="button" aria-label="'+t+'"></div>').join('')+'</main></body></html>';
 const css='*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}main>div{height:48px;width:100%}@media(max-width:600px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:400px){main{grid-template-columns:minmax(0,1fr)}}';
 const profile={id:'web',viewport:{min:320,max:1280,height:{min:400,max:900}}};
 const model={version:1,initial:'ready',states:['ready'],transitions:[],profiles:[profile],contracts:targets.map(t=>({id:t,kind:'min-size',target:t,width:44,height:44}))};
 const file=join(dir,'ui.json'),cache=join(dir,'cache'),cli=fileURLToPath(new URL('../tools/ui-check.mjs',import.meta.url));
 writeFileSync(join(dir,'page.html'),html);writeFileSync(join(dir,'page.css'),css);
 writeFileSync(file,JSON.stringify({model,documents:[{state:'ready',profile:'web',html:'page.html',css:'page.css',targets}]}));
 const run=useCache=>{
  const t=performance.now(),report=JSON.parse(execFileSync(process.execPath,[cli,...(useCache?['--cache-dir',cache]:[]),file],{encoding:'utf8'}));
  assert.equal(report.status,'verified');return {ms:performance.now()-t,report};
 };
 const cold=run(true),plain=[],warm=[];
 for(let i=0;i<7;i++){
  const a=run(false),b=run(true);assert.deepEqual(a.report,b.report);assert.deepEqual(a.report,cold.report);
  plain.push(a.ms);warm.push(b.ms);
 }
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 console.log(JSON.stringify({node:process.version,arch:process.arch,targets:12,runs:7,coldMs:cold.ms,uncachedMedianMs:median(plain),warmMedianMs:median(warm)}));
}finally{rmSync(dir,{recursive:true,force:true})}
