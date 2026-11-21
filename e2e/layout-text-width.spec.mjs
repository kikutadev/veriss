// Flex items with text in the browsers: each browser's own widths (its resolution of sans-serif, recorded in
// models/text/<platform>-widths.json; TEXT_PLATFORM picks the platform, linux by default) make every TextWidth one value, so the L1 reference gives one layout; the items drawn
// in that browser have those boxes (within 0.05px) at narrow and wide container widths (items at their text minimum,
// growing past it, and shrinking with a basis).
import {test, expect} from '@playwright/test';
import {spec} from '../models/layout/spec.mjs';
import {boxesAt, close, toNumber} from '../models/layout/solve.mjs';
import {textWidth} from '../models/text/width.mjs';
import {realBrowsers, records} from '../models/text/system-fonts.mjs';

// The platform whose widths the model uses (the workflow sets windows or macos; here: linux).
const platform = process.env.TEXT_PLATFORM ?? ({darwin:'macos',win32:'windows',linux:'linux'}[process.platform] ?? process.platform);

test.afterAll(async () => { await close(); });
const words = ['Home', 'Documentation', 'Pricing', 'Blog'];
const configs = [
  {name: 'grow from 0', item: {basis: 0, grow: 1, shrink: 1}},
  {name: 'shrink from 120', item: {basis: 120, grow: 0, shrink: 1}},
  {name: 'fixed basis, no shrink', item: {basis: 60, grow: 0, shrink: 0}},
];
for (const cfg of configs) test(`text items (${cfg.name}) are where the reference puts them`, async ({page, browserName}) => {
  test.skip(!records[platform], `No recorded font widths for ${platform}: do not compare Linux font measurements against this OS`);
  test.skip(!realBrowsers[platform]?.includes(browserName), `${browserName} is not a browser people use on ${platform}`);
  const c = {display: 'flex', height: 40, gap: 8, justify: 'flex-start', items: words.map(w => ({...cfg.item, text: textWidth(w, {family: 'sans-serif', size: 16}, {platforms: [platform], browsers: [browserName]})}))};
  const s = spec(c);
  for (const W of [120, 200, 256, 300, 480, 800]) {
    await page.setContent(`<!doctype html><style>*{margin:0;padding:0;border:0}.c{display:flex;width:${W}px;height:40px;column-gap:8px;font:16px sans-serif;white-space:nowrap}.c > span{flex:${cfg.item.grow} ${cfg.item.shrink} ${cfg.item.basis}px}</style><div class="c">${words.map(w => `<span>${w}</span>`).join('')}</div>`);
    const got = await page.evaluate(() => { const o = document.querySelector('.c').getBoundingClientRect(); return [...document.querySelectorAll('.c > span')].map(e => { const r = e.getBoundingClientRect(); return [r.x - o.x, r.width]; }); });
    const want = (await boxesAt(s, W)).map(b => [toNumber(b.x), toNumber(b.w)]);
    want.forEach(([x, w], k) => {
      expect(Math.abs(got[k][1] - w), `${cfg.name} W ${W} "${words[k]}" width: reference ${w}, browser ${got[k][1]}`).toBeLessThan(0.05);
      expect(Math.abs(got[k][0] - x), `${cfg.name} W ${W} "${words[k]}" x: reference ${x}, browser ${got[k][0]}`).toBeLessThan(0.05);
    });
  }
});
