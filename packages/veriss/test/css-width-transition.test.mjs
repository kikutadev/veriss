import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCSSWidthTransition} from '../src/transitions.mjs';
const profile={id:'web',viewport:{min:320,max:1920,height:{min:320,max:1080}}};
const html='<!doctype html><html lang="en"><head><title>QA</title></head><body><div id="dock" data-expanded="false"><div id="panel"></div></div></body></html>';
const css='*{box-sizing:border-box;margin:0;padding:0}#dock{position:fixed;left:50%;top:0;height:100px;transform:translateX(-50%);width:min(230px,100vw - 24px);transition:width .54s cubic-bezier(.3,.7,.2,1);border:1px solid #333}#dock[data-expanded=true]{width:min(344px,100vw - 22px)}#panel{height:20px}@media(width>=1025px){#dock{width:258px}#dock[data-expanded=true]{width:358px}}';
const fit={op:'all',items:['dock','panel'].flatMap(target=>[{op:'compare',relation:'ge',left:{target,field:'inlineStart'},right:'0'},{op:'compare',relation:'le',left:{target,field:'inlineEnd'},right:{environment:'width'}}])};
const input={html,css,profile,target:'dock',stateAttribute:'data-expanded',from:'false',to:'true',predicate:fit};
test('derive a bounded width model from closed component CSS, without caller geometry or interpolation assumptions',()=>{
 const r=verifyCSSWidthTransition(input);
 assert.equal(r.status,'verified',JSON.stringify(r));
 assert.equal(r.derivation.kind,'fixed-width-transition');
 assert.equal(r.endpoints.status,'verified');
 assert.equal(verifyCSSWidthTransition({...input,css:css.replace('translateX(-50%)','none')}).status,'violated');
});
test('refuse cross-axis, unpaired width cases, moving geometry, external styles and overshoot',()=>{
 for(const s of [css.replace('100vw - 22px','100vw - 26px'),css+'#dock{min-width:350px}',css+'#dock[data-expanded=true]{left:0}',css+'#panel{width:max-content}',css.replace('width .54s','all .54s'),css.replace('.3,.7,.2,1','.3,2,.2,1'),css+'@media(width>600px){#dock{width:280px}}',css+'#dock{animation:spin 1s}',css+'@import "x.css";',css+'#dock[data-expanded=true]{height:150px}',css.replaceAll('#dock[data-expanded=true]','#dock [data-expanded=true]'),css+'#dock{transition:width 1s ease,transform 1s ease}',css+'#dock{display:flex;flex-direction:row}',css+'#panel{border:300px solid #333}',css+'@media(width>=1025px){#dock{display:flex;flex-direction:column}}',css.replace('position:fixed;','')+'@media(width>=1025px){#dock{position:fixed}}']){
  assert.equal(verifyCSSWidthTransition({...input,css:s}).status,'unknown',s);
 }
 assert.equal(verifyCSSWidthTransition({...input,html:html.replace('<body>','<body style="transform:translateX(20px)">')}).status,'unknown');
 assert.equal(verifyCSSWidthTransition({...input,predicate:{op:'compare',relation:'le',left:{target:'panel',field:'blockEnd'},right:{environment:'height'}}}).status,'unknown');
});

test('column-reverse flex and explicit paint transitions use the same derived proof',()=>{
 const source=css+'#dock{display:flex;flex-direction:column-reverse;align-items:stretch}#panel{min-width:0;flex:none}';
 const style=source.replace('width .54s cubic-bezier(.3,.7,.2,1)','width .54s cubic-bezier(.3,.7,.2,1),opacity .2s ease')+'#dock[data-expanded=true]{opacity:.5}';
 const r=verifyCSSWidthTransition({...input,css:style});assert.equal(r.status,'verified',JSON.stringify(r));
 assert.equal(verifyCSSWidthTransition({...input,css:style.replace('min-width:0;','')}).status,'unknown');
});

test('the same proof handles a different fixed notification pane and detects insufficient inset',()=>{
 const html='<!doctype html><html lang="en"><head><title>Notifications</title></head><body><aside id="notice" data-mode="small"><div id="actions"></div></aside></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#notice{position:fixed;right:12px;bottom:0;height:60px;width:80px;transition:width .2s ease-out}#notice[data-mode=wide]{width:280px}#actions{height:20px}';
 const predicate={op:'compare',relation:'ge',left:{target:'actions',field:'inlineStart'},right:'0'};
 const input={html,css,profile,target:'notice',stateAttribute:'data-mode',from:'small',to:'wide',predicate};
 assert.equal(verifyCSSWidthTransition(input).status,'verified');
 assert.equal(verifyCSSWidthTransition({...input,css:css.replace('280px','330px')}).status,'violated');
});

test('adjacent identical responsive conditions can be emitted as separate rules',()=>{
 const split=css.replace('@media(width>=1025px){#dock{width:258px}#dock[data-expanded=true]{width:358px}}','@media(width>=1025px){#dock{width:258px}}/* compiled stylesheet */@media (width>=1025px){#dock[data-expanded=true]{width:358px}}');
 assert.equal(verifyCSSWidthTransition({...input,css:split}).status,'verified');
 const interrupted=split.replace('/* compiled stylesheet */','#dock{width:500px}');
 assert.equal(verifyCSSWidthTransition({...input,css:interrupted}).status,'unknown');
});
