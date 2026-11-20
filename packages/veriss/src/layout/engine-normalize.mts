// Normalize computed styles to the supported formatting model before sizing.
import {q,cmp,add} from './linear.mjs';
import {evaluate} from './region.mjs';
import type {Affine2,Region} from './region.mjs';
import {px} from './css.mjs';
import {crossAlignment} from './flex.mjs';
import {phrasingTags} from '../tree.mjs';
import type {EngineStyle} from './engine-style.mjs';
import type {InlineBox} from './engine-inline.mjs';
import type {LayoutWarning,LayoutRange,LayoutRegion} from '../layout-contracts.d.ts';

type Box=InlineBox & {$foldedInline?:boolean};
type Ancestor={box:Box;style:EngineStyle;names?:readonly string[]};
type Space={root?:boolean;percentBlock?:Affine2|null;inline:Affine2;block?:Affine2|null;flexItem?:{main:'inline'|'block'}};
type Piece={style:EngineStyle;region:Region};
type Context={
  box:Box;state:Piece;available:Space;parents:readonly Ancestor[];inherited:EngineStyle|undefined;emit:boolean;
  layoutWarnings:LayoutWarning[];ranges:(region:Region)=>{range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion};
  styles:(box:Box,region:Region,parents:readonly Ancestor[],inherited:EngineStyle|undefined,emit:boolean,gridItem:boolean)=>Piece[];
};
const zero=q(0);
  function inertMainSize(style:EngineStyle, box:InlineBox, main:'inline'|'block') {
    const size = main === 'block' ? 'block-size' : 'inline-size';
    if (!style.$sources?.[size] || style[size] === 'auto' || ['auto', 'content'].includes(String(style['flex-basis']))) return null;
    const scroller = !['visible', 'clip'].includes(String(style['overflow-x'])) || !['visible', 'clip'].includes(String(style['overflow-y']));
    const empty = !(box.children ?? []).length && !box.text && !box.inline?.length;
    return style[`min-${size}`] !== 'auto' || scroller || empty ? size : null;
  }

export function normalizeLayoutState({box,state,available,parents,inherited,emit,layoutWarnings,ranges,styles}:Context):{box:Box;style:EngineStyle} {
  let {style}=state;
        // F55: a percentage top / bottom of a relative box refers to its containing block's height; in a block-flow parent
        // of auto height that is not definite, so it is auto: the box does not move (measured in Chromium, Firefox and
        // WebKit; a grid area resolves it, differently in WebKit, so only block flow).
        // The parent's auto height is indefinite only where the parent is itself in block flow (a stretched grid or flex
        // item has a definite height, against which Chromium and Firefox resolve the percentage: measured).
        const grand = parents.at(-2), parentInBlockFlow = !!grand && (grand.style?.$blockFlow || (grand.style?.display === 'block' && !grand.box?.text)) && !['absolute', 'fixed'].includes(String(parents.at(-1)?.style?.position)) && !parents.at(-1)?.style?.$fixed;
        if (inherited?.$blockFlow && parentInBlockFlow && !available.root && style.position === 'relative' && String(inherited['block-size'] ?? 'auto') === 'auto') {
          const pct = ['top', 'bottom'].filter(key => /%$/.test(String(style[key] ?? '')));
          if (pct.length) {
            if (emit && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties?.includes(pct[0]!)))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: pct, css: pct.filter(key => style.$sources?.[key]).map(key => ({ property: key, file: style.$sources[key]!.file, line: style.$sources[key]!.line, selector: style.$sources[key]!.selector })),
                message: `${box.label}: ${pct.map(key => `${key}: ${style[key]}`).join(', ')} does nothing: a percentage ${pct.length === 1 ? pct[0] : 'top / bottom'} refers to the containing block's height, and its parent has no height (auto), so it is treated as auto. Give the parent a height, or use transform: translateY(${style[pct[0]!]}) (a percentage of the box itself)` });
            style = { ...style, ...Object.fromEntries(pct.map(key => [key, 'auto'])) };
          }
        }
        // F56: a percentage height (or min / max height) refers to the containing block's height; in a block-flow parent
        // of auto height that is itself in block flow it is not definite, so height is auto, min-height 0, max-height none
        // (CSS 2.2 §10.5; measured in Chromium, Firefox and WebKit — under a grid the parent's height is definite).
        if (inherited?.$blockFlow && parentInBlockFlow && !available.root && !['absolute', 'fixed'].includes(String(style.position)) && !style.$fixed && String(inherited['block-size'] ?? 'auto') === 'auto') {
          const idle:Record<string,string> = { 'block-size': 'auto', 'min-block-size': 'auto', 'max-block-size': 'none' };
          const pct = Object.keys(idle).filter(key => /%$/.test(String(style[key] ?? '')));
          if (pct.length) {
            const names:Record<string,string> = { 'block-size': 'height', 'min-block-size': 'min-height', 'max-block-size': 'max-height' };
            if (emit && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties?.includes(pct[0]!)))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: pct, css: pct.filter(key => style.$sources?.[key]).map(key => ({ property: key, file: style.$sources[key]!.file, line: style.$sources[key]!.line, selector: style.$sources[key]!.selector })),
                message: `${box.label}: ${pct.map(key => `${names[key]}: ${style[key]}`).join(', ')} does nothing: a percentage height refers to the parent's height, and ${parents.at(-1)?.box?.label ?? 'its parent'} has none (auto), so it is ignored. Give the parent a height, or make it a flex or grid container and stretch this box` });
            style = { ...style, ...Object.fromEntries(pct.map(key => [key, idle[key]])) };
          }
        }
        // F53: an in-flow child of a block-flow parent has auto margin-top / margin-bottom of 0 (see the collect step).
        if (inherited?.$blockFlow && !available.root && !['absolute', 'fixed'].includes(String(style.position)) && !style.$fixed && ['margin-top', 'margin-bottom'].some(key => String(style[key]) === 'auto'))
          style = { ...style, ...Object.fromEntries(['margin-top', 'margin-bottom'].filter(key => String(style[key]) === 'auto').map(key => [key, '0'])) };
        // A grid container whose only content is text (a chat bubble: display: grid on the p) has one anonymous grid
        // item holding it. With one minmax(0, 1fr) column, no row tracks and no item or content alignment, that item
        // fills the content box and its row is the text's height: the same as a block text leaf, which it is laid out as.
        const norm = (v:unknown) => String(v ?? '').replace(/\s+/g, '');
        if (style.display === 'grid' && !style.$blockFlow && box.text && !box.children.length && !box.pseudo && norm(style['grid-template-columns']) === 'minmax(0,1fr)'
          && style['grid-template-rows'] === 'none' && ['auto'].includes(String(style['grid-auto-rows'])) && style['grid-template-areas'] === 'none'
          && ['normal', 'stretch'].includes(String(style['align-items'])) && ['normal', 'stretch', 'legacy'].includes(String(style['justify-items'] ?? 'normal'))
          && ['normal', 'start', 'stretch'].includes(String(style['align-content'])) && ['normal', 'start', 'stretch'].includes(String(style['justify-content'])))
          style = { ...style, display: 'block', 'grid-template-columns': 'none', 'align-content': 'normal', 'justify-content': 'normal', $anonymousGridText: true };
        // A block container whose only child is one inline phrasing element with text (<p><a>Read more</a></p>,
        // <li><a>Item</a></li>) is a text leaf with that element as its inline content: it takes the element's
        // text contract. In a grid or flex container the element would be an item instead (not folded).
        if (style.display === 'block' && !box.text && !box.inline?.length && box.children.length && !box.pseudo) {
          const kids = box.children, textual = (k:InlineBox) => k.text || k.inline?.length;
          // Only elements that stay display: inline and in flow are folded (nav > a { display: block } is a block-level
          // child; an absolutely positioned badge in a button is out of flow).
          const staysInline = (k:InlineBox) => { try { return styles(k, state.region, [...parents.map(p => ({ ...p, names: [] })), { box, style, names: [] }], style, false, false).every(s => s.style.display === 'inline' && s.style.position === 'static' && s.style.float === 'none'); } catch { return true; } };
          const allInline = kids.every(k => phrasingTags.has(k.tag) && k.tag !== 'img' && !(k.children ?? []).length) && kids.every(staysInline);
          // One element: it brings its text contract. Several: the container's own contract sizes the line(s).
          if (allInline && kids.length === 1 && textual(kids[0]!) && kids[0]!.contract && !box.contract)
            box = { ...box, text: true, inline: kids, children: [], contract: kids[0]!.contract, $foldedInline: true };
          else if (allInline && kids.length > 1 && kids.some(textual) && box.contract)
            box = { ...box, text: true, inline: kids, children: [], $foldedInline: true };
        }
        // A percentage height against a parent whose height depends on its content (block flow in block flow, auto
        // height) computes to auto (CSS 2.2 §10.5; measured: height: 100% changes nothing there).
        {
          const parent = parents.at(-1), grand = parents.at(-2);
          const blockish = (st:EngineStyle|undefined) => st && ['block', 'list-item'].includes(String(st.display)) && !st.$blockFlowGrid;
          // (Also in a grid item, or the item of a row flex container, that is aligned rather than stretched: its auto
          // height depends on its content too — measured in Chromium, Firefox and WebKit, checklist D2.)
          const alignedItem = grand && !grand.style.$blockFlow && String(parent?.style['block-size']) === 'auto' && (['grid', 'inline-grid'].includes(String(grand.style.display)) || (['flex', 'inline-flex'].includes(String(grand.style.display)) && !String(grand.style['flex-direction']).startsWith('column')))
            && crossAlignment(String(grand.style['align-items']), String(parent!.style['align-self'])) !== 'stretch';
          if (/^\d+(?:\.\d+)?%$/.test(String(style['block-size'])) && style.position === 'static' && parent && grand && blockish(parent.style) && (blockish(grand.style) || alignedItem) && String(parent.style['block-size']) === 'auto' && !['html', 'body'].includes(parent.box.tag) && !available.percentBlock && !box.pseudo) {
            if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties?.includes('block-size')))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['block-size'], ...(style.$sources?.['block-size'] ? { css: [{ property: 'block-size', file: style.$sources['block-size']!.file, line: style.$sources['block-size']!.line, selector: style.$sources['block-size']!.selector }] } : {}),
                message: `${box.label}: block-size: ${style['block-size']} has no effect (its parent ${parent.box.label} has an auto height, which depends on its content, so a percentage height computes to auto). Give ${parent.box.label} a height, or make it a grid or flex container that stretches ${box.label}`, ...ranges(state.region) });
            style = { ...style, 'block-size': 'auto' };
          }
        }
        const inertMain = available.flexItem && style.position !== 'absolute' ? inertMainSize(style, box, available.flexItem.main) : null;
        if (inertMain) style = { ...style, [inertMain]: 'auto', $inertMain: { property: inertMain, value: String(style[inertMain]) } };
        // A flex item's main size is the one its container resolved (grown, shrunk or clamped by its min/max, §9.7) and
        // passes down as the available size; its own width or height is only the base (measured: width: 50px with
        // flex-grow: 2 is 240px wide in a 300px row).
        else if (available.flexItem && style.position !== 'absolute') {
          const size = available.flexItem.main === 'block' ? 'block-size' : 'inline-size';
          const given = available[available.flexItem.main];
          // Unchanged (the item neither grew nor shrank, nor was clamped): keep its own size, which other rules read.
          const sides = available.flexItem.main === 'block' ? ['top', 'bottom'] : ['left', 'right'];
          const own = /^\d+(?:\.\d+)?px$/.test(String(style[size])) ? add(px(String(style[size])), style['box-sizing'] === 'content-box' ? sides.map(side => add(px(String(style[`padding-${side}`])), px(String(style[`border-${side}`])))).reduce(add, zero) : zero) : null;
          const same = own && given && cmp(given.x, zero) === 0 && cmp(given.y, zero) === 0 && cmp(evaluate(given, { x: zero, y: zero }), own) === 0;
          if (style[size] !== 'auto' && given && !same) style = { ...style, [size]: 'auto', $flexMain: style[size] };
        }
  return {box,style};
}
