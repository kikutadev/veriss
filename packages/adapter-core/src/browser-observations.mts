/** Browser runtime observations for a caller's *existing* authenticated E2E test.
 * No browser launch, login, network fetch, DOM source capture or proof inference.
 * Only viewport measurements and keyboard focus bounds leave the browser page.
 */
import type {Observation} from '@mizchi/veriss/src/relational-contract.mjs';

export interface BrowserRect {x:number;y:number;width:number;height:number}
export interface BrowserFrame {viewport:number;height:number;documentWidth:number;main:BrowserRect|null;overflowElements:string[]}
export interface BrowserFocusStep {tag:string;inScope:boolean;offscreen:boolean;bounds:BrowserRect}

// The methods required from Playwright Page. No dependency on Playwright itself.
export interface BrowserObservationPage {
 evaluate<A,R>(fn:(arg:A)=>R|Promise<R>,arg:A):Promise<R>;
 locator(selector:string):{focus():Promise<void>};
 keyboard:{press(key:string):Promise<void>};
}
const valid=(x:number)=>Number.isFinite(x)&&x>=0;
const rectangle=(r:BrowserRect)=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>=0&&r.height>=0;
const identities=(state:string,profile:string)=>{
 if(!state||!profile||typeof state!=='string'||typeof profile!=='string')throw new TypeError('Expected state and profile identifiers');
};

export function viewportObservation(state:string,profile:string,frame:BrowserFrame):Observation {
 identities(state,profile);
 if(!valid(frame.viewport)||frame.viewport===0||!valid(frame.height)||frame.height===0||!valid(frame.documentWidth)||
   frame.main!==null&&!rectangle(frame.main)||!Array.isArray(frame.overflowElements))throw new TypeError('Invalid viewport measurement');
 return {state,profile,width:frame.viewport,height:frame.height,
  rects:{...(frame.main?{main:frame.main}:{}),scrollExtent:{x:0,y:0,width:frame.documentWidth,height:frame.height}}};
}

/** An offscreen focus is a defect only when it occurs inside the caller's
 * declared *closed* scope. An intentionally off-canvas drawer without focus
 * is not a defect. This records a sampled action, never a CSS proof. */
export function focusObservation(state:string,profile:string,viewport:number,height:number,steps:readonly BrowserFocusStep[],event='keyboard-focus-visible'):Observation {
 identities(state,profile);
 if(!event||!valid(viewport)||!viewport||!valid(height)||!height||!Array.isArray(steps)||
  steps.some(s=>!rectangle(s.bounds)))throw new TypeError('Invalid keyboard event or focus measurement');
 return {state,profile,width:viewport,height,event,to:state,passed:!steps.some(s=>s.inScope&&s.offscreen)};
}

export async function captureViewport(page:BrowserObservationPage,{state,profile,mainSelector='main,[role=main]'}:{state:string;profile:string;mainSelector?:string}) {
 const frame=await page.evaluate(({selector})=>{
  const rect=(el:Element):BrowserRect=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  const main=document.querySelector(selector);
  // Structural paths only: do not return DOM text, attribute values,
  // credentials, form inputs, user IDs or session information.
  const path=(el:Element)=>{
   const parts:string[]=[];let n:Element|null=el;
   for(let depth=0;n&&depth<4;depth++,n=n.parentElement){
    let index=1;for(let prev=n.previousElementSibling;prev;prev=prev.previousElementSibling)if(prev.tagName===n.tagName)index++;
    parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+index+')');
   }
   return parts.join(' > ');
  };
  const overflowElements=document.documentElement.scrollWidth>innerWidth+2?
   [...(main?.querySelectorAll('*')??[])].filter(el=>{
    const r=el.getBoundingClientRect(),style=getComputedStyle(el);
    return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.right>innerWidth+2;
   }).slice(0,8).map(path):[];
  return {viewport:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,main:main?rect(main):null,overflowElements};
 },{selector:mainSelector});
 return {frame,observation:viewportObservation(state,profile,frame)};
}

/** Keyboard exploration starts from a caller-selected anchor on an already
 * logged-in page. The caller declares which drawer/panel is CLOSED. */
export async function captureClosedScopeTabFocus(page:BrowserObservationPage,{
 state,profile,anchor,closedScope,steps=6,event='keyboard-focus-visible'
}:{state:string;profile:string;anchor:string;closedScope:string;steps?:number;event?:string}) {
 identities(state,profile);
 if(!anchor||!closedScope||!Number.isSafeInteger(steps)||steps<1||steps>64)throw new TypeError('Invalid keyboard focus exploration');
 await page.locator(anchor).focus();
 const focus:BrowserFocusStep[]=[];
 let width=0,height=0;
 for(let i=0;i<steps;i++) {
  await page.keyboard.press('Tab');
  const result=await page.evaluate(({scope})=>{
   const el=document.activeElement,r=el?.getBoundingClientRect();
   if(!el||!r)return {width:innerWidth,height:innerHeight,step:null};
   return {width:innerWidth,height:innerHeight,step:{tag:el.tagName.toLowerCase(),inScope:!!el.closest(scope),
    offscreen:r.width>0&&r.height>0&&(r.right<=0||r.left>=innerWidth||r.bottom<=0||r.top>=innerHeight),
    bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}};
  },{scope:closedScope});
  width=result.width;height=result.height;
  if(result.step)focus.push(result.step);
 }
 return {steps:focus,observation:focusObservation(state,profile,width,height,focus,event)};
}

/** A genuine aria-modal dialog must keep sequential keyboard focus inside.
 * Sampled behavior only: this does not prove every element or browser state.
 * The caller opens the dialog first and retains responsibility for teardown. */
export function modalFocusObservation(state:string,profile:string,viewport:number,height:number,steps:readonly BrowserFocusStep[],event='modal-focus-contained'):Observation {
 identities(state,profile);
 if(!event||!valid(viewport)||!viewport||!valid(height)||!height||!Array.isArray(steps)||steps.length===0||
    steps.some(s=>!rectangle(s.bounds)))throw new TypeError('Invalid modal focus measurement');
 // Native <dialog> may transiently report BODY as activeElement in some
 // engines while the top-layer modal still blocks background interaction.
 // This is inconclusive, not evidence of a usable focus escape.
 const definiteEscape=steps.some(s=>!s.inScope&&!['body','html'].includes(s.tag));
 const hiddenFocus=steps.some(s=>s.inScope&&s.offscreen);
 if(!definiteEscape&&!hiddenFocus&&steps.some(s=>!s.inScope&&['body','html'].includes(s.tag)))
  throw new Error('Indeterminate document focus during modal Tab traversal');
 return {state,profile,width:viewport,height,event,to:state,passed:!definiteEscape&&!hiddenFocus};
}

export async function captureModalTabFocus(page:BrowserObservationPage,{
 state,profile,scope='[role="dialog"][aria-modal="true"]',steps=6,event='modal-focus-contained'
}:{state:string;profile:string;scope?:string;steps?:number;event?:string}) {
 identities(state,profile);
 if(!scope||!Number.isSafeInteger(steps)||steps<1||steps>64)throw new TypeError('Invalid modal exploration');
 // Refuse nonmodal popovers and hidden DOM nodes, rather than reporting a
 // false positive or pretending a missing dialog has been verified.
 const init=await page.evaluate(({selector})=>{
  const el=document.querySelector(selector);
  if(!el)return {present:false,modal:false,visible:false};
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return {present:true,modal:el.getAttribute('aria-modal')==='true',
    visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
 },{selector:scope});
 if(!init.present||!init.modal||!init.visible)throw new Error('Open visible aria-modal dialog required for focus capture');
 const focus:BrowserFocusStep[]=[];let width=0,height=0;
 for(let i=0;i<steps;i++){
  await page.keyboard.press('Tab');
  const result=await page.evaluate(({selector})=>{
   const el=document.activeElement,r=el?.getBoundingClientRect();
   if(!el||!r)return {width:innerWidth,height:innerHeight,step:null};
   return {width:innerWidth,height:innerHeight,step:{tag:el.tagName.toLowerCase(),
     inScope:!!el.closest(selector),
     offscreen:r.width<=0||r.height<=0||r.right<=0||r.left>=innerWidth||r.bottom<=0||r.top>=innerHeight,
     bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}};
  },{selector:scope});
  width=result.width;height=result.height;
  if(result.step)focus.push(result.step);
 }
 if(focus.length!==steps)throw new Error('Modal focus position could not be observed');
 return {steps:focus,observation:modalFocusObservation(state,profile,width,height,focus,event)};
}
