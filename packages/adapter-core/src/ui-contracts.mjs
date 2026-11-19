// Evaluation adapter; all proof semantics live in the veriss core.
import {analyzeHTML} from '@mizchi/veriss/html';
import {createLayoutIR} from '@mizchi/veriss/contracts';
import {layoutGeometry,profileKey,verifyUI} from '@mizchi/veriss/src/relational-contract.mjs';
export {verifyUI};
export function domGeometry({state,profile,html,css,targets,local,boxes,knownFonts,defaultFontSize}) {
  let layout;
  try { const report=analyzeHTML(html,{css,viewport:profile.viewport,safeArea:profile.safeArea??{},...(profile.ua?{ua:profile.ua}:{}),scripting:'enabled',...(boxes?{boxes}:{}),...(knownFonts?{knownFonts}:{}),...(defaultFontSize?{defaultFontSize}:{}),scrollbars:[profile.scrollbar??{name:'overlay',inlineSize:0,blockSize:0}],...(profile.dpr?{devicePixelRatios:[profile.dpr]}: {})}); layout=createLayoutIR(report); }
  catch(e){return targets.map(target=>({state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:local?.assumptions??[],reason:'CSS model refused input: '+e.message}));}
  return layoutGeometry({state,profile,layout,targets,local});
}
