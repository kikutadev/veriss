// The caller drives gameplay and waits for each named state. This helper does
// not discover reachability, execute arbitrary actions, or change the live DOM.
export async function captureSnapshot(page, choices, {headLayoutIndependent=false}={}) {
  const snapshot=await page.evaluate(headLayoutIndependent=>{
    if(document.compatMode!=='CSS1Compat') throw Error('Snapshot requires standards mode');
    const root=document.documentElement.cloneNode(true);
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
export async function captureGameObservation(page,{state,profile,targets}) {
  const data=await page.evaluate(targets=>{
    const rects=Object.create(null);
    for(const id of targets){
      const matches=[...document.querySelectorAll('[id]')].filter(e=>e.id===id);
      if(matches.length!==1||!matches[0].getClientRects().length)continue;
      const r=matches[0].getBoundingClientRect();
      rects[id]=Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r[k].toFixed(6))]));
    }
    return {width:innerWidth,height:innerHeight,rects:Object.fromEntries(Object.entries(rects))};
  },targets);
  return {state,profile,...data};
}
