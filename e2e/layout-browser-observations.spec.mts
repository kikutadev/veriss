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

test('managed modal traps Tab; ARIA-only impostor leaks to background in all engines',async({page,browserName})=>{
 const {captureModalTabFocus}=await import('../packages/adapter-core/src/browser-observations.mjs');
 const modalModel:UIModel={version:1,initial:'dialog-open',states:['dialog-open'],
  transitions:[{from:'dialog-open',event:'modal-focus-contained',to:'dialog-open'}],
  profiles:[{id:'browser',viewport:{min:390,max:390,height:{min:844,max:844}}}],
  contracts:[{id:'modal-focus',kind:'action',event:'modal-focus-contained'}]};
 await page.setViewportSize({width:390,height:844});
 await page.setContent('<button id="outside">Outside</button><div role="dialog" aria-modal="true" style="display:block;padding:16px"><button id="last">Inside</button></div><button id="next">Next</button>');
 await page.locator('#last').focus();
 const failed=await captureModalTabFocus(page,{state:'dialog-open',profile:'browser',steps:3});
 expect(failed.observation.passed,`${browserName} should detect leaky modal`).toBe(false);
 const failedContract=verifyUI({model:modalModel,observations:[failed.observation]});
 expect(failedContract.status).toBe('unknown');
 expect(failedContract.observationStatus).toBe('failed');
 await page.setContent('<button id="outside">Outside</button><div role="dialog" aria-modal="true"><button id="first">First</button><button id="last">Last</button></div><button id="next">Next</button>');
 await page.locator('#last').evaluate((el:HTMLElement)=>el.addEventListener('keydown',(event:KeyboardEvent)=>{
  if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();document.querySelector<HTMLElement>('#first')?.focus()}
 }));
 await page.locator('#last').focus();
 const good=await captureModalTabFocus(page,{state:'dialog-open',profile:'browser',steps:3});
 expect(good.observation.passed,`${browserName} native modal retains focus`).toBe(true);
 expect(good.steps.every(s=>s.inScope&&!s.offscreen)).toBe(true);
 const verifiedSample=verifyUI({model:modalModel,observations:[good.observation]});
 expect(verifiedSample.status).toBe('unknown');
 expect(verifiedSample.observationStatus).toBe('sampled');
 await page.locator('[role=dialog]').evaluate(el=>el.removeAttribute('aria-modal'));
 await expect(captureModalTabFocus(page,{state:'dialog-open',profile:'browser'})).rejects.toThrow(/Open visible aria-modal/);
});
