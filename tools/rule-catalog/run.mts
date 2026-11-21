// Runs veriss on an example and lists every finding (code, severity, box, message), for both sides (ng / ok).
//   node tools/rule-catalog/run.mjs <id|all>
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import type {CatalogInput} from './examples.mjs';
export const reset = '*{box-sizing:border-box;margin:0;padding:0}html,body{margin:0}';
export function run({html, css, boxes, vw = [375,1280],accessibility = true}:Pick<CatalogInput,'html'|'css'|'boxes'|'accessibility'> & {vw?:[number,number]}) {
  const r = analyzeHTML(html, {name: 'Page', css: reset + css, viewport: {min: vw[0], max: vw[1], height: {min: 600, max: 1000}}, accessibility, ...(boxes ? {boxes} : {})});
  const seen = new Map<string,{code:string;severity?:string;box?:string;message?:string;range?:{min:number;max:number;minExact?:string;maxExact?:string;maxInclusive?:boolean};witness?:{viewport:number;viewportHeight?:number}}> ();
  const walk = (item:unknown,depth=0):void => {
    if (!item || typeof item !== 'object' || depth > 6) return;
    if (Array.isArray(item)) { for(const part of item) walk(part,depth+1); return; }
    const o=item as Record<string,unknown>, code=o.code, box=o.box;
    if(typeof code==='string' && /^[EWU]_/.test(code) && (typeof o.message==='string'||typeof o.severity==='string')) {
      const key=code+(typeof box==='string'?box:'');
      if(!seen.has(key)) seen.set(key, {code,...(typeof o.severity==='string'?{severity:o.severity}:{}),...(typeof box==='string'?{box}:{}),...(typeof o.message==='string'?{message:o.message}:{}),...(o.range && typeof o.range==='object' ? {range:o.range as {min:number;max:number;minExact?:string;maxExact?:string;maxInclusive?:boolean}} : {}),...(o.witness && typeof o.witness==='object' ? {witness:o.witness as {viewport:number;viewportHeight?:number}} : {})});
    }
    for(const v of Object.values(o)) walk(v,depth+1);
  };
  walk(r);
  return {status: r.status, findings: [...seen.values()]};
}
if (typeof process !== 'undefined' && process.argv[2]) {
  const {examples, sides} = await import('./examples.mjs');
  for (const ex of examples.filter(e => process.argv[2] === 'all' || e.id === process.argv[2])) for (const s of sides(ex)) {
    const o = run(s); console.log('##', ex.id, s.side, o.status);
    for (const f of o.findings) console.log('  ', f.code, f.severity ?? '', f.box ?? '', (f.message ?? '').slice(0, 140));
  }
}
