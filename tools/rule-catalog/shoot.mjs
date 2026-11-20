// Builds the images of docs/rule-catalog.md: each example is analysed by veriss and drawn in Chromium.
//   node tools/rule-catalog/shoot.mjs            (CHROMIUM_PATH=/path/to/chromium when Playwright has no browser)
import {createRequire} from 'node:module'; const {chromium} = createRequire(import.meta.url)('playwright');
import {writeFileSync} from 'node:fs';
import {examples} from './examples.mjs';
import {run, reset} from './run.mjs';
const out = new URL('../../docs/rule-catalog/', import.meta.url).pathname;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
const ctx = await b.newContext({deviceScaleFactor: 2});
const page = await ctx.newPage();
async function snap(ex, state) {
  await page.setViewportSize({width: ex.shot, height: 600});
  await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${reset}${ex.css}body{padding:10px}</style></head><body>${ex.html}</body></html>`);
  if (state === 'hover') await page.hover(ex.hover);
  if (state === 'focus') await page.focus(ex.focus);
  const bodyH = await page.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll('main, main *')].map(e => e.getBoundingClientRect().bottom))));
  const r = await page.evaluate(sel => { const e = document.querySelector(sel).getBoundingClientRect(); return {x: e.x, y: e.y, w: e.width, h: e.height}; }, ex.mark);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const png = await page.screenshot({clip: {x: 0, y: 0, width: Math.max(ex.shot, sw), height: Math.min(Math.max(bodyH + 8, 60), 400)}, fullPage: true});
  return {png: png.toString('base64'), r, w: Math.max(ex.shot, sw), h: Math.min(Math.max(bodyH + 8, 60), 400), overflow: sw > ex.shot};
}
for (const ex of examples) {
  const res = run(ex);
  const shown = res.findings.filter(f => f.code !== 'W_A11Y_FORCED_COLORS' && !(f.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT')).slice(0, 3);
  const shots = [await snap(ex, null)];
  if (ex.hover) shots.push(await snap(ex, 'hover'));
  const shotsHtml = shots.map((s, i) => `<figure><div class="frame" style="width:${s.w}px;height:${s.h}px"><img src="data:image/png;base64,${s.png}" width="${s.w}" height="${s.h}">
    <div class="mark" style="left:${s.r.x - 3}px;top:${s.r.y - 3}px;width:${s.r.w + 6}px;height:${s.r.h + 6}px"></div>
    ${s.overflow ? `<div class="vp" style="left:${ex.shot}px"></div>` : ''}</div>
    <figcaption>${shots.length > 1 ? (i ? ':hover 中' : '通常') : `Chromium ${ex.shot}px 幅${ex.focus ? '(フォーカス中)' : ''}${s.overflow ? '/赤線 = viewport の右端' : ''}`}</figcaption></figure>`).join('');
  const sev = f => f.severity === 'error' ? 'err' : f.severity === 'unknown' ? 'unk' : 'warn';
  const card = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font:14px/1.5 system-ui,'Noto Sans CJK JP',sans-serif;background:#f6f7f9;color:#1b1f24}
  .card{display:inline-block;padding:20px 24px;background:#fff;border:1px solid #d9dde3;border-radius:10px;margin:12px;min-width:560px;max-width:900px}
  .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0}.frame{position:relative;border:1px solid #c9ced6;background:#fff;overflow:hidden}.frame img{display:block}
  .mark{position:absolute;border:2px dashed #e5484d;border-radius:4px;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
  .vp{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #e5484d}
  figcaption{font-size:12px;color:#5b6470;margin-top:4px}
  pre{margin:12px 0 0;padding:10px 12px;background:#f3f4f6;border-radius:6px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;max-width:860px}
  .f{margin-top:8px;font:12px/1.5 ui-monospace,monospace;max-width:860px}.f b{display:inline-block;padding:0 6px;border-radius:4px;margin-right:6px;font-weight:600}
  .err b{background:#fde2e2;color:#b42318}.warn b{background:#fff1cc;color:#8a5a00}.unk b{background:#e5e7eb;color:#374151}
  .cap{margin-top:10px;font-size:13px}.status{font:12px ui-monospace,monospace;color:#5b6470}
  </style></head><body><div class="card">
  <div class="row">${shotsHtml}</div>
  <div class="cap">${esc(ex.caption)}</div>
  <pre>${esc(ex.html)}\n${esc(ex.css.replace(/^\.page\{[^}]*\}/, '').replace(/\}/g, '}\n').trim())}</pre>
  <div class="status">veriss の判定: status = ${res.status}</div>
  ${shown.map(f => `<div class="f ${sev(f)}"><b>${esc(f.code)}</b>${esc((f.message ?? '').replace(/(\d+)\/(\d+)(?=px)/g, (m, a, c) => String(Math.round(a / c * 100) / 100)).slice(0, 420))}</div>`).join('')}
  </div></body></html>`;
  await page.setViewportSize({width: 1000, height: 400});
  await page.setContent(card);
  const el = await page.$('.card');
  writeFileSync(`${out}${ex.id}.png`, await el.screenshot());
  console.log(ex.id, res.status, shown.map(f => f.code).join(' '));
}

await b.close();
