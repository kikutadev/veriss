import {test,expect} from '@playwright/test';
import {captureViewport,captureClosedScopeTabFocus} from '../packages/adapter-core/src/browser-observations.mjs';
import {verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';
import type {UIModel} from '../packages/veriss/src/relational-contract.mjs';

const model:UIModel={version:1,initial:'dashboard',states:['dashboard'],
 transitions:[{from:'dashboard',event:'keyboard-focus-visible',to:'dashboard'}],
 profiles:[{id:'browser',viewport:{min:320,max:390,height:{min:844,max:844}}}],
 contracts:[
  {id:'width',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'scrollExtent',field:'inlineEnd'},right:{environment:'safeRight'}}},
  {id:'focus',kind:'action',event:'keyboard-focus-visible'}
 ]};

test('logged-in DOM observer distinguishes root overflow from scrollable children and hidden focus from inert drawer',async({page,browserName})=>{
 await page.setViewportSize({width:320,height:844});
 await page.setContent(`<!doctype html><html lang="en"><head><style>
 *{box-sizing:border-box} html,body{margin:0}main{width:100%;height:120px}
 #drawer{position:fixed;left:0;top:0;width:200px;transform:translateX(-100%);background:#fff}
 #nested{overflow:auto;width:100%}#nested>div{width:600px;height:20px}
 </style></head><body><button id="menu">Menu</button>
 <aside id="drawer"><a href="#help">Help</a><button>Logout</button></aside>
 <main id="content"><div id="nested"><div></div></div><button id="next">Next</button></main>
 </body></html>`);
 const nested=await captureViewport(page,{state:'dashboard',profile:'browser',mainSelector:'#content'});
 expect(nested.frame.viewport).toBe(320);
 expect(nested.frame.documentWidth,`${browserName}: nested scrolling is not global overflow`).toBe(320);
 expect(nested.frame.overflowElements).toEqual([]);
 const hidden=await captureClosedScopeTabFocus(page,{state:'dashboard',profile:'browser',anchor:'#menu',closedScope:'#drawer',steps:3});
 expect(hidden.steps.some(f=>f.offscreen&&f.inScope)).toBe(true);
 expect(hidden.observation.passed).toBe(false);
 const failedFocus=verifyUI({model,observations:[nested.observation,hidden.observation]});
 expect(failedFocus.status).toBe('unknown');
 expect(failedFocus.observationStatus).toBe('failed');
 expect(failedFocus.contracts.find(c=>c.id==='focus')?.observations.some(x=>x.status==='failed')).toBe(true);

 await page.locator('#drawer').evaluate(el=>el.setAttribute('inert',''));
 const invisible=await captureClosedScopeTabFocus(page,{state:'dashboard',profile:'browser',anchor:'#menu',closedScope:'#drawer',steps:3});
 expect(invisible.steps.some(f=>f.offscreen&&f.inScope)).toBe(false);
 expect(invisible.observation.passed).toBe(true);
 await page.locator('#content').evaluate(el=>{el.style.width='334px'});
 const widened=await captureViewport(page,{state:'dashboard',profile:'browser',mainSelector:'#content'});
 expect(widened.frame.documentWidth).toBe(334);
 const failedWidth=verifyUI({model,observations:[widened.observation,invisible.observation]});
 expect(failedWidth.status).toBe('unknown');
 expect(failedWidth.observationStatus).toBe('failed');
 expect(failedWidth.contracts.find(c=>c.id==='width')?.observations.some(x=>x.status==='failed')).toBe(true);

 await page.locator('#content').evaluate(el=>{el.style.width='min(100%,334px)'});
 const repaired=await captureViewport(page,{state:'dashboard',profile:'browser',mainSelector:'#content'});
 expect(repaired.frame.documentWidth).toBe(320);
 const good=verifyUI({model,observations:[repaired.observation,invisible.observation]});
 expect(good.status,'browser measurements do not prove every possible viewport').toBe('unknown');
 expect(good.observationStatus).toBe('sampled');
});
