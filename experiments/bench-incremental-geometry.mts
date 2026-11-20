// Reproducible comparison. Includes DOM/CSS parsing, dependency checks and
// LayoutIR extraction; excludes browser rendering and the later proof step.
import type {GeometryEvidence} from '../packages/veriss/src/layout-contract.mjs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {domGeometry,createGeometrySession} from '../packages/adapter-core/src/ui-contracts.mjs';
const profile={id:'web',viewport:{min:320,max:1280,height:{min:400,max:900}}};
const targets=Array.from({length:12},(_,i)=>'button'+i);
const markup=targets.map(t=>'<div id="'+t+'" role="button" aria-label="'+t+'"></div>').join('');
const document=(body:string)=>'<!doctype html><html lang="en"><head><title>Settings</title></head><body>'+body+'</body></html>';
const gridHtml=document('<main>'+markup+'</main>');
const gridCss='*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}main>div{height:48px;width:100%}@media(max-width:600px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:400px){main{grid-template-columns:minmax(0,1fr)}}';
const independentHtml=document('<main id="panel"><kbd>native</kbd>'+markup+'</main>');
const rules=targets.map((t,i)=>'#'+t+'{position:absolute;top:'+i*32+'px;left:0;width:40%;height:48px}@media(max-width:600px){#'+t+'{width:60%}}').join('');
const independentCss='*{box-sizing:border-box;margin:0;padding:0}#panel{position:relative;overflow:hidden;height:100dvh}'+rules+Array.from({length:120},(_,i)=>'.unused-'+i+'{width:20px;height:30px}').join('');
const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
for(const [name,html,css,preferIndependent] of ([['grid',gridHtml,gridCss,false],['independent',independentHtml,independentCss,true]] as const)){
 const input={state:'ready',profile,html,css,targets};
 const session=createGeometrySession({preferIndependent});
 for(let i=0;i<3;i++)session.domGeometry(input);
 const times={uncached:[] as number[],warm:[] as number[],changedUncached:[] as number[],changedCached:[] as number[]};
 for(let i=0;i<9;i++){
  const measure=(label:keyof typeof times,fn:()=>GeometryEvidence[])=>{const t=performance.now(),result=fn();times[label].push(performance.now()-t);assert.ok(result.every(e=>e.rows?.length),JSON.stringify(result));return result};
  const first=measure('uncached',()=>domGeometry(input));
  assert.deepEqual(measure('warm',()=>session.domGeometry(input)),first);
  const modified={...input,css:css+'#button0{height:'+(50+i)+'px}'};
  const changed=measure('changedUncached',()=>domGeometry(modified));
  assert.deepEqual(measure('changedCached',()=>session.domGeometry(modified)),changed);
 }
 console.log(JSON.stringify({node:process.version,arch:process.arch,name,targets:targets.length,runs:9,medianMs:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,median(v)])),stats:session.stats()}));
}
