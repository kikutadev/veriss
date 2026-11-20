import test from 'node:test';
import assert from 'node:assert/strict';
import {domGeometry,verifyUI} from '../src/ui-contracts.mjs';
import type {EnvironmentProfile,GeometryEvidence,UIModel,Predicate} from '@mizchi/veriss/src/relational-contract.mjs';
const first=<T,>(xs:readonly T[]):T=>{const x=xs[0];assert.ok(x!==undefined);return x};
const profile:EnvironmentProfile={id:'web',viewport:{min:320,max:1000,height:{min:320,max:900}}};
const html='<!doctype html><html lang="en"><head><title>App</title></head><body><main id="shell"><kbd>native</kbd><div class="decor"></div><canvas id="scene" width="300" height="150"></canvas></main></body></html>';
const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#scene{position:absolute;inset:0;width:100%;height:100%}.decor:has(> .x) {clip-path:polygon(0 0,100% 0,0 100%);width:2px}@media (max-height:460px){#scene{height:80%}}';
const check=(html:string,css:string,targets=['scene'])=>domGeometry({state:'screen',profile,html,css,targets});
const verify=(evidence:GeometryEvidence[],target='scene')=>verifyUI({model:{version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'fits',kind:'within-viewport',target}]},evidence});
test('automatic geometry projection proves independent boxes despite unrelated unsupported DOM/CSS',()=>{
 const evidence=check(html,css,['scene','shell']);
 assert.ok(evidence.every(e=>e.rows?.length),JSON.stringify(evidence));
 assert.ok(evidence.every(e=>e.source==='local-dom'));
 assert.equal(verify(evidence).status,'verified');
 assert.equal(verify(evidence,'shell').status,'verified');
});
test('automatic projection does not erase relevant dependencies',()=>{
 const cases:[string,string,string][]=[
  ['ancestor selector',html,css+'#shell:has(kbd){height:20px}'],
  ['sibling selector',html,css+'kbd ~ #scene{width:3000px}'],
  ['relative dependency',html,css+'#scene{width:auto}'],
  ['ancestor transforms',html,css+'#shell{transform:scale(2)}'],
  ['external CSS',html,'@import url(other.css);'+css],
  ['normal flow sibling',html.replace('<main','<div>previous</div><main'),css],
  ['container query',html,css+'@container (width>500px){#scene{height:20px}}'],
  ['dynamic selector',html,css+'#scene:hover{width:400px}'],
  ['intrinsic ancestor',html,css+'#shell{height:auto}'],
  ['unanchored absolute',html,css+'#scene{inset:auto}'],
  ['global cascade',html,css+'@layer x{#scene{height:20px}}'],
  ['viewport scrollbar',html,css+'html{scrollbar-gutter:stable}'],
  ['pseudo',html,css+'#shell::before{content:"";display:block;height:100px}'],
  ['font geometry',html,css+'#scene{width:10ch}'],
  ['duplicate target',html.replace('</main>','<div id="scene"></div></main>'),css],
 ];
 for(const [name,source,style] of cases){
  const e=first(check(source,style));assert.ok(!e.rows?.length,name+': '+JSON.stringify(e));
 }
});
test('automatic geometry preserves actual violation, and does not certify the whole document',()=>{
 const e=first(check(html,css+'#scene{height:30px}'));
 assert.ok(e.rows?.length,JSON.stringify(e));
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'size',kind:'min-size',target:'scene',width:44,height:44}]};
 assert.equal(verifyUI({model,evidence:[e]}).status,'violated');
});
test('class bindings, hidden selectors, and out-of-flow generated decoration',()=>{
 const source=html.replace('id="scene"','class="scene"');
 const style=css.replaceAll('#scene','.scene')+'#shell::after{content:"";position:absolute;inset:0;pointer-events:none}div[hidden]{display:none}';
 const options={state:'screen',profile,html:source,css:style,targets:['scene'],bindings:{scene:'.scene'}};
 const e=domGeometry(options);
 assert.ok(first(e).rows?.length,JSON.stringify(e));
 assert.equal(verify(e).status,'verified');
 const bad=domGeometry({...options,css:style+'@media (max-width:500px){#shell::after{position:static}}'});
 assert.equal(verify(bad).status,'unknown');
 assert.equal(verify(domGeometry({...options,partial:false})).status,'unknown');
});
test('selector-list disjunction excludes unrelated subjects but not a possible dependency',()=>{
 const style=css+':where(html,body){margin:0}:is(.decor:has(.x),.other){height:8px}';
 assert.equal(verify(check(html,style)).status,'verified');
 assert.equal(verify(check(html,style+':is(#shell:has(kbd),.other){height:8px}')).status,'unknown');
});

test('complete geometry remains evidence when an overflow obligation has a counterexample',()=>{
 const e=first(check(html,css+'#scene{width:120%}'));
 assert.ok(e.rows?.length,JSON.stringify(e));
 const r=verify([e]);
 assert.equal(r.status,'violated');
 assert.ok(first(first(r.contracts).cases).witness);
 // Unsupported geometry and a statically invalid cascade remain Unknown.
 assert.equal(verify(check(html,css+'#scene{width:120%;transform:rotate(30deg)}')).status,'unknown');
});
test('responsive centered block geometry is independently derived from a complete cascade',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="shell"><kbd>native</kbd></main></body></html>';
 const style='*{box-sizing:border-box;margin:0}#shell{width:min(100%,520px);height:100dvh;margin:0 auto;overflow:hidden;border-inline:2px solid #123456}';
 const e=first(check(source,style,['shell']));
 assert.ok(e.rows?.length,JSON.stringify(e));
 assert.equal(verify([e],'shell').status,'verified');
});

test('unscrolled rectangles remain available inside nested hidden overflow ancestors',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="app"><section id="field"><kbd>native</kbd><div id="surface"></div></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}html,body,#app{width:100%;height:100dvh;overflow:hidden}#field{position:relative;width:100%;height:100%;min-height:400px;overflow:hidden}#surface{position:absolute;inset:0}';
 const evidence=check(source,style,['field','surface']);
 assert.ok(evidence.every(e=>e.rows?.length),JSON.stringify(evidence));
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
 {id:'fits',kind:'within-viewport',target:'surface'},
 {id:'contains',kind:'contains',target:'field',other:'surface'}
 ]};
 const r=verifyUI({model,evidence});
 assert.deepEqual(r.contracts.map(c=>c.status),['violated','verified']);
 // A changing transform of an ancestor or a non-overlay environment is not covered.
 assert.ok(!first(check(source,style+'#app{transform:scale(2)}',['surface'])).rows?.length);
 const p={...profile,scrollbar:{name:'classic',inlineSize:15,blockSize:15}};
 assert.ok(!first(domGeometry({state:'screen',profile:p,html:source,css:style,targets:['surface']})).rows?.length);
});

test('a resolved overflow is not confused with parser or coverage failure',async()=>{
 const {analyzeHTML}=await import('@mizchi/veriss/html');
 const {createLayoutIR}=await import('@mizchi/veriss/contracts');
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="wide"></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}#wide{width:120%;height:40px}';
 const opts={viewport:profile.viewport,scrollbars:[{name:'overlay',inlineSize:0,blockSize:0}]};
 const full=analyzeHTML(source,{...opts,css:style});
 assert.equal(full.status,'violated');
 assert.equal(createLayoutIR(full).geometryComplete,true);
 assert.equal(full.ok,false);
 assert.equal(verify(check(source,style,['wide']),'wide').status,'violated');
 const unresolved=analyzeHTML(source,{...opts,css:style+'#wide{width:attr(data-width px)}'});
 assert.equal(unresolved.status,'unknown');
 assert.equal(createLayoutIR(unresolved).geometryComplete,false);
});

test('inline-only projection proves widths and positions without pretending to know height',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><kbd>native</kbd><section id="panel"><kbd>unknown height</kbd></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}#shell{max-width:800px;margin:0 auto;padding-inline:clamp(20px,5vw,76px)}#panel{width:100%;height:auto;padding-bottom:calc(94px + env(safe-area-inset-bottom))}';
 const evidence=check(source,style,['shell','panel']);
 assert.ok(evidence.every(e=>e.rows?.length&&e.axes?.join(',')==='inline'),JSON.stringify(evidence));
 assert.ok(evidence.every(e=>(e.rows??[]).every(r=>!Object.hasOwn(r.rect,'blockSize')&&!Object.hasOwn(r.rect,'blockStart'))));
 const h:Predicate={op:'compare',relation:'le',left:{target:'panel',field:'inlineEnd'},right:{environment:'safeRight'}};
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'horizontal',kind:'predicate',predicate:h},
  {id:'vertical',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'panel',field:'blockEnd'},right:{environment:'safeBottom'}}},
  {id:'all',kind:'within-viewport',target:'panel'}
 ]};
 assert.deepEqual(verifyUI({model,evidence}).contracts.map(c=>c.status),['verified','unknown','unknown']);
 for(const extra of ['#shell{display:flex}','#shell{aspect-ratio:1/1}','#shell{float:left}','header{float:left}','@keyframes float-away{to{float:left}}','#shell{transform:scale(2)}','#panel{width:10ch}','#panel{position:absolute;left:0}','#shell:has(kbd){width:10px}']){
  assert.ok(!first(check(source,style+extra,['panel'])).rows?.length,extra);
 }
 assert.ok(!first(check(source.replace('<header>','<header style="float:left">'),style,['panel'])).rows?.length);
 const e=first(check(source,style+'#panel{width:200%}',['panel']));
 assert.equal(verifyUI({model,evidence:[e]}).contracts[0]?.status,'violated');
});

test('snapshot root descendant presence is frozen without losing selector specificity',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header class="journey"><kbd>native</kbd></header><main><kbd>unknown height</kbd></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}body:has(.journey) main{max-width:380px}body main{max-width:520px;margin:0 auto}';
 const opts={state:'screen',profile,html:source,css:style,targets:['shell'],bindings:{shell:'main'}};
 const present=first(domGeometry(opts));
 const test=(e:GeometryEvidence,limit:string)=>verifyUI({model:{version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'width',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'shell',field:'inlineSize'},right:limit}}]},evidence:[e]}).status;
 assert.equal(test(present,'380'),'verified',JSON.stringify(present));
 const absent=first(domGeometry({...opts,html:source.replace(' class="journey"','')}));
 assert.equal(test(absent,'380'),'violated');
 assert.ok(!first(domGeometry({...opts,css:style+String.raw`header{fl\6f at:left}`})).rows?.length);
 assert.ok(!first(domGeometry({...opts,html:source.replace('</main>','</main><main></main>')})).rows?.length);
});

test('paint-only transitions do not prevent independent inline geometry; unknown and mixed transitions do',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="shell"><kbd>native</kbd></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}#shell{max-width:520px;margin:0 auto}';
 for(const value of ['background .18s,color .18s','color 300ms ease-in-out, border-color 1s linear','opacity .2s cubic-bezier(.1,.2,.3,.4)','none']){
  const r=first(check(source,style+'body{transition:'+value+'}',['shell']));
  assert.ok(r.rows?.length,JSON.stringify({value,r}));
 }
 for(const value of ['all .2s','width .2s','color .2s,transform 1s','opacity 2s,width 1s','--size 1s','1s ease','var(--transition)','color .1s nonsense']){
  assert.ok(!first(check(source,style+'body{transition:'+value+'}',['shell'])).rows?.length,value);
 }
 assert.ok(first(check(source,style+'body{transition-property:color, background-color;transition-duration:.2s}',['shell'])).rows?.length);
 assert.ok(!first(check(source,style+'body{transition-property:color, width}',['shell'])).rows?.length);
});

test('paint-only transitions and inactive grid tracks preserve an ordinary block inline proof',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><section id="panel"><kbd>native</kbd></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}body{transition:background .18s,color .18s}#shell{display:block;grid-template-columns:1fr 2fr;margin:auto;max-width:520px}#panel{width:100%}';
 const e=first(check(source,style,['panel']));
 assert.deepEqual(e.axes,['inline'],JSON.stringify(e));
 for(const extra of ['body{transition:width .2s}','body{transition:all .2s}','body{transition:.2s}','body{transition-property:--size}','body{transition-property:height}','@media(max-width:500px){#shell{display:grid}}','#shell{display:flex}']){
  assert.ok(!first(check(source,style+extra,['panel'])).rows?.length,extra);
 }
 assert.ok(first(check(source,style+'body{transition-property:background-color,opacity}',['panel'])).rows?.length);
});

test('fixed block-axis evidence does not require the intrinsic inline width',()=>{
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><section id="panel"><kbd>native</kbd></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}#panel{position:fixed;right:2rem;width:max-content;height:64px;bottom:12px}';
 const e=first(check(source,style,['panel']));
 assert.deepEqual(e.axes,['block'],JSON.stringify(e));
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'bottom',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'panel',field:'blockEnd'},right:{environment:'safeBottom'}}},
  {id:'both',kind:'within-viewport',target:'panel'}
 ]};
 assert.deepEqual(verifyUI({model,evidence:[e]}).contracts.map(c=>c.status),['verified','unknown']);
 const bad=first(check(source,style+'#panel{bottom:-1px}',['panel']));
 assert.equal(verifyUI({model,evidence:[bad]}).contracts[0]?.status,'violated');
 for(const extra of ['#panel{height:auto}','#panel{aspect-ratio:1/1}','#panel{position:absolute}','#panel{margin-block:auto}','#panel{transform:translateY(10px)}','#shell{transform:translateX(1px)}','#shell{filter:blur(1px)}','#shell{contain:layout}']){
  assert.ok(!first(check(source,style+extra,['panel'])).rows?.length,extra);
 }
});

test('explicit media features are preserved through independent geometry and reject cross-profile reuse',()=>{
 const base:EnvironmentProfile={...profile,mediaFeatures:{hover:'none',pointer:'coarse','prefers-reduced-motion':'reduce'}};
 const source='<!doctype html><html lang="en"><head><title>Dashboard</title></head><body><main id="shell"><kbd>unmodeled</kbd></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}#shell{height:40px;width:100%;overflow:hidden}@media (hover:hover){#shell{height:var(--unknown)}}@media (pointer:coarse){#shell{height:80px}}@media (prefers-reduced-motion:reduce) and (min-width:600px){#shell{height:100px}}';
 const input={state:'screen',profile:base,html:source,css:style,targets:['shell']};
 const e=first(domGeometry(input));
 assert.ok(e.rows?.length,JSON.stringify(e));
 assert.ok(e.assumptions.some(a=>a.includes('pointer: coarse')));
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[base],contracts:[{id:'size',kind:'min-size',target:'shell',width:44,height:80}]};
 assert.equal(verifyUI({model,evidence:[e]}).status,'verified');
 const desktop:EnvironmentProfile={...base,mediaFeatures:{hover:'hover',pointer:'fine','prefers-reduced-motion':'no-preference'}};
 assert.notEqual(verifyUI({model:{...model,profiles:[desktop]},evidence:domGeometry({...input,profile:desktop})}).status,'verified');
 assert.throws(()=>verifyUI({model:{...model,profiles:[desktop]},evidence:[e]}),/profile mismatch/);
 const {profileKey,...unbound}=e;
 assert.throws(()=>verifyUI({model,evidence:[unbound]}),/profile mismatch/);
});
