import {test,expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

test('generated HTML, minified lengths, link metadata and side borders match browser geometry',async({page})=>{
  const base='*{box-sizing:border-box;margin:0;padding:0}html{font-size:16px}main{display:grid;grid-template-columns:minmax(0,1fr)}.date,a,img{display:block;width:80px;height:40px}';
  const html='<!doctype html><!-- generated --><html lang="ja"><head><title>T</title></head><body><main><time class="date" datetime="2026-11-20"></time><a href="#target" rel="noopener noreferrer"></a><img alt="" width="80" height="40" fetchpriority="high" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'40\'/%3E"></main></body></html>';
  const css=base+'.date{padding:.5rem;border-left:2px solid #123456}a{padding:.5em;border-bottom:2px solid #123456}img{border-top:initial}img{border-top-style:solid}';
  const report=analyzeHTML(html,{css,viewport:{min:320,max:1920,height:{min:480,max:1080}}});
  expect(report.status,JSON.stringify(report.diagnostics)).toBe('verified');
  for(const width of [320,768,1920]){
    await page.setViewportSize({width,height:900});
    await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
    const actual=await page.locator('time,a,img').evaluateAll(nodes=>nodes.map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return [r.x,r.y,r.width,r.height,parseFloat(s.paddingLeft),parseFloat(s.borderLeftWidth),parseFloat(s.borderTopWidth),parseFloat(s.borderBottomWidth)];
    }));
    expect(actual).toEqual([[0,0,80,40,8,2,0,0],[0,40,80,40,8,0,0,2],[0,80,80,40,0,0,3,0]]);
    const model=report.sizes.filter(s=>['.date','a@Document/0/0/1','img@Document/0/0/2'].includes(s.box));
    expect(model).toHaveLength(3);
    for(const [i,s] of model.entries()){
      expect(Number(s.rect.inlineStart.constant)).toBe(actual[i][0]);
      expect(Number(s.rect.blockStart.constant)).toBe(actual[i][1]);
      expect(Number(s.rect.inlineSize.constant)).toBe(actual[i][2]);
      expect(Number(s.rect.blockSize.constant)).toBe(actual[i][3]);
    }
  }
});

test('scripting-enabled static snapshot excludes noscript fallback',async({page})=>{
  const html='<!doctype html><html lang="en"><body><main><noscript><p>fallback</p></noscript><div class="item"></div></main></body></html>';
  const css='*{box-sizing:border-box;margin:0;padding:0}main{display:grid;grid-template-columns:minmax(0,1fr)}.item{width:80px;height:40px}@media (scripting: none){.item{width:500px}}@media (scripting: enabled){.item{width:100px}}';
  const report=analyzeHTML(html,{css,scripting:'enabled',viewport:{min:320,max:1920,height:{min:480,max:1080}}});
  expect(report.status,JSON.stringify(report.diagnostics)).toBe('verified');
  await page.setContent(html.replace('<body>','<head><style>'+css+'</style></head><body>'));
  expect(await page.locator('noscript').evaluate(el=>({children:el.children.length,boxes:el.getClientRects().length}))).toEqual({children:0,boxes:0});
  expect(await page.evaluate(()=>matchMedia('(scripting: enabled)').matches)).toBe(true);
  expect(await page.locator('.item').evaluate(el=>el.getBoundingClientRect().width)).toBe(Number(report.sizes.find(s=>s.box==='.item').inlineSize.constant));
});

test('minified game media queries and safe-area sum match actual layout',async({page})=>{
  const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,viewport-fit=cover"></head><body><main><div class="hud"></div></main></body></html>';
  const css='*{box-sizing:border-box;margin:0}html,body,main{display:grid;grid-template-columns:minmax(0,1fr)}.hud{height:90px;padding-top:calc(19px + env(safe-area-inset-top));padding-bottom:calc(env(safe-area-inset-bottom, 40px) + 5px)}@media (min-width:651px)and (max-width:1000px){.hud{height:110px}}@media (max-height:510px)and (min-width:651px){.hud{height:130px}}@media (min-width:651px)and(max-width:1000px){.hud{height:200px}}';
  for (const [width,height,expected] of [[650,700,90],[651,700,110],[1000,700,110],[1001,700,90],[700,510,130],[700,511,110]]) {
    await page.setViewportSize({width,height});
    await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
    const measurement=await page.locator('.hud').evaluate(el=>({height:el.getBoundingClientRect().height,top:parseFloat(getComputedStyle(el).paddingTop),bottom:parseFloat(getComputedStyle(el).paddingBottom)}));
    expect(measurement).toEqual({height:expected,top:19,bottom:5});
    const report=analyzeHTML(html,{css,viewport:{min:width,max:width,height:{min:height,max:height}},safeArea:{top:0,right:0,bottom:0,left:0}});
    expect(report.status,JSON.stringify(report.diagnostics)).toBe('verified');
    const size=report.sizes.find(s=>s.box==='.hud');
    expect(Number(size.blockSize.constant)).toBe(measurement.height);
    expect(Number(size.contentBlockSize.constant)).toBe(measurement.height-measurement.top-measurement.bottom);
  }
  const unknown=analyzeHTML(html,{css,viewport:{min:320,max:1920,height:{min:320,max:1080}}});
  expect(unknown.status).toBe('unknown');
  expect(unknown.diagnostics.some(d=>d.message.includes('safeArea'))).toBe(true);
});

test('snapshot game contracts match browser rectangles in both axes',async({page})=>{
  const {analyzeSnapshots}=await import('../packages/adapter-core/src/index.mjs');
  const {captureSnapshot}=await import('../tools/capture-snapshots.mjs');
  const css='*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{display:grid;grid-template-columns:100px 100px;gap:10px;height:100px}#left,#right{height:48px}@media (max-height:550px){html[data-mode=paused] #left{margin-top:8px}}';
  const html='<!doctype html><html lang="en" data-mode="normal"><head><title>Game</title><style>'+css+'</style></head><body><main id="field"><div id="left" data-noshift="left"></div><div id="right"></div></main></body></html>';
  await page.setContent(html);
  const states=[await captureSnapshot(page,{mode:'normal'},{headLayoutIndependent:true})];
  await page.evaluate(()=>document.documentElement.dataset.mode='paused');
  states.push(await captureSnapshot(page,{mode:'paused'},{headLayoutIndependent:true}));
  const contracts=[{kind:'disjoint',target:'left',other:'right'},{kind:'contains',target:'field',other:'left'}];
  const report=analyzeSnapshots({states,css,contracts},{viewport:{min:320,max:800,height:{min:400,max:900}}});
  expect(report.status).toBe('violated');
  expect(report.findings.filter(f=>f.code==='E_LAYOUT_NOSHIFT')).toHaveLength(1);
  expect(report.findings.filter(f=>f.code==='E_SNAPSHOT_CONTRACT')).toHaveLength(0);
  for(const width of [320,800]) for(const height of [400,550,551,900]){
    await page.setViewportSize({width,height});
    const read=async mode=>{
      await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);
      return page.locator('#left,#right').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}));
    };
    const normal=await read('normal'),paused=await read('paused');
    expect(paused[0].y-normal[0].y).toBe(height<=550?8:0);
    for(const rows of [normal,paused]) expect(rows[0].right).toBeLessThanOrEqual(rows[1].x);
  }
  const safe=analyzeSnapshots({states,css,contracts:[{kind:'within-viewport',target:'right'}]},{viewport:{min:320,max:800,height:{min:400,max:900}},safeArea:{top:20}});
  expect(safe.findings.some(f=>f.code==='E_SNAPSHOT_CONTRACT')).toBe(true);
});

test('game model separates DOM/canvas geometry, HUD union and live action observations',async({page})=>{
  const {verifyUI,domGeometry}=await import('../packages/adapter-core/src/ui-contracts.mjs');
  const {captureUIObservation}=await import('../tools/capture-snapshots.mjs');
  const profile={id:'desktop',viewport:{min:320,max:800,height:{min:400,max:900}}};
  const css='*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{position:relative;display:grid;grid-template-columns:minmax(0,1fr);height:100px}#hud{position:absolute;left:0;top:0;width:100px;height:50px}#extra{position:absolute;left:50px;top:0;width:100px;height:50px}';
  const html='<!doctype html><html lang="en"><head><title>Game</title></head><body><main id="field"><div id="hud"></div><div id="extra"></div></main></body></html>';
  const model={version:1,initial:'play',states:['play','pause'],transitions:[{from:'play',event:'pause',to:'pause'}],profiles:[profile],contracts:[
    {id:'space',kind:'max-occupancy',target:'field',overlays:['hud','extra'],max:'1/4',states:['play']},
    {id:'tight',kind:'max-occupancy',target:'field',overlays:['hud','extra'],max:'1/8',states:['play']},
    {id:'stable',kind:'stable',target:'hud',event:'pause'},
    {id:'action',kind:'action',event:'pause'}
  ]};
  const evidence=['play','pause'].flatMap(state=>domGeometry({state,profile,html,css,targets:['hud','extra']}));
  // The simulated scene renderer's model is independently supplied. Its
  // CSS-pixel projection is compared below against the browser's field box.
  const a=(constant,coefficient='0')=>({constant,coefficient});
  evidence.push({state:'play',profile:'desktop',target:'field',source:'scene',assumptions:['scene uses full viewport width and 100 CSS px height at origin'],rows:[{rect:{inlineStart:a('0'),blockStart:a('0'),inlineSize:a('0','1'),blockSize:a('100')}}]});
  const check=verifyUI({model,evidence});
  expect(check.contracts.map(c=>c.status)).toEqual(['verified','violated','verified','unknown']);
  const observations=[];
  for(const width of [320,600,800]){
    await page.setViewportSize({width,height:600});
    await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
    const targets=['field','hud','extra'];
    const one=await captureUIObservation(page,{state:'play',profile:'desktop',targets});
    observations.push(one);
    const {field,hud,extra}=one.rects;
    expect((hud.width*50+extra.width*50-50*50)/(field.width*field.height)).toBeCloseTo(75/width);
    await page.evaluate(()=>document.querySelector('#hud').addEventListener('click',()=>document.body.dataset.mode='pause'));
    await page.locator('#hud').click({position:{x:10,y:10}});
    expect(await page.locator('body').getAttribute('data-mode')).toBe('pause');
    observations.push(await captureUIObservation(page,{state:'pause',profile:'desktop',targets}),
      {state:'play',profile:'desktop',width,height:600,event:'pause',to:'pause',passed:true});
  }
  const report=verifyUI({model,evidence,observations});
  expect(report.contracts.find(c=>c.id==='space').observations.map(o=>o.status)).toEqual(['passed','passed','passed']);
  expect(report.contracts.find(c=>c.id==='tight').observations.map(o=>o.status)).toEqual(['failed','passed','passed']);
  expect(report.contracts.find(c=>c.id==='stable').observations.map(o=>o.status)).toEqual(['passed','passed','passed']);
  expect(report.contracts.find(c=>c.id==='action').observations.map(o=>o.status)).toEqual(['passed','passed','passed']);
  expect(report.outcome).toBe('failed');
});

test('fixed translation fit follows the rendered box at responsive boundaries',async({page})=>{
  const base='*{box-sizing:border-box;margin:0;padding:0}html,body{font-size:16px}.island{position:fixed;bottom:14px;left:50%;width:min(344px,100vw - 22px);height:57px;border:1px solid #3c4943}';
  for(const [transform,expected] of [['translate(-50%)translateZ(0)',true],['none',false],['translate(-110%)',false],['translate(10%)',false]]){
    const css=base+'.island{transform:'+transform+'}';
    const html='<!doctype html><html lang="en"><body><div class="island"></div></body></html>';
    const report=analyzeHTML(html,{css,viewport:{min:320,max:1920,height:{min:320,max:1080}},integrity:true});
    expect(report.status).toBe(expected?'verified':'violated');
    await page.setContent(html.replace('<body>','<head><style>'+css+'</style></head><body>'));
    let outside=false;
    for(const width of [320,365,366,367,527,688,1025,1920]){
      await page.setViewportSize({width,height:600});
      const r=await page.locator('.island').evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,y:b.y,width:b.width}});
      const rat=s=>{const [n,d='1']=String(s??0).split('/');return Number(n)/Number(d)};
      const at=a=>rat(a.constant)+rat(a.coefficient)*width+rat(a.heightCoefficient)*600;
      const row=report.sizes.find(s=>s.box==='.island'&&(width> s.range.min||width===s.range.min&&s.range.minInclusive)&&(width<s.range.max||width===s.range.max&&s.range.maxInclusive));
      expect(row?.rect).toBeTruthy();
      expect(r.left).toBeCloseTo(at(row.rect.inlineStart),2);
      expect(r.width).toBeCloseTo(at(row.rect.inlineSize),2);
      outside ||= r.left < -0.01 || r.right > width+0.01;
    }
    expect(outside).toBe(!expected);
  }
});

test('minified rotation and dynamic viewport flex lengths match in a fixed viewport',async({page})=>{
  const html='<!doctype html><html lang="en"><body><main><div class="item"></div></main></body></html>';
  const css='*{box-sizing:border-box;margin:0;padding:0}main{display:flex;height:300px}.item{flex:0 0 38dvh;min-width:0;min-height:0;transform:rotate(0)}';
  const report=analyzeHTML(html,{css,viewport:{min:320,max:1920,height:{min:320,max:600}},integrity:true});
  expect(report.status,JSON.stringify(report.diagnostics)).toBe('verified');
  await page.setContent(html.replace('<body>','<head><style>'+css+'</style></head><body>'));
  for(const [width,height] of [[320,320],[650,510],[1920,600]]){
    await page.setViewportSize({width,height});
    const actual=await page.locator('.item').evaluate(n=>({width:n.getBoundingClientRect().width,transform:getComputedStyle(n).transform}));
    const a=report.sizes.find(s=>s.box==='.item').rect.inlineSize;
    expect(actual.width).toBeCloseTo(Number(a.heightCoefficient.split('/')[0])/Number(a.heightCoefficient.split('/')[1])*height,1);
    expect(actual.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
  }
});

test('relational profile proves ordinary account settings responsiveness and state stability',async({page,browserName})=>{
  const {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,verifyObligationIR}=await import('../packages/veriss/src/layout-contract.mjs');
  const {domGeometry}=await import('../packages/adapter-core/src/ui-contracts.mjs');
  const {captureUIObservation}=await import('../tools/capture-snapshots.mjs');
  const html='<html lang="en"><head><title>Account settings</title></head><body><main id="panel"><section id="details"><div id="email" role="textbox" aria-label="Email address"></div></section><section id="actions"><div id="save" role="button" aria-label="Save"></div></section></main></body></html>';
  const css='*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}#panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}#details,#actions{display:grid;grid-template-columns:minmax(0,1fr);height:100px;align-content:start}#email,#save{width:100%;height:48px}@media(max-width:600px){#panel{grid-template-columns:minmax(0,1fr)}}';
  const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:400,max:900}}};
  const state=createStateIR({initial:'editing',states:['editing','saving'],transitions:[{from:'editing',event:'save',to:'saving'}]});
  const environment=createEnvironmentIR([profile]);
  const cmp=(relation,left,right)=>({op:'compare',relation,left,right});
  const ref=(target,field,endpoint)=>({target,field,...(endpoint?{endpoint}:{})});
  const separation={op:'any',items:[
    cmp('le',{op:'add',items:[ref('details','inlineEnd'),'16']},ref('actions','inlineStart')),
    cmp('le',{op:'add',items:[ref('details','blockEnd'),'16']},ref('actions','blockStart'))
  ]};
  const spec=createContractIR({component:'AccountSettings',profile:'relational/1',definitions:{control:{op:'all',items:[cmp('ge',ref('item','inlineSize'),'44'),cmp('ge',ref('item','blockSize'),'44')]}},contracts:[
    {id:'responsive-gap',kind:'predicate',predicate:separation},
    {id:'control-size',kind:'predicate',predicate:{op:'use',name:'control',bind:{item:'save'}}},
    {id:'stable-save',kind:'stable',target:'save',event:'save'}
  ]});
  const targets=['details','actions','save'];
  const saving=html.replace('aria-label="Save"','aria-label="Saving"');
  const facts=(changed=false)=>createEvidenceIR(['editing','saving'].flatMap(s=>domGeometry({state:s,profile,html:s==='editing'?html:saving,css:changed&&s==='saving'?css+'#save{height:40px}':css,targets})));
  const observations=[];
  for(const width of [320,600,601,1000])for(const height of [400,900]){
    await page.setViewportSize({width,height});
    const doc=s=>'<!doctype html>'+s.replace('</head>','<style>'+css+'</style></head>');
    await page.setContent(doc(html));
    observations.push(await captureUIObservation(page,{state:'editing',profile:'web',targets}));
    await page.setContent(doc(saving));
    observations.push(await captureUIObservation(page,{state:'saving',profile:'web',targets}));
  }
  const proof=await verifyObligationIR(createObligationIR(spec,{state,environment,evidence:facts()}),undefined,{observations});
  expect(proof.status,JSON.stringify(proof.contracts)).toBe('verified');
  expect(proof.observationStatus).toBe('sampled');
  expect(proof.contracts[0].observations.length).toBe(16);
  const broken=await verifyObligationIR(createObligationIR(spec,{state,environment,evidence:facts(true)}));
  expect(broken.contracts[1].status).toBe('violated');
  expect(broken.contracts[2].status).toBe('violated');
});

test('viewport-dependent grid and flex gaps match browser rectangles over width and height branches',async({page})=>{
  const html='<!doctype html><html lang="en"><body><main><div class="a"></div><div class="b"></div><div class="c"></div></main></body></html>';
  const base='*{box-sizing:border-box;margin:0;padding:0}main>div{height:40px;min-width:0;min-height:0}';
  const cases=[
    'main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(10px,3vh,21px) clamp(12px,4vw,30px)}',
    'main{display:flex;flex-wrap:wrap;gap:clamp(10px,3vh,21px) clamp(12px,4vw,30px)}main>div{flex:0 0 150px}',
    'main{display:flex;flex-direction:column;gap:clamp(10px,3vh,21px)}',
    'main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));height:220px;row-gap:clamp(10px,3vh,21px)}',
    'main{display:grid;grid-template-columns:150px 150px;gap:clamp(12px,4vw,30px)}'
  ];
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const [index,extra] of cases.entries()){
    const css=base+extra,report=analyzeHTML(html,{css,viewport:{min:240,max:1000,height:{min:320,max:800}},integrity:true});
    expect(report.status,JSON.stringify(report.diagnostics)).toBe(index===4?'violated':'verified');
    await page.setContent(html.replace('<body>','<head><style>'+css+'</style></head><body>'));
    for(const width of [240,300,313,320,468,469,500,750,1000])for(const height of [320,334,700,800]){
      await page.setViewportSize({width,height});
      const actual=await page.locator('main>div').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
      const inRange=(r,v)=>(v>r.min||v===r.min&&r.minInclusive)&&(v<r.max||v===r.max&&r.maxInclusive);
      const at=a=>rat(a.constant)+rat(a.coefficient)*width+rat(a.heightCoefficient)*height;
      for(const [i,name] of ['.a','.b','.c'].entries()){
        const row=report.sizes.find(s=>s.box===name&&inRange(s.range,width)&&inRange(s.heightRange,height)&&s.region.constraints.every(c=>{const n=at(c);return c.strict?n>1e-8:n>=-1e-8}));
        expect(row?.rect,JSON.stringify({index,width,height,name})).toBeTruthy();
        const predicted=['inlineStart','blockStart','inlineSize','blockSize'].map(k=>at(row.rect[k]));
        for(const [j,v] of predicted.entries())expect(Math.abs(v-actual[i][j]),JSON.stringify({index,width,height,name,predicted,actual:actual[i]})).toBeLessThan(0.1);
      }
    }
  }
});

test('viewport padding and gaps compose through nested responsive boxes',async({page})=>{
  const html='<!doctype html><html lang="en"><body><main class="shell"><section class="grid"><div class="a"></div><div class="b"></div></section></main></body></html>';
  const css='*{box-sizing:border-box;margin:0;padding:0}.shell{padding:clamp(10px,3vh,30px) clamp(24px,5vw,76px)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(16px,2vw,30px)}.grid>div{height:40px;min-width:0}';
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const broken of [false,true]){
    const sheet=broken?css.replace('repeat(2,minmax(0,1fr))','240px 240px'):css;
    const report=analyzeHTML(html,{css:sheet,viewport:{min:320,max:1920,height:{min:320,max:1080}},integrity:true});
    expect(report.status,JSON.stringify(report.diagnostics)).toBe(broken?'violated':'verified');
    await page.setContent(html.replace('<body>','<head><style>'+sheet+'</style></head><body>'));
    for(const width of [320,480,800,1440,1500,1520,1920])for(const height of [320,334,1000,1080]){
      await page.setViewportSize({width,height});
      const at=a=>rat(a.constant)+rat(a.coefficient)*width+rat(a.heightCoefficient)*height;
      for(const selector of ['.shell','.grid','.a','.b']){
        const row=report.sizes.find(s=>s.box===selector&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8));
        expect(row?.rect).toBeTruthy();
        const actual=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
        for(const [i,key] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())expect(Math.abs(at(row.rect[key])-actual[i])).toBeLessThan(0.1);
      }
    }
  }
});

test('responsive sibling margins and grid item margins match exact layout regions',async({page})=>{
  const html='<!doctype html><html lang="en"><body><main><div class="a"></div><div class="b"></div></main></body></html>';
  const base='*{box-sizing:border-box;margin:0;padding:0}main{padding:1px}main>div{height:40px;min-width:0;min-height:0}.a{margin-bottom:clamp(12px,4vw,48px);margin-left:clamp(8px,2vw,24px)}.b{margin-top:clamp(18px,3vh,36px)}';
  const options={viewport:{min:320,max:1600,height:{min:320,max:1000}},integrity:true};
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const extra of ['', 'main{display:grid;grid-template-columns:minmax(0,1fr)}','main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:100px}', 'main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:100px}.b{width:900px;margin-right:clamp(10px,3vw,30px)}']){
    const css=base+extra;
    const report=analyzeHTML(html,{...options,css});
    expect(report.status,JSON.stringify(report.diagnostics)).toBe(extra.includes('900px')?'violated':'verified');
    await page.setContent(html.replace('<body>','<head><style>'+css+'</style></head><body>'));
    for(const width of [320,400,449,450,451,750,900,1200,1600])for(const height of [320,600,800,1000]){
      await page.setViewportSize({width,height});
      const at=a=>rat(a.constant)+rat(a.coefficient)*width+rat(a.heightCoefficient)*height;
      for(const selector of ['main','.a','.b']){
        const row=report.sizes.find(s=>(s.box===selector||s.box.startsWith(selector+'@'))&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8));
        expect(row?.rect,JSON.stringify({extra,width,height,selector})).toBeTruthy();
        const actual=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
        for(const [i,key] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())expect(Math.abs(at(row.rect[key])-actual[i]),JSON.stringify({extra,width,height,selector,key,expected:at(row.rect[key]),actual:actual[i]})).toBeLessThan(.1);
      }
    }
  }
});

test('responsive flex margins preserve shrink, grow, wrap, and cross-axis geometry',async({page})=>{
  const html='<!doctype html><html lang="en"><body><main><div class="a"></div><div class="b"></div></main></body></html>';
  const base='*{box-sizing:border-box;margin:0;padding:0}main{display:flex}main>div{height:40px;min-width:0;min-height:0}.a{flex:1 1 240px;margin-left:clamp(8px,2vw,24px);margin-top:clamp(12px,4vh,32px)}.b{flex:1 1 180px;margin-right:clamp(10px,3vw,30px)}';
  const cases=[
    '',
    'main{flex-wrap:wrap;column-gap:6px;row-gap:12px}',
    'main{flex-direction:column;height:220px;align-items:stretch}.a{flex:1 1 80px}.b{flex:2 1 100px}',
    'main{flex-direction:column}.a{flex:0 0 80px}.b{flex:0 0 100px}',
    'main{align-items:center;height:120px}.a{max-width:260px}.b{max-width:220px}',
    'main{justify-content:center}.a{flex:0 0 240px}.b{flex:0 0 180px}'
  ];
  const options={viewport:{min:320,max:1600,height:{min:320,max:1000}},integrity:true};
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const [i,extra] of cases.entries()){
    const css=base+extra,report=analyzeHTML(html,{...options,css});
    expect(report.status,JSON.stringify({i,diagnostics:report.diagnostics})).toBe(i===5?'violated':'verified');
    await page.setContent(html.replace('<body>','<head><style>'+css+'</style></head><body>'));
    for(const width of [320,400,440,450,451,600,1000,1200,1600])for(const height of [320,600,800,1000]){
      await page.setViewportSize({width,height});
      const at=a=>rat(a.constant)+rat(a.coefficient)*width+rat(a.heightCoefficient)*height;
      for(const selector of ['main','.a','.b']){
        const row=report.sizes.find(s=>(s.box===selector||s.box.startsWith(selector+'@'))&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8));
        expect(row?.rect,JSON.stringify({i,width,height,selector})).toBeTruthy();
        const actual=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
        for(const [j,key] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())expect(Math.abs(at(row.rect[key])-actual[j]),JSON.stringify({i,width,height,selector,key,expected:at(row.rect[key]),actual:actual[j]})).toBeLessThan(.1);
      }
    }
  }
});

test('screen media capabilities and motion preferences compose with responsive layout in unrelated UI',async({browser})=>{
  const html='<!doctype html><html lang="en"><head><title>Orders</title></head><body><main class="toolbar"><div class="filter"></div><div class="command"></div></main></body></html>';
  const css='*{box-sizing:border-box;margin:0;padding:0}.toolbar{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:10px}.filter,.command{height:48px;min-width:0;min-height:0}@media (hover:hover) and (min-width:700px),(pointer:coarse) and (min-width:1000px){.toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (pointer:coarse){.filter,.command{height:64px}}@media (prefers-reduced-motion:reduce){.toolbar{gap:16px}@media (min-height:700px){.command{height:80px}}}';
  const viewport={min:320,max:1200,height:{min:320,max:900}};
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const hasTouch of [false,true])for(const reducedMotion of ['no-preference','reduce']){
    const context=await browser.newContext({hasTouch,reducedMotion,viewport:{width:320,height:320}});
    try {
      const page=await context.newPage();
      await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
      // Browser engines can expose different primary input capabilities.
      // Read the actual media facts, never infer them from the viewport.
      const media=await page.evaluate(()=>Object.fromEntries(Object.entries({hover:['none','hover'],pointer:['none','coarse','fine'],'prefers-reduced-motion':['no-preference','reduce']}).map(([k,values])=>[k,values.find(v=>matchMedia('('+k+': '+v+')').matches)])));
      expect(media['prefers-reduced-motion']).toBe(reducedMotion);
      expect(['none','hover']).toContain(media.hover);expect(['none','coarse','fine']).toContain(media.pointer);
      const report=analyzeHTML(html,{css,viewport,mediaFeatures:media,integrity:true});
      expect(report.status,JSON.stringify(report.diagnostics)).toBe('verified');
      for(const width of [320,699,700,999,1000,1200])for(const height of [320,699,700,900]){
        await page.setViewportSize({width,height});
        expect(await page.evaluate(features=>Object.entries(features).every(([k,v])=>matchMedia('('+k+': '+v+')').matches),media)).toBe(true);
        const actual=await page.locator('.toolbar,.filter,.command').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
        const at=a=>rat(a.constant)+rat(a.coefficient)*width+rat(a.heightCoefficient)*height;
        for(const [i,selector] of ['.toolbar','.filter','.command'].entries()){
          const row=report.sizes.find(s=>s.box===selector&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8));
          expect(row?.rect,JSON.stringify({media,width,height,selector})).toBeTruthy();
          for(const [j,key] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())expect(Math.abs(at(row.rect[key])-actual[i][j]),JSON.stringify({media,width,height,selector,key})).toBeLessThan(.1);
        }
      }
    }finally{await context.close()}
  }
});
