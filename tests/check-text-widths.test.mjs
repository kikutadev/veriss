// tools/check-text-widths.mjs on synthetic Windows records (the workflow runs it on real ones): a record whose Arial,
// Times New Roman and Courier New draw like their Liberation clones passes; one whose Arial is 5% wider fails, and so
// does one whose sans-serif resolves to another font than the table expects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {linuxWidths} from '../models/text/system-fonts.mjs';

const tool = new URL('../tools/check-text-widths.mjs', import.meta.url).pathname;
const windowsLike = ({scaleArial = 1, sansSerif = 'Arial'} = {}) => {
  const named = b => { const l = linuxWidths.browsers[b].named; return {Arial: l['Liberation Sans'].map(w => w * scaleArial), 'Times New Roman': l['Liberation Serif'], 'Courier New': l['Liberation Mono'], 'Segoe UI': l.Inter, Consolas: l['DejaVu Sans Mono']}; };
  const fonts = {chromium: {'system-ui': 'Segoe UI', 'sans-serif': sansSerif, serif: 'Times New Roman', monospace: 'Consolas'}, firefox: {'system-ui': 'Segoe UI', 'sans-serif': sansSerif, serif: 'Times New Roman', monospace: 'Courier New'}};
  return {platform: 'windows', recorded: 'synthetic', os: 'Windows_NT (synthetic)', size: linuxWidths.size, corpus: linuxWidths.corpus, moonbit: {}, fonts: {},
    browsers: Object.fromEntries(Object.entries(fonts).map(([b, f]) => [b, {version: 'synthetic', named: named(b), resolved: Object.fromEntries(Object.entries(f).map(([g, font]) => [g, {font, widths: named(b)[font]}]))}]))};
};
const run = record => { const dir = mkdtempSync(join(tmpdir(), 'tw-')), file = join(dir, 'windows-widths.json'); writeFileSync(file, JSON.stringify(record)); return spawnSync(process.execPath, [tool, file], {encoding: 'utf8'}); };

test('a Windows record whose default fonts draw like their clones passes the model checks', () => {
  const r = run(windowsLike());
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Arial ~ Liberation Sans in chromium: within the allowance/);
  assert.match(r.stdout, /sans-serif: every width the browsers drew is inside the approximate model's interval/);
  // Segoe UI has no clone: the approximate model claims nothing for system-ui.
  assert.match(r.stdout, /system-ui: Unknown in the approximate model/);
});
test('the checks fail when the record disagrees with the model', () => {
  const wide = run(windowsLike({scaleArial: 1.05}));
  assert.equal(wide.status, 1); assert.match(wide.stdout, /Arial ~ Liberation Sans in chromium: outside the clone allowance/);
  assert.match(wide.stdout, /sans-serif: the approximate model misses/);
  const other = run(windowsLike({sansSerif: 'Segoe UI'}));
  assert.equal(other.status, 1); assert.match(other.stdout, /resolution: chromium sans-serif: expected Arial, resolved Segoe UI/);
});
