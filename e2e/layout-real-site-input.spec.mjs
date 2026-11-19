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
