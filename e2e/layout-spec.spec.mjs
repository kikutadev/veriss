// The L1 coordinate reference (models/layout, docs/adr/0018-coordinate-subset.md) against the browsers: random Grid and
// Flex (row, nowrap) configurations inside L1, drawn at several container widths, every border box compared with the
// Z3 solution of the reference (within 0.05px: browsers round layout to 1/64px).
import {test, expect} from '@playwright/test';
import {spec, toCSS, toHTML} from '../models/layout/spec.mjs';
import {boxesAt, close, toNumber} from '../models/layout/solve.mjs';
import {randomGrid, randomFlex} from '../models/layout/random.mjs';

const widths = [0, 37, 120, 333, 640];
test.afterAll(async () => { await close(); });
for (const [kind, make] of [['grid', randomGrid], ['flex', randomFlex]]) {
  test(`L1 ${kind}: the reference coordinates are the browser's`, async ({page}) => {
    const misses = [];
    for (let seed = 1; seed <= 60; seed++) {
      const c = make(seed), s = spec(c);
      for (const W of widths) {
        await page.setContent(`<!doctype html><style>*{margin:0;padding:0;border:0;box-sizing:border-box}.c{width:${W}px}${toCSS(c)}</style>${toHTML(c)}`);
        const got = await page.evaluate(() => { const o = document.querySelector('.c').getBoundingClientRect(); return [...document.querySelectorAll('.c > div')].map(e => { const r = e.getBoundingClientRect(); return [r.x - o.x, r.y - o.y, r.width, r.height]; }); });
        const want = await boxesAt(s, W);
        want.forEach((b, k) => {
          const exp = [b.x, b.y, b.w, b.h].map(toNumber);
          // Sizes always; positions where the item's position is inside L1.
          const idx = b.ok ? [0, 1, 2, 3] : [2, 3];
          if (idx.some(i => Math.abs(exp[i] - got[k][i]) > 0.05)) misses.push(`seed ${seed} W ${W} item ${k}: reference ${exp.map(v => +v.toFixed(3))} browser ${got[k].map(v => +v.toFixed(3))}\n  ${toCSS(c)}`);
        });
      }
    }
    expect(misses.slice(0, 5).join('\n')).toBe('');
  });
}
