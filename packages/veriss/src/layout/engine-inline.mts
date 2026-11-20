// Generated text and measured inline geometry; no recursive block/grid solver.
import {q,div,cmp,add,sub,mul} from './linear.mjs';
import type {Rational} from './linear.mjs';
import {scalar,sum,diff,times,asAffine,clip} from './region.mjs';
import type {Affine2,Region} from './region.mjs';
import {matches,px} from './css.mjs';
import {droppedOf} from './dropped.mjs';
import {compileSelector} from './selectors.mjs';
import {paintFacts} from './accessibility.mjs';
import type {AccessibilityGeometry,PaintFacts} from './accessibility.mjs';

import type {Dimensions,DimensionValue} from './engine-types.mjs';
import type {LayoutRange,LayoutRegion,LayoutWarning,LayoutGeneratedText,TextInlineBounds,TextMetricPair} from '../layout-contracts.d.ts';
type Generated=Partial<Record<'before'|'after',string>>;
import type {SolverBox,SolverStyle,SolverAncestor} from './engine-solver-types.mjs';
export type InlineBox=SolverBox;
type InlineAncestor=SolverAncestor;
interface InlineLeafRow {origin:Dimensions|null;block:Affine2|null;content:{left:DimensionValue;top:DimensionValue;inline:Affine2}}
interface InlineContext {
  styles:(box:InlineBox,region:Region,parents:readonly InlineAncestor[],inherited:SolverStyle|undefined,emit:boolean,gridItem:boolean,state?:ReadonlySet<string>)=>{style:SolverStyle;region:Region}[];
  edgeValue:(style:SolverStyle,side:'top'|'bottom')=>Affine2;
  generatedTexts:LayoutGeneratedText[];layoutWarnings:LayoutWarning[];geometry:AccessibilityGeometry[];
  ranges:(region:Region)=>{range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion};
  paints:(style:SolverStyle)=>boolean;
  pseudoWithoutContent:(box:InlineBox,style:SolverStyle)=>unknown;
  inlineStateTransforms:(box:InlineBox,style:SolverStyle)=>unknown;
  inlineTextAlignment:(box:InlineBox,style:SolverStyle)=>unknown;
  inlineAutoMargin:(box:InlineBox,style:SolverStyle, parentStyle?:SolverStyle)=>unknown;
  inlineOverflow:(box:InlineBox,style:SolverStyle)=>unknown;
  firstPseudoInert:(box:InlineBox,style:SolverStyle)=>unknown;
  decorationNone:(box:InlineBox,style:SolverStyle,parents:readonly InlineAncestor[])=>unknown;
}
const zero=q(0);
export function createInlineSolver({styles,edgeValue,generatedTexts,layoutWarnings,geometry,ranges,paints,pseudoWithoutContent,inlineStateTransforms,inlineTextAlignment,inlineAutoMargin,inlineOverflow,firstPseudoInert,decorationNone}:InlineContext) {
  // Inline content of a text leaf: phrasing elements that stay display: inline add no geometry when
  // they have no horizontal padding, border or margin (and keep a font-derived contract's font).
  // Each gets its own computed style and DOM facts as a row without a rectangle.
  const fontKeys = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform'];
  // Generated content outside a grid/flex container (a leaf, inline content, or a container whose children are
  // not collected here) has no modeled box: Unknown unless it generates nothing.
  // Generated text is allowed where it cannot change the geometry: in a leaf with px width and height, or in a
  // text leaf whose measured content already holds it (at its start for ::before, its end for ::after), set in the
  // leaf's font. It is recorded as the box's generated text (accessible names include it).
  function generatedElsewhere(box:InlineBox,region:Region,parents:readonly InlineAncestor[],inheritedStyle:SolverStyle):Generated|null {
    if (box.pseudo) return null;
    const generated:Generated = {};
    let deferred:Error|null = null; // the first error, raised once both kinds are recorded
    for (const kind of ['before', 'after'] as const) {
      const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : (box.children ?? []).length}`, label: `${box.label}::${kind}`, children: [], pseudo: kind };
      for (const c of styles(pbox, region, parents, inheritedStyle, false, false, new Set([`::${kind}`]))) {
        const content = c.style.content ?? 'none';
        pseudoWithoutContent(pbox, c.style);
        if (content === 'none' || c.style.display === 'none') continue;
        const text = content.startsWith('text:') ? content.slice(5) : null;
        const fixed = !(box.children ?? []).length && !box.inline?.length && ['inline-size', 'block-size'].every(key => /^\d+(?:\.\d+)?px$/.test(String(inheritedStyle[key]))) && c.style.position === 'static';
        const metrics=box.contract?.textMetrics; const measured = metrics && 'text' in metrics ? metrics.text : undefined, collapsedText = text?.replace(/\s+/g, ' ').trim();
        const inMeasure = text !== null && typeof measured === 'string' && collapsedText && (kind === 'before' ? measured.startsWith(collapsedText) : measured.endsWith(collapsedText)) && c.style.position === 'static'
          && ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform'].every(key => c.style[key] === inheritedStyle[key]) && c.style.display === 'inline';
        // An absolutely positioned generated box of a leaf (a hit-area expansion, a check mark) is out of flow: it is laid
        // out after the leaf, against its containing block (leafPseudo).
        if (text === null && c.style.position === 'absolute' && !(box.children ?? []).length && !box.inline?.length) { box.absolutePseudo = [...new Set([...(box.absolutePseudo ?? []), kind])]; continue; }
        // Generated text is recorded (path, contract selector, kind, text) so a text resolver can measure it with the
        // leaf's content and analyse again (withGeneratedText in /text).
        if (text !== null && !generatedTexts.some(g => g.path === box.path && g.kind === kind && g.text === text)) generatedTexts.push({ path: box.path, box: box.label, ...(box.contractSelector ? { selector: box.contractSelector } : {}), kind, text });
        if (text === null || !(fixed || inMeasure)) { deferred ??=  Object.assign(new Error(`${pbox.label} generates ${text === null ? 'a box' : 'text'} that may change the layout (only text in a px-sized leaf, or included in the leaf's measured text, is modeled)`), { code: 'U_LAYOUT_PSEUDO' }); continue; }
        generated[kind] = text;
      }
    }
    if (deferred) throw deferred;
    return generated.before !== undefined || generated.after !== undefined ? generated : null;
  }
  // Measured bounds of an inline element in one line of fixed text (textMetrics.inline): an outer
  // rectangle it stays inside and an inner one it always covers, from the leaf's content box.
  const sixtyfourths = (value:number,round:(v:number)=>number) => div(q(String(round(value * 64))), q(64));
  // A list of {region, outer, inner}: one piece for one line of text, one per width interval of the
  // line layout for wrapping text (none where the element is split across lines).
  function inlineBounds(child:InlineBox,leaf:InlineBox,leafStyle:SolverStyle,leafRow:InlineLeafRow|undefined,region:Region,childStyle:Readonly<Record<string,unknown>>={}) {
    const contract=leaf.contract, metrics=contract?.textMetrics;
    if(!contract || !metrics || metrics.kind==='domain')return null;
    // Checklist D3: text-align moves each line by (content width − line width) × f: 0 at the start, 1/2 centred, 1 at the
    // end (ltr). Where the line does not fit it is start-aligned (CSS Text 3 §6.1), so only widths where it fits count.
    // justify stretches every line but the last, which is start-aligned (text-align-last: auto): only last lines count.
    const justify = String(leafStyle['text-align']) === 'justify' && (leafStyle['text-align-last']==='auto'||leafStyle['text-align-last']===undefined);
    // rtl (checklist D3): only text of Hebrew letters and spaces, whose visual order is the logical order reversed (no
    // bidi reordering of mixed runs): a piece lies at [line's right edge − end, line's right edge − start]. The factor
    // then moves the line's right edge to the left: 0 at the start (right), 1/2 centred, 1 at the end (left).
    const rtl = leafStyle.direction === 'rtl';
    if (rtl && !/^[\u05D0-\u05EA ]+$/.test(String(metrics?.text ?? ''))) return null;
    const alignFactors:Record<string,Rational> = rtl ? { start: q(0), right: q(0), center: div(q(1), q(2)), left: q(1), end: q(1) } : { start: q(0), left: q(0), center: div(q(1), q(2)), right: q(1), end: q(1) };
    const alignFactor=justify?q(0):alignFactors[String(leafStyle['text-align'])];
    if (!leafRow?.origin || !metrics?.inline || !alignFactor || !['ltr', 'rtl'].includes(String(leafStyle.direction))) return null;
    if (!(metrics.kind === 'content' && ['nowrap', 'one-line'].includes(String(contract.wrap))) && metrics.kind !== 'lines') return null;
    const selector=Object.keys(metrics.inline).find(selector=>matches(compileSelector(selector),child));
    if(selector===undefined)return null;
    const x = sum(leafRow.origin.inline, asAffine(leafRow.content.left));
    // A table cell aligns its lines by vertical-align within its (stretched) content box (measured: middle by default).
    const L = contract.font?.lineHeight, align = leaf.tableCell ? leafStyle['vertical-align'] : 'top';
    if (!['top', 'middle', 'bottom'].includes(String(align)) || (align !== 'top' && (!leafRow.block || !L))) return null;
    const contentBlock = leafRow.block && diff(leafRow.block, sum(edgeValue(leafStyle,'top'),edgeValue(leafStyle,'bottom')));
    const shift = (lines:number) => align === 'top' ? scalar(zero) : times(diff(contentBlock!, scalar(mul(q(String(L)), q(lines)))), align === 'middle' ? div(q(1), q(2)) : q(1));
    let y = sum(leafRow.origin.block, asAffine(leafRow.content.top));
    // The inline box's vertical padding and border do not move the line but extend its box (painted and hit) above and
    // below the content area (measured: padding: 4px 0 makes a 19px link 27px tall).
    const vertical = (side:'top'|'bottom') => { const v = ['padding', 'border'].map(k => String(childStyle[`${k}-${side}`] ?? '0')); return v.every(x => /^(?:0|\d+(?:\.\d+)?px)$/.test(x)) ? v.map(x => x === '0' ? zero : px(x)).reduce(add, zero) : null; };
    const [padTop, padBottom] = [vertical('top'), vertical('bottom')];
    if (!padTop || !padBottom) return null;
    const rect = (x0:Rational,x1:Rational,y0:Rational,y1:Rational,shift:Affine2|null=null) => cmp(x1, x0) > 0 && cmp(y1, y0) > 0 ? { origin: { inline: sum(shift ? sum(x, shift) : x, scalar(x0)), block: sum(y, scalar(y0)) }, inline: scalar(sub(x1, x0)), block: scalar(sub(y1, y0)) } : null;
    const aligned = cmp(alignFactor, zero) !== 0;
    // An aligned line of width [lo, hi]: the outer bound starts where the widest line puts it and ends where the
    // narrowest does; the inner bound the other way round.
    const piece = (b:TextInlineBounds,r:Region,width:TextMetricPair|undefined) => {
      const lo = aligned ? sixtyfourths(width![0], Math.floor) : zero, hi = aligned ? sixtyfourths(width![1], Math.ceil) : zero, spread = mul(sub(hi, lo), alignFactor);
      if (rtl) {
        // The line's right edge is C·(1 − f) + w·f from the content's left, w in [lo, hi].
        const right = times(leafRow.content.inline, sub(q(1), alignFactor)), lf = mul(lo, alignFactor), hf = mul(hi, alignFactor);
        return { region: r, outer: rect(sub(lf, sixtyfourths(b.end[1], Math.ceil)), sub(hf, sixtyfourths(b.start[0], Math.floor)), sub(sixtyfourths(b.top[0], Math.floor), padTop), add(sixtyfourths(b.bottom[1], Math.ceil), padBottom), right),
          inner: rect(sub(hf, sixtyfourths(b.end[0], Math.floor)), sub(lf, sixtyfourths(b.start[1], Math.ceil)), sub(sixtyfourths(b.top[1], Math.ceil), padTop), add(sixtyfourths(b.bottom[0], Math.floor), padBottom), right) };
      }
      // (Both bounds are relative to the widest line's position; spread is how much further the narrowest one goes.)
      const outerShift = aligned ? times(diff(leafRow.content.inline, scalar(hi)), alignFactor) : null;
      return { region: r, outer: rect(sixtyfourths(b.start[0], Math.floor), add(sixtyfourths(b.end[1], Math.ceil), spread), sub(sixtyfourths(b.top[0], Math.floor), padTop), add(sixtyfourths(b.bottom[1], Math.ceil), padBottom), outerShift),
        inner: rect(add(sixtyfourths(b.start[1], Math.ceil), spread), sixtyfourths(b.end[0], Math.floor), sub(sixtyfourths(b.top[1], Math.ceil), padTop), add(sixtyfourths(b.bottom[0], Math.floor), padBottom), outerShift) };
    };
    const fits = (r:Region|null,width:TextMetricPair|undefined) => !aligned ? r : r && clip(r, diff(leafRow.content.inline, scalar(sixtyfourths(width![1], Math.ceil))));
    const base = y;
    if (metrics.kind === 'content') {
      y = sum(base, shift(1));
      if (aligned && !metrics.lineWidth) return null;
      const r = fits(region, metrics.lineWidth);
      const bound=metrics.inline?.[selector];
      return r && bound ? [piece(bound,r,metrics.lineWidth)] : null;
    }
    const content = leafRow.content.inline, out = [];
    for (const step of metrics.inline?.[selector] ?? []) {
      if (step.split) continue;
      let r = clip(region, diff(content, scalar(sixtyfourths(step.atLeastInlineSize, Math.round))));
      if (r && step.below !== null) r = clip(r, diff(scalar(sixtyfourths(step.below, Math.round)), content), true);
      if (r && align !== 'top' && step.lines === undefined) return null;
      // A justified line that is not the last is stretched: its inline boxes move with the word spacing (no bounds).
      // The line count varies at the line-break widths like the line widths do: only below alignBelow.
      if (r && justify && (step.lines === undefined || step.line !== step.lines - 1)) r = null;
      if (r && justify && step.below !== null) r = step.alignBelow === undefined ? null : clip(r, diff(scalar(sixtyfourths(step.alignBelow, Math.floor)), content), true);
      if (r && aligned && !step.lineWidth) return null;
      if (r) r = fits(r, step.lineWidth);
      // Aligned: only below alignBelow, where no wider layout can apply yet.
      if (r && aligned && step.below !== null) r = step.alignBelow === undefined ? null : clip(r, diff(scalar(sixtyfourths(step.alignBelow, Math.floor)), content), true);
      if (r) { y = sum(base, shift(step.lines ?? 1)); out.push(piece(step, r, step.lineWidth)); }
    }
    return out;
  }
  function inlineContent(leaf:InlineBox,leafStyle:SolverStyle,region:Region,parents:readonly InlineAncestor[],chain:PaintFacts[],leafRow?:InlineLeafRow) {
    for (const child of leaf.inline ?? []) for (const state of styles(child, region, parents.map(p => ({ ...p, names: [] })), parents.at(-1)?.style, false, false)) {
      const style = state.style;
      if (style.display === 'none') continue;
      const generatedText = generatedElsewhere(child, state.region, parents, style);
      if (generatedText) child.generated = generatedText;
      if (style.display !== 'inline' || style.position !== 'static' || style.float !== 'none') throw Object.assign(new Error(`${child.label} inside text must stay display: inline and static to keep the text's measured size`), { code: 'U_LAYOUT_INLINE' });
      // A replaced element (an image, an icon, a control) inside text is an atomic inline box: it widens the line by its
      // own width and, taller than the text's ascent, makes the line taller (checklist D3) — neither of which the text's
      // size contract counts. (Measured: a 40px image in a 24px line makes it 47px in Chromium, 46.5px in Firefox and WebKit.)
      // Measured with the text contract (inline {atomic: [width, height], at}) it is accepted where its CSS size is that
      // one, with no vertical margins, padding or border, on the baseline: the contract counted its width and checked
      // that it does not make the line taller.
      const atomic = ['img', 'svg', 'video', 'canvas', 'iframe', 'input', 'button', 'select', 'textarea', 'picture', 'object', 'embed'].includes(child.tag);
      if (atomic) {
        const metrics=leaf.contract?.textMetrics;
        const measured = Object.entries(metrics && metrics.kind!=='domain'?metrics.inlineAtomics??{}:{}).find(([selector]) => matches(compileSelector(selector), child))?.[1];
        const pxOf = (v:unknown) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(v)); return m ? Number(m[1]) : String(v) === '0' ? 0 : null; };
        // (No edges at all: auto inline margins of an inline box are 0.)
        const flat = ['top', 'bottom', 'left', 'right'].every(side => ['padding', 'border', 'margin'].every(k => pxOf(style[`${k}-${side}`] ?? '0') === 0 || (k === 'margin' && ['left', 'right'].includes(side) && String(style[`${k}-${side}`]) === 'auto')));
        const sized = measured && pxOf(style['inline-size']) === measured[0] && pxOf(style['block-size']) === measured[1];
        if (!(measured && sized && flat && ['baseline', undefined].includes(style['vertical-align']) && style.position === 'static' && style.float === 'none'))
          throw Object.assign(new Error(`${child.label} inside text is an atomic inline box: its width and height change the line, which the text's size does not count${measured ? ` (the text contract measured it ${measured.join(' × ')}px, with no edges, on the baseline; its CSS differs)` : '; measure it with the text contract (inline {atomic: [width, height], at}) or lay it out beside the text (a flex or grid item)'}`), { code: 'U_LAYOUT_INLINE' });
      }
      if (!atomic && ['img', 'svg', 'video', 'canvas', 'iframe', 'input', 'button', 'select', 'textarea', 'picture', 'object', 'embed'].includes(child.tag)) throw Object.assign(new Error(`${child.label} inside text is an atomic inline box: its width and height change the line, which the text's size does not count; lay it out beside the text (a flex or grid item) instead`), { code: 'U_LAYOUT_INLINE' });
      // vertical-align other than baseline, top or bottom raises or lowers the inline box, and the line box grows to
      // hold it (measured: super, sub, middle, text-top and lengths all change the line's height in Chromium, Firefox
      // and WebKit, by amounts that differ between them). top and bottom with the text's own font change nothing.
      if (!['baseline', 'top', 'bottom'].includes(String(style['vertical-align'] ?? 'baseline'))) throw Object.assign(new Error(`${child.label} inside text has vertical-align: ${style['vertical-align']}, which moves it off the baseline and makes the line taller; the measured text height does not hold`), { code: 'U_LAYOUT_INLINE' });
      // auto margins of inline boxes compute to 0.
      // Horizontal edges add to the line (checklist D3): allowed where the text contract measured them (inline
      // {text, edges}) and they are the ones declared here.
      {
        const edge = (key:string) => { const v = String(style[key] ?? '0'); if (v === 'auto' && key.startsWith('margin')) return 0; if (v === '0') return 0; const m = /^(\d+(?:\.\d+)?)px$/.exec(v); return m ? Number(m[1]) : null; };
        const own = [edge('margin-left'), [edge('border-left'), edge('padding-left')], [edge('padding-right'), edge('border-right')], edge('margin-right')].map(e => Array.isArray(e) ? (e.includes(null) ? null : e[0]! + e[1]!) : e);
        const metrics=leaf.contract?.textMetrics;
        const declared = Object.entries(metrics && metrics.kind!=='domain'?metrics.inlineEdges??{}:{}).find(([selector]) => matches(compileSelector(selector), child))?.[1];
        const firstKey = ['margin-left', 'border-left', 'padding-left', 'padding-right', 'border-right', 'margin-right'].find(key => !['0', '0px', ...(key.startsWith('margin') ? ['auto'] : [])].includes(String(style[key])));
        if (firstKey && !(declared && own.every((v, i) => v !== null && Math.abs(v - declared[i]!) < 1e-9))) throw Object.assign(new Error(`${child.label} inside text has horizontal ${firstKey}; inline box edges change the measured text${declared ? ` (the text contract measured edges ${declared.join(', ')}px, not these)` : ' (measure them with the text contract: inline {text, edges})'}`), { code: 'U_LAYOUT_INLINE' });
        if (!firstKey && declared && declared.some(v => v)) throw Object.assign(new Error(`${child.label}: the text contract measured inline edges ${declared.join(', ')}px that its CSS does not declare`), { code: 'U_LAYOUT_INLINE' });
      }
      // Another weight of the same font (checklist D3) where the text contract measured that run (inline {text, weight}).
      {
        const changed = fontKeys.filter(key => style[key] !== leafStyle[key]);
        const weightOf = (v:unknown) => v === 'normal' ? 400 : v === 'bold' ? 700 : /^\d+$/.test(String(v)) ? Number(v) : null;
        const metrics=leaf.contract?.textMetrics;
        const measuredWeight = Object.entries(metrics && metrics.kind!=='domain'?metrics.inlineWeights??{}:{}).find(([selector]) => matches(compileSelector(selector), child))?.[1];
        const weighted = changed.length === 1 && changed[0] === 'font-weight' && measuredWeight !== undefined && weightOf(style['font-weight']) === measuredWeight;
        if (leaf.contract?.textMetrics && changed.length && !weighted) throw Object.assign(new Error(`${child.label} changes the font inside text measured as one run${changed.length === 1 && changed[0] === 'font-weight' ? ' (measure its weight with the text contract: inline {text, weight})' : ''}`), { code: 'U_LAYOUT_INLINE' });
        if (measuredWeight !== undefined && !weighted && !changed.length) throw Object.assign(new Error(`${child.label}: the text contract measured it in weight ${measuredWeight}, which its CSS does not set`), { code: 'U_LAYOUT_INLINE' });
      }
      // Sizes, vertical margins and aspect-ratio do not apply to a non-replaced inline box (CSS 2.2 §10.3.1, §10.6.1;
      // measured: width, height, min/max-width, margin-top and aspect-ratio on a span change no pixel), nor do
      // transforms (CSS Transforms 1 §1: only block-level and atomic inline boxes are transformable; measured too).
      inlineStateTransforms(child, style);
      inlineTextAlignment(child, style);
      inlineAutoMargin(child, style);
      inlineOverflow(child, style);
      decorationNone(child, style, parents);
      firstPseudoInert(child, style);
      if (!['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'button', 'select', 'textarea'].includes(child.tag) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === child.path)) {
        const initial:Record<string,string[]> = { 'inline-size': ['auto'], 'block-size': ['auto'], 'min-inline-size': ['auto', '0', '0px'], 'min-block-size': ['auto', '0', '0px'], 'max-inline-size': ['none'], 'max-block-size': ['none'], 'margin-top': ['0', '0px', 'auto'], 'margin-bottom': ['0', '0px', 'auto'], 'aspect-ratio': ['auto'], transform: ['none'], translate: ['none'], rotate: ['none'], scale: ['none'] };
        const dropped = new Set(droppedOf(style, 'aspect-ratio').map(d => d.property));
        const written = Object.keys(initial).filter(key => style.$sources?.[key] && (dropped.has(key) || !initial[key]!.includes(String(style[key]))));
        if (written.length) layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: child.label, path: child.path, properties: written,
          css: written.map(key => ({ property: key, file: style.$sources[key]!.file, line: style.$sources[key]!.line, selector: style.$sources[key]!.selector })),
          message: `${child.label}: ${written.join(', ')} ${written.length === 1 ? 'has' : 'have'} no effect (it is display: inline, a box that flows in the line: ${written.every(key => ['transform', 'translate', 'rotate', 'scale'].includes(key)) ? 'transforms do not apply' : written.some(key => ['transform', 'translate', 'rotate', 'scale'].includes(key)) ? 'sizes, vertical margins and transforms do not apply' : 'sizes and vertical margins do not apply'}). Use display: inline-block (or block) to ${written.every(key => ['transform', 'translate', 'rotate', 'scale'].includes(key)) ? 'transform' : 'size'} it`, ...ranges(state.region) });
      }
      const own = [...chain, paintFacts({...style,position:style.position})];
      geometry.push({ box: child, path: child.path, region: state.region, origin: null, inline: null, block: null, position: 'static', inlineFlow: true,
        borders: { left: zero, right: zero, top: zero, bottom: zero }, overflow: 'visible', overflowValue: 'visible', painted: paints(style), paint: paintFacts({...style,position:style.position}), chain: own, parentText: leaf.path,
        ...(leafRow ? { bounds: inlineBounds(child, leaf, leafStyle, leafRow, state.region, style) ?? undefined } : {}) });
      if (child.children?.length) inlineContent({ ...child, inline: child.children, ...(leaf.contract?{contract:leaf.contract}:{}) }, style, state.region, [...parents, { box: child, style }], own);
    }
  }
  return {generatedElsewhere,inlineContent,inlineBounds};
}
