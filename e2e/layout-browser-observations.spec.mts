import {test,expect} from '@playwright/test';
import {captureViewport,captureClosedScopeTabFocus} from '../packages/adapter-core/src/browser-observations.mjs';
import {verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';
import type {UIModel} from '../packages/veriss/src/relational-contract.mjs';

const model:UIModel={version:1,initial:'dashboard',states:['dashboard'],
 transitions:[],
 profiles:[{id:'browser',viewport:{min:320,max:390,height:{min:844,max:844}}}],
 contracts:[
  {id:'width',kind:'predicate',predicate:{op:'compare',relation:'le',left:{target:'scrollExtent',field:'inlineEnd'},right:{environment:'safeRight'}}}
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
 const hidden=await captureClosedScopeTabFocus(page,{anchor:'#menu',closedScope:'#drawer',steps:3});
 expect(hidden.steps.some(f=>f.offscreen&&f.inScope)).toBe(true);
 expect(hidden.passed).toBe(false);
 const initial=verifyUI({model,observations:[nested.observation]});
 expect(initial.status).toBe('unknown');
 expect(initial.observationStatus).toBe('sampled');

 await page.locator('#drawer').evaluate(el=>el.setAttribute('inert',''));
 const invisible=await captureClosedScopeTabFocus(page,{anchor:'#menu',closedScope:'#drawer',steps:3});
 expect(invisible.steps.some(f=>f.offscreen&&f.inScope)).toBe(false);
 expect(invisible.passed).toBe(true);
 await page.locator('#content').evaluate(el=>{el.style.width='334px'});
 const widened=await captureViewport(page,{state:'dashboard',profile:'browser',mainSelector:'#content'});
 expect(widened.frame.documentWidth).toBe(334);
 const failedWidth=verifyUI({model,observations:[widened.observation]});
 expect(failedWidth.status).toBe('unknown');
 expect(failedWidth.observationStatus).toBe('failed');
 expect(failedWidth.contracts.find(c=>c.id==='width')?.observations.some(x=>x.status==='failed')).toBe(true);

 await page.locator('#content').evaluate(el=>{el.style.width='min(100%,334px)'});
 const repaired=await captureViewport(page,{state:'dashboard',profile:'browser',mainSelector:'#content'});
 expect(repaired.frame.documentWidth).toBe(320);
 const good=verifyUI({model,observations:[repaired.observation]});
 expect(good.status,'browser measurements do not prove every possible viewport').toBe('unknown');
 expect(good.observationStatus).toBe('sampled');
});

test('managed modal traps Tab; ARIA-only impostor leaks to background in all engines',async({page,browserName})=>{
 const {captureModalTabFocus}=await import('../packages/adapter-core/src/browser-observations.mjs');
 await page.setViewportSize({width:390,height:844});
 await page.setContent('<button id="outside">Outside</button><div role="dialog" aria-modal="true" style="display:block;padding:16px"><button id="last">Inside</button></div><button id="next">Next</button>');
 await page.locator('#last').focus();
 const failed=await captureModalTabFocus(page,{steps:3});
 expect(failed.passed,`${browserName} should detect leaky modal`).toBe(false);
 await page.setContent('<button id="outside">Outside</button><div role="dialog" aria-modal="true"><button id="first">First</button><button id="last">Last</button></div><button id="next">Next</button>');
 await page.locator('#last').evaluate((el:HTMLElement)=>el.addEventListener('keydown',(event:KeyboardEvent)=>{
  if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();document.querySelector<HTMLElement>('#first')?.focus()}
 }));
 await page.locator('#last').focus();
 const good=await captureModalTabFocus(page,{steps:3});
 expect(good.passed,`${browserName} native modal retains focus`).toBe(true);
 expect(good.steps.every(s=>s.inScope&&!s.offscreen)).toBe(true);
 await page.locator('[role=dialog]').evaluate(el=>el.removeAttribute('aria-modal'));
 await expect(captureModalTabFocus(page,{})).rejects.toThrow(/Open visible aria-modal/);
});

test('role-specific Playwright expectations reject wrong target and aria-only disabled states',async({page})=>{
 const {expectRbacUserActions,demoUsers}=await import('./rbac-role-assertions.mjs');
 await page.setContent('<main>'+demoUsers.map(([name,action])=>`<div><button aria-label="Edit ${name}">Edit</button><button aria-label="${action} ${name}" ${name==='Ada Lovelace'?'disabled':''}>Status</button></div>`).join('')+'</main>');
 const ok=await expectRbacUserActions(page,'Admin',{timeout:250});
 expect(ok).toEqual({editEnabled:8,statusEnabled:7,matched:8});
 await page.getByRole('button',{name:'Suspend Alan Turing'}).evaluate(el=>el.setAttribute('disabled',''));
 await expect(expectRbacUserActions(page,'Admin',{timeout:250})).rejects.toThrow();
 await page.getByRole('button',{name:'Suspend Alan Turing'}).evaluate(el=>el.removeAttribute('disabled'));
 await page.getByRole('button',{name:'Suspend Ada Lovelace'}).evaluate(el=>el.removeAttribute('disabled'));
 await expect(expectRbacUserActions(page,'Admin',{timeout:250})).rejects.toThrow();
 await page.locator('button').evaluateAll(els=>els.forEach(el=>el.setAttribute('disabled','')));
 const viewer=await expectRbacUserActions(page,'Viewer',{timeout:250});
 expect(viewer).toEqual({editEnabled:0,statusEnabled:0,matched:8});
 await page.getByRole('button',{name:'Edit Alan Turing'}).evaluate(el=>{el.removeAttribute('disabled');el.setAttribute('aria-disabled','true')});
 await expect(expectRbacUserActions(page,'Viewer',{timeout:250})).rejects.toThrow(/expected native\/inert blocked UI/);
});
