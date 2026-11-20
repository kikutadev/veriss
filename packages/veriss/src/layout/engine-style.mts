// Resolve the CSS cascade over conditional regions and attach modeled HTML size hints.
import {q,cmp} from './linear.mjs';
import {affine,sample,evaluate,partition} from './region.mjs';
import type {Region} from './region.mjs';
import {computeStyle,matches,viewportLength} from './css.mjs';
import type {ComputedStyle,CSSRule,InheritedStyle,CSSCondition,CSSBox} from './css.mjs';
import {parseCondition} from './conditions.mjs';
import type {ParsedCondition} from './conditions.mjs';
import {compare} from './engine-queries.mjs';
import type {createQuerySolver,LoadedSource} from './engine-queries.mjs';
import {lengthPieces} from './engine-geometry.mjs';
import type {EngineOptions} from './input.mjs';
import type {NormalizedBox,ImageSize,SVGPaint} from '../tree.mjs';
import type {Side} from './engine-types.mjs';
import type {LayoutSummary,LayoutRange,LayoutRegion,LayoutWarning,LayoutAffine,LayoutTextFontFacts} from '../layout-contracts.d.ts';
type StyleBox=NormalizedBox & CSSBox & {pseudo?:string;children:StyleBox[];inline?:StyleBox[]};
type Condition=ParsedCondition|CSSCondition;
type Compiled=ReturnType<ReturnType<typeof createQuerySolver>['context']>;
type QueryFact={condition:Condition;target:string|undefined;box:string;matched:boolean;region:Region};
type PictureSource={condition:ParsedCondition|null;facts:ImageSize;src:LoadedSource};
type SourceUse={box:StyleBox;sources:PictureSource[];chosen:Set<number>;active:Set<number>};
type ImageFacts={width?:number|'dynamic'|undefined;height?:number|'dynamic'|undefined;src:LoadedSource};
export interface EngineStyle extends ComputedStyle {
  $blockFlow?:boolean;$inlineLevel?:true;$inlineDisplay?:string|undefined;$listItem?:true;
  $staticPosition?:true;$containerCollapse?:true;$lineClamp?:number;$embedDefaultHeight?:true;
  $iconPaint?:string|undefined;$svgUnsized?:'fills'|'default';$widthFromAttribute?:number;
  $imageUnreserved?:{width:number;height:number;src:string};
  $imageRatioMismatch?:{src:string;natural:{width:number;height:number};reserved:string};
  $imageRatio?:{width:number;height:number;basis:'file'|'attributes';follows:boolean};
  $uaControl?:true;$viewportLengths?:Record<string,LayoutAffine & {source:string}>;
}
type StyleAncestor=Parameters<ReturnType<typeof createQuerySolver>['context']>[1][number]&{box:StyleBox;style:EngineStyle};
type StylePiece={region:Region;style:EngineStyle};
const zero=q(0);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const known=<T,>(value:T|undefined):value is T=>value!==undefined;
interface StyleContext {
  rules:readonly CSSRule[];preferences:readonly string[];hovered:string|undefined;untransformed:boolean;options:EngineOptions;
  spend:(count:number)=>void;bounded:<T>(values:T[])=>T[];
  loadedSource:ReturnType<typeof createQuerySolver>['loadedSource'];context:ReturnType<typeof createQuerySolver>['context'];
  textFonts:Map<string,Omit<LayoutTextFontFacts,'path'|'varied'>|'varied'>;
  layoutWarnings:LayoutWarning[];sourceUse:Map<string,SourceUse>;queryFacts:QueryFact[];
  queries:LayoutSummary['queries'];invalidSubstitutions:NonNullable<LayoutSummary['invalidSubstitutions']>;
  ranges:(region:Region)=>{range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion};
  cssMistakes:(box:StyleBox,style:EngineStyle,ancestors:readonly StyleAncestor[],inherited:InheritedStyle|undefined,gridItem:boolean,region:Region,state?:ReadonlySet<string>)=>void;
  noteTransform:()=>void;
}
export function createStyleResolver({rules,preferences,hovered,untransformed,options,spend,bounded,loadedSource,context,textFonts,layoutWarnings,sourceUse,queryFacts,queries,invalidSubstitutions,ranges,cssMistakes,noteTransform}:StyleContext) {
  function styles(box:StyleBox, region:Region, ancestors:readonly StyleAncestor[], inherited:InheritedStyle|undefined, emit:boolean, gridItem=true, state?:ReadonlySet<string>):StylePiece[] {
    spend(rules.length + 1);
    if (preferences.length) state = new Set([...(state ?? []), ...preferences]);
    if (box.pseudo) state = new Set([...(state ?? []), `::${box.pseudo}`]);
    // The focused re-layout: the one focused box (focus-at:<path>) has :focus/:focus-visible, its ancestors :focus-within.
    const focusAt = preferences.find(p => p.startsWith('focus-at:'))?.slice(9);
    if (focusAt !== undefined && !box.pseudo && (box.path === focusAt || focusAt.startsWith(box.path + '/'))) state = new Set([...(state ?? []), 'focus-within', ...(box.path === focusAt ? ['focus', 'focus-visible'] : [])]);
    // The hovered re-layout: the hovered box and its ancestors match :hover.
    if (hovered !== undefined && !box.pseudo && (box.path === hovered || hovered.startsWith(box.path + '/'))) state = new Set([...(state ?? []), 'hover']);
    // :checked holds for a checkbox/radio with the checked attribute unless the unchecked state is asked for.
    if (box.nativeStates?.checked && !state?.has('unchecked')) state = new Set([...(state ?? []), 'checked']);
    const relevant = rules.filter(rule => rule.selectors.some(selector => matches(selector, box, state)));
    const contexts = new Map<Condition,Compiled>();
    for (const rule of relevant) for (const condition of rule.contexts) if (!contexts.has(condition)) contexts.set(condition, context(condition, ancestors));
    // An img in a picture: the first earlier source with a srcset whose media matches (and whose type Chromium
    // decodes) is selected; its media conditions split the region like a media rule.
    const pictureSources = (() => {
      const picture = box.tag === 'img' && !box.pseudo ? ancestors.at(-1)?.box : null;
      if (picture?.tag !== 'picture') return [];
      return (picture.children ?? []).slice(0, picture.children.indexOf(box)).filter(child => child.tag === 'source' && child.imageSize?.srcset !== undefined).map(source => {
        const facts = source.imageSize!;
        if ([facts.srcset, facts.media, facts.type].includes('dynamic')) throw Object.assign(new Error(`${box.label}: a picture source with a dynamic srcset, media or type is not modeled`), { code: 'U_LAYOUT_IMAGE' });
        if (facts.type !== undefined && !/^image\/(?:avif|webp|png|jpeg|gif|svg\+xml)$/i.test(facts.type.trim())) throw Object.assign(new Error(`${box.label}: a picture source of type ${facts.type} may not be decoded`), { code: 'U_LAYOUT_IMAGE' });
        let condition:ParsedCondition|null = null;
        if (facts.media !== undefined && facts.media.trim() && facts.media.trim().toLowerCase() !== 'all') {
          try { condition = parseCondition(facts.media, 'media',options.mediaFeatures); } catch (error) { throw Object.assign(new Error(`${box.label}: source media ${facts.media}: ${error instanceof Error?error.message:String(error)}`), { code: 'U_LAYOUT_IMAGE' }); }
          if (condition.groups.flat().some(atom => atom.preference)) throw Object.assign(new Error(`${box.label}: a preference media query on a picture source is not modeled`), { code: 'U_LAYOUT_IMAGE' });
          contexts.set(condition, context(condition, ancestors));
        }
        return { condition, facts, src: loadedSource(facts.srcset) };
      });
    })();
    let regions = [region];
    const split = new Set();
    for (const compiled of contexts.values()) for (const atom of compiled.groups.flat()) {
      const key = JSON.stringify([affine(atom.slack), atom.relation]);
      if (split.has(key)) continue; split.add(key);
      regions = regions.flatMap(r => { const p = partition(r, atom.slack, atom.relation); return [...p.yes, ...p.no]; });
      if (regions.length > 512) throw new Error('Conditional region limit exceeded');
    }
    return regions.map(r => {
      const p = sample(r), activeContext = (compiled:Compiled) => compiled.groups.some(group => group.every(atom => compare(cmp(evaluate(atom.slack, p), zero), atom.relation)));
      const active = (rule:CSSRule) => rule.contexts.every(condition => activeContext(contexts.get(condition)!));
      let style:EngineStyle;
      try {style=computeStyle(relevant,box,active,inherited,{spend:(n=1)=>spend(n),state});}
      catch(error) {if(error instanceof Error && !('box' in error))Object.assign(error,{box});throw error;}
      // reportTextFonts: the computed font of each text leaf (for a caller that measures it with a font file and
      // analyses again with a font contract); 'varied' where it differs across the domain.
      // (A text field's placeholder too: its text and the field's font.)
      if (options.reportTextFonts && !state && box.tag === 'input' && typeof box.attributes?.placeholder === 'string' && box.attributes.placeholder.trim()) {
        const facts = { placeholder: true, classes: box.classes, text: box.attributes.placeholder, family: style['font-family'], size: style['font-size'], lineHeight: style['line-height'], weight: style['font-weight'], style: style['font-style'], whiteSpace: 'nowrap', overflowWrap: 'normal', letterSpacing: style['letter-spacing'], lang: style.$lang };
        const seen = textFonts.get(box.path);
        textFonts.set(box.path, seen && (seen === 'varied' || JSON.stringify(seen) !== JSON.stringify(facts)) ? 'varied' : facts);
      }
      if (options.reportTextFonts && !state && box.text && !box.pseudo && !(box.inline ?? []).length && !box.anonymous) {
        const hint = (name:string) => box.attributes && Object.hasOwn(box.attributes, name) ? box.attributes[name] : undefined;
        const facts = { classes: box.classes, text: box.textContent ?? '', ...(hint('data-text-one-line') !== undefined ? { oneLine: true } : {}), ...(hint('data-text-max-length') !== undefined ? { maxLength: hint('data-text-max-length') } : {}), ...(hint('data-text-chars') !== undefined ? { characters: hint('data-text-chars') } : {}), family: style['font-family'], size: style['font-size'], lineHeight: style['line-height'], weight: style['font-weight'], style: style['font-style'], whiteSpace: style['white-space'], overflowWrap: style['overflow-wrap'], letterSpacing: style['letter-spacing'], lang: style.$lang, textOverflow: style['text-overflow'], overflowX: style['overflow-x'], label: box.label };
        const seen = textFonts.get(box.path);
        textFonts.set(box.path, seen && seen !== 'varied' && JSON.stringify(seen) !== JSON.stringify(facts) ? 'varied' : seen === 'varied' ? 'varied' : facts);
      }
      if (gridItem && inherited && ['inline', 'inline-block'].includes(String(style.display))) style = { ...style, display: 'block', $inlineLevel: true, $inlineDisplay: style.display };
      // content-visibility: auto: on screen the box lays out as usual; offscreen it is size-contained. Admitted where
      // its width does not come from its content (block flow, or grid columns that are not content-sized), so that
      // only its height changes offscreen (W_LAYOUT_CONTENT_VISIBILITY_SIZE).
      if (style['content-visibility'] === 'auto') {
        const ps = ancestors.at(-1)?.style;
        const contentSized = !ps || !(ps.$blockFlow || ['block', 'list-item'].includes(String(ps.display)) || (ps.display === 'grid' && !/\b(?:auto|min-content|max-content|fit-content)\b/.test(String(ps['grid-template-columns'])) && String(ps['grid-template-columns']) !== 'none')) || ['absolute', 'fixed'].includes(String(style.position)) || style.$fixed;
        if (contentSized) throw Object.assign(new Error(`${box.label}: content-visibility: auto size-contains it offscreen, and its width depends on its content here; that is not modeled`), { code: 'U_LAYOUT_CSS', box });
      }
      // A list item lays out as a block: its outside marker takes no part in the layout (measured). An inside marker
      // is an inline box in the first line, which is not modeled.
      // resize lets the user drag the box's size, which the analysis does not know; it applies only to a box whose
      // overflow is not visible (CSS UI 4 §6.1). Elsewhere it does nothing (W_LAYOUT_DECLARATION_INERT).
      if (style.resize && style.resize !== 'none' && ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(style[key])))) throw Object.assign(new Error(`${box.label} is resize: ${style.resize}: the user can drag its size, which is not modeled`), { code: 'U_LAYOUT_CSS', box });
      if (style.display === 'list-item') {
        if (style['list-style-position'] === 'inside' && style['list-style-type'] !== 'none') throw Object.assign(new Error(`${box.label} has an inside list marker, which takes part in its first line; that is not modeled`), { code: 'U_LAYOUT_CSS', box });
        style = { ...style, display: 'block', $listItem: true };
      }
      // position: sticky with every inset auto never sticks (a sticky box is offset only by its inset properties):
      // it is laid out like position: relative, and the author probably forgot top: 0.
      if (style.$sticky && !box.pseudo && ['top', 'bottom', 'left', 'right'].every(side => style[side] === undefined || style[side] === 'auto')) {
        style = { ...style, $sticky: false };
        if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_NO_INSET' && w.path === box.path)) layoutWarnings.push({ code: 'W_LAYOUT_STICKY_NO_INSET', severity: 'warning', box: box.label, path: box.path,
          message: `${box.label} is position: sticky with no top, bottom, left or right: a sticky box sticks only by its insets, so it scrolls away like position: relative. Add top: 0 (or the edge it should stick to)`, ...ranges(r) });
      }
      // An absolute box with both insets of an axis (inset: 0 overlays): an auto size fills the containing block
      // between them, width = 100% − start − end − its own padding and border under content-box (CSS 2 §10.3.7); with
      // an explicit size it is over-constrained and the end inset is ignored (right in ltr, left in rtl; bottom).
      // An absolute box with both insets of an axis auto sits at its static position. In a grid container that is the
      // container's padding edge (css-grid-1 §9.4); when that container is also the containing block (positioned),
      // it is an inset of 0 on the start side (the visually hidden "sr-only" pattern, a badge without offsets).
      if (style.position === 'absolute' && !style.$fixed && !box.pseudo) {
        const parentStyle = ancestors.at(-1)?.style;
        if (parentStyle && ['grid', 'inline-grid'].includes(String(parentStyle.display)) && parentStyle.position !== 'static') {
          const none = (side:Side) => style[side] === undefined || style[side] === 'auto';
          const inlineStart = style.direction === 'rtl' ? 'right' : 'left';
          if (none('left') && none('right')) style = { ...style, [inlineStart]: '0px', $staticPosition: true };
          // That edge is where the box sits only when it is not aligned: its align-self, or the grid's align-items, moves
          // the static position (measured: align-items: flex-end on an 80px grid puts a 20px absolute child at 60).
          const aligned = (value:unknown) => !['auto', 'normal', 'stretch', 'start', 'flex-start', 'self-start'].includes(String(value ?? 'auto'));
          const blockAlign = String(style['align-self'] ?? 'auto') === 'auto' ? parentStyle['align-items'] : style['align-self'];
          if (none('top') && none('bottom') && aligned(blockAlign)) throw Object.assign(new Error(`${box.label}: an absolute box with auto top and bottom aligned by ${String(style['align-self'] ?? 'auto') === 'auto' ? `its grid's align-items: ${blockAlign}` : `align-self: ${blockAlign}`} has a static position that is not modeled`), { code: 'U_LAYOUT_CSS', box });
          if (none('top') && none('bottom')) style = { ...style, top: '0px', $staticPosition: true };
        }
      }
      if (style.position === 'absolute') {
        const sized = (start:Side,end:Side,size:'inline-size'|'block-size',edges:readonly Side[]) => {
          const set = (side:Side) => style[side] !== undefined && style[side] !== 'auto';
          if (!set(start) || !set(end)) return;
          if (style[size] === 'auto') {
            const own = style['box-sizing'] === 'content-box' ? edges.flatMap(edge => [style[`padding-${edge}`], style[`border-${edge}`]]).filter(v => v && !['0', '0px', 'ua'].includes(v)) : [];
            const minus = [style[start], style[end], ...own].filter(v => !['0', '0px'].includes(String(v)));
            style = { ...style, [size]: minus.length ? `calc(100% - ${minus.join(' - ')})` : '100%', [end]: 'auto' };
          } else style = { ...style, [end]: 'auto' };
        };
        sized(style.direction === 'rtl' ? 'right' : 'left', style.direction === 'rtl' ? 'left' : 'right', 'inline-size', ['left', 'right']);
        sized('top', 'bottom', 'block-size', ['top', 'bottom']);
        // An auto width left after the insets shrinks to fit its content; under inline-size containment
        // (container-type: inline-size / size) the content counts for nothing, so it is its padding and border.
        if (style['inline-size'] === 'auto' && ['inline-size', 'size'].includes(String(style['container-type']))) {
          const sides = (['left', 'right'] as const).flatMap(side => [style[`padding-${side}`], style[`border-${side}`]]).map(v => v === 'ua' || v === undefined ? '0' : String(v));
          if (sides.every(v => /^(?:0|\d+(?:\.\d+)?px)$/.test(v))) {
            const edges = sides.reduce((total, v) => total + (v === '0' ? 0 : Number(v.slice(0, -2))), 0);
            style = { ...style, 'inline-size': style['box-sizing'] === 'content-box' ? '0px' : `${edges}px`, $containerCollapse: true };
          }
        }
      }
      // A line-clamped text leaf (-webkit-box, vertical, -webkit-line-clamp: N): a block whose height is at most N lines.
      if (style.display === '-webkit-box' && !box.pseudo) {
        if (style['box-orient'] !== 'vertical' || !/^\d+$/.test(String(style['line-clamp'])) || !box.text || (box.children ?? []).length || !/^\d+(?:\.\d+)?px$/.test(String(style['line-height']))) throw Object.assign(new Error(`${box.label}: display: -webkit-box is modeled as a line clamp of a text leaf (-webkit-box-orient: vertical, -webkit-line-clamp: N, a px line-height)`), { code: 'U_LAYOUT_CSS' });
        style = { ...style, display: 'block', $lineClamp: Number(style['line-clamp']) };
      }
      // An img's width/height attributes are presentational hints (below every author rule) for its width and height,
      // and set its aspect-ratio to auto w / h (HTML rendering §15.4.3; measured).
      const chosen = pictureSources.find(source => !source.condition || activeContext(contexts.get(source.condition)!));
      if (emit && pictureSources.length) {
        const use = sourceUse.get(box.path) ?? { box, sources: pictureSources, chosen: new Set(), active: new Set() };
        sourceUse.set(box.path, use);
        if (chosen) use.chosen.add(pictureSources.indexOf(chosen));
        pictureSources.forEach((source, i) => { if (!source.condition || activeContext(contexts.get(source.condition)!)) use.active.add(i); });
      }
      // A selected source with width or height attributes is the image's dimension source; else the img's own.
      const imageFacts:ImageFacts|undefined = chosen ? { ...((chosen.facts.width !== undefined || chosen.facts.height !== undefined) ? { width: chosen.facts.width, height: chosen.facts.height } : { width: box.imageSize?.width, height: box.imageSize?.height }), src: chosen.src } : box.imageSize && { ...box.imageSize, src: loadedSource(box.imageSize.srcset, box.imageSize.src) };
      // video: its width/height attributes are size hints and aspect-ratio auto w / h too (HTML rendering §15.4.3).
      // An iframe is a replaced box of 300×150 by default (its width/height attributes are presentational hints) with
      // no natural aspect ratio: an auto height stays 150px whatever its width, unless aspect-ratio sizes it.
      if (box.tag === 'iframe' && !box.pseudo && style.display === 'block') {
        const { width: w, height: hgt } = box.imageSize ?? {};
        if (style['inline-size'] === 'auto' && !style.$sources['inline-size'] && (w === undefined || finite(w))) style = { ...style, 'inline-size': `${w ?? 300}px` };
        if (style['block-size'] === 'auto' && !style.$sources['block-size'] && (hgt === undefined || finite(hgt)) && (style['aspect-ratio'] === 'auto' || !style.$sources['aspect-ratio']))
          style = { ...style, 'block-size': `${hgt ?? 150}px`, ...(hgt === undefined && style.$sources['inline-size'] ? { $embedDefaultHeight: true } : {}) };
      }
      // An inline svg (a replaced box, measured in Chromium): width/height attributes are presentational hints; with a
      // width its height is the height attribute, else width × the viewBox ratio, else 150px; with only a height its
      // width is height ÷ the ratio, else 300px; with neither, a viewBox fills the grid area (ratio height) and no
      // viewBox is 300×150. Stretch-fit in a flex container is not modeled.
      if (box.tag === 'svg' && !box.pseudo) {
        const facts = box.svgSize ?? {}, vb = facts.viewBox;
        if ([facts.width, facts.height].includes('dynamic') || vb === 'dynamic') throw Object.assign(new Error(`${box.label}: an svg with a dynamic width, height or viewBox is not modeled`), { code: 'U_LAYOUT_ELEMENT', box });
        if (style.display === 'inline') style = { ...style, display: 'block' };
        // The color its shapes are drawn in: a shape's own fill/stroke attribute, else author CSS on the svg, else the
        // svg's attribute, else the inherited value (initial fill black, stroke none). Fill wins if both paint.
        {
          const paint:Partial<SVGPaint> = facts.paint ?? {}, value = (key:'fill'|'stroke') => {
            const shape = paint[key === 'fill' ? 'shapeFill' : 'shapeStroke'];
            if (shape === 'mixed' || shape === 'dynamic') return 'dynamic';
            const v = shape ?? (style.$sources[key] ? style[key] : paint[key] ?? style[key]);
            return String(v).toLowerCase() === 'currentcolor' ? style.color : v;
          };
          const fill = value('fill'), stroke = value('stroke');
          style = { ...style, $iconPaint: [fill, stroke].includes('dynamic') ? 'dynamic' : fill !== 'none' && stroke !== 'none' && String(fill) !== String(stroke) ? 'dynamic' : fill !== 'none' ? fill : stroke };
        }
        const authored = (key:string) => style.$sources[key] && style[key] !== 'auto';
        if (!authored('inline-size') && facts.width) style = { ...style, 'inline-size': facts.width };
        if (!authored('block-size') && facts.height) style = { ...style, 'block-size': facts.height };
        const w = style['inline-size'], h = style['block-size'], ratio = vb ? `${vb.width}/${vb.height}` : null;
        const parentDisplay = ancestors.at(-1)?.style?.display;
        if (w !== 'auto' && h === 'auto') style = ratio && !authored('aspect-ratio') ? { ...style, 'aspect-ratio': ratio } : authored('aspect-ratio') ? style : { ...style, 'block-size': '150px' };
        else if (w === 'auto' && h !== 'auto') {
          if (!/^\d+(?:\.\d+)?px$/.test(String(h))) throw Object.assign(new Error(`${box.label}: an svg sized by a non-px height alone is not modeled`), { code: 'U_LAYOUT_ELEMENT', box });
          style = { ...style, 'inline-size': vb ? `${+(parseFloat(String(h)) * vb.width / vb.height).toFixed(6)}px` : '300px' };
        } else if (w === 'auto' && h === 'auto') {
          if (vb && !['grid', 'inline-grid'].includes(String(parentDisplay))) throw Object.assign(new Error(`${box.label}: an unsized svg with a viewBox fills its container; outside a grid area that is not modeled`), { code: 'U_LAYOUT_ELEMENT', box });
          style = { ...(vb ? { ...style, 'inline-size': '100%', 'aspect-ratio': ratio! } : { ...style, 'inline-size': '300px', 'block-size': '150px' }), $svgUnsized: vb ? 'fills' : 'default' };
        }
      }
      if (['img', 'video'].includes(box.tag) && imageFacts && !box.pseudo) {
        const { width: w, height: hgt } = imageFacts;
        if (finite(w) && style['inline-size'] === 'auto' && !style.$sources['inline-size']) style = { ...style, 'inline-size': `${w}px`, ...(!style.$sources['max-inline-size'] ? { $widthFromAttribute: w } : {}) };
        if (finite(hgt) && style['block-size'] === 'auto' && !style.$sources['block-size']) style = { ...style, 'block-size': `${hgt}px` };
        if (finite(w) && finite(hgt) && w > 0 && hgt > 0 && style['aspect-ratio'] === 'auto' && !style.$sources['aspect-ratio']) style = { ...style, 'aspect-ratio': `auto ${w}/${hgt}` };
        // The loaded image's natural size (a static file read at build time) against what was reserved before it loads.
        // Several density candidates without a device pixel ratio: decided only when every candidate file has one ratio.
        if (imageFacts.src && typeof imageFacts.src==='object') {
          const sizes = imageFacts.src.candidates.map(url => options.images?.[url]);
          if (sizes.every(known) && sizes.some(size => size.width * sizes[0]!.height !== size.height * sizes[0]!.width)) throw Object.assign(new Error(`${box.label}: its srcset candidates have different ratios, so its loaded height depends on the device pixel ratio; give the devicePixelRatios option`), { code: 'U_LAYOUT_IMAGE' });
          imageFacts.src = sizes.every(known) ? imageFacts.src.candidates[0] : 'dynamic';
        }
        const natural = typeof imageFacts.src === 'string' ? options.images?.[imageFacts.src] : undefined;
        if (style['block-size'] === 'auto' && natural && typeof imageFacts.src==='string') {
          const reserved = /^auto (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(String(style['aspect-ratio']));
          if (style['aspect-ratio'] === 'auto') style = { ...style, 'aspect-ratio': `auto ${natural.width}/${natural.height}`, $imageUnreserved: { ...natural, src: imageFacts.src } };
          else if (reserved && Number(reserved[1]) * natural.height !== Number(reserved[2]) * natural.width) style = { ...style, $imageRatioMismatch: { src: imageFacts.src, natural, reserved: `${reserved[1]}/${reserved[2]}` } };
        }
        // The ratio an img's picture is drawn at (its file's size, else its width/height attributes), for object-fit: fill.
        // A box with aspect-ratio auto … and an auto size follows the loaded file, so it cannot stretch it.
        const drawn = natural ?? (finite(w) && finite(hgt) && w > 0 && hgt > 0 ? { width: w, height: hgt } : null);
        if (box.tag === 'img' && drawn) style = { ...style, $imageRatio: { width: drawn.width, height: drawn.height, basis: natural ? 'file' : 'attributes', follows: /^auto\b/.test(String(style['aspect-ratio'])) && (style['inline-size'] === 'auto' || style['block-size'] === 'auto') } };
      }
      // A user-agent checkbox or radio (appearance auto, size and minimum untouched): Chromium draws it 13×13 border-box
      // (measured). Laid out at that size for the accessibility checks; SC 2.5.8/2.5.5 exempt it. Padding and border do
      // not change that box (F42, measured in Chromium, Firefox and WebKit: same size, same position after it).
      if (options.accessibility && !box.pseudo && box.tag === 'input' && ['checkbox', 'radio'].includes(String(box.inputType)) && style.appearance === 'auto' && ['ua', 'inline-block', 'block'].includes(String(style.display))
        && ['inline-size', 'block-size'].every(key => style[key] === 'auto') && ['min-inline-size', 'min-block-size'].every(key => ['ua', 'auto'].includes(String(style[key]))))
        style = { ...style, appearance: 'none', display: 'block', 'box-sizing': 'border-box', 'inline-size': '13px', 'block-size': '13px', 'min-inline-size': 'auto', 'min-block-size': 'auto', ...Object.fromEntries(['left', 'right', 'top', 'bottom'].flatMap(side => [[`padding-${side}`, '0'], [`border-${side}`, '0']])), $uaControl: true };
      // F30 (emitted with or without emit: a display: none child is never laid out again): display: contents on a replaced element or form control computes to none (css.mjs): the control vanishes.
      if (style.$contentsRemoved && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTENTS_REMOVED' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_CONTENTS_REMOVED', severity: 'warning', box: box.label, path: box.path, ...(style.$sources?.display ? { css: [{ property: 'display', file: style.$sources.display.file, line: style.$sources.display.line, selector: style.$sources.display.selector }] } : {}),
        message: `${box.label}: display: contents on <${box.tag}> acts as display: none (a replaced element or form control has no children to show in its place), so it is not rendered at all. Use display: block (or inline-block), or put display: contents on a wrapper` });
      // F68 (emitted with or without emit, as F30: a display: none box is never laid out).
      if (style.$hiddenInputDisplay && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties?.includes('display')))
      layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['display'], ...(style.$sources?.display ? { css: [{ property: 'display', file: style.$sources.display.file, line: style.$sources.display.line, selector: style.$sources.display.selector }] } : {}),
        message: `${box.label}: display: ${style.$hiddenInputDisplay} has no effect on an input type=hidden (the browser's display: none !important always wins). Use another input type to show a field` });
      if (emit) cssMistakes(box, style, ancestors, inherited, gridItem, r, state);
      if (emit) for (const entry of style.$invalid ?? []) invalidSubstitutions.push({ box: box.label, path: box.path, property: entry.property, longhands: entry.longhands, css: { file: entry.file, line: entry.line }, reason: entry.code === 'U_LAYOUT_VARIABLE_CYCLE' ? 'cycle' : 'guaranteed-invalid', message: entry.message, resolution: 'unset', ...ranges(r) });
      if (emit) for (const [condition, compiled] of contexts) if (condition.kind === 'container') {
        queries.push({ box: box.label, path: box.path, name: condition.name, target: compiled.target, targetPath: compiled.path, matched: activeContext(compiled), ...ranges(r) });
        queryFacts.push({ condition, target: compiled.target, box: box.label, matched: activeContext(compiled), region: r });
      }
      if (style.transform !== 'none' && !box.pseudo) { if (untransformed) style = { ...style, transform: 'none' }; else noteTransform(); }
      return { region: r, style };
    }).flatMap(entry => {
      let pieces = [entry];
      if (entry.style.display === 'none') return pieces;
      const keys = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
        ...(['grid', 'flex', 'inline-grid', 'inline-flex'].includes(String(entry.style.display)) ? ['row-gap', 'column-gap'] : [])];
      for (const key of keys) {
        const value = entry.style[key];
        if (!viewportLength(value)) continue;
        if(typeof value!=='string')throw new Error('Unresolved viewport-dependent length');
        if (key.startsWith('padding-') && !['block', 'grid', 'flex', 'inline-grid', 'inline-flex'].includes(String(entry.style.display)))
          throw Object.assign(new Error('Viewport-dependent padding on inline/other formatting contexts is not modeled'), {code:'U_LAYOUT_CSS', box});
        pieces = bounded(pieces.flatMap(piece => lengthPieces(value, null, piece.region, piece.style).map(part => ({
          region: part.region, style: { ...piece.style, $viewportLengths: { ...piece.style.$viewportLengths, [key]: { source: value, ...affine(part.value) } } }
        }))));
      }
      return pieces;
    });
  }
  return styles;
}
