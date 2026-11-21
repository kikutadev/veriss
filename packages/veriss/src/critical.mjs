// Critical CSS: the rules a page's first view needs, for every viewport in the usual smartphone and PC ranges.
//
// An element is in the critical path when, in some viewport of some profile, its border box may start above the fold
// (blockStart < viewport height at the initial scroll). Its rules (in any state), its ancestors' and the at-rules
// around them are kept. Everything not proven to stay out of the first view is kept too: an element whose layout the
// analysis did not decide (Unknown, no box, inline text), an element outside plain block flow (a flex or grid item, a
// float, an absolutely positioned box: its size can move what is above it), and an element below an ancestor whose
// painting depends on its height (a background image or gradient).
//
// Text: with font files (options.textMetrics from loadTextMetrics, options.fonts), each text leaf is measured with the
// font its computed style names, and laid out at the size its characters need. A free string (data-text-free, a
// bounded one with data-text-max-length, or the adapters' '…' for an expression) may be any length: it is laid out
// empty (0 x 0), the least it can take. In plain block flow a longer text only pushes what follows it further down,
// so that is the case in which the most can start in the first view (a block container that centres or ends its
// content, align-content, is not plain block flow: there a longer text moves what is before it up).
//
// The first view drawn with the critical CSS alone
// is then the first view drawn with all of it (e2e/critical-css.spec.mjs checks it in Chromium, Firefox and WebKit).
import postcss from 'postcss';
import {parse, serialize} from 'parse5';
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
const startAligned = new Set(['normal', 'start', 'flex-start', 'stretch', 'baseline', 'first baseline', 'safe start']);

// Text leaves (elements whose only children are text) get a marker class, so a contract can size them.
function markTextLeaves(html) {
  const document = parse(/^\s*<!doctype/i.test(html) ? html : `<!doctype html>${html}`);
  const leaves = [];
  const visit = node => {
    for (const child of node.childNodes ?? []) if (child.tagName) visit(child);
    if (!node.tagName || ['html', 'head', 'body', 'script', 'style', 'template', 'textarea', 'title'].includes(node.tagName)) return;
    const kids = node.childNodes ?? [];
    if (!kids.length || !kids.every(k => k.nodeName === '#text') || !kids.some(k => k.value.trim())) return;
    const marker = `__vtext${leaves.length}`, attrs = node.attrs, cls = attrs.find(a => a.name === 'class');
    if (cls) cls.value = `${cls.value} ${marker}`.trim(); else attrs.push({name: 'class', value: marker});
    const has = name => attrs.some(a => a.name === name);
    leaves.push({marker, free: has('data-text-free') || has('data-text-max-length') || kids.some(k => k.value.includes('…'))});
  };
  visit(document);
  return {html: serialize(document), leaves};
}
// A contract for a measured text leaf (the same reading of the computed font as the adapters' measuredContract).
function measured(facts, textMetrics, fonts) {
  const px = v => /^\d+(?:\.\d+)?px$/.test(String(v)) ? Number(String(v).slice(0, -2)) : undefined;
  const family = Object.keys(fonts ?? {}).find(name => name.toLowerCase() === String(facts.family).replace(/["']/g, '').split(',')[0].trim().toLowerCase());
  const size = px(facts.size), lineHeight = px(facts.lineHeight) ?? (/^\d+(?:\.\d+)?$/.test(String(facts.lineHeight)) && size ? Number(facts.lineHeight) * size : undefined);
  const weight = facts.weight === 'normal' ? 400 : facts.weight === 'bold' ? 700 : /^\d+$/.test(String(facts.weight)) ? Number(facts.weight) : undefined;
  if (!textMetrics || !family || !size || !lineHeight || !weight || facts.style !== 'normal' || facts.letterSpacing !== 'normal') return null;
  const wrap = ['nowrap', 'pre'].includes(facts.whiteSpace) ? 'nowrap' : ['normal', 'pre-line', 'pre-wrap'].includes(facts.whiteSpace) ? 'normal' : null;
  if (!wrap) return null;
  try { return textMetrics.resolveBoxes({x: {text: {font: {family, size, lineHeight, weight}, content: facts.text, ...(facts.lang ? {lang: facts.lang} : {}), ...(wrap === 'normal' && facts.overflowWrap && facts.overflowWrap !== 'normal' ? {overflowWrap: facts.overflowWrap} : {})}, wrap}}).x; } catch { return null; }
}
const paintsByHeight = /background(?:-image)?\s*:[^;]*(?:url\(|gradient\()|mask(?:-image)?\s*:|border-image\s*:/i;

export function extractCriticalCSS(source, {css, profiles = firstViewProfiles, name = 'page', textMetrics, fonts, ...options} = {}) {
  if (typeof css !== 'string') throw new TypeError('css is required');
  // Text leaves: measured with the fonts (a first analysis reports each one's computed font), free strings at 0 x 0.
  const {html, leaves} = markTextLeaves(source);
  const boxes = {...(options.boxes ?? {})}, texts = [];
  const empty = {minInlineSize: 0, intrinsicBlockSize: 0};
  if (leaves.length) {
    const first = analyzeHTML(html, {...options, name, css, viewport: profiles[0].viewport, scrollbars: profiles[0].scrollbars, boxes: {...Object.fromEntries(leaves.map(l => [`.${l.marker}`, empty])), ...boxes}, reportTextFonts: true});
    const factsOf = new Map((first.textFonts ?? []).filter(f => f && f !== 'varied').flatMap(f => (f.classes ?? []).filter(c => /^__vtext\d+$/.test(c)).map(c => [c, f])));
    for (const leaf of leaves) {
      const key = `.${leaf.marker}`;
      if (boxes[key]) continue;
      if (leaf.free) { boxes[key] = empty; texts.push({marker: leaf.marker, sized: 'free: laid out empty (it may grow without bound)'}); continue; }
      const contract = factsOf.has(leaf.marker) ? measured(factsOf.get(leaf.marker), textMetrics, fonts) : null;
      if (contract) { boxes[key] = contract; texts.push({marker: leaf.marker, sized: `measured with ${contract.font?.family ?? 'the font'}`}); }
      else texts.push({marker: leaf.marker, sized: 'not measured (no font file for its computed font, or a style the measurement does not model): its layout stays Unknown'});
    }
  }
  // The element tree, with the paths the analysis gives its rows (name/0/1 …) and parent links for selector matching.
  const {tree} = htmlBoxTree(html), treeBoxes = [];
  const walk = (box, path, parent) => {
    box.path = path; if (parent) box[PARENT] = parent; treeBoxes.push(box);
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
    const report = analyzeHTML(html, {...options, name, css, viewport: profile.viewport, scrollbars, ...(Object.keys(boxes).length ? {boxes} : {})});
    const unknown = report.diagnostics.filter(d => d.severity === 'unknown');
    profileResults.push({name: profile.name, status: report.status, unknown: unknown.map(d => ({code: d.code, message: d.message}))});
    // Unknown anywhere: positions are not decided, so nothing is proven to stay below the fold in this profile.
    if (report.status === 'unknown') { for (const box of treeBoxes) mark(box, `${profile.name}: the layout is Unknown (${unknown[0]?.code ?? 'U_LAYOUT'})`); continue; }
    const rows = new Map();
    for (const row of report.sizes ?? []) { if (!rows.has(row.path)) rows.set(row.path, []); rows.get(row.path).push(row); }
    const inBlockFlow = box => { const own = rows.get(box.path); return own?.length && own.every(r => blockLevel.has(String(r.display)) && startAligned.has(String(r.alignContent ?? 'normal')) && ['static', 'relative'].includes(String(r.position ?? 'static')) && [undefined, 'none'].includes(r.float)); };
    for (const box of treeBoxes) {
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
    profiles: profileResults, texts,
    elements: treeBoxes.map(box => ({path: box.path, tag: box.tag, classes: (box.classes ?? []).filter(c => !/^__vtext\d+$/.test(c)), critical: critical.has(box), ...(critical.has(box) ? {reason: critical.get(box)} : {})})),
  };
}
