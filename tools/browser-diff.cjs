// Does a declaration change anything? Renders the page with and without it in Chromium, Firefox and WebKit and compares
// every element's border box and a screenshot. Measure several contents and conditions before calling a declaration
// inert (a one-character cell once hid that max-width does narrow a column of wrapping text; see TODO.md).
//   node tools/browser-diff.cjs '<base css>' '<css with the declaration>' '<body html>'
const pw = require('playwright');
const [base = '', withIt = '', html = '<div class="a">x</div>'] = process.argv.slice(2);
const shot = async (page, css) => {
  await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}${css}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(100);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('body *')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(','); }).join(' '));
  return [boxes, (await page.screenshot({clip: {x: 0, y: 0, width: 400, height: 200}})).toString('base64')];
};
(async () => {
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const browser = await pw[name].launch(), page = await browser.newPage();
    const [ga, pa] = await shot(page, base), [gb, pb] = await shot(page, withIt);
    console.log(name.padEnd(9), ga === gb ? (pa === pb ? 'SAME' : 'paint differs') : `geometry differs: ${ga} -> ${gb}`);
    await browser.close();
  }
})();
