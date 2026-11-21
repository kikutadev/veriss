// Builds the images of docs/rule-catalog.md: each example's NG and OK sides are analysed by veriss and drawn in
// Chromium side by side, with the verdict veriss returned for each.
//   node tools/rule-catalog/shoot.mjs [id]       (CHROMIUM_PATH=/path/to/chromium when Playwright has no browser)
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {examples, sides} from './examples.mjs';
import type {CatalogInput} from './examples.mjs';
import {run, reset} from './run.mjs';
const {chromium} = createRequire(import.meta.url)('playwright');
const out = fileURLToPath(new URL('../../docs/rule-catalog/', import.meta.url));
const esc = (s:string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const px = (m:string) => m.replace(/(\d+)\/(\d+)(?=px)/g, (_match:string, a:string, c:string) => String(Math.round(Number(a) / Number(c) * 100) / 100));
const b = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
const context = await b.newContext({deviceScaleFactor: 2}), page = await context.newPage();

// Each capture gets a page of its own, so no pointer or focus carries over from the previous capture (a hover left
// over .card would paint the next normal capture hovered).
interface Snapshot {png:string;r:{x:number;y:number;w:number;h:number};w:number;h:number;overflow:boolean;state:'hover'|'focus'|null;focused:boolean}
async function snap(s:CatalogInput, state:'hover'|'focus'|null):Promise<Snapshot> {
  const page = await context.newPage();
  await page.setViewportSize({width: s.shot, height: 600});
  await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${reset}${s.css}body{padding:10px}</style></head><body>${s.html}</body></html>`);
  if (state === 'hover' && s.hover) await page.hover(s.hover);
  let focused = false;
  if (state === 'focus' && s.focus) { await page.focus(s.focus); focused = await page.evaluate((sel:string) => document.activeElement === document.querySelector(sel), s.focus); }
  const h = await page.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll('main, main *')].map(e => e.getBoundingClientRect().bottom))) + 10);
  const r = await page.evaluate((sel:string) => { const e = document.querySelector(sel)!.getBoundingClientRect(); return {x: e.x, y: e.y, w: e.width, h: e.height}; }, s.mark);
  const w = Math.max(s.shot, await page.evaluate(() => document.documentElement.scrollWidth));
  const png = await page.screenshot({clip: {x: 0, y: 0, width: w, height: h}, fullPage: true});
  await page.close();
  return {png: png.toString('base64'), r, w, h, overflow: w > s.shot, state, focused};
}
const frame = (s:CatalogInput, shot:Snapshot, ok:boolean) => `<figure><div class="frame" style="width:${shot.w}px;height:${shot.h}px"><img src="data:image/png;base64,${shot.png}" width="${shot.w}" height="${shot.h}">
  <div class="mark ${ok ? 'm-ok' : ''}" style="left:${shot.r.x - 3}px;top:${shot.r.y - 3}px;width:${shot.r.w + 6}px;height:${shot.r.h + 6}px"></div>
  ${shot.overflow ? `<div class="vp" style="left:${s.shot}px"></div>` : ''}</div>
  <figcaption>${shot.state === 'hover' ? ':hover 中' : shot.state === 'focus' ? (shot.focused ? 'フォーカス中' : 'focus() の後(フォーカスされない)') : s.hover ? '通常' : `Chromium ${s.shot}px 幅`}${shot.overflow ? '/赤線 = viewport の右端' : ''}</figcaption></figure>`;
const sev = (f:ReturnType<typeof run>['findings'][number]) => f.severity === 'error' ? 'err' : f.severity === 'unknown' ? 'unk' : 'warn';

for (const ex of examples.filter(e => !process.argv[2] || e.id === process.argv[2])) {
  const cols = [];
  for (const s of sides(ex)) {
    const res = run(s), ok = s.side === 'ok';
    const shots = [await snap(s, s.focus ? 'focus' : null)];
    if (s.hover) shots.push(await snap(s, 'hover'));
    const code = s.side === 'ok' && ex.ok.html ? `${s.html}\n${s.extra}` : s.extra || '(CSS は共通部分だけ)';
    const width = Math.max(300, shots.reduce((a, sh) => a + sh.w + 2, 0) + 16 * (shots.length - 1));
    cols.push(`<div class="col ${ok ? 'ok' : 'ng'}" style="width:${width}px"><div class="tag">${ok ? 'OK 正常系' : 'NG 検出'}</div>
      <div class="shots">${shots.map(sh => frame(s, sh, ok)).join('')}</div>
      <div class="cap">${esc(s.caption)}</div>
      <pre>${esc(code.replace(/\}(?=.)/g, '}\n'))}</pre>
      <div class="status">veriss: <b class="st-${res.status}">${res.status}</b></div>
      ${res.findings.length ? res.findings.slice(0, 3).map(f => `<div class="f ${sev(f)}"><b>${esc(f.code)}</b>${esc(px(f.message ?? '').slice(0, 300))}</div>`).join('') : '<div class="f none">指摘なし</div>'}
    </div>`);
    console.log(ex.id, s.side, res.status, res.findings.map(f => f.code).join(' '));
  }
  const shared = sides(ex)[0];
  const card = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font:14px/1.5 system-ui,'Noto Sans CJK JP',sans-serif;background:#f6f7f9;color:#1b1f24}
  .card{display:inline-block;padding:20px 24px;background:#fff;border:1px solid #d9dde3;border-radius:10px;margin:12px}
  .cols{display:flex;gap:28px;align-items:flex-start}
  .tag{display:inline-block;font:700 12px ui-monospace,monospace;letter-spacing:.06em;padding:2px 8px;border-radius:4px;margin-bottom:8px}
  .ng .tag{background:#fde2e2;color:#b42318}.ok .tag{background:#dcf3e5;color:#18794e}
  .shots{display:flex;gap:16px}figure{margin:0}.frame{position:relative;border:1px solid #c9ced6;background:#fff;overflow:hidden}.frame img{display:block}
  .mark{position:absolute;border:2px dashed #e5484d;border-radius:4px}.m-ok{border-color:#30a46c}
  .vp{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #e5484d}
  figcaption{font-size:12px;color:#5b6470;margin-top:4px}
  .cap{margin-top:8px;font-size:13px}
  pre{margin:8px 0 0;padding:8px 10px;background:#f3f4f6;border-radius:6px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all}
  .status{margin-top:8px;font:12px ui-monospace,monospace;color:#5b6470}.st-verified{color:#18794e}.st-violated{color:#b42318}.st-unknown{color:#374151}
  .f{margin-top:6px;font:12px/1.5 ui-monospace,monospace}.f b{display:inline-block;padding:0 6px;border-radius:4px;margin-right:6px;font-weight:600}
  .err b{background:#fde2e2;color:#b42318}.warn b{background:#fff1cc;color:#8a5a00}.unk b{background:#e5e7eb;color:#374151}.none{color:#18794e}
  .common{margin-top:16px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:12px;color:#5b6470}.common pre{max-width:${2 * Math.max(ex.shot * (ex.hover ? 2 : 1), 300) + 30}px}
  </style></head><body><div class="card"><div class="cols">${cols.join('')}</div>
  <div class="common">共通の HTML と CSS<pre>${esc(`${ex.html}\n${ex.css.replace(/^\.page\{[^}]*\}/, '')}`.replace(/\}(?=.)/g, '}\n'))}</pre></div></div></body></html>`;
  await page.setViewportSize({width: 1400, height: 400});
  await page.setContent(card);
  writeFileSync(`${out}${ex.id}.png`, await (await page.$('.card'))!.screenshot());
}
await b.close();
