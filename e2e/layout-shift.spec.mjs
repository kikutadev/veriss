// The layout-shift verdicts of the L1 reference (models/layout/shift.mjs) in the browsers: at the Z3 witness width of
// each broken case (a move of at least 3px: Chromium's layout-shift tracker ignores smaller moves) the state change moves
// the reported items in Chromium, Firefox and WebKit, and Chromium records a layout-shift entry (no input before it, so it counts for CLS); for each stable case nothing
// moves at the common widths and Chromium records no shift.
import {test, expect} from '@playwright/test';
import {toCSS, toHTML} from '../models/layout/spec.mjs';
import {layoutShift} from '../models/layout/shift.mjs';
import {shiftCases} from '../models/layout/shift-cases.mjs';
import {close} from '../models/layout/solve.mjs';

test.afterAll(async () => { await close(); });
const reset = '*{margin:0;padding:0;border:0;box-sizing:border-box}.c > div{background:#68a}';
// Loads the before state at width W (a real navigation, as layout-cls-facts.spec.mjs measures CLS), waits, then switches
// to the after state with no input and reads both positions and the layout-shift entries.
const observe = `window.__shift=0;if(PerformanceObserver.supportedEntryTypes?.includes('layout-shift'))new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__shift+=e.value}).observe({type:'layout-shift',buffered:true});`;
async function switchAt(page, c, W, trackShift) {
  await page.setViewportSize({width: Math.ceil(W) + 40, height: 400});
  await page.route('http://shift.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><script>${observe}</script><style id="s">${reset}.c{width:${W}px}${toCSS(c.before)}</style></head><body>${toHTML(c.before)}</body></html>`}));
  await page.goto('http://shift.test/');
  await page.waitForTimeout(300);
  const got = await page.evaluate(async ({css, html}) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const read = () => { const o = document.querySelector('.c').getBoundingClientRect(); return Object.fromEntries([...document.querySelectorAll('.c > div')].map(e => { const r = e.getBoundingClientRect(); return [e.dataset.id, [r.x - o.x, r.y - o.y]]; })); };
    await frame();
    const before = read();
    // Keep the existing elements (a recreated element is new, not shifted): re-class them by their new index and only
    // insert the items the after state adds.
    const box = document.querySelector('.c'), next = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.c > div');
    let at = box.firstElementChild;
    for (const n of next) {
      const old = box.querySelector(`:scope > [data-id="${n.dataset.id}"]`);
      if (old) { old.className = n.className; at = old.nextElementSibling; }
      else box.insertBefore(n, at);
    }
    document.getElementById('s').textContent = css;
    await frame(); await frame();
    return {before, after: read()};
  }, {css: `${reset}.c{width:${W}px}${toCSS(c.after)}`, html: toHTML(c.after)});
  await page.waitForTimeout(300);
  await page.unroute('http://shift.test/');
  return {...got, shift: trackShift ? await page.evaluate(() => window.__shift) : null};
}

for (const c of shiftCases) test(`${c.expect}: ${c.name}`, async ({page, browserName}) => {
  if (c.expect === 'shift') {
    const r = await layoutShift(c.before, c.after, {atLeast: 3});
    expect(r.shift, c.why).toBe(true);
    const got = await switchAt(page, c, r.width, browserName === 'chromium');
    // Each item Z3 says moves by 3px or more moves in the browser by the amount it says (within 0.05px).
    const big = r.moved.filter(m => Math.abs(m.before.x - m.after.x) >= 3 || Math.abs(m.before.y - m.after.y) >= 3);
    expect(big.length, c.name).toBeGreaterThan(0);
    for (const m of big) {
      expect(Math.abs(got.after[m.id][0] - got.before[m.id][0] - (m.after.x - m.before.x)), `${c.name} ${m.id} x at ${r.width}`).toBeLessThan(0.05);
      expect(Math.abs(got.after[m.id][1] - got.before[m.id][1] - (m.after.y - m.before.y)), `${c.name} ${m.id} y at ${r.width}`).toBeLessThan(0.05);
    }
    if (got.shift !== null) expect(got.shift, `${c.name}: Chromium layout-shift`).toBeGreaterThan(0);
  } else {
    expect((await layoutShift(c.before, c.after)).shift, c.why).toBe(false);
    for (const W of [320, 375, 414, 768, 1024, 1280, 1440, 1920]) {
      const got = await switchAt(page, c, W, browserName === 'chromium');
      for (const id of Object.keys(got.before)) if (got.after[id]) expect(got.after[id], `${c.name} ${id} at ${W}`).toEqual(got.before[id]);
      if (got.shift !== null) expect(got.shift, `${c.name} at ${W}: Chromium layout-shift`).toBe(0);
    }
  }
});
