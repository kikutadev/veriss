// Empirical post-login evidence from public DEMO accounts. No personal auth,
// session tokens, screenshots, document text, or private user data are stored.
// This is an external network audit, NOT a universal static proof or release gate.
import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';
import type {Observation,UIModel} from '../packages/veriss/src/relational-contract.mjs';

type Rect={x:number;y:number;width:number;height:number};
type Frame={viewport:number;documentWidth:number;main:Rect|null;overflowElements:string[]};
type Focus={tag:string;offscreen:boolean;inDrawer:boolean;bounds:Rect};
const widths=[320,390,768,1280] as const;
const height=844;

async function measure(page:Page):Promise<Frame>{
 // React apps may finish a fetch or resize a chart after route navigation.
 // Sample after the current paint and a short async layout settling period.
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await page.waitForTimeout(180);
 return page.evaluate(()=>{
  const rect=(el:Element):Rect=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  const main=document.querySelector('main,[role=main]');
  const overflowElements=document.documentElement.scrollWidth>innerWidth+2?
   [...(main?.querySelectorAll('*')??[])].filter(el=>{
    const r=el.getBoundingClientRect(),style=getComputedStyle(el);
    return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.right>innerWidth+2;
   }).slice(0,8).map(el=>el.tagName.toLowerCase()+'.'+String(el.getAttribute('class')??'').trim().split(/\s+/).slice(0,2).join('.')):[];
  return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,main:main?rect(main):null,overflowElements};
 });
}
async function focusSequence(page:Page,anchor:string,count:number,drawerSelector:string):Promise<Focus[]>{
 await page.locator(anchor).focus();
 const result:Focus[]=[];
 for(let i=0;i<count;i++){
  await page.keyboard.press('Tab');
  const next=await page.evaluate(selector=>{
   const el=document.activeElement, r=el?.getBoundingClientRect();
   if(!el||!r)return null;
   const inDrawer=!!el.closest(selector);
   return {tag:el.tagName.toLowerCase(),offscreen:r.width>0&&r.height>0&&(r.right<=0||r.left>=innerWidth||r.bottom<=0||r.top>=innerHeight),inDrawer,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};
  },drawerSelector);
  if(next)result.push(next);
 }
 return result;
}
function scopedModel(browserName:string):UIModel{
 const profile={id:'demo',ua:browserName as 'chromium'|'firefox'|'webkit',viewport:{min:320,max:1280,height:{min:844,max:844}}};
 return {version:1,initial:'login',states:['login','dashboard','drawer-open','list'],
  transitions:[
   {from:'login',event:'sign-in',to:'dashboard'},
   {from:'dashboard',event:'open-menu',to:'drawer-open'},
   {from:'drawer-open',event:'navigate-list',to:'list'},
   {from:'dashboard',event:'keyboard-focus-visible',to:'dashboard'}
  ],profiles:[profile],contracts:[
   {id:'main-horizontal-fit',kind:'predicate',states:['dashboard','list'],predicate:{op:'compare',relation:'le',left:{target:'main',field:'inlineEnd'},right:{environment:'safeRight'}}},
   {id:'document-width-fit',kind:'predicate',states:['dashboard','list'],predicate:{op:'compare',relation:'le',left:{target:'scrollExtent',field:'inlineEnd'},right:{environment:'safeRight'}}},
   {id:'menu-open',kind:'action',event:'open-menu'},
   {id:'keyboard-focus-visible',kind:'action',event:'keyboard-focus-visible'}
  ]};
}
function frameObservation(state:'dashboard'|'list',frame:Frame):Observation{
 return {state,profile:'demo',width:frame.viewport,height,rects:{...(frame.main?{main:frame.main}:{}),scrollExtent:{x:0,y:0,width:frame.documentWidth,height}}};
}
function result(name:string,browser:string,frames:readonly (Frame & {state:string;width:number})[],focus:Focus[],observations:Observation[]){
 const proof=verifyUI({model:scopedModel(browser),observations});
 // Runtime observations cannot prove *all widths*. No browser sampling may be
 // smuggled into closed affine evidence or relabeled static VERIFIED.
 expect(proof.status,'Sampled external UI is not a static proof').not.toBe('verified');
 const failures=proof.contracts.filter(c=>c.observations.some(o=>o.status==='failed')).map(c=>c.id);
 const overflowing=frames.some(f=>f.documentWidth>f.viewport+0.5);
 const offscreen=focus.some(f=>f.offscreen);
 expect(failures.includes('document-width-fit')).toBe(overflowing);
 expect(failures.includes('keyboard-focus-visible')).toBe(offscreen);
 expect(proof.observationStatus==='failed').toBe(overflowing||offscreen);
 console.log('AUTH_UI_AUDIT '+JSON.stringify({app:name,browser,frames,focusIssues:focus.filter(f=>f.offscreen),focusSteps:focus.map(f=>({tag:f.tag,inDrawer:f.inDrawer,offscreen:f.offscreen})),veriss:{status:proof.status,observationStatus:proof.observationStatus,observedFailures:failures,reachable:proof.reachable}}));
}

test('role-based admin demo: authenticated dashboard, hidden drawer, user list',async({page,browserName})=>{
 await page.setViewportSize({width:390,height});
 await page.goto('https://jorgeariosg.github.io/react-admin-rbac/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('input[name=email]')).toBeVisible();
 const observations:Observation[]=[];
 observations.push({state:'login',profile:'demo',width:390,height,event:'sign-in',to:'dashboard',passed:true});
 // Explicitly published demo credentials, never a user's real session.
 await page.locator('input[name=email]').fill('admin@demo.bank');
 await page.locator('input[name=password]').fill('password');
 await page.getByRole('button',{name:'Sign in'}).click();
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 const frames:(Frame & {state:string;width:number})[]=[];
 for(const width of widths){
  await page.setViewportSize({width,height});
  const measured=await measure(page);
  frames.push({state:'dashboard',width,...measured});
  observations.push(frameObservation('dashboard',measured));
 }
 await page.setViewportSize({width:390,height});
 const aside=page.locator('aside');
 await expect.poll(async()=>aside.evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
 const closed=await focusSequence(page,'button[aria-label="Open menu"]',6,'aside');
 const offscreenDrawer=closed.filter(f=>f.offscreen&&f.inDrawer);
 observations.push({state:'dashboard',profile:'demo',width:390,height,event:'keyboard-focus-visible',to:'dashboard',passed:offscreenDrawer.length===0});
 // This is an observation, not an invented CSS proof. If the upstream demo
 // is fixed, the finding becomes 0 without making this audit fail.
 observations.push({state:'dashboard',profile:'demo',width:390,height,event:'open-menu',to:'drawer-open',passed:true});
 await page.getByRole('button',{name:'Open menu'}).click();
 await expect.poll(async()=>aside.evaluate(el=>el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(-1);
 await expect(aside.getByRole('link',{name:'Users'})).toBeVisible();
 const opened=await measure(page);
 expect(opened.viewport).toBe(390);
 const menuTarget=aside.getByRole('link',{name:'Users'});
 observations.push({state:'drawer-open',profile:'demo',width:390,height,event:'navigate-list',to:'list',passed:true});
 await menuTarget.click();
 await expect(page.getByRole('heading',{name:'Users'})).toBeVisible();
 for(const width of widths){
  await page.setViewportSize({width,height});
  const measured=await measure(page);
  frames.push({state:'list',width,...measured});
  observations.push(frameObservation('list',measured));
 }
 result('RBAC public demo',browserName,frames,closed,observations);
 console.log('AUTH_UI_FOCUS_FINDING '+JSON.stringify({app:'RBAC public demo',browser:browserName,closedDrawerFocusableOffscreen:offscreenDrawer.length}));
});

test('react-admin official demo: authenticated dashboard, drawer, orders table',async({page,browserName})=>{
 await page.setViewportSize({width:390,height});
 await page.goto('https://marmelab.com/react-admin-demo/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('input[name=username]')).toBeVisible();
 const observations:Observation[]=[{state:'login',profile:'demo',width:390,height,event:'sign-in',to:'dashboard',passed:true}];
 await page.locator('input[name=username]').fill('demo');
 await page.locator('input[name=password]').fill('demo');
 await page.locator('button[type=submit]').click();
 await expect(page.getByText('Welcome to the react-admin e-commerce demo')).toBeVisible();
 console.log('REACT_LOGGED_IN',browserName);
 const frames:(Frame & {state:string;width:number})[]=[];
 // Interact while the mobile drawer is in its original state. Desktop→mobile
 // resizing may preserve an already-open modal; that is a separate state,
 // not a legitimate reason to use force-click through its backdrop.
 const start=await measure(page);
 frames.push({state:'dashboard',width:390,...start});
 observations.push(frameObservation('dashboard',start));
 const menu=page.getByRole('button',{name:'Open menu'});
 await expect(menu).toBeVisible();
 const closed=await focusSequence(page,'button[aria-label="Open menu"]',6,'.RaSidebar-docked');
 console.log('REACT_FOCUS_DONE',browserName,closed.length);
 observations.push({state:'dashboard',profile:'demo',width:390,height,event:'keyboard-focus-visible',to:'dashboard',passed:!closed.some(f=>f.offscreen)});
 observations.push({state:'dashboard',profile:'demo',width:390,height,event:'open-menu',to:'drawer-open',passed:true});
 await menu.click({noWaitAfter:true,timeout:8000});
 console.log('REACT_OPENED',browserName);
 await expect(page.getByRole('menuitem',{name:'Orders',exact:true})).toBeVisible();
 observations.push({state:'drawer-open',profile:'demo',width:390,height,event:'navigate-list',to:'list',passed:true});
 await page.getByRole('menuitem',{name:'Orders',exact:true}).click();
 console.log('REACT_NAV_CLICKED',browserName);
 await expect(page).toHaveURL(/#\/orders/);
 await expect(page.getByRole('heading',{name:'Orders'}).first()).toBeVisible();
 for(const width of widths){
  await page.setViewportSize({width,height});
  const measured=await measure(page);
  frames.push({state:'list',width,...measured});
  observations.push(frameObservation('list',measured));
 }
 // Revisit the dashboard route with the same demo session after the list.
 // This is a route access check, NOT a second asserted menu transition.
 await page.goto('https://marmelab.com/react-admin-demo/#/',{waitUntil:'domcontentloaded'});
 await expect(page.getByText('Welcome to the react-admin e-commerce demo')).toBeVisible();
 for(const width of [320,768,1280]){
  await page.setViewportSize({width,height});
  const measured=await measure(page);
  frames.push({state:'dashboard',width,...measured});
  observations.push(frameObservation('dashboard',measured));
 }
 result('react-admin official demo',browserName,frames,closed,observations);
});
