import {test,expect} from '@playwright/test';
import {domGeometry,verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';

const html='<!doctype html><html lang="en"><head><title>Independent application pane</title></head><body><main id="shell"><kbd>native content</kbd><div class="decor"></div><canvas class="scene" width="300" height="150"></canvas></main></body></html>';
const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#shell::after{content:"";position:absolute;inset:0;pointer-events:none}.scene{position:absolute;inset:0;width:100%;height:100%}.decor:has(> .x){clip-path:polygon(0 0,100% 0,0 100%);width:2px}@media (max-height:460px){.scene{height:80%}}div[hidden]{display:none}';
const rational=s=>{const [a,b='1']=String(s??0).split('/');return Number(a)/Number(b)};
const value=(a,w,h)=>rational(a.constant)+rational(a.coefficient)*w+rational(a.heightCoefficient)*h;

test('automatic local evidence matches original browser geometry across both axes',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const targets=['shell','scene'],bindings={scene:'.scene'};
 const args={state:'screen',profile,html,css,targets,bindings};
 const evidence=domGeometry(args);
 expect(evidence.map(e=>e.source)).toEqual(['local-dom','local-dom']);
 expect(evidence.every(e=>e.rows?.length),JSON.stringify(evidence)).toBe(true);
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'fit',kind:'within-viewport',target:'scene'}]};
 expect(verifyUI({model,evidence}).status).toBe('verified');
 for(const width of [320,651,1000])for(const height of [320,460,461,900]){
   await page.setViewportSize({width,height});
   await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator(bindings[e.target]??'#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows)for(const [i,k] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())
       expect(actual[i]).toBeCloseTo(value(row.rect[k],width,height),1);
   }
 }
 const bad=domGeometry({...args,css:css+'#shell::after{position:static}'});
 expect(verifyUI({model,evidence:bad}).status).toBe('unknown');
});

test('local rectangle proofs imply page separation; a changed implementation must recheck',async({page,browserName})=>{
 const {createRequire}=await import('node:module');
 const {init,killThreads}=createRequire(new URL('../packages/veriss/package.json',import.meta.url))('z3-solver');
 const {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession}=await import('../packages/veriss/src/layout-contract.mjs');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:400,max:900}}};
 const state=createStateIR({initial:'ready',states:['ready'],transitions:[]}),environment=createEnvironmentIR([profile]);
 const html='<!doctype html><html lang="en"><head><title>Dashboard</title></head><body><main id="shell"><div id="left" role="button" aria-label="Previous"></div><div id="right" role="button" aria-label="Next"></div><kbd>native content</kbd></main></body></html>';
 const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#left,#right{position:absolute;top:20px;width:44%;height:48px}#left{left:0}#right{right:0}';
 const facts=(targets,style=css)=>domGeometry({state:'ready',profile,html,css:style,targets});
 const make=(component,contracts,evidence)=>createObligationIR(createContractIR({component,profile:'relational/1',contracts}),{state,environment,evidence:createEvidenceIR(evidence)});
 const half={op:'scale',factor:'1/2',item:{environment:'width'}};
 const child=(target,field,relation)=>make(target,[{id:'half',kind:'predicate',predicate:{op:'compare',relation,left:{target,field},right:half}}],facts([target]));
 const imports=[
  {obligation:child('left','inlineEnd','le'),contract:'half',bind:{left:'left'}},
  {obligation:child('right','inlineStart','ge'),contract:'half',bind:{right:'right'}}
 ];
 const parent=style=>make('Dashboard',[{id:'separation',kind:'disjoint',target:'left',other:'right'}],facts(['left','right'],style));
 const s=createRelationalProofSession(),api=await init();
 try{
  const report=await s.compose(parent(css),imports,api);
  expect(report.status).toBe('verified');
  expect(report.contracts[0].cases[0].method).toBe('composition');
  const badCSS=css+'#left,#right{width:60%}';
  const bad=await s.compose(parent(badCSS),imports,api);
  expect(bad.status).toBe('violated');
  expect(bad.contracts[0].cases[0].method).toBeUndefined();
  for(const [style,valid] of [[css,true],[badCSS,false]])for(const width of [320,651,1000])for(const height of [400,900]){
    await page.setViewportSize({width,height});
    await page.setContent(html.replace('</head>','<style>'+style+'</style></head>'));
    const [a,b]=await page.locator('#left,#right').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}));
    expect(a.right<=b.left).toBe(valid);
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
   const [e]=domGeometry({state:'screen',profile,html:input,css:style,targets:['shell']});
   expect(e.rows?.length??0,JSON.stringify(e)).toBeGreaterThan(0);
   for(const width of [320,399,400,519,520,521,657,1000]){
     const height=700;
     await page.setViewportSize({width,height});
     await page.setContent(input.replace('</head>','<style>'+style+'</style></head>'));
     const actual=await page.locator('#shell').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0],declaration+' @ '+width).toBeCloseTo(value(row.rect.inlineStart,width,height),1);
       expect(actual[1],declaration+' @ '+width).toBeCloseTo(value(row.rect.inlineSize,width,height),1);
     }
   }
 }
});

test('nested overflow projection keeps exact rectangles and exposes failure at short heights',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="app"><section id="field"><kbd>native</kbd><div id="surface"></div></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}html,body,#app{width:100%;height:100dvh;overflow:hidden}#field{position:relative;width:100%;height:100%;min-height:400px;overflow:hidden}#surface{position:absolute;inset:0}';
 const evidence=domGeometry({state:'screen',profile,html:source,css:style,targets:['field','surface']});
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
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
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows)for(const [i,k] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())
       expect(actual[i]).toBeCloseTo(value(row.rect[k],width,height),1);
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
 const model={version:1,initial:'ready',states:['ready'],transitions:[],profiles:[profile],contracts:[{id:'size',kind:'min-size',target:'left',width:44,height:44}]};
 expect(verifyUI({model,evidence:initial}).status).toBe('verified');
 expect(verifyUI({model,evidence}).status).toBe('violated');
 for(const width of [320,600,601,1000])for(const height of [400,900]){
  await page.setViewportSize({width,height});
  await page.setContent(html.replace('</head>','<style>'+changed.css+'</style></head>'));
  for(const e of evidence){
   const actual=await page.locator('#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
   const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
   expect(rows.length).toBeGreaterThan(0);
   for(const row of rows)for(const [i,k] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())expect(actual[i]).toBeCloseTo(value(row.rect[k],width,height),1);
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
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'inline',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'panel',field:'inlineEnd'},right:{environment:'safeRight'}}},
  {id:'both',kind:'within-viewport',target:'panel'}
 ]};
 expect(verifyUI({model,evidence}).contracts.map(c=>c.status)).toEqual(['verified','unknown']);
 for(const width of [320,400,500,501,799,800,801,1520,1920])for(const height of [390,900]){
   await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator('#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0]).toBeCloseTo(value(row.rect.inlineStart,width,height),1);
       expect(actual[1]).toBeCloseTo(value(row.rect.inlineSize,width,height),1);
       expect(row.rect.blockSize).toBeUndefined();
     }
   }
 }
});

test('root descendant presence keeps selector priority in an inline projection',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const html=present=>'<!doctype html><html lang="en"><head><title>T</title></head><body><header'+(present?' class="journey"':'')+'><kbd>native</kbd></header><main><kbd>unknown height</kbd></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}body:has(.journey) main{max-width:380px}body main{max-width:520px;margin:0 auto}';
 for(const present of [true,false]){
   const [e]=domGeometry({state:'screen',profile,html:html(present),css:style,targets:['shell'],bindings:{shell:'main'}});
   expect(e.axes).toEqual(['inline']);
   expect(e.rows?.length??0,JSON.stringify(e)).toBeGreaterThan(0);
   for(const width of [320,379,380,381,519,520,521,1000]){
     const height=700;
     await page.setViewportSize({width,height});
     await page.setContent(html(present).replace('</head>','<style>'+style+'</style></head>'));
     const actual=await page.locator('main').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     expect(actual[1]).toBe(Math.min(width,present?380:520));
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0]).toBeCloseTo(value(row.rect.inlineStart,width,height),1);
       expect(actual[1]).toBeCloseTo(value(row.rect.inlineSize,width,height),1);
     }
   }
 }
});

test('child proof transfers to a different allocation and affine origin only with exact parent evidence',async({page,browserName})=>{
 const {createRequire}=await import('node:module');
 const {init,killThreads}=createRequire(new URL('../packages/veriss/package.json',import.meta.url))('z3-solver');
 const {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession}=await import('../packages/veriss/src/layout-contract.mjs');
 const childProfile={id:'child',ua:browserName,viewport:{min:160,max:640,height:{min:300,max:300}}};
 const parentProfile={id:'parent',ua:browserName,viewport:{min:320,max:1280,height:{min:400,max:900}}};
 const state=createStateIR({initial:'ready',states:['ready'],transitions:[]});
 const html='<!doctype html><html lang="en"><head><title>Panel</title></head><body><div id="control"></div></body></html>';
 const reset='*{box-sizing:border-box;margin:0;padding:0}';
 const childCSS=reset+'#control{position:fixed;top:0;left:0;width:100%;height:48px}';
 const parentCSS=reset+'#control{position:fixed;top:30px;left:20px;width:50vw;height:48px}';
 const make=(profile,css,contracts)=>createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts}),{state,environment:createEnvironmentIR([profile]),evidence:createEvidenceIR(domGeometry({state:'ready',profile,html,css,targets:['control']}))});
 const child=make(childProfile,childCSS,[{id:'fit',kind:'within-viewport',target:'control'}]);
 const goal={id:'allocated',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'control',field:'inlineEnd'},right:{op:'add',items:['20',{op:'scale',factor:'1/2',item:{environment:'width'}}]}}};
 const aff=(constant,coefficient='0')=>({constant,coefficient});
 const transfer={state:'ready',profile:'child',width:aff('0','1/2'),height:aff('300'),inlineStart:aff('20'),blockStart:aff('30')};
 const session=createRelationalProofSession(),api=await init();
 try{
  const imports=[{obligation:child,contract:'fit',bind:{control:'control'},transfer}];
  const proof=await session.compose(make(parentProfile,parentCSS,[goal]),imports,api);
  expect(proof.status,JSON.stringify(proof)).toBe('verified');expect(proof.contracts[0].cases[0].method).toBe('composition');
  const bad=parentCSS+'#control{width:75vw}';
  expect((await session.compose(make(parentProfile,bad,[goal]),imports,api)).status).toBe('violated');
  for(const width of [320,650,1280]){
   await page.setViewportSize({width:width/2,height:300});
   await page.setContent(html.replace('</head>','<style>'+childCSS+'</style></head>'));
   const local=await page.locator('#control').boundingBox();
   for(const style of [parentCSS,bad]){
    await page.setViewportSize({width,height:600});
    await page.setContent(html.replace('</head>','<style>'+style+'</style></head>'));
    const actual=await page.locator('#control').boundingBox();
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
 const horizontal={op:'compare',relation:'le',left:{target:'shell',field:'inlineEnd'},right:{environment:'safeRight'}};
 const model={version:1,initial:'ready',states:['ready'],transitions:[],profiles:[profile],contracts:[{id:'fit',kind:'predicate',predicate:horizontal}]};
 const input={state:'ready',profile,html,css,targets:['shell']};
 const evidence=domGeometry(input);
 expect(evidence[0].axes).toEqual(['inline']);
 expect(verifyUI({model,evidence}).status).toBe('verified');
 for(const width of [320,520,521,1000]){
  await page.setViewportSize({width,height:600});
  await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
  const r=await page.locator('#shell').boundingBox();
  expect(r.x).toBeCloseTo((width-Math.min(width,520))/2,1);expect(r.width).toBeCloseTo(Math.min(width,520),1);
  await page.locator('body').evaluate(n=>n.classList.add('alt'));
  await page.waitForTimeout(80);
  const moving=await page.locator('#shell').boundingBox();expect(moving.x).toBe(r.x);expect(moving.width).toBe(r.width);
 }
 const wide=css+'#shell{width:120%;max-width:none}';
 expect(verifyUI({model,evidence:domGeometry({...input,css:wide})}).status).toBe('violated');
 expect(verifyUI({model,evidence:domGeometry({...input,css:css+'body{transition:color .2s,width .2s}'})}).status).toBe('unknown');
 await page.setViewportSize({width:320,height:600});await page.setContent(html.replace('</head>','<style>'+wide+'</style></head>'));
 expect((await page.locator('#shell').boundingBox()).width).toBeCloseTo(384,1);
});

test('paint transitions and inactive grid tracks do not change block inline geometry',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1920,height:{min:320,max:1080}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><section id="panel"><kbd>native</kbd></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}body{transition:background .18s,color .18s}#shell{display:block;grid-template-columns:1fr 2fr;margin:auto;max-width:520px}#panel{width:100%}';
 const [e]=domGeometry({state:'screen',profile,html:source,css:style,targets:['panel']});
 expect(e.axes,JSON.stringify(e)).toEqual(['inline']);
 for(const width of [320,519,520,521,1920])for(const height of [390,900]){
  await page.setViewportSize({width,height});
  await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
  const actual=await page.locator('#panel').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
  const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
  expect(rows.length).toBeGreaterThan(0);
  for(const row of rows){
   expect(actual[0]).toBeCloseTo(value(row.rect.inlineStart,width,height),1);
   expect(actual[1]).toBeCloseTo(value(row.rect.inlineSize,width,height),1);
  }
 }
 for(const extra of ['body{transition:width .2s}','body{transition:all .2s}','#shell{display:grid}']){
  expect(domGeometry({state:'screen',profile,html:source,css:style+extra,targets:['panel']})[0].rows).toBeUndefined();
 }
});

test('fixed block-axis projection preserves vertical coordinates without an intrinsic width model',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1920,height:{min:320,max:1080}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><header><kbd>native</kbd></header><main id="shell"><section id="panel"><kbd>native</kbd></section></main></body></html>';
 const base='*{box-sizing:border-box;margin:0;padding:0}#panel{position:fixed;right:2rem;width:max-content;height:64px;bottom:12px}';
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'bottom',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'panel',field:'blockEnd'},right:{environment:'safeBottom'}}},
  {id:'both',kind:'within-viewport',target:'panel'}
 ]};
 for(const valid of [true,false]){
  const style=base+(valid?'':'#panel{bottom:-1px}');
  const evidence=domGeometry({state:'screen',profile,html:source,css:style,targets:['panel']});
  const e=evidence[0];expect(e.axes,JSON.stringify(e)).toEqual(['block']);
  expect(verifyUI({model,evidence}).contracts.map(c=>c.status)).toEqual([valid?'verified':'violated','unknown']);
  for(const width of [320,800,1920])for(const height of [320,390,1080]){
   await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
   const actual=await page.locator('#panel').evaluate(el=>{const r=el.getBoundingClientRect();return [r.y,r.height]});
   const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
   expect(rows.length).toBeGreaterThan(0);
   for(const row of rows){
    expect(actual[0]).toBeCloseTo(value(row.rect.blockStart,width,height),1);
    expect(actual[1]).toBeCloseTo(value(row.rect.blockSize,width,height),1);
    expect(row.rect.inlineSize).toBeUndefined();
   }
  }
 }
});
