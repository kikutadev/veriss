// TextWidth (models/text/width.mjs, docs/adr/0019-text-width-type.md): the widths a string may take across the fonts it
// may be drawn in, and its use in the Z3 model (a Flex item's automatic minimum is its text's min-content, a variable
// in that interval: Z3 looks for a container width and a font at once).
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {textWidth, allowance, recordedMetrics} from '../models/text/width.mjs';
import {linuxWidths} from '../models/text/system-fonts.mjs';
import {spec} from '../models/layout/spec.mjs';
import {counterexample, boxesAt, close, toNumber} from '../models/layout/solve.mjs';

after(close);
const metrics = await recordedMetrics();
const nav = ['Home', 'Documentation', 'Pricing', 'Blog'];

test('the MoonBit width of each recorded font is within the allowance of every browser (the calibration)', t => {
  // Linux file paths stored in the reference record are not available on macOS.
  // Do not call an empty calibration successful; retain full coverage on hosts with the fonts.
  if (!Object.keys(metrics).length) { t.skip('Linux reference font files unavailable on this host; recorded widths stay testable'); return; }
  let compared = 0;
  for (const [browser, b] of Object.entries(linuxWidths.browsers)) for (const [font, widths] of Object.entries(b.named)) {
    if (!metrics[font]) continue;
    linuxWidths.corpus.forEach((text, i) => {
      const w = metrics[font].measureText({font: {family: font, size: linuxWidths.size, lineHeight: 24, weight: 400}, text}).width;
      assert.ok(Math.abs(w - widths[i]) <= allowance(w), `${browser} ${font} "${text}": MoonBit ${w}, browser ${widths[i]}`);
      compared++;
    });
  }
  assert.ok(compared > 500, `compared ${compared}`);
});

test('a generic family spans the fonts the browsers resolve it to', () => {
  const r = textWidth('Documentation', {family: 'sans-serif', size: 16});
  assert.deepEqual(r.combos.map(c => `${c.browser}:${c.font}`), ['chromium:Liberation Sans', 'firefox:Inter', 'webkit:Inter']);
  assert.deepEqual(r.max, [107.625, linuxWidths.browsers.firefox.named.Inter[linuxWidths.corpus.indexOf('Documentation')]]);
  // A string outside the recorded corpus is measured with MoonBit and widened by the allowance.
  const free = textWidth('Newsletter', {family: 'sans-serif', size: 16}, {metrics});
  if (Object.keys(metrics).length) assert.ok(free.combos.every(c => c.source === 'moonbit') && free.max[0] < free.max[1]);
  else assert.match(free.unknown ?? '', /no recorded width.*no font file/);
  // A platform with no record: a default font with a metric-compatible clone is approximated by the clone, widened (the
  // safe side); one with no clone is Unknown, not guessed.
  const windows = textWidth('Home', {family: 'sans-serif', size: 16}, {platforms: ['windows']});
  assert.deepEqual(windows.combos.map(c => `${c.browser}:${c.font}:${c.source}`), ['chromium:Arial:clone Liberation Sans (recorded)', 'firefox:Arial:clone Liberation Sans (recorded)']);
  const liberation = linuxWidths.browsers.chromium.named['Liberation Sans'][linuxWidths.corpus.indexOf('Home')];
  assert.ok(windows.max[0] < liberation && windows.max[1] > liberation);
  assert.match(textWidth('Home', {family: 'system-ui', size: 16}, {platforms: ['windows']}).unknown, /Segoe UI.*no metric-compatible clone/);
  // min-content is the widest word, max-content the whole string.
  const two = textWidth('Sign in', {family: 'serif', size: 16}, {metrics});
  if (Object.keys(metrics).length) assert.ok(two.min[1] < two.max[0]);
  else assert.match(two.unknown ?? '', /no recorded width.*no font file/);
});

const navConfig = (browsers, rest = {}) => ({display: 'flex', height: 40, gap: 8, justify: 'flex-start',
  items: nav.map(word => ({basis: 0, grow: 1, shrink: 1, text: textWidth(word, {family: 'sans-serif', size: 16}, {browsers}), ...rest}))});
test('Z3 finds the font and the width at which a nav overflows (the text width is part of the model)', async () => {
  // 256-270px: Liberation Sans (Chromium) fits 4 words and 3 gaps (255.25px); Inter (Firefox, WebKit) does not (270.27px).
  const range = {min: 256, max: 270};
  assert.equal(await counterexample(spec(navConfig(['chromium'])), '(>= L 0.0)', range), null);
  const w = await counterexample(spec(navConfig(['chromium', 'firefox', 'webkit'])), '(>= L 0.0)', range);
  assert.ok(w, 'some font in the set overflows');
  // Wide enough for every font: no overflow anywhere.
  assert.equal(await counterexample(spec(navConfig(['chromium', 'firefox', 'webkit'])), '(>= L 0.0)', {min: 271, max: 1920}), null);
  // A free string may be any length: it can always overflow.
  const free = navConfig(['chromium']); free.items[1].text = textWidth({free: true}, {family: 'sans-serif', size: 16});
  assert.ok(await counterexample(spec(free), '(>= L 0.0)', {min: 320, max: 1920}));
});

test('with one font the text items are laid out at their measured minimum', async () => {
  // Chromium alone: each interval is one value (the recorded width), so the boxes are determined.
  const s = spec(navConfig(['chromium']));
  const at = (await boxesAt(s, 200)).map(b => toNumber(b.w));
  assert.deepEqual(at.map(v => Math.round(v * 1000) / 1000), [42.688, 107.625, 48.906, 32.031]); // overflowing: every word at its min-content
  const wide = (await boxesAt(s, 600)).map(b => toNumber(b.w));
  // 600 - 24 = 576 shared by grow 1 from basis 0, but Documentation keeps its min (107.625) and the rest share 468.375.
  assert.ok(Math.abs(wide.reduce((a, v) => a + v, 0) - 576) < 1e-9 && wide[1] >= 107.625 && Math.abs(wide[0] - wide[2]) < 1e-9);
});
