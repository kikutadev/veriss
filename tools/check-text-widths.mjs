// Checks a text-width record (tools/text-widths.mjs) against the model (models/text/): run by the workflow
// .github/workflows/text-widths.yml on Windows and macOS, and here on the Linux record.
//   node tools/check-text-widths.mjs [record.json]     exit 1 when the model disagrees with the record
// 1. Each generic family resolves to the font the system-font table expects, in the browsers used on that platform.
// 2. The MoonBit width of each recorded font file is within the allowance of every browser's width.
// 3. Each metric-compatible clone (Liberation for Arial, …: the Linux record) is within the clone allowance of the real font.
// 4. The approximate model (no record of this platform: clones, widened) contains every width the browsers drew for the
//    generic families: the safe side holds where it is used.
import {readFileSync, appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expectedFonts, realBrowsers, metricClones, linuxWidths} from '../models/text/system-fonts.mjs';
import {allowance, cloneAllowance, textWidth} from '../models/text/width.mjs';

const platformOf = {linux: 'linux', win32: 'windows', darwin: 'macos'}[process.platform];
const file = process.argv[2] ?? fileURLToPath(new URL(`../models/text/${platformOf}-widths.json`, import.meta.url));
const record = JSON.parse(readFileSync(file, 'utf8')), platform = record.platform;
const browsers = realBrowsers[platform].filter(b => record.browsers[b]);
const lines = [`## Text widths on ${platform} (${record.os}, ${record.recorded})`, '', `Browsers: ${browsers.map(b => `${b} ${record.browsers[b].version}`).join(', ')}`, ''];
const failures = [];
const fail = message => { failures.push(message); lines.push(`- ❌ ${message}`); };
const ok = message => lines.push(`- ✅ ${message}`);

lines.push('### 1. Generic families', '', '| browser | generic | expected | resolved |', '|---|---|---|---|');
const mismatches = [];
for (const b of browsers) for (const [g, expected] of Object.entries(expectedFonts[platform]?.[b] ?? {})) {
  const got = record.browsers[b].resolved[g]?.font ?? '(no installed font matched)';
  lines.push(`| ${b} | ${g} | ${expected} | ${got}${got === expected ? '' : ' ⚠'} |`);
  if (got !== expected) mismatches.push(`${b} ${g}: expected ${expected}, resolved ${got}`);
}
lines.push('');
for (const m of mismatches) fail(`resolution: ${m} (update expectedFonts in models/text/system-fonts.mjs)`);
if (!mismatches.length) ok('every generic family resolves to the expected font');

lines.push('', '### 2. MoonBit against the browsers', '');
let worst = 0, compared = 0;
for (const b of browsers) for (const [font, widths] of Object.entries(record.browsers[b].named)) {
  const mb = record.moonbit[font]; if (!mb) continue;
  widths.forEach((w, i) => { compared++; const d = Math.abs(w - mb[i]); worst = Math.max(worst, d); if (d > allowance(mb[i])) fail(`MoonBit ${font} "${record.corpus[i]}" in ${b}: ${mb[i]} vs ${w} (allowance ${allowance(mb[i]).toFixed(3)})`); });
}
ok(`${compared} widths compared, the largest difference ${worst.toFixed(4)}px`);

lines.push('', '### 3. Metric-compatible clones (the Linux record) against the real fonts', '');
if (platform === 'linux') lines.push('- (the Linux record is the clones\' own: nothing to compare)');
else for (const [font, clone] of Object.entries(metricClones)) for (const b of browsers) {
  const real = record.browsers[b].named[font], approx = linuxWidths.browsers[b]?.named[clone.font];
  if (!real || !approx) continue;
  const widen = cloneAllowance[clone.exact ? 'exact' : 'near'];
  const d = Math.max(...real.map((w, i) => Math.abs(w - approx[i])));
  const bad = real.map((w, i) => Math.abs(w - approx[i]) > widen(approx[i]) + allowance(approx[i]) ? record.corpus[i] : null).filter(Boolean);
  if (bad.length) fail(`${font} ~ ${clone.font} in ${b}: outside the clone allowance for ${bad.map(s => `"${s}"`).join(', ')} (largest difference ${d.toFixed(3)}px)`);
  else ok(`${font} ~ ${clone.font} in ${b}: within the allowance (largest difference ${d.toFixed(3)}px)`);
}

lines.push('', '### 4. The approximate model contains what the browsers drew', '');
if (platform === 'linux') lines.push('- (Linux is recorded: the approximate model is not used there)');
else for (const g of ['system-ui', 'sans-serif', 'serif', 'monospace']) {
  const misses = [], unknown = new Set();
  record.corpus.forEach((text, i) => {
    const model = textWidth(text, {family: g, size: record.size}, {platforms: [platform], browsers, approximate: true, maxOnly: true});
    if (model.unknown) { unknown.add(model.unknown); return; }
    for (const b of browsers) { const w = record.browsers[b].resolved[g]?.widths[i]; if (w !== undefined && (w < model.max[0] || w > model.max[1])) misses.push(`${b} "${text}": ${w} outside [${model.max.map(v => v.toFixed(3)).join(', ')}]`); }
  });
  if (unknown.size) lines.push(`- ➖ ${g}: Unknown in the approximate model (${[...unknown][0]}): not used, nothing claimed`);
  else if (misses.length) fail(`${g}: the approximate model misses ${misses.length} widths: ${misses.slice(0, 3).join('; ')}`);
  else ok(`${g}: every width the browsers drew is inside the approximate model's interval`);
}

const text = lines.join('\n') + '\n';
process.stdout.write(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
process.exit(failures.length ? 1 : 0);
