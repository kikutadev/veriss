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
