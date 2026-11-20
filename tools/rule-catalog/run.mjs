// Runs veriss on an example and lists every finding (code, severity, box, message), for both sides (ng / ok).
//   node tools/rule-catalog/run.mjs <id|all>
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
export const reset = '*{box-sizing:border-box;margin:0;padding:0}html,body{margin:0}';
export function run({html, css, boxes, vw = [375, 1280], accessibility = true}) {
  const r = analyzeHTML(html, {name: 'Page', css: reset + css, viewport: {min: vw[0], max: vw[1], height: {min: 600, max: 1000}}, accessibility, ...(boxes ? {boxes} : {})});
  const seen = new Map();
  const walk = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 6) return; if (Array.isArray(o)) return o.forEach(x => walk(x, d + 1));
    if (typeof o.code === 'string' && /^[EWU]_/.test(o.code) && (o.message || o.severity)) { const k = o.code + (o.box ?? ''); if (!seen.has(k)) seen.set(k, {code: o.code, severity: o.severity, box: o.box, message: o.message}); }
    for (const v of Object.values(o)) walk(v, d + 1); };
  walk(r);
  return {status: r.status, findings: [...seen.values()]};
}
if (process.argv[2]) {
  const {examples, sides} = await import('./examples.mjs');
  for (const ex of examples.filter(e => process.argv[2] === 'all' || e.id === process.argv[2])) for (const s of sides(ex)) {
    const o = run(s); console.log('##', ex.id, s.side, o.status);
    for (const f of o.findings) console.log('  ', f.code, f.severity ?? '', f.box ?? '', (f.message ?? '').slice(0, 140));
  }
}
