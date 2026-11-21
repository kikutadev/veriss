// Critical CSS (packages/veriss/src/critical.mjs) in the browsers: each page is drawn with all its CSS and with the
// critical CSS alone at usual smartphone and PC sizes, in Chromium, Firefox and WebKit. Every element that starts in the
// first view has the same box in both, and the first-view screenshots are the same pixels. Some rules are dropped on
// each page (the check is not vacuous). The pages use what the analysis lays out (px lengths, class states): with an
// Unknown layout everything is kept, which is sound but checks nothing here. A rule is kept or dropped whole: the rules
// every article shares stay, those only the comments below use go.
import {test, expect} from '@playwright/test';
import {extractCriticalCSS} from '../packages/veriss/src/critical.mjs';

const doc = body => `<!doctype html><html lang="en"><body>${body}</body></html>`;
const pages = {
  landing: {html: doc('<header class="site"><nav class="nav"></nav></header><section class="hero"></section><section class="features"><div class="card"></div><div class="card"></div></section><section class="quote"></section><footer class="foot"><div class="cols"></div></footer>'),
    css: '*{margin:0}body{background:#fff}.site{height:64px;background:#123}.nav{height:64px;margin:0 16px;background:#246}.hero{height:420px;background:#eef}.features{padding:24px;background:#fafafa}.card{height:240px;margin-bottom:24px;background:#ddd;border-radius:8px}.card:hover{background:#ccc}.quote{height:500px;background:#fee}.foot{height:300px;background:#222}.cols{height:120px;margin:40px;background:#444}@media (min-width:1263px){.hero{height:560px}.features{padding:48px 120px}.foot{height:200px}}'},
  articles: {html: doc(`<header class="bar"></header><main class="list">${Array.from({length: 8}, () => '<article class="post"><div class="thumb"></div></article>').join('')}</main><section class="comments"><div class="comment"></div><div class="comment"></div></section>`),
    css: '*{margin:0}.bar{height:56px;background:#0a7}.list{padding:16px}.post{padding:16px;margin-bottom:16px;background:#f4f4f4}.thumb{height:180px;background:#9bd}.post:first-child .thumb{height:260px;background:#79b}@media (min-width:1263px){.list{padding:32px 320px}.thumb{height:240px}}.comments{padding:24px;background:#eee}.comment{height:90px;margin-bottom:12px;background:#ccd}'},
  hidden: {html: doc('<div class="top"></div><div class="menu"><div class="item"></div></div><div class="tall"></div><div class="end"></div>'),
    css: '*{margin:0}.top{height:120px;background:#333}.menu{display:none;position:absolute;top:0;left:0;width:200px;height:300px;background:#f00}.menu.open{display:block}.item{height:40px}.tall{height:1400px;background:#cde}.end{height:80px;background:#222}'},
};
const sizes = [[320, 568], [375, 667], [390, 844], [430, 932], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];

for (const [name, p] of Object.entries(pages)) test(`critical CSS keeps the first view of ${name}`, async ({page}) => {
  const r = extractCriticalCSS(p.html, {css: p.css});
  expect(r.profiles.map(x => x.status), JSON.stringify(r.profiles)).not.toContain('unknown');
  expect(r.dropped, `${name}: some rules are dropped`).toBeGreaterThan(0);
  for (const [width, height] of sizes) {
    await page.setViewportSize({width, height});
    const draw = async css => {
      await page.setContent(p.html.replace('<body>', `<head><style>${css}</style></head><body>`));
      const boxes = await page.evaluate(h => [...document.querySelectorAll('body *')].map(e => { const b = e.getBoundingClientRect(); return {top: b.top, box: [b.x, b.y, b.width, b.height].join(',')}; }).map(b => b.top < h ? b.box : null), height);
      return {boxes, shot: (await page.screenshot()).toString('base64')};
    };
    const full = await draw(p.css), critical = await draw(r.css);
    // Elements that start in the first view with all the CSS have the same box with the critical CSS alone.
    full.boxes.forEach((b, i) => { if (b !== null) expect(critical.boxes[i], `${name} at ${width}x${height}: element ${i}`).toBe(b); });
    expect(critical.shot === full.shot, `${name} at ${width}x${height}: the first-view pixels`).toBe(true);
  }
});

// Text pages: measured with the font file (the browsers load the same file), and a free string that is extracted once
// from the template and then drawn empty, short and long: the critical CSS holds for every value it takes.
import {readFileSync} from 'node:fs';
import {loadTextMetrics} from '../packages/veriss/src/text-node.mjs';
const fontFile = new URL('../packages/veriss/text-metrics/fixtures/roboto-variable.ttf', import.meta.url).pathname;
const fonts = {Roboto: {file: fontFile}};
const fontCSS = '@font-face{font-family:Roboto;src:url(/roboto.ttf);font-display:block}';
const type = 'font-family:Roboto;font-size:16px;line-height:24px;font-weight:400';
const textPages = {
  text: {template: doc('<header class="bar">Site name</header><h1 class="title">A heading that wraps on narrow phones</h1><p class="lead">Some text in the first view, measured with the font file the browsers load too.</p><div class="gap"></div><footer class="foot">Below the fold</footer>'),
    css: `${fontCSS}*{margin:0}body{${type}}.bar{background:#123;color:#fff}.title{font-size:32px;line-height:40px}.gap{height:1200px;background:#eef}.foot{background:#222;color:#fff}`},
  free: {template: doc('<header class="bar">Site name</header><p class="comment" data-text-free>{comment}</p><div class="gap"></div><footer class="foot">Below the fold</footer>'),
    values: ['', 'A short comment.', Array.from({length: 40}, (_, i) => `word${i}`).join(' ')],
    css: `${fontCSS}*{margin:0}body{${type}}.bar{background:#123;color:#fff}.comment{background:#ffe}.gap{height:1200px;background:#eef}.foot{background:#222;color:#fff}`},
};
for (const [name, p] of Object.entries(textPages)) test(`critical CSS keeps the first view of a ${name} page`, async ({page}) => {
  const textMetrics = await loadTextMetrics({fonts});
  const r = extractCriticalCSS(p.template, {css: p.css, textMetrics, fonts});
  expect(r.profiles.map(x => x.status), JSON.stringify(r.profiles)).not.toContain('unknown');
  expect(r.dropped, `${name}: some rules are dropped`).toBeGreaterThan(0);
  await page.route('**/roboto.ttf', route => route.fulfill({body: readFileSync(fontFile), contentType: 'font/ttf'}));
  for (const value of p.values ?? [null]) {
    const html = value === null ? p.template : p.template.replace('{comment}', value);
    for (const [width, height] of sizes) {
      await page.setViewportSize({width, height});
      const draw = async css => {
        await page.route('http://critical.test/', route => route.fulfill({contentType: 'text/html', body: html.replace('<body>', `<head><style>${css}</style></head><body>`)}));
        await page.goto('http://critical.test/'); await page.evaluate(() => document.fonts.ready);
        await page.unroute('http://critical.test/');
        const boxes = await page.evaluate(h => [...document.querySelectorAll('body *')].map(e => { const b = e.getBoundingClientRect(); return b.top < h ? [b.x, b.y, b.width, b.height].join(',') : null; }), height);
        return {boxes, shot: (await page.screenshot()).toString('base64')};
      };
      const full = await draw(p.css), critical = await draw(r.css);
      full.boxes.forEach((b, i) => { if (b !== null) expect(critical.boxes[i], `${name} "${value?.slice(0, 12)}" at ${width}x${height}: element ${i}`).toBe(b); });
      expect(critical.shot === full.shot, `${name} "${value?.slice(0, 12)}" at ${width}x${height}: the first-view pixels`).toBe(true);
    }
  }
});
