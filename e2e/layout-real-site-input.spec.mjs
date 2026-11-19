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
