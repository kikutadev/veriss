// Extracts text widths from the browsers (E2E) and checks the MoonBit font measurement against them.
//   PLAYWRIGHT_BROWSERS_PATH=… node tools/text-widths.mjs [out.json]   (default: models/text/<platform>-widths.json)
// On Windows and macOS (the GitHub Actions workflow .github/workflows/text-widths.yml) the default fonts are found by
// their known files; a font the measurement cannot load is recorded for the browsers only.
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
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
// The platform the record is for: linux, windows or macos (models/text/<platform>-widths.json).
export const platform = {linux: 'linux', win32: 'windows', darwin: 'macos'}[process.platform] ?? process.platform;
const out = process.argv[2] ?? fileURLToPath(new URL(`../models/text/${platform}-widths.json`, import.meta.url));
// Installed fonts: family name -> regular file. Linux: fc-list. Windows and macOS: the default fonts' known files (the
// names the system-font table uses; a .ttc collection is left out where the measurement cannot load it).
const known = {
  windows: {dir: process.env.WINDIR ? join(process.env.WINDIR, 'Fonts') : 'C:\\Windows\\Fonts', files: {'Segoe UI': 'segoeui.ttf', Arial: 'arial.ttf', 'Times New Roman': 'times.ttf', 'Courier New': 'cour.ttf',
    Consolas: 'consola.ttf', Calibri: 'calibri.ttf', Cambria: 'cambria.ttc', Verdana: 'verdana.ttf', Tahoma: 'tahoma.ttf', Georgia: 'georgia.ttf', 'Trebuchet MS': 'trebuc.ttf'}},
  macos: {dirs: ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts'], files: {'SF Pro': 'SFNS.ttf', Helvetica: 'Helvetica.ttc', 'Helvetica Neue': 'HelveticaNeue.ttc',
    Times: 'Times.ttc', 'Times New Roman': 'Times New Roman.ttf', Arial: 'Arial.ttf', 'Courier New': 'Courier New.ttf', Courier: 'Courier.ttc', Menlo: 'Menlo.ttc', Georgia: 'Georgia.ttf', Verdana: 'Verdana.ttf'}},
};
const files = {};
if (platform === 'linux') {
  for (const line of execSync('fc-list : file family style').toString().split('\n')) {
    const m = /^(.+?): (.+?):style=(.+)$/.exec(line); if (!m) continue;
    const [, file, fam, style] = m, family = fam.split(',')[0].trim();
    if (!/^(?:Regular|Book|Roman|Normal)$/i.test(style.split(',')[0].trim())) continue; // the first style name (Inter Thin is "Thin,Regular")
    if (/\.(?:ttf|otf)$/i.test(file) && !files[family]) files[family] = file;
  }
} else if (known[platform]) {
  const {dir, dirs = [dir], files: names} = known[platform];
  for (const [family, name] of Object.entries(names)) {
    const found = dirs.map(d => join(d, name)).find(f => existsSync(f)) ?? dirs.flatMap(d => existsSync(d) ? readdirSync(d).filter(f => f.toLowerCase() === name.toLowerCase()).map(f => join(d, f)) : [])[0];
    if (found) files[family] = found;
  }
}
const generics = ['system-ui', 'sans-serif', 'serif', 'monospace'];
const families = Object.keys(files).sort();
const measure = (page, family) => page.evaluate(({family, corpus, size}) => corpus.map(s => { const e = document.createElement('span'); e.style.cssText = `font:${size}px ${family};white-space:pre`; e.textContent = s; document.body.append(e); const w = e.getBoundingClientRect().width; e.remove(); return w; }), {family, corpus, size});
const record = {platform, recorded: new Date().toISOString().slice(0, 10), os: `${os.type()} ${os.release()}`, size, corpus, browsers: {}, moonbit: {}, fonts: {...files}};
const metrics = {};
for (const family of families) try { metrics[family] = await loadTextMetrics({fonts: {[family]: {file: files[family]}}}); } catch { /* a font the measurement cannot load: browsers only */ }
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
  for (const family of Object.keys(files)) named[family] = await measure(page, `"${family}", monospace`);
  const resolved = {};
  for (const g of generics) {
    const widths = await measure(page, g);
    resolved[g] = {widths, font: Object.keys(named).find(f => named[f].every((w, i) => Math.abs(w - widths[i]) < 1e-6)) ?? null};
  }
  const diff = Object.keys(record.moonbit).filter(f => named[f]).map(f => Math.max(...named[f].map((w, i) => Math.abs(w - record.moonbit[f][i]) / Math.max(1, w)))).filter(Number.isFinite);
  record.browsers[name] = {version: browser.version(), resolved, named, maxRelativeDifference: Math.max(...diff)};
  await browser.close();
}
writeFileSync(out, JSON.stringify(record, null, 1) + '\n');
for (const [name, b] of Object.entries(record.browsers)) console.log(name, b.version, Object.fromEntries(Object.entries(b.resolved).map(([g, r]) => [g, r.font])), 'max relative difference vs MoonBit', b.maxRelativeDifference.toExponential(2));
