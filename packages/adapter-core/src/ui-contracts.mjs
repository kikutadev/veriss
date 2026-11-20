// Evaluation adapter; all proof semantics live in the veriss core.
import {analyzeHTML} from '@mizchi/veriss/html';
import {createLayoutIR} from '@mizchi/veriss/contracts';
import {layoutGeometry,profileKey,verifyUI} from '@mizchi/veriss/src/relational-contract.mjs';
import {projectIndependentGeometry,analyzeProjectedGeometry} from '@mizchi/veriss/src/partial-geometry.mjs';
export {verifyUI};
export function domGeometry(input) {
  return extractGeometry(input);
}

// Cache only plain, finite data with no custom serialization. Unrecognized
// input forms retain the uncached semantics instead of risking a key collision.
function exactKey(input){
  const seen=new Set();
  function copy(v){
    if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)&&!Object.is(v,-0))return v;
    if(!v||typeof v!=='object'||seen.has(v)||Object.getOwnPropertySymbols(v).length)throw Error('Non-JSON analysis input');
    const array=Array.isArray(v);
    if(array?Object.getPrototypeOf(v)!==Array.prototype:Object.getPrototypeOf(v)!==Object.prototype)throw Error('Non-plain analysis input');
    const descriptors=Object.getOwnPropertyDescriptors(v),keys=Object.keys(descriptors);
    if(array&&(keys.length!==v.length+1||Array.from({length:v.length},(_,i)=>String(i)).some(k=>!Object.hasOwn(descriptors,k))))throw Error('Sparse or extended array');
    seen.add(v);
    const result=array?[]:Object.create(null);
    for(const k of keys){
      if(array&&k==='length')continue;
      const d=descriptors[k];
      if(!d.enumerable||!Object.hasOwn(d,'value')||k==='toJSON')throw Error('Non-data analysis input');
      if(array)result.push(copy(d.value));else result[k]=copy(d.value);
    }
    seen.delete(v);return result;
  }
  try{return JSON.stringify(copy(input))}catch{return null}
}

export function createGeometrySession({maxEntries=128,maxBytes=16_000_000,preferIndependent=false,trustedStorage}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>4096||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128_000_000||typeof preferIndependent!=='boolean')throw new TypeError('Invalid geometry session options');
  const entries=new Map(),counts={full:{hits:0,misses:0,bypassed:0},projected:{hits:0,misses:0,bypassed:0}};
  let bytes=0,evictions=0;
  const remove=k=>{bytes-=entries.get(k).bytes;entries.delete(k)};
  function remember(key,layout){
    if(!layout.geometryComplete)return;
    let weight;
    try{weight=2*(key.length+JSON.stringify(layout).length)}catch{return}
    if(weight>maxBytes)return;
    if(entries.has(key))remove(key);
    while(entries.size>=maxEntries||bytes+weight>maxBytes){remove(entries.keys().next().value);evictions++}
    entries.set(key,{layout,bytes:weight});bytes+=weight;
  }
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
  function cached(stage,input,analyze){
    const key=exactKey([stage,input]),stats=counts[stage];
    if(key===null||key.length*2>maxBytes){stats.bypassed++;return analyze()}
    if(!entries.has(key)&&trustedStorage)try{
      const stored=trustedStorage.get(key);
      if(stored?.version===1&&stored.kind==='layout'&&stored.geometryComplete)remember(key,freeze(stored));
    }catch{/* no persistent reuse */}
    const hit=entries.get(key);
    if(hit){stats.hits++;entries.delete(key);entries.set(key,hit);return hit.layout}
    stats.misses++;
    const layout=analyze();
    remember(key,layout);
    if(entries.has(key))try{trustedStorage?.set(key,layout)}catch{/* no persistent reuse */}
    return layout;
  }
  return Object.freeze({
    domGeometry:input=>extractGeometry(input,cached,preferIndependent),
    stats:()=>({entries:entries.size,bytes,evictions,full:{...counts.full},projected:{...counts.projected}}),
    clear:()=>{entries.clear();bytes=evictions=0;for(const c of Object.values(counts))c.hits=c.misses=c.bypassed=0}
  });
}

function extractGeometry({state,profile,html,css,targets,local,boxes,knownFonts,defaultFontSize,partial=true,bindings={}},cached,preferIndependent=false) {
  if(!Array.isArray(targets)||targets.length>128||new Set(targets).size!==targets.length||targets.some(t=>typeof t!=='string'||!t||t.length>128)||!bindings||Object.getPrototypeOf(bindings)!==Object.prototype||Object.entries(bindings).some(([k,v])=>!targets.includes(k)||typeof v!=='string'||!/^[.#][A-Za-z_][A-Za-z0-9_-]*$/.test(v)))throw new TypeError('Invalid DOM targets or bindings');
  const options={viewport:profile.viewport,safeArea:profile.safeArea??{},...(profile.ua?{ua:profile.ua}:{}),scripting:'enabled',...(boxes?{boxes}:{}),...(knownFonts?{knownFonts}:{}),...(defaultFontSize?{defaultFontSize}:{}),scrollbars:[profile.scrollbar??{name:'overlay',inlineSize:0,blockSize:0}],...(profile.dpr?{devicePixelRatios:[profile.dpr]}: {})};
  const base=target=>({state,profile:profile.id,profileKey:profileKey(profile),target,source:local?'local-dom':'dom',assumptions:local?.assumptions??[]});
  const analyze=(kind,source,run)=>cached?cached(kind,{...source,profile,options},run):run();
  const canProject=partial&&!local&&!boxes&&profile.viewport.height;
  let full;
  function fullGeometry(){
    if(full)return full;
    try{
      const layout=analyze('full',{html,css},()=>createLayoutIR(analyzeHTML(html,{...options,css})));
      full=layoutGeometry({state,profile,layout,targets,local});
    }catch(e){full=targets.map(target=>({...base(target),reason:'CSS model refused input: '+e.message}));}
    return full;
  }
  if(!canProject)return fullGeometry().map(e=>Object.hasOwn(bindings,e.target)?{...base(e.target),reason:'Selector binding requires automatic projection'}:e);
  let attempts=0;
  function project(target){
    const binding=Object.hasOwn(bindings,target)?bindings[target]:undefined;
    if(++attempts>32)return {limit:true};
    try{
      // Re-run the independence checks on the current, complete document.
      // Only the downstream computation for an identical validated projection
      // can be skipped; cached provenance is never used as a dependency proof.
      const p=projectIndependentGeometry(html,css,target,profile,binding);
      const layout=analyze('projected',{html:p.html,css:p.css},()=>createLayoutIR(analyzeProjectedGeometry(p,options)));
      const [result]=layoutGeometry({state,profile,layout,targets:[target],paths:{[target]:p.path},local:{assumptions:p.assumptions}});
      if(!result.rows?.length)throw Error(result.reason??'No projected rectangle');
      return {result};
    }catch(e){return {error:e.message}}
  }
  function fallback(entry,p){
    if(p.result)return p.result;
    if(p.limit)return {...base(entry.target),reason:'Automatic projection target budget exceeded'};
    const {rows,...rest}=entry;
    return {...rest,reason:(entry.reason??'Geometry incomplete')+'; automatic projection: '+p.error};
  }
  if(preferIndependent){
    // Opt-in: seek a closed independent rectangle first; full-layout
    // evidence remains the fallback for dependent targets.
    const projected=targets.map(project);
    if(projected.every(p=>p.result))return projected.map(p=>p.result);
    return fullGeometry().map((entry,i)=>projected[i].result??(entry.rows?.length&&!Object.hasOwn(bindings,entry.target)?entry:fallback(entry,projected[i])));
  }
  return fullGeometry().map(entry=>{
    if(entry.rows?.length&&!Object.hasOwn(bindings,entry.target))return entry;
    return fallback(entry,project(entry.target));
  });
}
