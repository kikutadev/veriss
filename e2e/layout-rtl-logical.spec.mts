// Logical inline sides (padding-inline-start/end, padding-inline) resolve by the box's direction, mixed in the
// cascade with physical sides: random rules under dir=rtl and ltr, every leaf's position against Chromium.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import type {LayoutAffine} from '../packages/veriss/src/index.mjs';
import {required, layoutWarnings} from './support/required.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
function random(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

test('logical and physical paddings in rtl and ltr boxes agree with Chromium (random rules)', async ({page}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({width: 400, height: 300});
  const props = ['padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end', 'padding-inline'];
  let compared = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = random(seed), pick = <T,>(list: readonly T[]): T => required(list[Math.floor(r() * list.length)], 'Missing random item');
    const dir = pick(['rtl', 'ltr']);
    const decls = Array.from({length: 1 + Math.floor(r() * 3)}, () => { const p = pick(props); return p === 'padding-inline' ? `${p}:${Math.floor(r() * 4) * 10}px ${Math.floor(r() * 4) * 10}px` : `${p}:${Math.floor(r() * 5) * 10}px`; });
    // One declaration per rule, of different specificity, so the cascade mixes logical and physical sides.
    const selectors = ['.x', '.c .x', '.c > .x', 'div.x'];
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.c{display:grid;grid-template-columns:200px}.x{${g}}${decls.map((d, i) => `${selectors[i]}{${d}}`).join('')}.y{height:20px}`;
    const html = `<div class="c" dir="${dir}"><div class="x"><div class="y"></div></div></div>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(report.status, `${seed}: ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    const row = report.sizes.find(s => s.box === '.y');
    const at = (v: LayoutAffine) => Number(v.constant) + 400 * Number(v.coefficient);
    await page.setContent(`<!doctype html><style>${css}</style>${html}`);
    const box = await page.evaluate(() => { const el = document.querySelector('.y'); if (!el) throw new Error('Missing .y'); const b = el.getBoundingClientRect(); return [b.x, b.width]; });
    expect([at(required(row?.rect, 'Missing model rectangle: .y').inlineStart), at(required(row?.rect, 'Missing model rectangle: .y').inlineSize)], `seed ${seed} dir=${dir}: ${decls.join('; ')}`).toEqual(box);
    compared++;
  }
  expect(compared).toBe(40);
});

test('physical sides in rtl: Chromium does not mirror the ltr layout exactly where the static check warns', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [decl, warn] of [['padding-left:30px', true], ['padding-right:10px', true], ['padding-inline-start:30px', false], ['padding-inline:30px 10px', false], ['padding-left:20px;padding-right:20px', false]] as const) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.c{display:grid;grid-template-columns:150px}.x{${g};${decl}}.y{height:20px}`;
    const at = async (dir: 'ltr' | 'rtl') => { await page.setContent(`<!doctype html><style>${css}</style><div class="c" dir="${dir}"><div class="x"><div class="y"></div></div></div>`); return page.evaluate(() => { const y = document.querySelector('.y'), x = document.querySelector('.x'); if (!y || !x) throw new Error('Missing .x or .y'); const b = y.getBoundingClientRect(), c = x.getBoundingClientRect(); return [b.x - c.x, b.width, c.width] as const; }); };
    const [[lx, w, cw], [rx]] = [await at('ltr'), await at('rtl')];
    const mirrored = rx === cw - lx - w;
    const report = analyzeHTML(`<html lang="en"><body><div class="c" dir="rtl"><div class="x"><div class="y"></div></div></div></body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    const warned = layoutWarnings(report).some(w => w.code === 'W_LAYOUT_PHYSICAL_IN_RTL');
    expect(warned, `${decl}: mirrored ${mirrored}`).toBe(!mirrored);
    expect(warned, decl).toBe(warn);
  }
});

test('absolute boxes with both insets of an axis agree with Chromium (random insets, sizes, box-sizing, direction)', async ({page}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({width: 400, height: 600});
  const n = (t: string | undefined) => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
  const len = (r: () => number) => required([`${Math.floor(r() * 4) * 10}px`, `${Math.floor(r() * 3) * 5}%`, '0'][Math.floor(r() * 3)], 'Missing random length');
  for (let seed = 1; seed <= 40; seed++) {
    const r = random(seed), pick = <T,>(list: readonly T[]): T => required(list[Math.floor(r() * list.length)], 'Missing random item');
    const inline = pick([`left:${len(r)};right:${len(r)}`, `left:${len(r)}`, `right:${len(r)}`]);
    const blockAxis = pick([`top:${len(r)};bottom:${len(r)}`, `top:${len(r)}`]);
    const both = inline.includes(';'), bothBlock = blockAxis.includes(';');
    const width = both && r() < 0.5 ? '' : 'width:120px;', height = bothBlock && r() < 0.5 ? '' : 'height:40px;';
    const sizing = pick(['border-box', 'content-box']), pad = pick(['', 'padding:4px 8px;']), dir = pick(['ltr', 'rtl']);
    const css = `*{margin:0}html,body,.page,.card{${g}}body{margin:0}.card{position:relative;height:200px}.o{position:absolute;box-sizing:${sizing};${pad}${width}${height}${inline};${blockAxis}}`;
    const html = `<main class="page"><div class="card" dir="${dir}"><div class="o"></div></div></main>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
    expect(report.status, `${seed}: ${css} ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    const rect = required(report.sizes.find(s => s.box === '.o')?.rect, 'Missing model rectangle: .o'), v = (x: LayoutAffine) => n(x.constant) + 400 * n(x.coefficient) + 600 * n(x.heightCoefficient);
    await page.setContent(`<!doctype html><style>${css}</style>${html}`);
    const box = await page.evaluate(() => { const el = document.querySelector('.o'); if (!el) throw new Error('Missing .o'); const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; });
    expect([v(rect.inlineStart), v(rect.blockStart), v(rect.inlineSize), v(rect.blockSize)], `seed ${seed} dir=${dir}: ${css}`).toEqual(box);
  }
});
