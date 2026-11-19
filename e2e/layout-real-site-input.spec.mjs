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
  const {verifyGameUI,domGeometry}=await import('../packages/adapter-core/src/game-ui.mjs');
  const {captureGameObservation}=await import('../tools/capture-snapshots.mjs');
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
  const check=verifyGameUI({model,evidence});
  expect(check.contracts.map(c=>c.status)).toEqual(['verified','violated','verified','unknown']);
  const observations=[];
  for(const width of [320,600,800]){
    await page.setViewportSize({width,height:600});
    await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
    const targets=['field','hud','extra'];
    const one=await captureGameObservation(page,{state:'play',profile:'desktop',targets});
    observations.push(one);
    const {field,hud,extra}=one.rects;
    expect((hud.width*50+extra.width*50-50*50)/(field.width*field.height)).toBeCloseTo(75/width);
    await page.evaluate(()=>document.querySelector('#hud').addEventListener('click',()=>document.body.dataset.mode='pause'));
    await page.locator('#hud').click({position:{x:10,y:10}});
    expect(await page.locator('body').getAttribute('data-mode')).toBe('pause');
    observations.push(await captureGameObservation(page,{state:'pause',profile:'desktop',targets}),
      {state:'play',profile:'desktop',width,height:600,event:'pause',to:'pause',passed:true});
  }
  const report=verifyGameUI({model,evidence,observations});
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
