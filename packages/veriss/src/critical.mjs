// Critical CSS: the rules a page's first view needs, for every viewport in the usual smartphone and PC ranges.
//
// An element is in the critical path when, in some viewport of some profile, its border box may start above the fold
// (blockStart < viewport height at the initial scroll). Its rules (in any state), its ancestors' and the at-rules
// around them are kept. Everything not proven to stay out of the first view is kept too: an element whose layout the
// analysis did not decide (Unknown, no box, inline text), an element outside plain block flow (a flex or grid item, a
// float, an absolutely positioned box: its size can move what is above it), and an element below an ancestor whose
// painting depends on its height (a background image or gradient). The first view drawn with the critical CSS alone
// is then the first view drawn with all of it (e2e/critical-css.spec.mjs checks it in Chromium, Firefox and WebKit).
import postcss from 'postcss';
import {analyzeHTML, htmlBoxTree} from './html.mjs';
import {compileSelector, matches, PARENT} from './layout/selectors.mjs';

/** The usual first-view ranges: smartphones (portrait) and PCs. Scrollbars: overlay on phones; overlay or classic on PCs. */
// A classic PC scrollbar (15px in Chrome and Safari, 17px in Firefox on Windows) narrows the layout by its width: the PC
// range starts 17px lower with overlay scrollbars, which covers it for every length but the viewport units (vw, vi,
// vmin, vmax, which include the scrollbar): with those the classic profiles are analyzed as they are.
export const firstViewProfiles = [
  {name: 'smartphone', viewport: {min: 320, max: 430, height: {min: 568, max: 932}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]},
  {name: 'pc', viewport: {min: 1263, max: 1920, height: {min: 720, max: 1080}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}],
    viewportUnits: [{name: 'classic-15', inlineSize: 15, blockSize: 15}, {name: 'classic-17', inlineSize: 17, blockSize: 17}]},
];
const viewportUnit = /(?:^|[^\w.-])-?(?:\d*\.)?\d+(?:[sld]?v(?:w|i|min|max))\b/i;

// Exact rationals ("n/d" strings) for the region vertices and affine coefficients.
const frac = s => { const [n, d = '1'] = String(s).split('/'); return [BigInt(n), BigInt(d)]; };
const add = ([a, b], [c, d]) => [a * d + c * b, b * d];
const mul = ([a, b], [c, d]) => [a * c, b * d];
const sign = ([n, d]) => (n === 0n ? 0 : (n < 0n) === (d < 0n) ? 1 : -1);
const at = (affine, w, h) => add(add(mul(frac(affine.coefficient), w), mul(frac(affine.heightCoefficient ?? '0'), h)), frac(affine.constant));
const verticesOf = row => row.region?.vertices?.length ? row.region.vertices.map(v => [frac(v.width), frac(v.height)])
  : [[row.range.minExact, row.heightRange?.minExact], [row.range.maxExact, row.heightRange?.minExact], [row.range.maxExact, row.heightRange?.maxExact], [row.range.minExact, row.heightRange?.maxExact]].map(([w, h]) => [frac(w), frac(h)]);
// blockStart - height is affine, so its minimum over the (convex) region is at a vertex: <= 0 there means the box may
// start in the first view (the boundary counts as in it: kept rather than dropped).
const mayStartAboveFold = row => !row.rect || verticesOf(row).some(([w, h]) => sign(add(at(row.rect.blockStart, w, h), mul([-1n, 1n], h))) <= 0);

const blockLevel = new Set(['block', 'flow-root', 'list-item']);
const paintsByHeight = /background(?:-image)?\s*:[^;]*(?:url\(|gradient\()|mask(?:-image)?\s*:|border-image\s*:/i;

export function extractCriticalCSS(html, {css, profiles = firstViewProfiles, name = 'page', ...options} = {}) {
  if (typeof css !== 'string') throw new TypeError('css is required');
  // The element tree, with the paths the analysis gives its rows (name/0/1 …) and parent links for selector matching.
  const {tree} = htmlBoxTree(html), boxes = [];
  const walk = (box, path, parent) => {
    box.path = path; if (parent) box[PARENT] = parent; boxes.push(box);
    (box.children ?? []).forEach((c, i) => walk(c, `${path}/${i}`, box));
    (box.inline ?? []).forEach((c, i) => walk(c, `${path}/inline-${i}`, box));
  };
  walk(tree, name);
  const sheet = postcss.parse(css);
  // Rules that may paint an element by its height (a background image or gradient sizes with the element's box).
  const ruleMatches = (rule, box) => rule.selectors.some(source => { try { const sel = compileSelector(source); return matches(sel, box, new Set([sel.state, sel.pseudoElement && `::${sel.pseudoElement}`].filter(Boolean))); } catch { return true; } });
  const styleRules = []; sheet.walkRules(rule => { if (rule.parent?.type !== 'atrule' || !/^(?:keyframes|-webkit-keyframes|font-face|page)$/i.test(rule.parent.name)) styleRules.push(rule); });
  const paintsBelow = box => styleRules.some(rule => paintsByHeight.test(rule.toString()) && ruleMatches(rule, box));

  const critical = new Map(), profileResults = [];
  const mark = (box, reason) => { if (!critical.has(box)) critical.set(box, reason); };
  for (const profile of profiles) {
    const scrollbars = profile.viewportUnits && viewportUnit.test(css) ? [...(profile.scrollbars ?? []), ...profile.viewportUnits] : profile.scrollbars ?? options.scrollbars;
    const report = analyzeHTML(html, {...options, name, css, viewport: profile.viewport, scrollbars});
    const unknown = report.diagnostics.filter(d => d.severity === 'unknown');
    profileResults.push({name: profile.name, status: report.status, unknown: unknown.map(d => ({code: d.code, message: d.message}))});
    // Unknown anywhere: positions are not decided, so nothing is proven to stay below the fold in this profile.
    if (report.status === 'unknown') { for (const box of boxes) mark(box, `${profile.name}: the layout is Unknown (${unknown[0]?.code ?? 'U_LAYOUT'})`); continue; }
    const rows = new Map();
    for (const row of report.sizes ?? []) { if (!rows.has(row.path)) rows.set(row.path, []); rows.get(row.path).push(row); }
    const inBlockFlow = box => { const own = rows.get(box.path); return own?.length && own.every(r => blockLevel.has(String(r.display)) && ['static', 'relative'].includes(String(r.position ?? 'static')) && [undefined, 'none'].includes(r.float)); };
    for (const box of boxes) {
      const own = rows.get(box.path);
      if (!own?.length) { mark(box, `${profile.name}: no laid-out box (hidden, inline or not analyzed)`); continue; }
      if (own.some(mayStartAboveFold)) { mark(box, `${profile.name}: may start in the first view`); continue; }
      // Below the fold: dropping its rules may only change what follows it, in plain block flow all the way up.
      for (let b = box; b; b = b[PARENT]) {
        if (!inBlockFlow(b)) { mark(box, `${profile.name}: ${b === box ? 'it is' : `its ancestor ${b.path} is`} not in plain block flow, so its size can move what is above it`); break; }
        if (b !== box && paintsBelow(b)) { mark(box, `${profile.name}: its ancestor ${b.path} paints a background that sizes with its height`); break; }
      }
    }
  }
  // Ancestors of a critical element are critical (their rules size and paint it).
  for (const box of [...critical.keys()]) for (let a = box[PARENT]; a; a = a[PARENT]) mark(a, 'an ancestor of a critical element');
  const criticalBoxes = [...critical.keys()];

  // Keep a style rule when a selector may match a critical element (in any state; an unsupported selector is kept).
  let kept = 0, dropped = 0;
  const keepRule = rule => {
    if (rule.nodes?.some(n => n.type === 'rule' || n.type === 'atrule')) return true; // nested CSS: kept whole
    return criticalBoxes.some(box => ruleMatches(rule, box));
  };
  const criticalSheet = sheet.clone(), restSheet = sheet.clone();
  const prune = (container, keepThis) => {
    for (const node of [...(container.nodes ?? [])]) {
      if (node.type === 'comment') { node.remove(); continue; }
      if (node.type === 'rule') { const k = keepRule(node); if (k) kept += keepThis ? 1 : 0; else dropped += keepThis ? 1 : 0; if (k !== keepThis) node.remove(); continue; }
      if (node.type === 'atrule' && /^(?:media|supports|container|layer|scope|starting-style|document|-moz-document)$/i.test(node.name) && node.nodes) {
        prune(node, keepThis); if (!node.nodes.length) node.remove(); continue;
      }
      // Other at-rules (@font-face, @keyframes, @property, @import, @layer a, b; …) are kept in the critical CSS.
      if (!keepThis) node.remove();
    }
  };
  prune(criticalSheet, true); prune(restSheet, false);
  return {
    css: criticalSheet.toString().trim(), rest: restSheet.toString().trim(), kept, dropped,
    profiles: profileResults,
    elements: boxes.map(box => ({path: box.path, tag: box.tag, classes: box.classes ?? [], critical: critical.has(box), ...(critical.has(box) ? {reason: critical.get(box)} : {})})),
  };
}
