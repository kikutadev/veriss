import test from 'node:test';
import assert from 'node:assert/strict';
import {domGeometry,verifyUI} from '../src/ui-contracts.mjs';
const profile={id:'web',viewport:{min:320,max:1000,height:{min:320,max:900}}};
const html='<!doctype html><html lang="en"><head><title>App</title></head><body><main id="shell"><kbd>native</kbd><div class="decor"></div><canvas id="scene" width="300" height="150"></canvas></main></body></html>';
const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#scene{position:absolute;inset:0;width:100%;height:100%}.decor:has(> .x) {clip-path:polygon(0 0,100% 0,0 100%);width:2px}@media (max-height:460px){#scene{height:80%}}';
const check=(html,css,targets=['scene'])=>domGeometry({state:'screen',profile,html,css,targets});
const verify=(evidence,target='scene')=>verifyUI({model:{version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'fits',kind:'within-viewport',target}]},evidence});
test('automatic geometry projection proves independent boxes despite unrelated unsupported DOM/CSS',()=>{
 const evidence=check(html,css,['scene','shell']);
 assert.ok(evidence.every(e=>e.rows?.length),JSON.stringify(evidence));
 assert.ok(evidence.every(e=>e.source==='local-dom'));
 assert.equal(verify(evidence).status,'verified');
 assert.equal(verify(evidence,'shell').status,'verified');
});
test('automatic projection does not erase relevant dependencies',()=>{
 for(const [name,source,style] of [
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
 ]) {
  const e=check(source,style)[0];assert.ok(!e.rows?.length,name+': '+JSON.stringify(e));
 }
});
test('automatic geometry preserves actual violation, and does not certify the whole document',()=>{
 const e=check(html,css+'#scene{height:30px}')[0];
 assert.ok(e.rows?.length,JSON.stringify(e));
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'size',kind:'min-size',target:'scene',width:44,height:44}]};
 assert.equal(verifyUI({model,evidence:[e]}).status,'violated');
});
test('class bindings, hidden selectors, and out-of-flow generated decoration',()=>{
 const source=html.replace('id="scene"','class="scene"');
 const style=css.replaceAll('#scene','.scene')+'#shell::after{content:"";position:absolute;inset:0;pointer-events:none}div[hidden]{display:none}';
 const options={state:'screen',profile,html:source,css:style,targets:['scene'],bindings:{scene:'.scene'}};
 const e=domGeometry(options);
 assert.ok(e[0].rows?.length,JSON.stringify(e));
 assert.equal(verify(e).status,'verified');
 const bad=domGeometry({...options,css:style+'@media (max-width:500px){#shell::after{position:static}}'});
 assert.equal(verify(bad).status,'unknown');
 assert.equal(verify(domGeometry({...options,partial:false})).status,'unknown');
});
