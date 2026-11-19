// Evaluation adapter; all proof semantics live in the veriss core.
import {analyzeHTML} from '@mizchi/veriss/html';
import {createLayoutIR} from '@mizchi/veriss/contracts';
import {layoutGeometry,profileKey,verifyUI} from '@mizchi/veriss/src/relational-contract.mjs';
import {projectIndependentGeometry,analyzeProjectedGeometry} from '@mizchi/veriss/src/partial-geometry.mjs';
export {verifyUI};
export function domGeometry({state,profile,html,css,targets,local,boxes,knownFonts,defaultFontSize,partial=true,bindings={}}) {
  if(!Array.isArray(targets)||targets.length>128||new Set(targets).size!==targets.length||targets.some(t=>typeof t!=='string'||!t||t.length>128)||!bindings||Object.getPrototypeOf(bindings)!==Object.prototype||Object.entries(bindings).some(([k,v])=>!targets.includes(k)||typeof v!=='string'||!/^[.#][A-Za-z_][A-Za-z0-9_-]*$/.test(v)))throw new TypeError('Invalid DOM targets or bindings');
  const options={viewport:profile.viewport,safeArea:profile.safeArea??{},...(profile.ua?{ua:profile.ua}:{}),scripting:'enabled',...(boxes?{boxes}:{}),...(knownFonts?{knownFonts}:{}),...(defaultFontSize?{defaultFontSize}:{}),scrollbars:[profile.scrollbar??{name:'overlay',inlineSize:0,blockSize:0}],...(profile.dpr?{devicePixelRatios:[profile.dpr]}: {})};
  const base=target=>({state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:local?.assumptions??[]});
  let full;
  try{
    full=layoutGeometry({state,profile,layout:createLayoutIR(analyzeHTML(html,{...options,css})),targets,local});
  }catch(e){full=targets.map(target=>({...base(target),reason:'CSS model refused input: '+e.message}));}
  if(!partial||local||boxes||!profile.viewport.height)return full.map(e=>Object.hasOwn(bindings,e.target)?{...base(e.target),reason:'Selector binding requires automatic projection'}:e);
  let attempts=0;
  return full.map(entry=>{
    const binding=Object.hasOwn(bindings,entry.target)?bindings[entry.target]:undefined;
    if(entry.rows?.length&&binding===undefined)return entry;
    if(++attempts>32)return {...base(entry.target),reason:'Automatic projection target budget exceeded'};
    try{
      const p=projectIndependentGeometry(html,css,entry.target,profile,binding);
      const report=analyzeProjectedGeometry(p,options);
      const [result]=layoutGeometry({state,profile,layout:createLayoutIR(report),targets:[entry.target],paths:{[entry.target]:p.path},local:{assumptions:p.assumptions}});
      if(!result.rows?.length)throw Error(result.reason??'No projected rectangle');
      return result;
    }catch(e){const {rows,...rest}=entry;return {...rest,reason:(entry.reason??'Geometry incomplete')+'; automatic projection: '+e.message};}
  });
}
