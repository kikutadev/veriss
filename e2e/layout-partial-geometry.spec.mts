import type {UIModel,Relation,GeometryEvidence,EnvironmentProfile,Operand,Predicate,RelationalCompositionImport} from '../packages/veriss/src/relational-contract.mjs';
import {evaluateAffine as value} from './support/geometry.mjs';
import {required} from './support/required.mjs';
import {init,killThreads} from 'z3-solver';
import {test,expect} from '@playwright/test';
import {domGeometry,verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';

const html='<!doctype html><html lang="en"><head><title>Independent application pane</title></head><body><main id="shell"><kbd>native content</kbd><div class="decor"></div><canvas class="scene" width="300" height="150"></canvas></main></body></html>';
const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#shell::after{content:"";position:absolute;inset:0;pointer-events:none}.scene{position:absolute;inset:0;width:100%;height:100%}.decor:has(> .x){clip-path:polygon(0 0,100% 0,0 100%);width:2px}@media (max-height:460px){.scene{height:80%}}div[hidden]{display:none}';

test('automatic local evidence matches original browser geometry across both axes',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const targets=['shell','scene'],bindings:Record<string,string>={scene:'.scene'};
 const args={state:'screen',profile,html,css,targets,bindings};
 const evidence=domGeometry(args);
 expect(evidence.map(e=>e.source)).toEqual(['local-dom','local-dom']);
 expect(evidence.every(e=>e.rows?.length),JSON.stringify(evidence)).toBe(true);
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'fit',kind:'within-viewport',target:'scene'}]};
 expect(verifyUI({model,evidence}).status).toBe('verified');
 for(const width of [320,651,1000])for(const height of [320,460,461,900]){
   await page.setViewportSize({width,height});
   await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator(bindings[e.target]??'#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
     const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows)for(const [i,k] of (['inlineStart','blockStart','inlineSize','blockSize'] as const).entries())
       expect(actual[i]).toBeCloseTo(value(required(row.rect[k],'Missing affine evidence'),width,height),1);
   }
 }
 const bad=domGeometry({...args,css:css+'#shell::after{position:static}'});
 expect(verifyUI({model,evidence:bad}).status).toBe('unknown');
});

test('local rectangle proofs imply page separation; a changed implementation must recheck',async({page,browserName})=>{
 const {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession}=await import('../packages/veriss/src/layout-contract.mjs');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:400,max:900}}};
 const state=createStateIR({initial:'ready',states:['ready'],transitions:[]}),environment=createEnvironmentIR([profile]);
 const html='<!doctype html><html lang="en"><head><title>Dashboard</title></head><body><main id="shell"><div id="left" role="button" aria-label="Previous"></div><div id="right" role="button" aria-label="Next"></div><kbd>native content</kbd></main></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#left,#right{position:absolute;top:20px;width:44%;height:48px}#left{left:0}#right{right:0}';
 const facts=(targets:string[],style=css)=>domGeometry({state:'ready',profile,html,css:style,targets});
 const make=(component:string,contracts:Relation[],evidence:GeometryEvidence[])=>createObligationIR(createContractIR({component,profile:'relational/1',contracts}),{state,environment,evidence:createEvidenceIR(evidence)});
 const half:Operand={op:'scale',factor:'1/2',item:{environment:'width'}};
 const child=(target:string,field:Extract<Operand,{target:string}>['field'],relation:Extract<Predicate,{op:'compare'}>['relation'])=>make(target,[{id:'half',kind:'predicate',predicate:{op:'compare',relation,left:{target,field},right:half}}],facts([target]));
 const imports:RelationalCompositionImport[]=[
  {obligation:child('left','inlineEnd','le'),contract:'half',bind:{left:'left'}},
  {obligation:child('right','inlineStart','ge'),contract:'half',bind:{right:'right'}}
 ];
 const parent=(style:string)=>make('Dashboard',[{id:'separation',kind:'disjoint',target:'left',other:'right'}],facts(['left','right'],style));
 const s=createRelationalProofSession(),api=await init();
 try{
  const report=await s.compose(parent(css),imports,api);
  expect(report.status).toBe('verified');
  expect(report.contracts[0]!.cases[0]!.method).toBe('composition');
  const badCSS=css+'#left,#right{width:60%}';
  const bad=await s.compose(parent(badCSS),imports,api);
  expect(bad.status).toBe('violated');
  expect(bad.contracts[0]!.cases[0]!.method).toBeUndefined();
  for(const [style,valid] of [[css,true],[badCSS,false]] as const)for(const width of [320,651,1000])for(const height of [400,900]){
    await page.setViewportSize({width,height});
    await page.setContent(html.replace('</head>','<style>'+style+'</style></head>'));
    const [a,b]=await page.locator('#left,#right').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}));
    expect(required(a,'Missing left').right<=required(b,'Missing right').left).toBe(valid);
  }
 }finally{await killThreads(api.em)}
});

test('responsive block centering agrees with actual used width, bounds and margins',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="shell"><kbd>native</kbd></main></body></html>';
 const base='*{box-sizing:border-box;margin:0;padding:0}#shell{height:100px;overflow:hidden;border-inline:2px solid #123456;';
 for(const declaration of [
   'width:min(100%,520px);margin:0 auto',
   'width:clamp(160px,70vw,500px);margin:0 auto;min-width:200px;max-width:460px',
   'width:min(70%,520px);box-sizing:content-box;padding-inline:12px;margin-left:auto;margin-right:8px',
   'width:max(400px,60vw);margin:0 auto',
 ]){
   const style=base+declaration+'}';
   const input=source;
   const e=required(domGeometry({state:'screen',profile,html:input,css:style,targets:['shell']})[0],'Missing evidence');
   expect(e.rows?.length??0,JSON.stringify(e)).toBeGreaterThan(0);
   for(const width of [320,399,400,519,520,521,657,1000]){
     const height=700;
     await page.setViewportSize({width,height});
     await page.setContent(input.replace('</head>','<style>'+style+'</style></head>'));
     const actual=await page.locator('#shell').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0],declaration+' @ '+width).toBeCloseTo(value(required(row.rect.inlineStart,'Missing affine evidence'),width,height),1);
       expect(actual[1],declaration+' @ '+width).toBeCloseTo(value(required(row.rect.inlineSize,'Missing affine evidence'),width,height),1);
     }
   }
 }
});

test('nested overflow projection keeps exact rectangles and exposes failure at short heights',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="app"><section id="field"><kbd>native</kbd><div id="surface"></div></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}html,body,#app{width:100%;height:100dvh;overflow:hidden}#field{position:relative;width:100%;height:100%;min-height:400px;overflow:hidden}#surface{position:absolute;inset:0}';
 const evidence=domGeometry({state:'screen',profile,html:source,css:style,targets:['field','surface']});
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'fit',kind:'within-viewport',target:'surface'},
  {id:'contains',kind:'contains',target:'field',other:'surface'}
 ]};
 const proof=verifyUI({model,evidence});
 expect(proof.contracts.map(c=>c.status)).toEqual(['violated','verified']);
 for(const width of [320,844,1000])for(const height of [320,390,399,400,401,900]){
   await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator('#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
     const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows)for(const [i,k] of (['inlineStart','blockStart','inlineSize','blockSize'] as const).entries())
       expect(actual[i]).toBeCloseTo(value(required(row.rect[k],'Missing affine evidence'),width,height),1);
   }
 }
});

test('incremental independent extraction reuses only unchanged validated source and agrees with the browser',async({page,browserName})=>{
 const {createGeometrySession}=await import('../packages/adapter-core/src/ui-contracts.mjs');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:400,max:900}}};
 const html='<!doctype html><html lang="en"><head><title>Settings</title></head><body><main id="panel"><div id="left"></div><div id="right"></div><kbd>native</kbd></main></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#panel{position:relative;overflow:hidden;height:100dvh}#left,#right{position:absolute;top:20px;width:40%;height:48px}#left{left:0}#right{right:0}';
 const input={state:'ready',profile,html,css,targets:['left','right']};
 const session=createGeometrySession({preferIndependent:true});
 const initial=session.domGeometry(input);
 expect(initial).toEqual(domGeometry(input));
 const changed={...input,css:css+'@media(max-width:600px){#left{height:32px}}'};
 const evidence=session.domGeometry(changed);
 expect(evidence).toEqual(domGeometry(changed));
 expect(session.stats().projected).toEqual({hits:1,misses:3,bypassed:0});
 const model:UIModel={version:1,initial:'ready',states:['ready'],transitions:[],profiles:[profile],contracts:[{id:'size',kind:'min-size',target:'left',width:44,height:44}]};
 expect(verifyUI({model,evidence:initial}).status).toBe('verified');
 expect(verifyUI({model,evidence}).status).toBe('violated');
 for(const width of [320,600,601,1000])for(const height of [400,900]){
  await page.setViewportSize({width,height});
  await page.setContent(html.replace('</head>','<style>'+changed.css+'</style></head>'));
  for(const e of evidence){
   const actual=await page.locator('#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
   const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
   expect(rows.length).toBeGreaterThan(0);
   for(const row of rows)for(const [i,k] of (['inlineStart','blockStart','inlineSize','blockSize'] as const).entries())expect(actual[i]).toBeCloseTo(value(required(row.rect[k],'Missing affine evidence'),width,height),1);
  }
 }
 const dependency={...changed,css:changed.css+'#panel:has(kbd){height:20px}'};
 expect(session.domGeometry(dependency)).toEqual(domGeometry(dependency));
 expect(session.domGeometry(dependency).every(e=>!e.rows?.length)).toBe(true);
});

test('axis-specific evidence matches original content-dependent block flow',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1920,height:{min:320,max:1080}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><kbd>native</kbd><section id="panel"><kbd>unknown height</kbd></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}header{height:73px}#shell{max-width:800px;margin:0 auto;padding-inline:clamp(20px,5vw,76px)}#panel{width:100%;height:auto;padding-bottom:calc(94px + env(safe-area-inset-bottom))}body:has(.absent) #shell{width:10px}@media (max-width:500px){#shell{padding-inline:16px}}';
 const evidence=domGeometry({state:'screen',profile,html:source,css:style,targets:['shell','panel']});
 expect(evidence.every(e=>e.axes?.join(',')==='inline'&&e.rows?.length),JSON.stringify(evidence)).toBe(true);
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'inline',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'panel',field:'inlineEnd'},right:{environment:'safeRight'}}},
  {id:'both',kind:'within-viewport',target:'panel'}
 ]};
 expect(verifyUI({model,evidence}).contracts.map(c=>c.status)).toEqual(['verified','unknown']);
 for(const width of [320,400,500,501,799,800,801,1520,1920])for(const height of [390,900]){
   await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator('#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0]).toBeCloseTo(value(required(row.rect.inlineStart,'Missing affine evidence'),width,height),1);
       expect(actual[1]).toBeCloseTo(value(required(row.rect.inlineSize,'Missing affine evidence'),width,height),1);
       expect(row.rect.blockSize).toBeUndefined();
     }
   }
 }
});

test('root descendant presence keeps selector priority in an inline projection',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const html=(present:boolean)=>'<!doctype html><html lang="en"><head><title>T</title></head><body><header'+(present?' class="journey"':'')+'><kbd>native</kbd></header><main><kbd>unknown height</kbd></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}body:has(.journey) main{max-width:380px}body main{max-width:520px;margin:0 auto}';
 for(const present of [true,false]){
   const e=required(domGeometry({state:'screen',profile,html:html(present),css:style,targets:['shell'],bindings:{shell:'main'}})[0],'Missing evidence');
   expect(e.axes).toEqual(['inline']);
   expect(e.rows?.length??0,JSON.stringify(e)).toBeGreaterThan(0);
   for(const width of [320,379,380,381,519,520,521,1000]){
     const height=700;
     await page.setViewportSize({width,height});
     await page.setContent(html(present).replace('</head>','<style>'+style+'</style></head>'));
     const actual=await page.locator('main').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     expect(actual[1]).toBe(Math.min(width,present?380:520));
     const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0]).toBeCloseTo(value(required(row.rect.inlineStart,'Missing affine evidence'),width,height),1);
       expect(actual[1]).toBeCloseTo(value(required(row.rect.inlineSize,'Missing affine evidence'),width,height),1);
     }
   }
 }
});

test('child proof transfers to a different allocation and affine origin only with exact parent evidence',async({page,browserName})=>{
 const {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession}=await import('../packages/veriss/src/layout-contract.mjs');
 const childProfile={id:'child',ua:browserName,viewport:{min:160,max:640,height:{min:300,max:300}}};
 const parentProfile={id:'parent',ua:browserName,viewport:{min:320,max:1280,height:{min:400,max:900}}};
 const state=createStateIR({initial:'ready',states:['ready'],transitions:[]});
 const html='<!doctype html><html lang="en"><head><title>Panel</title></head><body><div id="control"></div></body></html>';
 const reset='*{box-sizing:border-box;margin:0;padding:0}';
 const childCSS=reset+'#control{position:fixed;top:0;left:0;width:100%;height:48px}';
 const parentCSS=reset+'#control{position:fixed;top:30px;left:20px;width:50vw;height:48px}';
 const make=(profile:EnvironmentProfile,css:string,contracts:Relation[])=>createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts}),{state,environment:createEnvironmentIR([profile]),evidence:createEvidenceIR(domGeometry({state:'ready',profile,html,css,targets:['control']}))});
 const child=make(childProfile,childCSS,[{id:'fit',kind:'within-viewport',target:'control'}]);
 const goal:Relation={id:'allocated',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'control',field:'inlineEnd'},right:{op:'add',items:['20',{op:'scale',factor:'1/2',item:{environment:'width'}}]}}};
 const aff=(constant:string,coefficient='0')=>({constant,coefficient});
 const transfer={state:'ready',profile:'child',width:aff('0','1/2'),height:aff('300'),inlineStart:aff('20'),blockStart:aff('30')};
 const session=createRelationalProofSession(),api=await init();
 try{
  const imports:RelationalCompositionImport[]=[{obligation:child,contract:'fit',bind:{control:'control'},transfer}];
  const proof=await session.compose(make(parentProfile,parentCSS,[goal]),imports,api);
  expect(proof.status,JSON.stringify(proof)).toBe('verified');expect(proof.contracts[0]!.cases[0]!.method).toBe('composition');
  const bad=parentCSS+'#control{width:75vw}';
  expect((await session.compose(make(parentProfile,bad,[goal]),imports,api)).status).toBe('violated');
  for(const width of [320,650,1280]){
   await page.setViewportSize({width:width/2,height:300});
   await page.setContent(html.replace('</head>','<style>'+childCSS+'</style></head>'));
   const local=required(await page.locator('#control').boundingBox(),'Missing rendered rectangle');
   for(const style of [parentCSS,bad]){
    await page.setViewportSize({width,height:600});
    await page.setContent(html.replace('</head>','<style>'+style+'</style></head>'));
    const actual=required(await page.locator('#control').boundingBox(),'Missing rendered rectangle');
    expect(actual.x).toBeCloseTo(local.x+20,1);expect(actual.y).toBeCloseTo(local.y+30,1);
    expect(actual.height).toBeCloseTo(local.height,1);
    expect(actual.width).toBeCloseTo(style===bad?local.width*1.5:local.width,1);
   }
  }
 }finally{await killThreads(api.em)}
});

test('paint-only transition cannot alter independent inline geometry, mixed geometry transition is refused',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:400,max:900}}};
 const html='<!doctype html><html lang="en"><head><title>Panel</title></head><body><main id="shell"><kbd>native</kbd></main></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}body{background:black;color:white;transition:background 180ms,color 180ms}body.alt{background:white;color:black}#shell{max-width:520px;margin:0 auto}';
 const horizontal:Predicate={op:'compare',relation:'le',left:{target:'shell',field:'inlineEnd'},right:{environment:'safeRight'}};
 const model:UIModel={version:1,initial:'ready',states:['ready'],transitions:[],profiles:[profile],contracts:[{id:'fit',kind:'predicate',predicate:horizontal}]};
 const input={state:'ready',profile,html,css,targets:['shell']};
 const evidence=domGeometry(input);
 expect(evidence[0]!.axes).toEqual(['inline']);
 expect(verifyUI({model,evidence}).status).toBe('verified');
 for(const width of [320,520,521,1000]){
  await page.setViewportSize({width,height:600});
  await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
  const r=required(await page.locator('#shell').boundingBox(),'Missing rendered rectangle');
  expect(r.x).toBeCloseTo((width-Math.min(width,520))/2,1);expect(r.width).toBeCloseTo(Math.min(width,520),1);
  await page.locator('body').evaluate(n=>n.classList.add('alt'));
  await page.waitForTimeout(80);
  const moving=required(await page.locator('#shell').boundingBox(),'Missing rendered rectangle');expect(moving.x).toBe(r.x);expect(moving.width).toBe(r.width);
 }
 const wide=css+'#shell{width:120%;max-width:none}';
 expect(verifyUI({model,evidence:domGeometry({...input,css:wide})}).status).toBe('violated');
 expect(verifyUI({model,evidence:domGeometry({...input,css:css+'body{transition:color .2s,width .2s}'})}).status).toBe('unknown');
 await page.setViewportSize({width:320,height:600});await page.setContent(html.replace('</head>','<style>'+wide+'</style></head>'));
 expect(required(await page.locator('#shell').boundingBox(),'Missing shell').width).toBeCloseTo(384,1);
});

test('paint transitions and inactive grid tracks do not change block inline geometry',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1920,height:{min:320,max:1080}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><section id="panel"><kbd>native</kbd></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}body{transition:background .18s,color .18s}#shell{display:block;grid-template-columns:1fr 2fr;margin:auto;max-width:520px}#panel{width:100%}';
 const e=required(domGeometry({state:'screen',profile,html:source,css:style,targets:['panel']})[0],'Missing evidence');
 expect(e.axes,JSON.stringify(e)).toEqual(['inline']);
 for(const width of [320,519,520,521,1920])for(const height of [390,900]){
  await page.setViewportSize({width,height});
  await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
  const actual=await page.locator('#panel').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
  const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
  expect(rows.length).toBeGreaterThan(0);
  for(const row of rows){
   expect(actual[0]).toBeCloseTo(value(required(row.rect.inlineStart,'Missing affine evidence'),width,height),1);
   expect(actual[1]).toBeCloseTo(value(required(row.rect.inlineSize,'Missing affine evidence'),width,height),1);
  }
 }
 for(const extra of ['body{transition:width .2s}','body{transition:all .2s}','#shell{display:grid}']){
  expect(domGeometry({state:'screen',profile,html:source,css:style+extra,targets:['panel']})[0]!.rows).toBeUndefined();
 }
});

test('fixed block-axis projection preserves vertical coordinates without an intrinsic width model',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1920,height:{min:320,max:1080}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><section id="panel"><kbd>native</kbd></section></main></body></html>';
 const base='*{box-sizing:border-box;margin:0;padding:0}#panel{position:fixed;right:2rem;width:max-content;height:64px;bottom:12px}';
 const model:UIModel={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'bottom',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'panel',field:'blockEnd'},right:{environment:'safeBottom'}}},
  {id:'both',kind:'within-viewport',target:'panel'}
 ]};
 for(const valid of [true,false]){
  const style=base+(valid?'':'#panel{bottom:-1px}');
  const evidence=domGeometry({state:'screen',profile,html:source,css:style,targets:['panel']});
  const e=required(evidence[0],'Missing evidence');expect(e.axes,JSON.stringify(e)).toEqual(['block']);
  expect(verifyUI({model,evidence}).contracts.map(c=>c.status)).toEqual([valid?'verified':'violated','unknown']);
  for(const width of [320,800,1920])for(const height of [320,390,1080]){
   await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
   const actual=await page.locator('#panel').evaluate(el=>{const r=el.getBoundingClientRect();return [r.y,r.height]});
   const rows=required(e.rows,'Missing geometry rows').filter(r=>required(r.constraints,'Missing region constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
   expect(rows.length).toBeGreaterThan(0);
   for(const row of rows){
    expect(actual[0]).toBeCloseTo(value(required(row.rect.blockStart,'Missing affine evidence'),width,height),1);
    expect(actual[1]).toBeCloseTo(value(required(row.rect.blockSize,'Missing affine evidence'),width,height),1);
    expect(row.rect.inlineSize).toBeUndefined();
   }
  }
 }
});


test('conditional convex transition proof agrees with a shared bounded width interpolation',async({page,browserName})=>{
 const {verifyInterpolatedPredicate}=await import('../packages/veriss/src/transitions.mjs');
 const {layoutGeometry,createLayoutIR}=await import('../packages/veriss/src/layout-contract.mjs');
 const {analyzeHTML}=await import('../packages/veriss/src/html.mjs');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>QA</title></head><body><div id="outer"><div id="panel"></div></div></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#outer{position:fixed;left:50%;top:0;transform:translateX(-50%);width:120px;height:80px;border:1px solid #123456}#panel{height:40px}';
 const assumptions=['Fixed viewport; parent width changes between the two endpoints and all other inline coordinates depend affinely on it.'];
 const evidence=['closed','open'].flatMap(state=>layoutGeometry({state,profile,layout:createLayoutIR(analyzeHTML(source,{css:css+(state==='open'?'#outer{width:300px}':''),viewport:profile.viewport,ua:browserName,integrity:true,scrollbars:[{name:'overlay',inlineSize:0,blockSize:0}]})),targets:['outer','panel'],local:{assumptions}}));
 const predicate={op:'all',items:['outer','panel'].flatMap(target=>[{op:'compare',relation:'ge',left:{target,field:'inlineStart'},right:'0'},{op:'compare',relation:'le',left:{target,field:'inlineEnd'},right:{environment:'width'}}])};
 const input={profile,from:'closed',to:'open',evidence,predicate,interpolation:{kind:'shared-affine',easing:'cubic-bezier(.3,.7,.2,1)',assumptions}};
 expect(verifyInterpolatedPredicate(input).status).toBe('verified');
 for(const width of [320,400,1000]){
  await page.setViewportSize({width,height:600});
  await page.setContent(source.replace('</head>','<style>'+css+'</style></head>'));
  const frames=await page.evaluate(()=>{
   const outer=document.querySelector<HTMLElement>('#outer'),panel=document.querySelector<HTMLElement>('#panel');
   if(!outer||!panel)throw Error('Missing animated elements');
   const animation=outer.animate([{width:'120px'},{width:'300px'}],{duration:540,easing:'cubic-bezier(.3,.7,.2,1)',fill:'both'});
   animation.pause();
   const frames=[];
   for(const t of [0,1,27,81,135,270,405,539,540]){
    animation.currentTime=t;
    const a=outer.getBoundingClientRect(),b=panel.getBoundingClientRect();
    frames.push({outer:{x:a.x,right:a.right,width:a.width},panel:{x:b.x,right:b.right,width:b.width}});
   }
   animation.cancel();return frames;
  });
  for(const {outer,panel} of frames){
   expect(outer.x).toBeGreaterThanOrEqual(0);
   expect(outer.right).toBeLessThanOrEqual(width);
   expect(outer.width).toBeGreaterThanOrEqual(120);
   expect(outer.width).toBeLessThanOrEqual(300);
   expect(panel.x).toBeCloseTo(outer.x+1,1);
   expect(panel.width).toBeCloseTo(outer.width-2,1);
  }
 }
 expect(verifyInterpolatedPredicate({...input,interpolation:{...input.interpolation,easing:'cubic-bezier(.3,2,.2,1)'}}).status).toBe('unknown');
});

test('font-independent form width ignores focus paint and inactive animation metadata',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const html='<!doctype html><html lang="en"><head><title>Account settings</title></head><body><header><kbd>native</kbd></header><main id="account"><section tabindex="0" id="settings"><kbd>unknown height</kbd></section></main></body></html>';
 const base='*{box-sizing:border-box;margin:0;padding:0}#account{max-width:640px;margin:auto;padding-inline:24px}#settings{width:100%}';
 // Explicit tabindex is not yet admitted by the conservative projection;
 // test the same focus-paint cascade with an independently sized container.
 const source=html.replace(' tabindex="0"','');
 const paint='body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}:focus-visible{outline:3px solid orange;outline-offset:4px}@media(prefers-reduced-motion:reduce){*{animation-iteration-count:1!important;animation-duration:.01ms!important;animation-fill-mode:none;transition-duration:.01ms!important}}';
 const css=base+paint;
 const e=required(domGeometry({state:'screen',profile,html:source,css,targets:['settings']})[0],'Missing settings geometry');
 expect(e.axes,JSON.stringify(e)).toEqual(['inline']);
 for(const reducedMotion of ['reduce','no-preference'] as const){
  await page.emulateMedia({reducedMotion});
  for(const width of [320,639,640,641,1000]){
   const height=600;await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+css+'</style></head>'));
   const actual=await page.locator('#settings').evaluate(n=>{const r=n.getBoundingClientRect();return [r.x,r.width]});
   const rows=required(e.rows,'Missing settings geometry rows').filter(r=>required(r.constraints,'Missing geometry constraints').every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
   expect(rows.length).toBeGreaterThan(0);
   for(const r of rows){
    expect(actual[0]).toBeCloseTo(value(required(r.rect.inlineStart,'Missing inlineStart'),width,height),1);
    expect(actual[1]).toBeCloseTo(value(required(r.rect.inlineSize,'Missing inlineSize'),width,height),1);
   }
  }
 }
 for(const extra of [':focus-visible{width:200vw}','#account{animation-name:grow}@keyframes grow{to{width:200vw}}']){
  expect(domGeometry({state:'screen',profile,html:source,css:css+extra,targets:['settings']})[0]?.rows).toBeUndefined();
 }
});

test('shared progress can prove clearance of two moving workspace panes, not just a navigation width',async({page,browserName})=>{
 const {verifyInterpolatedPredicate}=await import('../packages/veriss/src/transitions.mjs');
 const {layoutGeometry,createLayoutIR}=await import('../packages/veriss/src/layout-contract.mjs');
 const {analyzeHTML}=await import('../packages/veriss/src/html.mjs');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>Workspace</title></head><body><aside id="palette"></aside><main id="workspace"></main></body></html>';
 const base='*{margin:0;padding:0;box-sizing:border-box}#palette{position:fixed;top:0;left:0;width:48px;height:80px}#workspace{position:fixed;left:56px;right:0;top:16px;height:80px}';
 const expanded='#palette{width:136px}#workspace{left:144px;height:120px}';
 const assumptions=['Both panes share the same interpolation progress at a fixed viewport.'];
 const extract=(state:string,css:string)=>layoutGeometry({state,profile,layout:createLayoutIR(analyzeHTML(source,{css,viewport:profile.viewport,ua:browserName,integrity:true,scrollbars:[{name:'overlay',inlineSize:0,blockSize:0}]})),targets:['palette','workspace'],local:{assumptions}});
 const before=extract('compact',base),after=extract('editing',base+expanded);
 const predicate={op:'all',items:[
  {op:'compare',relation:'le',left:{op:'add',items:[{target:'palette',field:'inlineEnd'},'8']},right:{target:'workspace',field:'inlineStart'}},
  {op:'compare',relation:'le',left:{target:'workspace',field:'inlineEnd'},right:{environment:'width'}},
  {op:'compare',relation:'le',left:{target:'workspace',field:'blockEnd'},right:{environment:'height'}}
 ]};
 const input={profile,from:'compact',to:'editing',evidence:[...before,...after],predicate,interpolation:{kind:'shared-affine',easing:'linear',assumptions}};
 expect(verifyInterpolatedPredicate(input).status).toBe('verified');
 expect(verifyInterpolatedPredicate({...input,evidence:[...before,...extract('editing',base+expanded+'#workspace{left:120px}')] }).status).toBe('violated');
 for(const width of [320,480,1000]) {
  await page.setViewportSize({width,height:480});
  await page.setContent(source.replace('</head>','<style>'+base+'</style></head>'));
  const samples=await page.evaluate(()=>{
   const p=document.querySelector<HTMLElement>('#palette'),w=document.querySelector<HTMLElement>('#workspace');
   if(!p||!w)throw Error('Missing workspace panes');
   const a=p.animate([{width:'48px'},{width:'136px'}],{duration:400,fill:'both',easing:'linear'});
   const b=w.animate([{left:'56px',height:'80px'},{left:'144px',height:'120px'}],{duration:400,fill:'both',easing:'linear'});
   a.pause();b.pause();
   const result=[];
   for(const t of [0,1,80,160,240,320,399,400]) {
    a.currentTime=b.currentTime=t;
    const x=p.getBoundingClientRect(),y=w.getBoundingClientRect();result.push({clearance:y.x-x.right,right:y.right,bottom:y.bottom});
   }
   // Moving only the palette proves why common progress must be an assumption.
   a.currentTime=400;b.currentTime=0;
   const asynchronous=w.getBoundingClientRect().x-p.getBoundingClientRect().right;
   a.cancel();b.cancel();return {result,asynchronous};
  });
  for(const r of samples.result){expect(r.clearance).toBeCloseTo(8,1);expect(r.right).toBeCloseTo(width,1);expect(r.bottom).toBeLessThanOrEqual(480.05)}
  expect(samples.asynchronous).toBeLessThan(0);
 }
});

test('closed CSS width transition derivation covers responsive intermediate geometry',async({page,browserName})=>{
 const {verifyCSSWidthTransition}=await import('../packages/veriss/src/transitions.mjs');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1920,height:{min:320,max:1080}}};
 const html='<!doctype html><html lang="en"><head><title>QA</title></head><body><section id="tray" data-open="false"><div id="contents"></div><div id="toolbar"></div></section></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#tray{display:flex;flex-direction:column-reverse;position:fixed;left:50%;top:0;height:100px;transform:translateX(-50%);width:min(230px,100vw - 24px);transition:width .54s cubic-bezier(.3,.7,.2,1),opacity .2s ease;border:1px solid #333}#tray[data-open=true]{width:min(344px,100vw - 22px);opacity:.9}#contents{height:20px;min-width:0;flex:none}#toolbar{height:40px;min-width:0;flex:none}@media(width>=1025px){#tray{width:258px}#tray[data-open=true]{width:358px}}';
 const predicate={op:'all',items:['tray','contents','toolbar'].flatMap(target=>[{op:'compare',relation:'ge',left:{target,field:'inlineStart'},right:'0'},{op:'compare',relation:'le',left:{target,field:'inlineEnd'},right:{environment:'width'}}])};
 const input={html,css,profile,target:'tray',stateAttribute:'data-open',from:'false',to:'true',predicate};
 const proof=verifyCSSWidthTransition(input);
 expect(proof.status,JSON.stringify(proof)).toBe('verified');
 expect(verifyCSSWidthTransition({...input,css:css.replace('translateX(-50%)','none')}).status).toBe('violated');
 expect(verifyCSSWidthTransition({...input,css:css.replace('.3,.7,.2,1','.3,2,.2,1')}).status).toBe('unknown');
 for(const width of [320,365,366,367,1024,1025,1920]){
  await page.setViewportSize({width,height:600});
  await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
  const frames=await page.evaluate(()=>{
   const tray=document.querySelector<HTMLElement>('#tray'),read=()=>['tray','contents','toolbar'].map(id=>{const element=document.getElementById(id);if(!element)throw Error('Missing '+id);const r=element.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width}});
   if(!tray)throw Error('Missing tray');
   const before=read();tray.dataset.open='true';void tray.offsetWidth;
   const animation=tray.getAnimations().find(a=>'transitionProperty' in a&&a.transitionProperty==='width');
   if(!animation)throw Error('Expected authored width transition');
   animation.pause();const frames=[];
   for(const t of [0,1,27,81,135,270,405,539,540]){animation.currentTime=t;frames.push(read())}
   return {before,frames};
  });
  const end=required(required(frames.frames.at(-1),'Missing final frame')[0],'Missing final tray');
  const initial=required(frames.before[0],'Missing initial tray');
  for(const f of frames.frames){
   const root=required(f[0],'Missing animated tray');
   expect(root.width).toBeGreaterThanOrEqual(initial.width-.1);
   expect(root.width).toBeLessThanOrEqual(end.width+.1);
   for(const r of f){expect(r.x).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(width)}
   for(const child of f.slice(1)){expect(child.x).toBeCloseTo(root.x+1,1);expect(child.width).toBeCloseTo(root.width-2,1)}
  }
 }
});
