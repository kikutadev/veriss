// Quick look at how the analyzer reads some CSS: status, the first Unknown reason and the warnings.
//   node tools/probe.mjs '.a{width:calc(100%-10px)}' ['<div class="a"></div>']
// The page is a one-column grid body with .a { height: 20px } (so a lone .a box is verified unless the CSS says otherwise).
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
const [css = '', html = '<div class="a"></div>'] = process.argv.slice(2);
const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
console.log(r.status);
for (const d of r.diagnostics.filter(d => d.severity !== 'info').slice(0, 5)) console.log(`  ${d.code} ${d.message}`);
for (const w of r.layoutWarnings ?? []) console.log(`  ${w.code}${w.properties ? ' ' + w.properties.join(',') : ''} ${w.box ?? ''}`);
