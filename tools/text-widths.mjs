// Extracts text widths from the browsers (E2E) and checks the MoonBit font measurement against them.
//   PLAYWRIGHT_BROWSERS_PATH=… node tools/text-widths.mjs [out.json]   (default: models/text/linux-widths.json)
// For each browser: which installed font each generic family (system-ui, sans-serif, serif, monospace) resolves to
// (the named font whose widths equal the generic family's on every string), and every string's width in each font.
// The MoonBit widths of the same font files (packages/veriss/text-metrics) are recorded beside them, with the largest
// difference per browser: the allowance a TextWidth interval adds (models/text/width.mjs). With PARLEY_WIDTHS, parley's
// widths of the same files too.
//   (cd tools/parley-widths && cargo build --release) && PARLEY_WIDTHS=tools/parley-widths/target/release/parley-widths node tools/text-widths.mjs
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';
import {corpus, size} from '../models/text/corpus.mjs';
const pw = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? new URL('../models/text/linux-widths.json', import.meta.url).pathname;
// Installed fonts: family name -> regular file (fc-list).
const files = {};
for (const line of execSync('fc-list : file family style').toString().split('\n')) {
  const m = /^(.+?): (.+?):style=(.+)$/.exec(line); if (!m) continue;
  const [, file, fam, style] = m, family = fam.split(',')[0].trim();
  if (!/^(?:Regular|Book|Roman|Normal)$/i.test(style.split(',')[0].trim())) continue; // the first style name (Inter Thin is "Thin,Regular")
  if (/\.(?:ttf|otf)$/i.test(file) && !files[family]) files[family] = file;
}
const generics = ['system-ui', 'sans-serif', 'serif', 'monospace'];
const families = Object.keys(files).sort();
const measure = (page, family) => page.evaluate(({family, corpus, size}) => corpus.map(s => { const e = document.createElement('span'); e.style.cssText = `font:${size}px ${family};white-space:pre`; e.textContent = s; document.body.append(e); const w = e.getBoundingClientRect().width; e.remove(); return w; }), {family, corpus, size});
const record = {recorded: new Date().toISOString().slice(0, 10), os: `${os.type()} ${os.release()}`, size, corpus, browsers: {}, moonbit: {}, fonts: {}};
const metrics = {};
for (const family of families) try { metrics[family] = await loadTextMetrics({fonts: {[family]: {file: files[family]}}}); record.fonts[family] = files[family]; } catch { /* a font the measurement cannot load */ }
for (const family of Object.keys(metrics)) try { record.moonbit[family] = corpus.map(text => metrics[family].measureText({font: {family, size, lineHeight: size * 1.5, weight: 400}, text}).width); } catch { delete record.moonbit[family]; }
// parley (Rust, tools/parley-widths): built with `cargo build --release` there, given as PARLEY_WIDTHS=<binary>.
if (process.env.PARLEY_WIDTHS) {
  record.parley = {};
  for (const family of Object.keys(record.moonbit)) if (!family.includes('\\')) try {
    record.parley[family] = execSync(`${JSON.stringify(process.env.PARLEY_WIDTHS)} ${[record.fonts[family], family, ...corpus].map(a => JSON.stringify(a)).join(' ')}`).toString().trim().split('\n').map(l => Number(l.split('\t').pop()));
  } catch { /* a font parley cannot load */ }
}
for (const name of ['chromium', 'firefox', 'webkit']) {
  const browser = await pw[name].launch(), page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const named = {};
  for (const family of Object.keys(record.moonbit)) named[family] = await measure(page, `"${family}", monospace`);
  const resolved = {};
  for (const g of generics) {
    const widths = await measure(page, g);
    resolved[g] = {widths, font: Object.keys(named).find(f => named[f].every((w, i) => Math.abs(w - widths[i]) < 1e-6)) ?? null};
  }
  const diff = Object.keys(record.moonbit).map(f => Math.max(...named[f].map((w, i) => Math.abs(w - record.moonbit[f][i]) / Math.max(1, w)))).filter(Number.isFinite);
  record.browsers[name] = {version: browser.version(), resolved, named, maxRelativeDifference: Math.max(...diff)};
  await browser.close();
}
writeFileSync(out, JSON.stringify(record, null, 1) + '\n');
for (const [name, b] of Object.entries(record.browsers)) console.log(name, b.version, Object.fromEntries(Object.entries(b.resolved).map(([g, r]) => [g, r.font])), 'max relative difference vs MoonBit', b.maxRelativeDifference.toExponential(2));
