// Critical CSS (src/critical.mjs): the rules a page's first view needs in the smartphone and PC ranges. Everything not
// proven to stay out of the first view is kept; e2e/critical-css.spec.mjs checks the first views in three browsers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCriticalCSS, firstViewProfiles} from '../src/critical.mjs';

const page = body => `<!doctype html><html lang="en"><body>${body}</body></html>`;
const landing = page('<header class="site"><nav class="nav"></nav></header><section class="hero"></section><section class="features"><div class="card"></div></section><footer class="foot"></footer>');
const base = '*{margin:0}.site{height:64px;background:#123}.nav{height:64px}.hero{height:480px;background:#eef}.features{height:900px}.card{height:200px;margin:40px;background:#ddd}.foot{height:300px;background:#222}';
const keptOf = r => Object.fromEntries(r.elements.map(e => [e.classes[0] ?? e.tag, e.critical]));

test('the rules of elements below the fold in every viewport go to the rest, with their at-rules', () => {
  const r = extractCriticalCSS(landing, {css: `${base}.card:hover{background:#ccc}@media (min-width:1280px){.hero{height:600px}.foot{height:200px}}@font-face{font-family:X;src:url(x.woff2)}`});
  assert.deepEqual(r.profiles.map(p => p.status), ['verified', 'verified']);
  assert.equal(keptOf(r).foot, false);
  for (const name of ['site', 'nav', 'hero', 'features', 'card', 'body', 'html']) assert.equal(keptOf(r)[name], true, name);
  assert.ok(!r.css.includes('.foot'));
  assert.match(r.rest, /^\.foot\{height:300px;background:#222\}@media \(min-width:1280px\)\{\.foot\{height:200px\}\}$/);
  // A state rule of a critical element, the media rule around a critical declaration and @font-face stay.
  assert.match(r.css, /\.card:hover\{/); assert.match(r.css, /@media \(min-width:1280px\)\{\.hero\{height:600px\}\}/); assert.match(r.css, /@font-face/);
  assert.equal(r.dropped, 2);
});

test('a box that may start in the first view in some viewport is kept (the card at 584px: in view at 932px tall)', () => {
  const r = extractCriticalCSS(landing, {css: base});
  assert.equal(keptOf(r).card, true);
  assert.match(r.elements.find(e => e.classes[0] === 'card').reason, /may start in the first view/);
  // With a taller hero the card starts below 932px on phones and 1080px on PCs: dropped.
  assert.equal(keptOf(extractCriticalCSS(landing, {css: `${base}.hero{height:1100px}`})).card, false);
});

test('what is not proven to stay out of the first view is kept', () => {
  // A flex sibling below the fold: its size can change the sizes of the items above it.
  const flex = extractCriticalCSS(page('<div class="row"><div class="a"></div><div class="b"></div></div><div class="tail"></div>'),
    {css: '*{margin:0}.row{display:flex;flex-direction:column;height:3000px}.a{height:100px}.b{height:2000px;margin-top:900px}.tail{height:100px}'});
  assert.equal(keptOf(flex).b, true); assert.match(flex.elements.find(e => e.classes[0] === 'b').reason, /not in plain block flow/);
  // A background gradient on an ancestor sizes with its height: what is below changes the colours above.
  const gradient = extractCriticalCSS(landing, {css: `${base}body{background:linear-gradient(#fff,#000)}`});
  assert.equal(keptOf(gradient).foot, true); assert.match(gradient.elements.find(e => e.classes[0] === 'foot').reason, /paints a background/);
  // A hidden menu has no box: its display: none rule must be in the critical CSS.
  const menu = extractCriticalCSS(page('<div class="top"></div><div class="menu"></div><div class="foot"></div>'), {css: '*{margin:0}.top{height:2000px}.menu{display:none}.menu:hover{color:red}.foot{height:10px}'});
  assert.equal(keptOf(menu).menu, true); assert.match(menu.css, /\.menu\{display:none\}/); assert.equal(keptOf(menu).foot, false);
  // An Unknown layout keeps everything (here: text the analysis has no measurement for).
  const text = extractCriticalCSS(page('<p class="t">Some text</p><div class="foot"></div>'), {css: '*{margin:0}.t{font-size:16px}.foot{height:10px;margin-top:3000px}'});
  assert.ok(text.profiles.some(p => p.status === 'unknown'));
  assert.equal(text.dropped, 0); assert.equal(text.rest, '');
  // A selector the analysis cannot match is kept.
  const odd = extractCriticalCSS(landing, {css: `${base}.foot:has(> .x:hover) ~ .y{color:red}`});
  assert.match(odd.css, /:has/);
});

test('viewport units bring the classic PC scrollbars into the analysis (vw includes the scrollbar)', () => {
  assert.equal(firstViewProfiles.find(p => p.name === 'pc').viewport.min, 1263);
  const r = extractCriticalCSS(landing, {css: `${base}.hero{height:30vw}`});
  // Classic scrollbars on a page taller than the viewport need overflow-y on html to be laid out: Unknown, all kept.
  assert.equal(r.profiles.find(p => p.name === 'pc').status, 'unknown');
  assert.equal(keptOf(r).foot, true);
});
