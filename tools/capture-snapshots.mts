// The caller drives gameplay and waits for each named state. This helper does
// not discover reachability, execute arbitrary actions, or change the live DOM.
import type {Page} from 'playwright';
export async function captureSnapshot<T>(page: Page, choices: T, {headLayoutIndependent=false}={}) {
  const snapshot=await page.evaluate(headLayoutIndependent=>{
    if(document.compatMode!=='CSS1Compat') throw Error('Snapshot requires standards mode');
    const root=document.documentElement.cloneNode(true);
    if (!(root instanceof Element)) throw Error('Snapshot requires a document root');
    // Stylesheets are supplied separately in original cascade order. Only
    // head metadata is stripped, with an explicit caller assumption. Body
    // structure and attributes (including style and hidden) remain intact.
    if(headLayoutIndependent) for(const node of root.querySelectorAll('head > script, head > style, head > link')) node.remove();
    return '<!doctype html>'+root.outerHTML;
  },headLayoutIndependent);
  return {html:snapshot,choices};
}

// Record a point observation independently of proof. No automatic scrolling;
// the caller drives state transitions and checks their expected outcome.
export async function captureUIObservation(page: Page,{state,profile,targets}: {state:string;profile:string;targets:readonly string[]}) {
  const data=await page.evaluate(targets=>{
    const rects: Record<string,{x:number;y:number;width:number;height:number}> = {};
    for(const id of targets){
      const matches=[...document.querySelectorAll('[id]')].filter(e=>e.id===id);
      const match=matches[0];
      if(matches.length!==1||!match||!match.getClientRects().length)continue;
      const r=match.getBoundingClientRect();
      Object.defineProperty(rects,id,{enumerable:true,configurable:true,writable:true,value:{x:Number(r.x.toFixed(6)),y:Number(r.y.toFixed(6)),width:Number(r.width.toFixed(6)),height:Number(r.height.toFixed(6))}});
    }
    return {width:innerWidth,height:innerHeight,rects:Object.fromEntries(Object.entries(rects))};
  },targets);
  return {state,profile,...data};
}
