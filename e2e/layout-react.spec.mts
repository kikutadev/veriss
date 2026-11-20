import {repeatedItems, evaluateAffine} from './support/geometry.mjs';
import type {Choices} from '../packages/adapter-core/src/index.mjs';
import type {LayoutAffine} from '../packages/veriss/src/layout-contracts.js';
// The React adapter against the real styles: StyleX's own compiled CSS (atomic classes) and Linaria's templates
// (kept nested, for the browser's native CSS nesting), with react-dom/server's markup for each state, laid out in
// Chromium and compared box by box (by tree path: the class names differ) with the static analysis.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {analyzeReact} from '../packages/react-adapter/src/index.mjs';
import {compileStylex, compileLinaria, render} from '../packages/react-adapter/test/ssr.mjs';

const fixture = (name:string) => readFileSync(new URL(`../packages/react-adapter/fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{margin:0}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const propsOf = (c:Choices) => Object.fromEntries(Object.entries(c).map(([k, v]) => k.startsWith('#map ') ? [k.slice(5), repeatedItems(v)] : [k, v]));

for (const [file, compile] of [['StylexCard.jsx', compileStylex], ['StylexLonghand.jsx', compileStylex], ['LinariaCard.jsx', compileLinaria]] as const) {
  test(`${file}: every state's boxes (position and size) agree with Chromium on the real styles`, async ({page}) => {
    const source = fixture(file), {code, css} = await compile(source);
    const report = analyzeReact(source, {pageCSS, viewport});
    let compared = 0;
    for (const width of [360, 700]) {
      await page.setViewportSize({width, height: 700});
      for (const state of report.states) {
        await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${css}</style></head><body>${await render(code, propsOf(state.choices))}</body></html>`);
        for (const row of state.report.sizes.filter(r => r.rect && r.path.split('/').length > 2)) {
          const v = (x:LayoutAffine) => evaluateAffine(x,width,700);
          if (!(width >= row.range.min && width <= row.range.max)) continue;
          const box = await page.evaluate(path => { let e:Element|undefined = document.body; for (const i of path.split('/').slice(2)) e = e?.children[Number(i)]; const r = e?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height]; }, row.path);
          expect(box, `${file} ${JSON.stringify(state.choices)} ${row.path} at ${width}`).toEqual([v(row.rect!.inlineStart), v(row.rect!.blockStart), v(row.rect!.inlineSize), v(row.rect!.blockSize)]);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThanOrEqual(16);
  });
}

test('LinariaSettings.jsx (interpolated constants and class references): the findings per state agree with the real Linaria build in Chromium', async ({page}) => {
  test.setTimeout(300_000);
  const source = fixture('LinariaSettings.jsx'), {code, css} = await compileLinaria(source);
  const css18 = pageCSS + 'body{font-size:18px}';
  const report = analyzeReact(source, {pageCSS: css18, viewport, accessibility: true, integrity: true, eachCounts: [2], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], boxes: {'.lx-title': {minInlineSize: 40, intrinsicBlockSize: 24}}});
  const holds = (code:string, box:string, choices:Choices) => report.findings.some(f => f.code === code && f.box === box && f.states.includes(choices));
  await page.setViewportSize({width: 400, height: 300});
  let checked = 0;
  for (const state of report.states) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css18}${css}.tall{height:2000px}</style></head><body>${await render(code, propsOf(state.choices))}<div class="tall"></div></body></html>`);
    // The hidden checkbox: Tab from the start never reaches it.
    const order = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement?.tagName.toLowerCase() + ':' + (document.activeElement?.getAttribute('aria-label') ?? (document.activeElement && 'type' in document.activeElement ? document.activeElement.type : undefined) ?? ''))); }
    const reachesBox = order.some(o => o === 'input:checkbox');
    expect(holds('E_A11Y_CONTROL_HIDDEN', '.lx-box.lx-hidden', state.choices), `${JSON.stringify(state.choices)} tab ${order}`).toBe(!reachesBox);
    // The buttons keep the UA font size against the 18px page.
    const [button, page18] = await page.evaluate(() => [getComputedStyle(document.querySelector('[aria-label="Reset"]')!).fontSize, getComputedStyle(document.querySelector('main')!).fontSize]);
    expect(holds('W_LAYOUT_CONTROL_FONT', '.lx-reset', state.choices)).toBe(button !== page18);
    // The interpolated width: 96px with or without the inert grid-column.
    expect(await page.evaluate(() => document.querySelector('[aria-label="Save"]')!.getBoundingClientRect().width)).toBe(96);
    // The sticky table head inside overflow-x: auto scrolls away with the page.
    const top = await page.evaluate(async () => { scrollTo(0, 300); await new Promise<number>(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('main > div:last-child > div')!.getBoundingClientRect().top; });
    expect(holds('W_LAYOUT_STICKY_SCROLLER', '.lx-thead', state.choices)).toBe(top < 0);
    checked++;
  }
  expect(checked).toBe(8);
});

