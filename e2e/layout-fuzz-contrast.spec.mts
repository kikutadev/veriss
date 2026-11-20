// Differential fuzzing of text contrast: nested opaque/translucent backgrounds, group opacity, translucent text,
// large and normal text, and media branches on width and prefers-color-scheme. Chromium's side is measured in
// pixels: a probe painted with currentColor inside the text gives the effective text colour (through every opacity
// group), and the same point with the probe and text hidden gives the backdrop. Per text box, viewport and scheme
// the static E_A11Y_CONTRAST verdict must equal the pixel ratio's (and its ratio agree within rounding); cases within
// 0.1 of the threshold, where 8-bit pixels cannot decide, are counted and skipped.
import {test, expect} from '@playwright/test';
import type {LayoutOptions, LayoutRange, LayoutDiagnostic} from '../packages/veriss/src/index.mjs';
import {required as need} from './support/required.mjs';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {generateContrastCase} from './support/contrast-fuzz.mjs';
import {viewports} from './support/visibility-fuzz.mjs';

const seeds = Number(process.env.FUZZ_SEEDS ?? 20), first = Number(process.env.FUZZ_FIRST ?? 1);
const inRange = (range: LayoutRange | undefined, v: number) => !range || ((range.minInclusive ? v >= range.min : v > range.min) && (range.maxInclusive ? v <= range.max : v < range.max));
type RGB = [number, number, number];
const lum = ([r, g, b]: RGB) => { const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a: RGB, b: RGB) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('fuzz: text contrast — static verdicts and ratios agree with Chromium pixels across nesting, opacity and schemes', async ({page}) => {
  test.setTimeout(1_800_000);
  const tally: {cases: number; unknown: number; compared: number; failing: number; nearThreshold: number; unknownTexts?: number} = {cases: 0, unknown: 0, compared: 0, failing: 0, nearThreshold: 0};
  const pixel = async (x: number, y: number): Promise<RGB> => { const [r, g, b] = await page.evaluate(async data => { const i = new Image(); i.src = `data:image/png;base64,${data}`; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); if (!g) throw new Error('Missing canvas context'); g.drawImage(i, 0, 0); return [...g.getImageData(0, 0, 1, 1).data]; }, (await page.screenshot({clip: {x, y, width: 1, height: 1}})).toString('base64')); return [need(r, 'Missing red'), need(g, 'Missing green'), need(b, 'Missing blue')]; };
  for (let seed = first; seed < first + seeds; seed++) {
    const c = generateContrastCase(seed);
    tally.cases++;
    const boxes = Object.fromEntries(c.texts.map(t => [`.${t}`, {minInlineSize: 40, intrinsicBlockSize: 24}]));
    const options: LayoutOptions & {accessibility: true} = {name: 'P', css: c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, accessibility: true, boxes};
    const report = analyzeHTML(c.html, options);
    // A geometry Unknown skips the case; a contrast Unknown (group opacity, a background image) skips that text only.
    if (report.diagnostics.some(d => d.severity === 'unknown' && /^U_LAYOUT/.test(d.code))) { tally.unknown++; continue; }
    const unknownText = new Set(report.diagnostics.filter(d => d.code === 'U_A11Y_CONTRAST').map(d => d.box));
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({colorScheme: scheme});
      for (const [w, h] of viewports(c, seed)) {
        await page.setViewportSize({width: w, height: h});
        const probe = '<i class="probe" style="display:inline-block;width:6px;height:6px;background:currentColor;vertical-align:top"></i>';
        await page.setContent(`<!doctype html><html lang="en"><head><style>${c.css}</style></head><body>${c.body.replace(/(<p class="t\d+">)/g, `$1${probe}`)}</body></html>`);
        const at = await page.evaluate(texts => Object.fromEntries(texts.map(t => { const p = document.querySelector(`.${t} .probe`); if (!p) throw new Error("Missing probe: " + t); const rect = p.getBoundingClientRect(); return [t, [Math.floor(rect.x + 3), Math.floor(rect.y + 3)] as const] as const; })), c.texts);
        const fg: Record<string, RGB> = {}; for (const t of c.texts) fg[t] = await pixel(...need(at[t], "Missing probe position"));
        await page.addStyleTag({content: '.probe{visibility:hidden}[class^="t"]{color:transparent!important}'});
        for (const t of c.texts) {
          const bg = await pixel(...need(at[t], "Missing probe position"));
          const measured = ratio(need(fg[t], "Missing foreground pixel"), bg);
          const style = await page.evaluate(t => { const el = document.querySelector(`.${t}`); if (!el) throw new Error("Missing text: " + t); const s = getComputedStyle(el); return [parseFloat(s.fontSize), Number(s.fontWeight)] as const; }, t);
          const required = style[0] >= 24 || (style[0] >= 18.66 && style[1] >= 700) ? 3 : 4.5;
          // The static check judges the dark scheme separately only where a prefers-color-scheme rule exists; without
          // one the page (and Chromium's emulation) is the light scheme.
          const darkJudged = scheme === 'dark' && /prefers-color-scheme:\s*dark/.test(c.css);
          // A dark finding equal to the light one is kept once, on the light finding, with alsoUnder.
          const under = (d: LayoutDiagnostic) => {
            const preference = 'preference' in d ? d.preference : undefined;
            const alsoUnder = 'alsoUnder' in d ? d.alsoUnder : undefined;
            if (preference !== undefined && typeof preference !== 'string') throw new Error('Invalid preference');
            if (alsoUnder !== undefined && !Array.isArray(alsoUnder)) throw new Error('Invalid alsoUnder');
            return darkJudged ? preference === 'prefers-color-scheme: dark' || (!preference && alsoUnder?.includes('prefers-color-scheme: dark')) : !preference;
          };
          const d = report.diagnostics.find(d => d.code === 'E_A11Y_CONTRAST' && d.box === `.${t}` && under(d) && inRange(d.range, w) && inRange(d.heightRange, h));
          if (unknownText.has(`.${t}`)) { tally.unknownTexts = (tally.unknownTexts ?? 0) + 1; continue; }
          if (Math.abs(measured - required) < 0.1) { tally.nearThreshold++; continue; }
          tally.compared++; if (measured < required) tally.failing++;
          const staticRatio = d && 'ratio' in d && typeof d.ratio === 'number' ? d.ratio : undefined;
          if (d && staticRatio === undefined) throw new Error('Missing contrast ratio');
          const label = `seed ${seed} .${t} ${scheme} at ${w}×${h}: pixels ${measured.toFixed(2)}:1 (fg ${fg[t]} bg ${bg}), static ${staticRatio !== undefined ? staticRatio.toFixed(2) + ':1' : 'pass'}, required ${required}\n${c.css}`;
          expect(Boolean(d), label).toBe(measured < required);
          if (staticRatio !== undefined) expect(Math.abs(staticRatio - measured), label).toBeLessThan(0.15);
        }
      }
    }
  }
  console.log(`contrast fuzz: ${JSON.stringify(tally)}`);
  expect(tally.unknown).toBeLessThan(Math.max(1, tally.cases * 0.3));
  expect(tally.failing).toBeGreaterThan(0);
  expect(tally.compared - tally.failing).toBeGreaterThan(0);
});
