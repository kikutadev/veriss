import {checkSettledStyle} from './engine-settled-style.mjs';
import {createInlineSolver} from './engine-inline.mjs';
import {createStyleValidator,visuallyHiddenStyle} from './engine-validate.mjs';
import {createStyleResolver} from './engine-style.mjs';
import {buildLayoutReport} from './engine-report.mjs';
import {checkQueryCoverage} from './engine-coverage.mjs';
import {checkHoverShifts,checkAnimationShifts} from './engine-state-shifts.mjs';
import {checkLayoutWarnings} from './engine-warnings.mjs';
import {hasCarousel,checkCarouselShifts} from './engine-carousel.mjs';
import {preflight} from './engine-preflight.mjs';
import {createObligationCollector} from './engine-obligations.mjs';
import {createPositionSolver, subgridError, isDescendant, intersectRegions} from './engine-positioning.mjs';
import { createQuerySolver } from './engine-queries.mjs';
import { createFlexLayout } from './engine-flex.mjs';
import { createEdgeSolver, maximum, clamp, ratioOf, minimumOf, preferredInlinePieces } from './engine-edges.mjs';
import { q, add, sub, mul, cmp, div, exact, number } from './linear.mjs';
import { scalar, asAffine, width, height, sum, diff, times, evaluate, affine, sample, rectangle, clip, partition, projection, serialize } from './region.mjs';
import { validateOptions } from './input.mjs';
import { parseLayoutCSS, matches, px, setRootFontSize, setSafeArea, containsFixed, setUAProfile, viewportLength, animationsOf, transitionsOf, dependentProperty } from './css.mjs';
import { resolveUAProfile } from './ua-profile.mjs';
import { tracks, tracks as gridTracks, place, parseAreas, expandTracks } from './grid.mjs';
import { compileSelector, PARENT, ignoringSiblings, placeholderField, requiredCapable, optionalDivergent, optionalDivergence, asFormField, readWriteKnown, asEditable, langMatches, directionality } from './selectors.mjs';
import { droppedOf, droppedPairs, droppedValue } from './dropped.mjs';
import { createCssMistakes } from '../rules/css-mistakes.mjs';
// User-action and other dynamic pseudo-classes: removed from a selector to ask whether it could match in some state (F83).
import { gapSize, trackArea, trackSlice, inheritTracks } from './subgrid.mjs';
import { scrollbarFrames } from './scrollbars.mjs';
import {absoluteOrigin} from './positioned.mjs';
import {fittingLength, fittingLines} from './text-font.mjs';
import {validateFlexContainer, flexItem, crossAlignment, distribution, flexUnknown} from './flex.mjs';
import {judgeIntegrity, intersect } from './integrity.mjs';
import {judgeAccessibility, accessibilityRules, accessibilityProfiles, ruleTier, paintFacts} from './accessibility.mjs';
import {fact, sizeChain, sizeProperties, trackProperties, contractFact, explanation} from './explain.mjs';
import {phrasingTags} from '../tree.mjs';

const zero = q(0), one = q(1), minusOne = q(-1);
const total = values => values.reduce(sum, scalar(0));
const trackStart = (values,gap,index) => sum(total(values.slice(0,index)),times(asAffine(gap),q(index)));
// Visually hidden (the "sr-only" pattern): clipped to nothing, or a box of at most 1px that hides its overflow. Its
// content is meant not to be seen, so it is not judged for fit or clipping.
import { createIntrinsicSolver, intrinsicBlock, measureLegend } from './engine-intrinsic.mjs';
import { tableAsGrid as tableAsGridImpl, tablePlacement } from './engine-table.mjs';
import { affineOf, linearOf, mapper, scaled, translated as translatedWithRoot, relativelyOffset, offset } from './engine-transforms.mjs';
import { createTrackSolver, scaleGap, constantLess, maximumConstant } from './engine-tracks.mjs';
import { unitContext, lengthPieces, length, layoutRectangle, firstStartMove, matchLayoutRectangles } from './engine-geometry.mjs';
let uaEngine; // the engine of the ua option's profile (set per analysis, like the UA profile in css.mjs)

// `preferences` (internal) names non-default user preferences, e.g. 'prefers-color-scheme:dark'.
export function analyzeBoxTree(root, options, scrollbarProfile, budget, inlineSheets=[], inputDiagnostics=[], preferences=[]) {
  // A hovered re-layout (hover-at:<path>) still needs its own untransformed re-layout, so it keeps a pristine copy.
  const hovered = preferences.find(p => p.startsWith('hover-at:'))?.slice(9);
  const pristine = (options.accessibility || options.integrity || /:hover|@(?:-webkit-)?keyframes|@starting-style/i.test(String(options.css ?? '')) || inlineSheets.length || hasCarousel(root)) && preferences.every(p => p.startsWith('hover-at:')) ? structuredClone(root) : null;
  // The untransformed re-layout (CSS transforms removed): the layout boxes, which is what a layout shift compares.
  const untransformed = preferences.includes('untransformed');
  let sawTransform = false;
  const layoutWarnings = [], generatedTexts = [], textFonts = new Map(), transitionSizes = [];
  // Checklist E1: whether the page fits the viewport and whether it overflows it somewhere in the viewport range, and
  // whether html keeps a scrollbar gutter either way (scrollbar-gutter: stable, overflow-y: scroll) or never shows one
  // (overflow-y: hidden or clip).
  let pageScroll;
  const animated = []; // boxes with a running animation whose keyframes lay out: {box, region, name}
  const domain = validateOptions(options), block = options.block ?? Boolean(options.viewport.height);
  const component = options.name ?? 'Document';
  const h = options.viewport.height ?? { min: 0, max: 0 };
  const initial = rectangle(domain, { min: q(h.min), max: q(h.max) });
  const diagnostics = [...inputDiagnostics], policies = [], sizes = [], queries = [], queryFacts = [], sourceUse = new Map(), subgrids = [], scrollbars = [], invalidSubstitutions = [];
  // Live geometry and waived obligations for the opt-in integrity rules.
  const geometry = [];
  const {checks, waived, ranges, cellGrows, scrolls, obligation, flush:flushObligations} = createObligationCollector({block, diagnostics, scrollIntent:options.scrollIntent});
  // Paint facts of the options.ancestors chain (html, body, …) for the accessibility rules.
  let ancestorPaint = [];
  let work = 0;
  const spend = count => {
    work += count;
    if(budget) {budget.remaining-=count;if(budget.remaining<0) throw Object.assign(new Error('Combined layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});}
    if (work > 2_000_000) throw Object.assign(new Error('Layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});
  };
  const unknown = (code, message, line, box, file = options.cssFile ?? '<css>') => diagnostics.push({ code, severity: 'unknown', message, ...(line ? { css: { file, line } } : {}), ...(box ? { box: box.label, path: box.path, source: box.source } : {}) });
  const issue = (code, message, box, region, axis) => diagnostics.push({ code, severity: 'error', message, box: box.label, path: box.path, source: box.source, ...(axis ? { axis } : {}), ...ranges(region) });
  const boxes = [];
  // Parent links for combinator matching (a symbol: a structuredClone of the tree drops them, so set them here).
  const collect = box => { if (box) { boxes.push(box); for (const child of [...box.children, ...(box.inline ?? [])]) child[PARENT] = box; box.children.forEach(collect); } };
  collect(root);
  // Contracts of generated boxes (selector::before / ::after) are applied when the pseudo-element is generated.
  const pseudoContracts = Object.entries(options.boxes ?? {}).flatMap(([selector, contract]) => { const m = /^(.*)::(before|after)$/.exec(selector); return m ? [{ base: m[1], kind: m[2], selector, contract }] : []; });
  for (const [selector, contract] of Object.entries(options.boxes ?? {}).filter(([selector]) => !/::(?:before|after)$/.test(selector))) {
    const selected = boxes.filter(box => matches(selector, box));
    if (!selected.length) throw new Error(`Layout contract does not match a box: ${selector}`);
    for (const box of selected) { if (box.contract) throw new Error(`Ambiguous layout contracts for ${box.label}`); box.contract = contract; box.contractSelector = selector; }
  }
  // A cell's textRuns contracts size its anonymous text blocks, in DOM order.
  for (const box of boxes.filter(box => box.anonymousRuns)) {
    const runs = box.contract?.textRuns ?? [], anonymous = box.children.filter(child => child.anonymous);
    if (runs.length !== anonymous.length) unknown('U_LAYOUT_INTRINSIC', `${box.label} has ${anonymous.length} anonymous text block(s); give its contract one textRuns entry per text run`, undefined, box);
    anonymous.forEach((child, k) => { if (runs[k]) { child.contract = runs[k]; child.contractSelector = `${box.contractSelector} text ${k}`; } });
  }
  const styleSources = [...(options.reset ?? []).map((sheet, index) => ({ ...sheet, kind: 'reset', file: sheet.file ?? `<reset:${index}>` })), { css: options.css, kind: 'app', file: options.cssFile ?? '<css>' },...inlineSheets];
  const parsed = parseLayoutCSS(styleSources, (code, message, line, file, detail) => {
    if(detail) diagnostics.push({code,message,...detail});
    else unknown(code,message,line,undefined,file);
  },{scripting:options.scripting,mediaFeatures:options.mediaFeatures});
  const { rules, layers, keyframes: keyframeNames = new Set(), dependentDeclarations = [], firstPseudo = [], radiusRules = [], contentRules = [], userSelectNone = [], keyframeFrames, fontFaces, startingRules = [] } = parsed;
  preflight({options,boxes,parsed,diagnostics,layoutWarnings,unknown});
  // style attributes: each element's declarations as a rule that matches only it, element-attached in the cascade.
  for (const box of boxes.filter(box => box.inlineStyle !== undefined)) {
    if (box.inlineStyle === 'dynamic') { unknown('U_LAYOUT_CSS', `${box.label}: a dynamic style attribute decides its styles`, undefined, box); continue; }
    const attached = parseLayoutCSS([{ css: `*{${box.inlineStyle}}`, file: `${box.label} style attribute` }], (code, message, line, file, detail) => { if (detail) diagnostics.push({ code, message, ...detail }); else unknown(code, message, line, box, file); }).rules;
    for (const rule of attached) { rule.selectors = [{ source: `${box.label} [style]`, parts: [{ kind: 'path', value: box.path }], specificity: [0, 0, 0] }]; rule.attached = true; rules.push(rule); }
  }
  // An animation frame re-layout: the keyframe's layout declarations apply to that one box (animations override the
  // author's normal declarations, like an element-attached rule).
  if (options.$animationFrame) {
    const frame = parseLayoutCSS([{ css: `*{${options.$animationFrame.css}}`, file: 'keyframe' }], (code, message) => unknown(code, message)).rules;
    for (const rule of frame) { rule.selectors = [{ source: `${options.$animationFrame.path} [keyframe]`, parts: [{ kind: 'path', value: options.$animationFrame.path }], specificity: [0, 0, 0] }]; rule.attached = true; rules.push(rule); }
  }
  for (const rule of rules) rule.layerName = rule.layer === null ? undefined : layers[rule.layer];
  const bounded = values => { spend(values.length); if (values.length > 512) throw new Error('Layout state limit exceeded'); return values; };

  // The file an img or source loads: its one srcset candidate, or (under a device pixel ratio) the smallest density at
  // least that ratio, else the densest. An img's src is its 1x candidate. 'dynamic' when not decided (w descriptors,
  // several candidates without a ratio, a dynamic attribute).
  const {loadedSource, context} = createQuerySolver(Boolean(options.viewport.height), options.$devicePixelRatio);
  // Checklist F: CSS mistakes on one box's computed style (called from the styles of the layout pass, and from a style
  // walk where the layout did not run, so they are reported whether or not the layout is decided).
  // F9: a ::before or ::after styled but with no content is never generated.
  // CSS mistakes found on one box's computed style (rules/css-mistakes.mjs, ADR-0016 M5).
  const { firstInert, firstPseudoInert, inlineAutoMargin, alignBrowserDependent, inlineTextAlignment, decorationNone, inlineOverflow, inlineStateTransforms, pseudoWithoutContent, cssMistakes, aspectInert, tableRowRadius, contentsInert } = createCssMistakes({
    report: { warnings: layoutWarnings, unknown, diagnostics, ranges },
    facts: { rules, firstPseudo, contentRules, radiusRules, keyframeNames, dependentDeclarations, userSelectNone, transitionSizes, styles },
    tools: { matches, PARENT, droppedOf, droppedPairs, droppedValue, transitionsOf, animationsOf, dependentProperty, ignoringSiblings, directionality, langMatches, asEditable, readWriteKnown, optionalDivergent, optionalDivergence, requiredCapable, asFormField, placeholderField, focusable: box => focusableBox(box) },
  });
  const resolveStyles = createStyleResolver({rules,preferences,hovered,untransformed,options,spend,bounded,loadedSource,context,textFonts,layoutWarnings,sourceUse,queryFacts,queries,invalidSubstitutions,ranges,cssMistakes,noteTransform:()=>{sawTransform=true;}});
  function styles(...args) { return resolveStyles(...args); }
  // A box paints when it has a border or a background (vlmkit's painted-parent filter).
  const paints = style => ['left','right','top','bottom'].some(side => cmp(px(style[`border-${side}`]), zero) > 0) || style['background-image'] !== 'none' ||
    !/^(?:transparent|initial|unset|revert|rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0\s*\)|#(?:[\da-f]{3}0|[\da-f]{6}00)|hsla\([^)]*,\s*0\s*\))$/.test(style['background-color']);
  // Flex sizes: constants compared without splitting a region.
  const intrinsic = (box, content, region) => intrinsicBlock(box, content, region, unknown, ranges);
  const validate=createStyleValidator({block,options,rootTag:root.tag,uaEngine:()=>uaEngine,layoutWarnings,policies,issue,ranges});
  const {fromAffineFact, hasViewportMargin, marginValue, resolvedViewportLength, resolvedGap, padding, edgeValue, hasViewportPadding, isZeroAffine, positivePadding, positiveEdge, responsiveBlockMargins} = createEdgeSolver(viewportLength, bounded, block);
  const {flex, resolveFlexLine, constantItem, breakLines, mainStarts} = createTrackSolver(bounded);
  const layoutFlex = input => createFlexLayout({block, options, viewportLength, bounded, frAutoMinimums, scrolls, obligation, solve, finish, resolvedGap, hasViewportMargin, hasViewportPadding, resolvedViewportLength, isZeroAffine, constantItem, resolveFlexLine, breakLines, mainStarts})(input);
  const {generatedElsewhere,inlineContent}=createInlineSolver({styles,edgeValue,generatedTexts,layoutWarnings,geometry,ranges,paints,pseudoWithoutContent,inlineStateTransforms,inlineTextAlignment,inlineAutoMargin,inlineOverflow,firstPseudoInert,decorationNone});
  const focusState = new Set(['focus', 'focus-visible', 'focus-within']), hoverState = new Set(['hover']);
  const focusableBox = box => box.focusable === true || box.tabIndex >= 0 || (['button', 'select', 'textarea'].includes(box.tag) && box.focusable !== false) || (box.tag === 'input' && box.focusable !== false && box.inputType !== 'hidden');
  // A :focus rule that moves an absolutely positioned box by its insets: where the focused box lands (stateGeometry
  // rules; accessibility checks only). Any other focused inset change is not modeled.
  function focusMove(box, style, focused, available, inline, blockSize, parents) {
    const moved = ['left', 'right', 'top', 'bottom'].some(key => focused[key] !== style[key]), turned = focused.transform !== style.transform;
    if (!moved && !turned) return {};
    if (moved && style.position !== 'absolute') throw Object.assign(new Error(`${box.label}: a :focus rule changes the insets of a box that is not absolutely positioned`), { code: 'U_LAYOUT_SELECTOR' });
    // The focused box: placed by its focused insets, then painted through its focused transform.
    const painted = scaled(focused, resolvedOrigin(focused, available, inline, blockSize, parents), inline, blockSize);
    return painted.origin ? { origin: painted.origin, inline: painted.inline, block: painted.block } : { originUnknown: true };
  }
  function finish(box, style, region, inline, contentInline, blockSize, contentBlock, available, parents, emit) {
    const contract = box.contract ?? {};
    // Justify alignment is modeled as the default (stretch / start) only: where it applies — a grid container's items,
    // a grid item, an absolute box — any other value is Unknown; on a flex item or container it does nothing.
    {
      const parentStyle = parents.at(-1)?.style, aligned = value => !['auto', 'normal', 'stretch', 'legacy'].includes(String(value ?? 'auto'));
      const ownSelf = aligned(style['justify-self']), fromItems = String(style['justify-self'] ?? 'auto') === 'auto' && aligned(parentStyle?.['justify-items']);
      const where = style.position === 'absolute' ? 'an absolute box' : ['grid', 'inline-grid'].includes(parentStyle?.display) ? 'a grid item' : null;
      if (where && (ownSelf || fromItems) && !available.justifyHandled) throw Object.assign(new Error(`${box.label}: justify alignment ${ownSelf ? `justify-self: ${style['justify-self']}` : `justify-items: ${parentStyle['justify-items']} (from its parent)`} of ${where} is not modeled`), { code: 'U_LAYOUT_CSS', box });
    }
    if (emit) {
      const self = [...parents, { box, style }];
      const offered = axis => () => parents.length ? [...trackProperties(axis).map(property => fact(parents.at(-1).box, parents.at(-1).style, property)),
        fact(box, style, axis === 'inline' ? 'grid-column' : 'grid-row'), ...sizeChain(parents, axis, { hostInset: options.hostInset })] : [{ kind: 'viewport', axis }];
      const own = axis => sizeProperties(axis).filter(property => style.$sources[property] || property === (axis === 'inline' ? 'inline-size' : 'block-size')).map(property => fact(box, style, property));
      const item = axis => () => explanation(offered(axis)(), own(axis));
      const content = (axis, property) => () => explanation(sizeChain(self, axis, { hostInset: options.hostInset }), [contractFact(box, property)]);
      // An end margin may stick out of the area: it creates no overflow and hides nothing (measured), so the fit check
      // is start margin + border box against the area.
      // (The end margin may stick out; a negative one does not narrow the box's room.)
      obligation(available.marginEnd && (available.marginEnd.inline.x !== undefined || cmp(available.marginEnd.inline, zero) > 0) ? sum(available.inline, asAffine(available.marginEnd.inline)) : available.inline, inline, box, region, 'E_LAYOUT_ITEM_SIZE', 'inline', available.fitInline !== false, item('inline'));
      // A text domain reports how many characters still fit at the witness.
      const domain = contract.textMetrics?.kind === 'domain' ? offeredInline => ({ text: { maxLength: contract.textMetrics.maxLength, fitsUpTo: fittingLength(contract.textMetrics, offeredInline), widest: contract.textMetrics.widest } }) : undefined;
      // A one-line text cut with an ellipsis (text-overflow: ellipsis, overflow hidden or clip, nowrap) is intended
      // truncation: where the text needs more than the box, it is a warning, not a content violation.
      const ellipsis = style['text-overflow'] === 'ellipsis' && ['hidden', 'clip'].includes(style['overflow-x']) && ['nowrap', 'pre'].includes(style['white-space']) && box.text;
      if (ellipsis && contract.minInlineSize !== undefined && emit) {
        const cut = clip(region, diff(scalar(contract.minInlineSize), contentInline), true);
        if (cut && !layoutWarnings.some(w => w.code === 'W_LAYOUT_TRUNCATED' && w.path === box.path)) { const p = sample(cut); layoutWarnings.push({ code: 'W_LAYOUT_TRUNCATED', severity: 'warning', box: box.label, path: box.path,
          message: `${box.label} is cut with an ellipsis: its text needs ${number(q(String(contract.minInlineSize)))}px but the box offers ${number(evaluate(contentInline, p))}px at viewport ${number(p.x)}px (keep the full text available, e.g. in its accessible name or the page it links to)`, ...ranges(cut) }); }
      }
      if (contract.minInlineSize !== undefined && !visuallyHiddenStyle(style)) obligation(contentInline, scalar(contract.minInlineSize), box, region, 'E_LAYOUT_CONTENT', 'inline', (contract.overflow ?? 'fit') === 'fit' && !ellipsis, content('inline', 'minInlineSize'), domain);
      if (block) {
        // The document root may be taller than the viewport when the viewport scrolls (html overflow-y not hidden/clip):
        // that is an ordinary long page. With overflow-y visible and a classic scrollbar profile the scrollbar would
        // appear and narrow the page, which is not laid out, so the root is still required to fit there. A hidden or
        // clipped root cannot scroll: content below the viewport is unreachable (the obligation stays).
        if (box.documentRoot && available.root && available.block && blockSize && !hovered && !options.$animationFrame) {
          const overflows = Boolean(clip(region, diff(blockSize, available.block), true)), fits = Boolean(clip(region, diff(available.block, blockSize)));
          pageScroll = { fits: (pageScroll?.fits ?? false) || fits, overflows: (pageScroll?.overflows ?? false) || overflows, stable: String(style['scrollbar-gutter']).startsWith('stable') || ['scroll', 'hidden', 'clip'].includes(style['overflow-y']) };
        }
        const viewportScrolls = box.documentRoot && available.root && !['hidden', 'clip'].includes(style['overflow-y']) && (['auto', 'scroll'].includes(style['overflow-y']) || (scrollbarProfile !== undefined && !(scrollbarProfile.inlineSize > 0)));
        // Without a scrollbar profile, a root taller than the viewport scrolls with a platform scrollbar of unknown width.
        if (box.documentRoot && available.root && available.block && !['hidden', 'clip', 'auto', 'scroll'].includes(style['overflow-y']) && scrollbarProfile === undefined && clip(region, diff(blockSize, available.block), true))
          throw Object.assign(new Error(`${box.label} is taller than the viewport, so the viewport scrolls: declare scrollbar profiles (the scrollbars option) for the platforms the page is checked on`), { code: 'U_LAYOUT_SCROLLBAR' });
        // With a classic scrollbar and overflow-y visible, a long page scrolls too (the root's visible is the viewport's
        // auto), and the scrollbar narrows it; that narrowing is laid out only for an explicit auto or scroll, so a
        // root taller than the viewport here is Unknown, not a violation (the page does scroll in a browser).
        if (box.documentRoot && available.root && available.block && !['hidden', 'clip', 'auto', 'scroll'].includes(style['overflow-y']) && scrollbarProfile?.inlineSize > 0 && clip(region, diff(blockSize, available.block), true))
          throw Object.assign(new Error(`${box.label} is taller than the viewport, so the viewport scrolls and its ${scrollbarProfile.name ?? 'classic'} scrollbar (${scrollbarProfile.inlineSize}px) narrows the page; that is laid out when html sets overflow-y: auto or scroll (the same in a browser)`), { code: 'U_LAYOUT_SCROLLBAR' });
        // An absolute box taller than its containing block (a dropdown under a short field) hangs out of it: that hides
        // nothing by itself (clipping and page overflow are checked on their own), so there is no block-size obligation
        // against a positioned ancestor or the initial containing block. A fixed box taller than the viewport keeps it.
        const hangs = available.containingBlock && available.containingBlock.path !== 'viewport';
        if (available.block && !hangs) obligation(available.marginEnd ? sum(available.block, asAffine(available.marginEnd.block)) : available.block, blockSize, box, region, 'E_LAYOUT_ITEM_SIZE', 'block', available.fitBlock !== false && !viewportScrolls, item('block'));
        if (contract.minBlockSize !== undefined && !visuallyHiddenStyle(style)) (box.tableCell && (contract.overflowBlock ?? 'fit') === 'fit' ? cellGrows : obligation)(contentBlock, scalar(contract.minBlockSize), box, region, 'E_LAYOUT_CONTENT', 'block', (contract.overflowBlock ?? 'fit') === 'fit', content('block', 'minBlockSize'));
      }
      let positioned;
      if (style.position === 'absolute') {
        const containing = available.containingBlock;
        if (!containing || !blockSize) throw new Error('Absolute box has no independently resolved local containing block');
        const origin = absoluteOrigin(style, containing, {inline, block:blockSize});
        // A viewport-fixed box with a pure translation is positioned visually
        // after layout; unlike ordinary absolute descendants it does not extend
        // the scrollable document by its untranslated rectangle. Preserve the
        // original layout coordinate for provenance and shift analysis.
        const fitOrigin = style.$fixed && containing.path === 'viewport' && affineOf(style) && !linearOf(style) && style.visibility === 'visible'
          ? translated(style, origin, {inline, block:blockSize}) : origin;
        if (!fitOrigin) throw Object.assign(new Error('Fixed painted origin cannot be resolved'), {code:'U_LAYOUT_CSS'});
        // Fully off-canvas drawers are intentionally outside the paint area. Keep
        // their original layout obligation and let the accessibility pass decide
        // whether hidden/offscreen controls are focusable. For partially visible
        // fixed boxes use the painted origin, on the precise region where visible.
        const pieces = fitOrigin === origin ? { yes: [region], no: [] } : partition(region, sum(fitOrigin.inline, inline), '>');
        for (const [part, fit] of [...pieces.yes.map(r=>[r,fitOrigin]), ...pieces.no.map(r=>[r,origin])]) {
          for (const [axis, dimension] of [['inline',inline],['block',blockSize]]) {
            // Against a containing block that clips on this axis, reaching past it is the box being cut off.
            const cut = containing.clips && containing.clips[axis === 'inline' ? 'x' : 'y'];
            obligation(fit[axis], scalar(0), box, part, cut ? 'E_LAYOUT_ABSOLUTE_CLIPPED' : 'E_LAYOUT_ABSOLUTE_START', axis);
            obligation(containing[axis], sum(fit[axis],dimension), box, part, cut ? 'E_LAYOUT_ABSOLUTE_CLIPPED' : 'E_LAYOUT_ABSOLUTE_END', axis);
          }
        }
        positioned = {origin:{inline:affine(origin.inline),block:affine(origin.block)},containingBlock:{path:containing.path,inline:affine(containing.inline),block:affine(containing.block)}};
      }
      const origin=resolvedOrigin(style,available,inline,blockSize,parents);
      const overflowValue=[style['overflow-x'],style['overflow-y']].find(v=>v!=='visible') ?? 'visible';
      // A box's own overflow clips its content, not its border box.
      const unscaledOrigin = origin ?? resolvedOrigin({...style,'overflow-x':'visible','overflow-y':'visible'},available,inline,blockSize,parents);
      const painted = scaled(style, unscaledOrigin, inline, blockSize), ownOrigin = painted.origin;
      // Inside an overflow: clip box positions are exact but parts may be clipped away: the other rules see no
      // position (as before), focus-clipped reads clipOrigin.
      const underClip = parents.some(p => p.clipScope);
      // Sticky inside an overflow: hidden box (a scroll container nobody scrolls): it sticks to that box, not to the page,
      // so it never sticks; at the initial scroll position it is where the flow puts it (a warning, laid out as relative).
      // overflow-x: clip with overflow-y visible is not a scroll container (CSS Overflow 3): a sticky box inside still
      // sticks to the page, and a horizontal clip does not cut its vertical sticking.
      const xClipOnly = p => p.style && p.style['overflow-x'] === 'clip' && p.style['overflow-y'] === 'visible';
      const scrolling = p => p.style && !xClipOnly(p) && ['overflow-x', 'overflow-y'].some(key => p.style[key] !== 'visible');
      const scroller = [...parents].reverse().find(scrolling);
      // A scroll container nobody scrolls vertically: overflow hidden, or overflow-x auto/scroll (so y computes to auto)
      // with a content-sized block size. A top/bottom sticky box sticks to it, which does not move, so it never sticks
      // to the page; at the initial scroll position it is where the flow puts it (a warning, laid out as relative).
      // A sticky left/right box (a sticky first column) does stick inside a horizontal scroller: not judged here.
      const stillY = p => ['overflow-x', 'overflow-y'].every(key => p.style[key] === 'hidden')
        || (['auto', 'scroll'].includes(p.style['overflow-x']) && ['visible', 'auto', 'hidden'].includes(p.style['overflow-y']) && p.style['block-size'] === 'auto' && ['none', undefined].includes(p.style['max-block-size']) && p.style['overflow-y'] !== 'scroll');
      const horizontalStick = ['left', 'right'].some(side => style[side] !== undefined && style[side] !== 'auto');
      if (style.$sticky && scroller && !horizontalStick && stillY(scroller) && !parents.some(p => p !== scroller && scrolling(p))) {
        const how = ['overflow-x', 'overflow-y'].every(key => scroller.style[key] === 'hidden') ? 'overflow: hidden' : `overflow-x: ${scroller.style['overflow-x']} (so its overflow-y is auto) and no height of its own`;
        if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER' && w.path === box.path)) layoutWarnings.push({ code: 'W_LAYOUT_STICKY_SCROLLER', severity: 'warning', box: box.label, path: box.path, scroller: scroller.box.label,
          message: `${box.label} is position: sticky inside ${scroller.box.label}, which has ${how}: it sticks to that box, which does not scroll vertically, so it never sticks to the page. Use overflow-x: clip on the ancestor (not a scroll container), or move the sticky box out of it`, ...ranges(region) });
        style = { ...style, $sticky: false };
      }
      if (style.$sticky && parents.some(p => (p.clipped || p.clipScope || scrolling(p)) && !xClipOnly(p))) throw Object.assign(new Error(`${box.label} is position: sticky inside a scrolling or clipping ancestor, which it would stick to`), { code: 'U_LAYOUT_CSS' });
      // @starting-style (checklist A1): a starting value that lays out, of a property this box transitions, eases from it
      // to the settled value when the box appears — a two-keyframe animation from the starting values (the settled
      // values are the implicit 100%). Untransitioned starting values are never drawn.
      if (startingRules.length && !box.pseudo) {
        const won = new Map(), rankCmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
        for (const rule of startingRules) {
          if (rule.contexts?.length) continue; // conditional starting rules: not modeled here (Unknown below)
          const hit = rule.selectors.filter(sel => matches(sel, box, new Set())).sort((a, b) => rankCmp(b.specificity, a.specificity))[0];
          if (!hit) continue;
          for (const d of rule.declarations) { const prior = won.get(d.property); const rank = [d.important ? 1 : 0, ...hit.specificity, rule.order]; if (!prior || rankCmp(rank, prior.rank) > 0) won.set(d.property, { ...d, rank, rule }); }
        }
        if (startingRules.some(rule => rule.contexts?.length && rule.selectors.some(sel => matches(sel, box, new Set())))) throw Object.assign(new Error(`${box.label} has a @starting-style rule inside a conditional rule, which is not modeled`), { code: 'U_LAYOUT_CSS' });
        const transitions = transitionsOf(style), seconds = v => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(m?s)$/.exec(String(v)); return m ? Number(m[1]) / (m[2] === 'ms' ? 1000 : 1) : 0; };
        const covering = property => transitions.findLast(t => (t.property === 'all' || t.property === property || property.startsWith(`${t.property}-`)) );
        const groups = new Map();
        for (const [property, d] of won) {
          const t = covering(property);
          if (!t || !(seconds(t.duration) > 0)) continue;
          const key = `${t.duration}|${t.easing}`;
          if (!groups.has(key)) groups.set(key, { t, layout: [] });
          groups.get(key).layout.push(`${property}:${d.value}`);
        }
        for (const { t, layout } of groups.values()) {
          const name = `@starting-style of ${box.label} (${t.duration} ${t.easing})`;
          keyframeFrames.set(name, [{ offset: 0, props: {}, layout: layout.join(';') }]);
          animated.push({ box, region, name, position: style.position, duration: t.duration, count: '1', direction: 'normal', easing: t.easing, style });
        }
      }
      // Each animation of the list (animationsOf repeats the longhand lists to the names).
      // A scroll-driven animation (scroll() / view()) runs with the scroll position whatever its duration.
      for (const a of animationsOf(style)) { const scrollDriven = /^(?:scroll|view)\(/.test(a.timeline); if (a.playState !== 'paused' && (scrollDriven || !/^-?0+(?:\.0+)?m?s$/.test(a.duration)) && keyframeFrames.get(a.name)?.some(frame => frame.layout)) animated.push({ box, region, name: a.name, position: style.position, duration: a.duration, count: a.count, direction: a.direction, easing: a.easing, delay: a.delay, fill: a.fill, scrollDriven, style }); }
      checkSettledStyle({box,style,region,parents,emit,cover,options,metaViewport:root.metaViewport,fontFaces,rules,layoutWarnings,ranges});
      geometry.push({ box, path: box.path, region, origin: underClip ? null : ownOrigin, ...(style.$listItem && style['list-style-type'] !== 'none' && style['list-style-position'] !== 'inside' && style.direction !== 'rtl' ? { outsideMarker: style['list-style-type'] } : {}), ...(style.display === 'grid' && /^(?:\s*(?:repeat\(\s*\d+\s*,\s*\d+(?:\.\d+)?px\s*\)|\d+(?:\.\d+)?px))+\s*$/.test(String(style['grid-template-columns'])) ? { fixedTracks: style['grid-template-columns'] } : {}), ...((box.text || box.inline?.length) && !box.pseudo && ['normal', 'pre-wrap', 'pre-line'].includes(style['white-space']) && style['overflow-wrap'] === 'normal' ? { wrapsByWords: true } : {}), ...(style.$widthFromAttribute ? { widthFromAttribute: style.$widthFromAttribute } : {}), ...(/\dvw\b|\bvw\)/.test(String(style.$sources?.['inline-size']?.specified ?? '')) ? { vwInline: style.$sources['inline-size'].specified } : {}), ...(/^100%$/.test(String(style.$sources?.['inline-size']?.specified ?? '').trim()) && ['left', 'right'].some(side => /^\d+(?:\.\d+)?px$/.test(String(style[`margin-${side}`])) && cmp(px(style[`margin-${side}`]), zero) > 0) ? { fullWidthMargins: ['left', 'right'].map(side => `margin-${side}`).filter(key => /^\d+(?:\.\d+)?px$/.test(String(style[key])) && cmp(px(style[key]), zero) > 0).map(key => `${key}: ${style[key]}`) } : {}), ...(style['box-sizing'] === 'content-box' && /^100%$/.test(String(style.$sources?.['inline-size']?.specified ?? '').trim()) && ['left', 'right'].some(side => cmp(px(style[`padding-${side}`] === 'ua' ? '0' : style[`padding-${side}`]), zero) > 0 || cmp(px(style[`border-${side}`] === 'ua' ? '0' : style[`border-${side}`]), zero) > 0) ? { contentBoxFull: ['left', 'right'].flatMap(side => [`padding-${side}`, `border-${side}`]).filter(key => style[key] && !['0', '0px', 'ua'].includes(String(style[key]))) } : {}), ...(style.$imageRatio ? { imageRatio: style.$imageRatio } : {}), clipOrigin: ownOrigin, ...(style.position === 'absolute' ? { containingPath: available.containingBlock?.path } : {}), ...(style.$fixed ? { fixed: true } : {}), ...(style.$uaControl ? { uaControl: true } : {}), ...(style.$sticky ? { sticky: { parent: parents.at(-1)?.box.path ?? null } } : {}), inline: painted.inline, block: painted.block, position: style.position,
        borders: Object.fromEntries(['left','right','top','bottom'].map(side => [side, px(style[`border-${side}`])])),
        // Content aligned towards the end (center, end): overflowing content may lie before the start edge.
        ...(['justify-content', 'align-content', 'align-items'].some(key => /^(?:center|end|flex-end|unsafe\b)/.test(String(style[key] ?? ''))) ? { alignsContent: true } : {}),
        ...((/^(?:0|\d+(?:\.\d+)?px)$/.test(String(style['padding-bottom'])) || viewportLength(style['padding-bottom'])) ? { paddingBlockEnd: padding(style, 'bottom') } : {}),
        ...((/^(?:0|\d+(?:\.\d+)?px)$/.test(String(style['padding-right'])) || viewportLength(style['padding-right'])) ? { paddingInlineEnd: padding(style, 'right') } : {}),
        // overflow: clip clips without scrolling (hidden still scrolls a focused descendant into view).
        clipAxes: { inline: style['overflow-x'] === 'clip', block: style['overflow-y'] === 'clip' },
        overflow: ['hidden','clip'].includes(overflowValue) ? 'clip' : ['auto','scroll'].includes(overflowValue) ? 'scroll' : 'visible', overflowValue,
        // Where a single line of text starts inside the box (font-derived text extents).
        content: { left: edgeValue(style, 'left'), top: edgeValue(style, 'top'), inline: contentInline },
        textAlign: style['text-align'], lineHeight: style['line-height'], direction: style.direction, overflowX: style['overflow-x'], painted: paints(style),
        // z-index applies to positioned boxes and to grid/flex items.
        zIndex: style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(parents.at(-1)?.style.display)) ? Number(style['z-index']) : null,
        paint: paintFacts(style), chain: [...ancestorPaint, ...parents.map((parent, i) => captionBackdrop(parent, parents[i + 1]?.box ?? box, paintFacts(parent.style))), paintFacts(style)],
        contentBlockSize: contentBlock ?? null, fontSize: style['font-size'],
        // The focused paint (paint-only :focus/:focus-visible/:focus-within rules) of focusable boxes.
        ...(focusableBox(box) || box.tag === 'a' ? { hoverStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, hoverState).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
        // (a transition too, checklist E4: whether reduce shortens it)
        ...(style['animation-name'] !== 'none' || /[1-9]/.test(String(style['transition-duration'] ?? '')) ? { reducedMotion: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set(['prefers-reduced-motion:reduce'])).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
        // Both checked states of a checkbox/radio (paint-only :checked rules), for the checked-indicator rule.
        // A ::before/::after generated in a state is described by its content and paint (`marks`); one that is not
        // absolutely positioned would move the layout (`markUnknown`).
        ...(box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType) ? { checkedStates: ['checked', 'unchecked'].map(name => styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set([name])).flatMap(s => {
          const owner = [...parents.map(p => ({ ...p, names: p.names ?? [] })), { box, style: s.style, names: [] }];
          let pieces = [{ region: s.region, marks: [], markUnknown: false }];
          for (const kind of ['before', 'after']) pieces = pieces.flatMap(piece => styles({ ...box, pseudo: kind }, piece.region, owner, s.style, false, false, new Set([name])).map(m => {
            const generated = !['none', 'normal'].includes(String(m.style.content ?? 'none')) && m.style.display !== 'none';
            return { region: m.region, marks: generated ? [...piece.marks, JSON.stringify([kind, m.style.content, m.style['background-color'], m.style.color, m.style.visibility, m.style.opacity])] : piece.marks, markUnknown: piece.markUnknown || (generated && m.style.position !== 'absolute') };
          }));
          return pieces.map(piece => ({ region: piece.region, paint: paintFacts(s.style), marks: piece.marks.join('|'), markUnknown: piece.markUnknown }));
        })) } : {}),
        // The placeholder text's paint (::placeholder rules; Chromium's UA color is rgb(117, 117, 117), measured).
        ...(box.placeholder && ['input', 'textarea'].includes(box.tag) ? { placeholderPaint: styles({ ...box, pseudo: 'placeholder' }, region, [...parents, { box, style, names: [] }], style, false, false, new Set(['::placeholder'])).map(s => ({ region: s.region, color: s.style.$sources.color ? s.style.color : '#757575', opacity: s.style.opacity })) } : {}),
        ...(focusableBox(box) ? { focusStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, focusState).map(s => ({ region: s.region, paint: paintFacts(s.style), authorOutline: Boolean(s.style.$sources['outline-style']), ...focusMove(box, style, s.style, available, inline, blockSize, parents), ...(s.style['z-index'] !== style['z-index'] ? { zIndex: s.style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(parents.at(-1)?.style.display)) ? Number(s.style['z-index']) : null } : {}) })) } : {}) });
      if (box.inline?.length) inlineContent(box, style, region, [...parents, { box, style }], geometry.at(-1).chain, geometry.at(-1));
      const shown = scaled(style, parents.some(p => p.clipScope) ? null : origin, inline, blockSize);
      const rect=shown.origin && shown.block ? {inlineStart:affine(shown.origin.inline),blockStart:affine(shown.origin.block),inlineSize:affine(shown.inline),blockSize:affine(shown.block)} : null;
      const sizeRow = { box: box.label, path: box.path, position:style.position, ...positioned,...(rect ? {rect} : {}), boxSizing: style['box-sizing'], boxSizingSource: style.$sources['box-sizing'],
        paddingInlineSize:affine(diff(inline,scalar(add(px(style['border-left']),px(style['border-right']))))),
        ...(blockSize ? {paddingBlockSize:affine(diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))))} : {}),
        // Explicit absolute sizing determines its public allocation independently
        // from child requirements. The enclosing padding box stays separate.
        allocatedInlineSize:affine(style.position==='absolute' ? inline : available.inline),
        ...(available.block ? {allocatedBlockSize:affine(style.position==='absolute' ? blockSize : available.block)} : {}),
        inlineSize:affine(inline),contentInlineSize:affine(contentInline),
        ...(blockSize ? {blockSize:affine(blockSize)} : {}),...(contentBlock ? {contentBlockSize:affine(contentBlock)} : {}),...ranges(region) };
      Object.defineProperty(sizeRow, '$shown', { value: { region, ...shown }, writable: true, enumerable: false });
      sizes.push(sizeRow);
      // rtl: the container places its children mirrored in its content box (each child's subtree moves; its own
      // interior follows its own direction). Absolute descendants use physical insets, so they are not modeled here.
      if (style.direction === 'rtl' && box.children.length && origin && box.$starts) {
        const L = sum(origin.inline, edgeValue(style,'left')), R = diff(sum(origin.inline, inline), edgeValue(style,'right'));
        const childOf = path => path.slice(0, path.lastIndexOf('/')) === box.path;
        const rows = geometry.slice(box.$starts.geometry), sizeRows = sizes.slice(box.$starts.sizes);
        // An absolute child is placed by physical insets: the container does not mirror it.
        for (const child of rows.filter(row => childOf(row.path) && row.position !== 'absolute' && intersectRegions(row.region, region) && (row.origin || row.clipOrigin))) {
          const at = child.origin ?? child.clipOrigin, dx = diff(diff(sum(L, R), times(at.inline, q(2))), child.inline);
          // An absolute box keeps its physical place unless its containing block moves with this child.
          const within = path => path === child.path || isDescendant(child.path, path);
          const stays = rows.filter(row => row.position === 'absolute' && row !== child && isDescendant(child.path, row.path) && !(row.containingPath && within(row.containingPath))).map(row => row.path);
          const moved = row => (row === child || (isDescendant(child.path, row.path) && intersectRegions(row.region, child.region))) && !stays.some(path => row.path === path || isDescendant(path, row.path));
          const shift = o => o ? { inline: sum(o.inline, dx), block: o.block } : o;
          for (const row of rows.filter(row => moved(row) && !row.$mirrored?.has(box.path))) {
            row.origin = shift(row.origin); row.clipOrigin = shift(row.clipOrigin);
            if (row.bounds) row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && { ...piece.outer, origin: shift(piece.outer.origin) }, inner: piece.inner && { ...piece.inner, origin: shift(piece.inner.origin) } }));
            (row.$mirrored ??= new Set()).add(box.path);
          }
          for (const row of sizeRows.filter(row => row.$shown && (row.path === child.path || isDescendant(child.path, row.path)) && !stays.some(path => row.path === path || isDescendant(path, row.path)) && intersectRegions(row.$shown.region, child.region))) {
            row.$shown = { ...row.$shown, origin: shift(row.$shown.origin) };
            if (row.rect && row.$shown.origin) row.rect = { ...row.rect, inlineStart: affine(row.$shown.origin.inline) };
          }
        }
      }
      // An arbitrary rotation: the box's circumscribed rectangle (an upper bound: |cos|·w/2 + |sin|·h/2 per half
      // extent, rounded up) is what it may cover; its descendants have no position either.
      // Composed with translations and scales (linear-any, checklist B2): |L11|·w/2 + |L12|·h/2 and |L21|·w/2 + |L22|·h/2
      // per half extent, about the centre moved by the translation t + W·u + H·w (each rounded outward by 1e-5 px).
      const turn = /^rotate-any\((-?[\d.]+)\)$/.exec(String(style.transform)), general = /^linear-any\((.+)\)$/.exec(String(style.transform));
      if ((turn || general) && origin && blockSize) {
        const radians = turn ? Number(turn[1]) * Math.PI / 180 : 0, up = v => q(String(Math.ceil(Math.abs(v) * 1e6 + 1) / 1e6));
        const L = general ? general[1].split(' ').map(Number) : [Math.cos(radians), -Math.sin(radians), Math.sin(radians), Math.cos(radians), 0, 0, 0, 0, 0, 0];
        const half = div(one, q(2)), slack = q('0.00001');
        const extentInline = sum(sum(times(inline, mul(up(L[0]), half)), times(blockSize, mul(up(L[1]), half))), scalar(slack)), extentBlock = sum(sum(times(inline, mul(up(L[2]), half)), times(blockSize, mul(up(L[3]), half))), scalar(slack));
        const exactly = v => q((Math.round(v * 1e6) / 1e6).toFixed(6));
        const move = k => sum(sum(scalar(exactly(L[4 + k])), times(inline, exactly(L[6 + k]))), times(blockSize, exactly(L[8 + k])));
        const centre = { inline: sum(sum(origin.inline, times(inline, half)), move(0)), block: sum(sum(origin.block, times(blockSize, half)), move(1)) };
        const own = geometry.findLast(row => row.path === box.path && intersectRegions(row.region, region));
        if (own) own.rotatedBounds = { origin: { inline: diff(centre.inline, extentInline), block: diff(centre.block, extentBlock) }, inline: times(extentInline, q(2)), block: times(extentBlock, q(2)) };
        if (box.$starts) for (const row of geometry.slice(box.$starts.geometry).filter(row => isDescendant(box.path, row.path) && intersectRegions(row.region, region))) { row.origin = null; row.clipOrigin = null; row.rotatedBy = box.path; }
      }
      // A scale maps the painted descendants too: r ↦ C + s·(r − C) about the box's centre C (affine, s constant).
      const matrix = linearOf(style);
      if (matrix && (box.children.length || box.inline?.length) && origin && blockSize && box.$starts) {
        const half = div(one, q(2));
        const map = mapper(matrix, { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) });
        const inside = row => isDescendant(box.path, row.path) && intersectRegions(row.region, region);
        for (const row of geometry.slice(box.$starts.geometry).filter(inside)) {
          Object.assign(row, map(row));
          if (row.bounds) row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && map(piece.outer), inner: piece.inner && map(piece.inner) }));
        }
        for (const row of sizes.slice(box.$starts.sizes).filter(row => row.$shown && isDescendant(box.path, row.path) && intersectRegions(row.$shown.region, region))) {
          const moved = map(row.$shown);
          row.$shown = { ...row.$shown, ...moved };
          if (row.rect && moved.origin && moved.block) row.rect = { inlineStart: affine(moved.origin.inline), blockStart: affine(moved.origin.block), inlineSize: affine(moved.inline), blockSize: affine(moved.block) };
        }
      }
    }
    if (!box.children.length) {
      if (box.text && contract.minInlineSize === undefined && (contract.overflow ?? 'fit') === 'fit') unknown('U_LAYOUT_INTRINSIC', 'Text needs a minInlineSize bound or an explicit overflow policy', undefined, box);
      if (block && box.text && (contract.overflowBlock ?? 'fit') === 'fit' && !style.$lineClamp) {
        if (contract.intrinsicBlockSize !== undefined) for (const required of intrinsic(box, contentInline, region)) {
          // Wrapped text reports the lines it needs at this width and how many the box holds.
          const needed = contract.textMetrics?.kind === 'lines' ? Math.round(number(evaluate(required.value, { x: zero, y: zero })) / contract.font.lineHeight) : 0;
          const annotate = needed ? offered => ({ text: { lines: needed, fitsLines: fittingLines(contract.font.lineHeight, offered, needed) } }) : undefined;
          if (emit && !visuallyHiddenStyle(style)) (box.tableCell ? cellGrows : obligation)(contentBlock, required.value, box, required.region, 'E_LAYOUT_CONTENT', 'block', true, undefined, annotate);
        }
        else if (contract.minBlockSize === undefined) unknown('U_LAYOUT_INTRINSIC', 'Text needs a block-height contract or an explicit overflowBlock policy', undefined, box);
      }
    }
    return { region, inline, block: blockSize };
  }

  const {translated, resolvedOrigin, untranslatedOrigin, subgridGeometry} = createPositionSolver({block, preferences, rootFontSize: () => rootFontSize, resolvedGap, bounded, diagnostics, ranges, subgrids});

  const tableAsGrid = (table, style, region, parents, emit, available, probe) => tableAsGridImpl({styles, uaEngine}, table, style, region, parents, emit, available, probe);
  // The table's background paints the table box only, not its caption (measured): content of the
  // caption sees through the table's background.
  function captionBackdrop(parent, next, paint) {
    return parent.box.tag === 'table' && next?.tableCaption ? { ...paint, backgroundColor: 'transparent', backgroundImage: 'none' } : paint;
  }
  const frAutoMinimums = createIntrinsicSolver(styles);
  const renderedLegend = (box, style, region, parents) => measureLegend(styles, box, style, region, parents);
  function placeLegend(rendered, origin, region, ancestors, emit) {
    if (rendered.hidden) return;
    const inline = scalar(rendered.inlineSize), block = scalar(rendered.blockSize);
    const legendOrigin = origin ? { inline: sum(origin.inline, scalar(rendered.offset.inline)), block: sum(origin.block, scalar(rendered.offset.block)) } : null;
    finish(rendered.box, rendered.style, region, inline, diff(inline, scalar(rendered.horizontal)), block, diff(block, scalar(rendered.vertical)),
      { inline, block, ...(legendOrigin ? { origin: legendOrigin } : {}) }, ancestors, emit);
  }
  let rootFontSize = null;
  // Safe-area insets: the declared ones under viewport-fit=cover (Unknown when not declared), else 0.
  const cover = /viewport-fit\s*=\s*cover/i.test(String(root.metaViewport ?? ''));
  setSafeArea(cover ? (options.safeArea ? { top: 0, right: 0, bottom: 0, left: 0, ...options.safeArea } : 'unknown') : null);
  unitContext.rootFontSize = null; setRootFontSize(null); setUAProfile(resolveUAProfile(options.ua)); uaEngine = resolveUAProfile(options.ua)?.engine; unitContext.heightKnown = Boolean(block && options.viewport.height);
  // A flex item's main size that a non-auto flex-basis replaces, when no automatic minimum reads it (flex.mjs keeps
  // that case Unknown): the property, or null. The layout treats it as auto; finish() reports it as inert.
  function inertMainSize(style, box, main) {
    const size = main === 'block' ? 'block-size' : 'inline-size';
    if (!style.$sources?.[size] || style[size] === 'auto' || ['auto', 'content'].includes(String(style['flex-basis']))) return null;
    const scroller = !['visible', 'clip'].includes(String(style['overflow-x'])) || !['visible', 'clip'].includes(String(style['overflow-y']));
    const empty = !(box.children ?? []).length && !box.text && !box.inline?.length;
    return style[`min-${size}`] !== 'auto' || scroller || empty ? size : null;
  }
  // Shared by actual sizing and block-flow auto-margin placement. CSS uses
  // the final border-box width (after min/max and edge floors), not the
  // specified preferred width, to distribute remaining inline space.
  function solve(box, available, region, parents = [], inherited, emit = true) {
    let results = [];
    if (emit) box.$starts = { geometry: geometry.length, sizes: sizes.length };
    try {
      // A table with measured rowspan cells whose width varies: split the region where a cell's line count changes.
      const tableStates = state => {
        if (box.tag !== 'table' || state.style.display !== 'table') return [state];
        const probe = [];
        try { tableAsGrid(box, state.style, state.region, parents, false, available, probe); } catch { return [state]; }
        let pieces = [state.region];
        for (const { inner, thresholds } of probe) for (const t of thresholds) pieces = pieces.flatMap(r => { const p = partition(r, diff(inner, scalar(t)), '>='); return [...p.yes, ...p.no]; });
        if (pieces.length > 256) throw new Error('Table region limit exceeded');
        return pieces.map(r => ({ ...state, region: r }));
      };
      for (const state of styles(box, region, parents, inherited, emit, !available.root).flatMap(tableStates)) {
        let { style } = state;
        // F55: a percentage top / bottom of a relative box refers to its containing block's height; in a block-flow parent
        // of auto height that is not definite, so it is auto: the box does not move (measured in Chromium, Firefox and
        // WebKit; a grid area resolves it, differently in WebKit, so only block flow).
        // The parent's auto height is indefinite only where the parent is itself in block flow (a stretched grid or flex
        // item has a definite height, against which Chromium and Firefox resolve the percentage: measured).
        const grand = parents.at(-2), parentInBlockFlow = !!grand && (grand.style?.$blockFlow || (grand.style?.display === 'block' && !grand.box?.text)) && !['absolute', 'fixed'].includes(String(parents.at(-1)?.style?.position)) && !parents.at(-1)?.style?.$fixed;
        if (inherited?.$blockFlow && parentInBlockFlow && !available.root && style.position === 'relative' && String(inherited['block-size'] ?? 'auto') === 'auto') {
          const pct = ['top', 'bottom'].filter(key => /%$/.test(String(style[key] ?? '')));
          if (pct.length) {
            if (emit && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(pct[0])))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: pct, css: pct.filter(key => style.$sources?.[key]).map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
                message: `${box.label}: ${pct.map(key => `${key}: ${style[key]}`).join(', ')} does nothing: a percentage ${pct.length === 1 ? pct[0] : 'top / bottom'} refers to the containing block's height, and its parent has no height (auto), so it is treated as auto. Give the parent a height, or use transform: translateY(${style[pct[0]]}) (a percentage of the box itself)` });
            style = { ...style, ...Object.fromEntries(pct.map(key => [key, 'auto'])) };
          }
        }
        // F56: a percentage height (or min / max height) refers to the containing block's height; in a block-flow parent
        // of auto height that is itself in block flow it is not definite, so height is auto, min-height 0, max-height none
        // (CSS 2.2 §10.5; measured in Chromium, Firefox and WebKit — under a grid the parent's height is definite).
        if (inherited?.$blockFlow && parentInBlockFlow && !available.root && !['absolute', 'fixed'].includes(style.position) && !style.$fixed && String(inherited['block-size'] ?? 'auto') === 'auto') {
          const idle = { 'block-size': 'auto', 'min-block-size': 'auto', 'max-block-size': 'none' };
          const pct = Object.keys(idle).filter(key => /%$/.test(String(style[key] ?? '')));
          if (pct.length) {
            const names = { 'block-size': 'height', 'min-block-size': 'min-height', 'max-block-size': 'max-height' };
            if (emit && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes(pct[0])))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: pct, css: pct.filter(key => style.$sources?.[key]).map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
                message: `${box.label}: ${pct.map(key => `${names[key]}: ${style[key]}`).join(', ')} does nothing: a percentage height refers to the parent's height, and ${parents.at(-1)?.box?.label ?? 'its parent'} has none (auto), so it is ignored. Give the parent a height, or make it a flex or grid container and stretch this box` });
            style = { ...style, ...Object.fromEntries(pct.map(key => [key, idle[key]])) };
          }
        }
        // F53: an in-flow child of a block-flow parent has auto margin-top / margin-bottom of 0 (see the collect step).
        if (inherited?.$blockFlow && !available.root && !['absolute', 'fixed'].includes(style.position) && !style.$fixed && ['margin-top', 'margin-bottom'].some(key => String(style[key]) === 'auto'))
          style = { ...style, ...Object.fromEntries(['margin-top', 'margin-bottom'].filter(key => String(style[key]) === 'auto').map(key => [key, '0'])) };
        // A grid container whose only content is text (a chat bubble: display: grid on the p) has one anonymous grid
        // item holding it. With one minmax(0, 1fr) column, no row tracks and no item or content alignment, that item
        // fills the content box and its row is the text's height: the same as a block text leaf, which it is laid out as.
        const norm = v => String(v ?? '').replace(/\s+/g, '');
        if (style.display === 'grid' && !style.$blockFlow && box.text && !box.children.length && !box.pseudo && norm(style['grid-template-columns']) === 'minmax(0,1fr)'
          && style['grid-template-rows'] === 'none' && ['auto'].includes(String(style['grid-auto-rows'])) && style['grid-template-areas'] === 'none'
          && ['normal', 'stretch'].includes(String(style['align-items'])) && ['normal', 'stretch', 'legacy'].includes(String(style['justify-items'] ?? 'normal'))
          && ['normal', 'start', 'stretch'].includes(String(style['align-content'])) && ['normal', 'start', 'stretch'].includes(String(style['justify-content'])))
          style = { ...style, display: 'block', 'grid-template-columns': 'none', 'align-content': 'normal', 'justify-content': 'normal', $anonymousGridText: true };
        // A block container whose only child is one inline phrasing element with text (<p><a>Read more</a></p>,
        // <li><a>Item</a></li>) is a text leaf with that element as its inline content: it takes the element's
        // text contract. In a grid or flex container the element would be an item instead (not folded).
        if (style.display === 'block' && !box.text && !box.inline?.length && box.children.length && !box.pseudo) {
          const kids = box.children, textual = k => k.text || k.inline?.length;
          // Only elements that stay display: inline and in flow are folded (nav > a { display: block } is a block-level
          // child; an absolutely positioned badge in a button is out of flow).
          const staysInline = k => { try { return styles(k, state.region, [...parents.map(p => ({ ...p, names: [] })), { box, style, names: [] }], style, false, false).every(s => s.style.display === 'inline' && s.style.position === 'static' && s.style.float === 'none'); } catch { return true; } };
          const allInline = kids.every(k => phrasingTags.has(k.tag) && k.tag !== 'img' && !(k.children ?? []).length) && kids.every(staysInline);
          // One element: it brings its text contract. Several: the container's own contract sizes the line(s).
          if (allInline && kids.length === 1 && textual(kids[0]) && kids[0].contract && !box.contract)
            box = { ...box, text: true, inline: kids, children: [], contract: kids[0].contract, $foldedInline: true };
          else if (allInline && kids.length > 1 && kids.some(textual) && box.contract)
            box = { ...box, text: true, inline: kids, children: [], $foldedInline: true };
        }
        // A percentage height against a parent whose height depends on its content (block flow in block flow, auto
        // height) computes to auto (CSS 2.2 §10.5; measured: height: 100% changes nothing there).
        {
          const parent = parents.at(-1), grand = parents.at(-2);
          const blockish = st => st && ['block', 'list-item'].includes(String(st.display)) && !st.$blockFlowGrid;
          // (Also in a grid item, or the item of a row flex container, that is aligned rather than stretched: its auto
          // height depends on its content too — measured in Chromium, Firefox and WebKit, checklist D2.)
          const alignedItem = grand && !grand.style.$blockFlow && String(parent?.style['block-size']) === 'auto' && (['grid', 'inline-grid'].includes(String(grand.style.display)) || (['flex', 'inline-flex'].includes(String(grand.style.display)) && !String(grand.style['flex-direction']).startsWith('column')))
            && crossAlignment(grand.style['align-items'], parent.style['align-self']) !== 'stretch';
          if (/^\d+(?:\.\d+)?%$/.test(String(style['block-size'])) && style.position === 'static' && parent && grand && blockish(parent.style) && (blockish(grand.style) || alignedItem) && String(parent.style['block-size']) === 'auto' && !['html', 'body'].includes(parent.box.tag) && !available.percentBlock && !box.pseudo) {
            if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('block-size')))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['block-size'], ...(style.$sources?.['block-size'] ? { css: [{ property: 'block-size', file: style.$sources['block-size'].file, line: style.$sources['block-size'].line, selector: style.$sources['block-size'].selector }] } : {}),
                message: `${box.label}: block-size: ${style['block-size']} has no effect (its parent ${parent.box.label} has an auto height, which depends on its content, so a percentage height computes to auto). Give ${parent.box.label} a height, or make it a grid or flex container that stretches ${box.label}`, ...ranges(state.region) });
            style = { ...style, 'block-size': 'auto' };
          }
        }
        const inertMain = available.flexItem && style.position !== 'absolute' ? inertMainSize(style, box, available.flexItem.main) : null;
        if (inertMain) style = { ...style, [inertMain]: 'auto', $inertMain: { property: inertMain, value: style[inertMain] } };
        // A flex item's main size is the one its container resolved (grown, shrunk or clamped by its min/max, §9.7) and
        // passes down as the available size; its own width or height is only the base (measured: width: 50px with
        // flex-grow: 2 is 240px wide in a 300px row).
        else if (available.flexItem && style.position !== 'absolute') {
          const size = available.flexItem.main === 'block' ? 'block-size' : 'inline-size';
          const given = available[available.flexItem.main];
          // Unchanged (the item neither grew nor shrank, nor was clamped): keep its own size, which other rules read.
          const sides = available.flexItem.main === 'block' ? ['top', 'bottom'] : ['left', 'right'];
          const own = /^\d+(?:\.\d+)?px$/.test(String(style[size])) ? add(px(style[size]), style['box-sizing'] === 'content-box' ? sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero) : zero) : null;
          const same = own && given && cmp(given.x, zero) === 0 && cmp(given.y, zero) === 0 && cmp(evaluate(given, { x: zero, y: zero }), own) === 0;
          if (style[size] !== 'auto' && given && !same) style = { ...style, [size]: 'auto', $flexMain: style[size] };
        }
        if (box.tag === 'html' && !parents.length && /^\d+(?:\.\d{1,6})?px$/.test(style['font-size'])) { rootFontSize = px(style['font-size']); unitContext.rootFontSize = rootFontSize; setRootFontSize(rootFontSize); }
        // defaultFontSize (the user's default font size, an assumption the caller states): the root's medium, %, em
        // or rem font-size resolves against it, so rem lengths do too.
        else if (box.tag === 'html' && !parents.length && options.defaultFontSize) {
          const fs = String(style['font-size']), base = q(String(options.defaultFontSize));
          const m = fs.match(/^(\d+(?:\.\d{1,6})?)(%|em|rem)$/);
          const size = ['medium', 'ua-default', 'initial', 'unset', 'revert'].includes(fs) ? base : m ? mul(base, m[2] === '%' ? div(q(m[1]), q('100')) : q(m[1])) : null;
          if (size) { rootFontSize = size; unitContext.rootFontSize = size; setRootFontSize(size); }
        }
        // A fixed table is laid out as its equivalent grid (rows and sections as contents, cells as blocks).
        if (box.tag === 'table' && style.display === 'table') style = tableAsGrid(box, style, state.region, parents, emit, available);
        if (!['grid', 'flex'].includes(style.display) && style.display !== 'none') { const generatedText = generatedElsewhere(box, state.region, [...parents, { box, style }], style); if (generatedText) box.generated = generatedText; }
        // A cell's width seeds its column (the cell fills the column); its height stretches to the row.
        style = tablePlacement(box, style);
        style = frAutoMinimums(box, style, state.region, parents);
        // min-block-size on a grid or flex container (auto height, not stretched by its parent): Grid §12.7.1 and
        // Flexbox §9.4 size the tracks or the line again against the container at its minimum, so where the natural
        // height falls short it lays out as if its height were the minimum (rows, fr rows and the flex line stretch).
        if (block && ['grid', 'inline-grid', 'flex', 'inline-flex'].includes(style.display) && !['auto', '0', '0px'].includes(String(style['min-block-size'])) && style['block-size'] === 'auto'
          // (Also an aligned item of a flex row: its cross size is its content raised to the minimum, like a grid item's.)
          && !available.$minNatural && !available.$minRaised && !available.root && !(available.flexItem && !(available.flexItem.main === 'inline' && available.alignBlock !== undefined)) && !available.flexBlockMinimum && !(available.block && available.alignBlock === undefined)) {
          const edges = ['top', 'bottom'].map(side => sum(style[`padding-${side}`] === 'ua' ? scalar(zero) : asAffine(padding(style, side)), scalar(style[`border-${side}`] === 'ua' ? zero : px(style[`border-${side}`])))).reduce(sum, scalar(zero));
          for (const natural of solve(box, { ...available, $minNatural: true }, state.region, parents, inherited, false)) {
            if (!natural.block) throw new Error('CSS min-block-size on a container whose height is not known is not modeled');
            for (const m of lengthPieces(style['min-block-size'], available.percentBlock ?? available.block, natural.region, style)) {
              const minimum = style['box-sizing'] === 'content-box' ? sum(m.value, edges) : m.value;
              const split = partition(m.region, diff(natural.block, minimum), '>=');
              for (const r of split.yes) results.push(...solve(box, { ...available, $minNatural: true }, r, parents, inherited, emit));
              // (An aligned item keeps its area's size as block, for its offset; its own height is the raised one.)
              for (const r of split.no) results.push(...solve(box, available.alignBlock !== undefined ? { ...available, $raisedBlock: minimum, $minRaised: true } : { ...available, block: minimum, $minRaised: true }, r, parents, inherited, emit));
            }
          }
          continue;
        }
        if (hasViewportPadding(style) && (available.flexItem || box.tablePart || ['table','td','th','caption','fieldset','legend','input','textarea','select','button','img','svg','canvas','iframe','video','audio'].includes(box.tag) || style.position === 'absolute' || style['grid-template-columns'] === 'subgrid' || style['grid-template-rows'] === 'subgrid'))
          throw Object.assign(new Error('Viewport-dependent padding on intrinsic/positioned/flex-item/shared-track boxes is not modeled'), {code:'U_LAYOUT_CSS',box});
        if (hasViewportMargin(style) && (!block || !(available.gridItem || available.flexItem) || style.position !== 'static' || style.direction !== 'ltr' || box.pseudo || box.tablePart || !['block','grid','flex'].includes(style.display) || style['grid-template-columns'] === 'subgrid' || style['grid-template-rows'] === 'subgrid' || ['table','td','th','caption','fieldset','legend','input','textarea','select','button','img','svg','canvas','iframe','video','audio','html','body'].includes(box.tag)))
          throw Object.assign(new Error('Viewport-dependent margins require a supported in-flow grid, flex or block item with both axes'), {code:'U_LAYOUT_CSS',box});
        if (!validate(style, box, state.region, emit, available, parents.at(-1)?.style ?? null)) continue;
        // A fieldset's first legend is rendered in its block-start border (HTML §15.3.13): it is not a
        // layout child, and the fieldset's effective border-top is max(border-top, legend height).
        const rendered = renderedLegend(box, style, state.region, parents);
        if (rendered) style = { ...style, 'border-top': `${number(rendered.effectiveTop)}px` };
        if (box.tag==='body' && parents.at(-1)?.box.documentRoot && inherited['overflow-x']==='visible' && inherited['overflow-y']==='visible' && inherited['container-type']==='normal' && style['container-type']==='normal' && (style['overflow-x']!=='visible' || style['overflow-y']!=='visible')) throw Object.assign(new Error('Body overflow propagation requires explicit overflow on html; set html overflow to auto or hidden'),{code:'U_LAYOUT_SCROLLBAR'});
        const incoming=available;
        for (const frame of scrollbarFrames(style,scrollbarProfile,box.documentRoot)) {
        const active=frame.inlineSize>0 || frame.blockSize>0;
        if (active && (style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid')) throw Object.assign(new Error('Scrollbar insets on a shared subgrid axis need an adapter'),{code:'U_LAYOUT_SUBGRID',box,region:state.region,axis:'inline'});
        // Root scrollbars reduce the viewport; local scrollbars reduce the content box.
        const available=box.documentRoot ? {...incoming,inline:diff(incoming.inline,scalar(frame.inlineSize)),block:incoming.block ? diff(incoming.block,scalar(frame.blockSize)) : null,scrollbarFrame:active} : {...incoming,scrollbarFrame:active};
        if(emit && (active || ['auto','scroll'].includes(style['overflow-x']) || ['auto','scroll'].includes(style['overflow-y']))) scrollbars.push({box:box.label,path:box.path,...frame,viewport:Boolean(box.documentRoot),...ranges(state.region)});
        const edge = sides => sides.map(side => edgeValue(style, side)).reduce(sum, scalar(zero));
        const cssInlineEdges=edge(['left','right']),cssBlockEdges=edge(['top','bottom']);
        const inlineEdges = sum(cssInlineEdges,scalar(box.documentRoot ? 0 : frame.inlineSize)), blockEdges = sum(cssBlockEdges,scalar(box.documentRoot ? 0 : frame.blockSize));
        // The preferred width (a viewport unit or calc() may split the region), as a border-box size.
        // A grid item (or block-flow child) with an aspect-ratio, a definite height and an auto width is not
        // stretched: justify-self: normal behaves as start for it, and its width follows the ratio (Grid §6.2, CSS
        // Sizing 4; measured). Flex items stretch on the cross axis or size by flex: not this case.
        const ratioWidth = block && style['inline-size'] === 'auto' && ratioOf(style) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && available.gridItem && !available.flexItem
          && ['auto', 'normal'].includes(String(style['justify-self'] ?? 'auto')) && style.direction !== 'rtl' && !available.autoMargins?.inline;
        const ratioInline = () => {
          const h = length(style['block-size'], available.percentBlock ?? available.block, style), r = ratioOf(style);
          // ratio = height / width, on the box named by box-sizing.
          return style['box-sizing'] === 'content-box' ? sum(times(h, div(one, r)), cssInlineEdges) : times(h, div(one, r));
        };
        const preferredStates = preferredInlinePieces(style,available.percentInline ?? available.inline,state.region,cssInlineEdges,
          style['inline-size']==='auto' ? ratioWidth ? ratioInline() : available.inline : null);
        const edgeExplanation = axis => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), sizeProperties(axis).filter(property => /^(?:padding|border)-/.test(property)).map(property => fact(box, style, property)));
        for (const proposal of preferredStates) if (emit) obligation(proposal.value, inlineEdges, box, proposal.region, 'E_LAYOUT_BOX_EDGES', 'inline', true, edgeExplanation('inline'));
        const contentStates = preferredStates.flatMap(proposal => clamp(proposal.region, diff(proposal.value, inlineEdges)));
        for (const content of contentStates) {
          const inline = sum(content.value, inlineEdges), contentInline = content.value;
          // A text field's placeholder measured with its font (placeholderInlineSize): wider than the field's content
          // box, its end is cut off (the hint the user reads before typing).
          if (emit && box.contract?.placeholderInlineSize !== undefined && !layoutWarnings.some(w => w.code === 'W_A11Y_PLACEHOLDER_CLIPPED' && w.path === box.path)) {
            const cut = clip(content.region, diff(scalar(box.contract.placeholderInlineSize), contentInline), true);
            if (cut) { const p = sample(cut); layoutWarnings.push({ code: 'W_A11Y_PLACEHOLDER_CLIPPED', severity: 'warning', box: box.label, path: box.path, needs: box.contract.placeholderInlineSize,
              message: `${box.label}'s placeholder needs ${box.contract.placeholderInlineSize}px but the field shows ${number(evaluate(contentInline, p))}px at viewport ${number(p.x)}px: its end is cut off. Shorten the placeholder (or put the hint in a label) or widen the field`, ...ranges(cut) }); }
          }
          let fixedBlock = null;
          if (block) {
            if (style['block-size'] !== 'auto') fixedBlock = /^\d+(?:\.\d+)?(?:px|%)$/.test(style['block-size']) ? length(style['block-size'], available.percentBlock ?? available.block, style) : scalar(zero);
            // aspect-ratio with an auto block-size (an img, or a box with no content): the block size follows the
            // inline size, on the box named by box-sizing (the content box by default).
            else if (ratioOf(style) && (['img', 'video'].includes(box.tag) || (!(box.children ?? []).length && !box.text && !box.inline?.length))) {
              const r = ratioOf(style);
              // Where the container sets the block size, it wins over the ratio (measured: a growing column flex item,
              // and a grid item with an explicit align-self: stretch, take the container's size); that is not modeled.
              const parentStyle = parents.at(-1)?.style;
              const explicitStretch = String(style['align-self']) === 'stretch' || (['auto', 'normal'].includes(String(style['align-self'] ?? 'auto')) && String(parentStyle?.['align-items']) === 'stretch');
              const growing = available.flexItem?.main === 'block' && cmp(q(String(style['flex-grow'] ?? '0')), zero) > 0;
              // (A flex row stretches its items by default: align-items normal; measured: a ratio item is the line's height.)
              const rowStretch = available.flexItem?.main === 'inline' && available.alignBlock === undefined;
              if (growing || rowStretch || (explicitStretch && available.gridItem)) throw Object.assign(new Error(`${box.label}: aspect-ratio with an auto height where its container ${growing ? 'grows it (flex-grow in a column)' : 'stretches it (align-self: stretch, or a flex row\'s default)'} is not modeled`), { code: 'U_LAYOUT_CSS', box });
              fixedBlock = style['box-sizing'] === 'border-box' ? times(inline, r) : sum(times(contentInline, r), cssBlockEdges);
            }
            // aspect-ratio on a box with content: the ratio sets the height, raised to the content's by the automatic
            // minimum in some layouts and not in others (measured: a grid item with a 30px child is 30px, a flex container
            // whose content is 38px follows the ratio's 20px); that is not modeled.
            else if (ratioOf(style) && ((box.children ?? []).length || box.text || box.inline?.length)) throw Object.assign(new Error(`${box.label}: aspect-ratio on a box with content (its height is the ratio's or its content's) is not modeled; give it a height, or put the ratio on an empty box`), { code: 'U_LAYOUT_CSS', box });
            else if (!available.root && available.block && available.alignBlock === undefined) fixedBlock = available.block;
            // A container raised to its min-height keeps that height also when it is aligned (not stretched) in its area
            // (measured: align-self: center on a 38px flex container with min-height: 50px is 50px tall).
            else if (available.$minRaised && (available.$raisedBlock || available.block)) fixedBlock = available.$raisedBlock ?? available.block;
            else if (style['container-type'] === 'size') fixedBlock = blockEdges;
            if (style['block-size'] !== 'auto' && style['box-sizing'] === 'content-box') fixedBlock = sum(fixedBlock, cssBlockEdges);
          }
          const maxBlock = block && /^\d+(?:\.\d+)?px$/.test(style['max-block-size']) ? sum(scalar(px(style['max-block-size'])), style['box-sizing'] === 'content-box' ? cssBlockEdges : scalar(0)) : null;
          // A block-size with viewport units, min()/max()/clamp() may split the region (a single piece otherwise).
          const contentEdges = style['box-sizing'] === 'content-box' ? cssBlockEdges : scalar(0);
          const blockPieces = block && style['block-size'] !== 'auto' && !/^\d+(?:\.\d+)?(?:px|%)$/.test(style['block-size'])
            ? lengthPieces(style['block-size'], available.percentBlock ?? available.block, content.region, style).map(piece => ({ region: piece.region, value: sum(piece.value, contentEdges) }))
            : [{ region: content.region, value: fixedBlock }];
          const fixedPieces = blockPieces.flatMap(piece => !(block && style['max-block-size'] !== 'none' && piece.value) ? [piece]
            : lengthPieces(style['max-block-size'], available.percentBlock ?? available.block, piece.region, style).flatMap(cap => minimumOf(cap.region, piece.value, sum(cap.value, contentEdges))));
          // min-block-size (content-box value, outer minus edges): wins over max-block-size, so it is applied after it.
          const minBlock = block && !['auto', '0', '0px'].includes(String(style['min-block-size'])) && !available.flexBlockMinimum && !available.$minNatural
            ? region => lengthPieces(style['min-block-size'], available.percentBlock ?? available.block, region, style).map(m => ({ region: m.region, value: diff(sum(m.value, contentEdges), blockEdges) })) : null;
          const raisedPieces = !minBlock ? fixedPieces : fixedPieces.flatMap(piece => !piece.value ? [piece] : minBlock(piece.region).flatMap(m => maximum(m.region, piece.value, sum(m.value, blockEdges))));
          const blockStates = raisedPieces.flatMap(piece => piece.value ? clamp(piece.region, diff(piece.value, blockEdges)) : [{ region: piece.region, value: null }]);
          for (const piece of fixedPieces) if (piece.value && emit) obligation(piece.value, blockEdges, box, piece.region, 'E_LAYOUT_BOX_EDGES', 'block', true, edgeExplanation('block'));
          for (const bs of blockStates) {
            const origin=resolvedOrigin(style,available,inline,bs.value ? sum(bs.value,blockEdges) : null,parents);
            const contentOrigin=offset(origin,edge(['left']),edge(['top']));
            // A transformed box is the containing block of its absolute descendants, like a positioned one.
            // Checklist D2: in block flow, a child's percentage height resolves against this box's height when that is
            // definite (a declared height, clamped by min/max): the used content height. Otherwise it computes to auto.
            // ($blockFlow is set below, where block flow becomes a one-column grid; the declared height is known here.)
            const blockFlowPercent = bs.value && (style['block-size'] !== 'auto' || available.definiteBlock) ? bs.value : null;
            const knownBlock = bs.value, own = { box, style, inline: contentInline, block: knownBlock, positioned:style.position!=='static' || containsFixed(style),
              contentOrigin,paddingOrigin:offset(origin,scalar(px(style['border-left'])),scalar(px(style['border-top']))),
              subgrid:style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid',
              clipped:!(box.documentRoot && available.root) && (!['visible','clip'].includes(style['overflow-x']) || !['visible','clip'].includes(style['overflow-y'])), clipScope: !(box.documentRoot && available.root) && (style['overflow-x'] === 'clip' || style['overflow-y'] === 'clip'),
              paddingInline:diff(inline,scalar(add(px(style['border-left']),px(style['border-right'])))),
              paddingBlock:knownBlock ? diff(sum(knownBlock,blockEdges),scalar(add(px(style['border-top']),px(style['border-bottom'])))) : null,
              type: style['container-type'], names: style['container-name'] === 'none' ? [] : style['container-name'].split(/\s+/) };
            const ancestors = [...parents, own];
            if (rendered) placeLegend(rendered, origin, bs.region, ancestors, emit);
            // A fixed table narrower than its px columns grows past its width; the grid cannot follow that.
            // An automatic table shares a width below its px columns by content (not modeled), and one with an auto
            // width shrinks to a narrower container: Unknown there.
            if (emit && style.tableAutoMinimum) { const narrow = clip(bs.region, diff(sum(scalar(style.tableAutoMinimum), scalar(style.tableGaps)), contentInline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} is narrower than its px columns; automatic layout then shares the width by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableShrink && available.inline) { const narrow = clip(bs.region, diff(scalar(style.tableShrink), available.inline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} has an automatic width wider than its container here, where it shrinks by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableColumns) obligation(diff(contentInline, scalar(style.tableGaps)), scalar(style.tableColumns), box, bs.region, 'E_LAYOUT_TABLE_WIDTH', 'inline');
            const { axes: inheritedAxes, regions: geometryRegions } = subgridGeometry(style, box, available, bs.region, emit);
            for (const geometryRegion of geometryRegions) {
              // Even an empty Grid has explicit tracks and contributes their
              // height/overflow. Only ordinary leaves use intrinsic height.
              if (!box.children.length && style.display !== 'grid') {
                let heights = !block ? [{ region: geometryRegion, value: null }] : knownBlock ? [{ region: geometryRegion, value: knownBlock }] : intrinsic(box, contentInline, geometryRegion);
                // A line clamp caps the text's height at N lines; where the text needs more, the rest is cut off (a warning).
                if (style.$lineClamp && !knownBlock) heights = heights.flatMap(h => h.value ? minimumOf(h.region, h.value, scalar(mul(q(String(style.$lineClamp)), px(style['line-height'])))).map(c => {
                  const cut = clip(c.region, diff(h.value, c.value), true);
                  if (cut && !layoutWarnings.some(w => w.code === 'W_LAYOUT_LINE_CLAMPED' && w.path === box.path)) { const p = sample(cut); layoutWarnings.push({ code: 'W_LAYOUT_LINE_CLAMPED', severity: 'warning', box: box.label, path: box.path, lines: style.$lineClamp, message: `${box.label} is clamped to ${style.$lineClamp} lines and its text needs ${number(div(evaluate(h.value, p), px(style['line-height'])))} at viewport ${number(p.x)}px: the rest of the text is cut off (keep the full text available elsewhere, such as the page the card links to)`, ...ranges(cut) }); }
                  return c;
                }) : [h]);
                // A content height above max-block-size is capped; the content then has to fit (or overflow by contract).
                if (maxBlock && !knownBlock) heights = heights.flatMap(h => h.value ? minimumOf(h.region, h.value, diff(maxBlock, blockEdges)).map(c => {
                  if (c.value !== h.value && emit) obligation(c.value, h.value, box, c.region, 'E_LAYOUT_CONTENT', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit');
                  return c;
                }) : [h]);
                if (minBlock && !knownBlock) heights = heights.flatMap(h => h.value ? minBlock(h.region).flatMap(m => maximum(m.region, h.value, m.value)) : [h]);
                for (const h of heights) {
                  results.push(finish(box, style, h.region, inline, contentInline, h.value ? sum(h.value, blockEdges) : null, h.value, available, parents, emit));
                  // Absolute ::before/::after of the leaf, against the nearest positioned box (this leaf when it is).
                  for (const kind of box.absolutePseudo ?? []) {
                    const leafOwn = { ...own, paddingBlock: own.paddingBlock ?? (h.value ? diff(sum(h.value, blockEdges), scalar(add(px(style['border-top']), px(style['border-bottom'])))) : null) };
                    const chain = [...parents, leafOwn], containing = chain.findLast(a => a.positioned);
                    if (!block || !containing?.paddingBlock || containing.subgrid || chain.some(a => a.clipped)) throw Object.assign(new Error(`${box.label}::${kind} is absolutely positioned without an owned non-scrolling, unclipped containing block`), { code: 'U_LAYOUT_PSEUDO' });
                    const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : 0}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind, absolutePseudo: undefined,
                      named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
                    solve(pbox, { inline: containing.paddingInline, block: containing.paddingBlock, containingBlock: { path: containing.box.path, inline: containing.paddingInline, block: containing.paddingBlock, origin: containing.paddingOrigin } }, h.region, chain, style, emit);
                  }
                }
                continue;
              }
              // Block flow: a display: block container whose children are all block-level, with no vertical margins
              // to collapse, lays them out as a one-column grid whose rows do not stretch (align-content: start) —
              // measured equal in Chromium for widths, %, horizontal margins, padding, borders, nested grids and images.
              // Its gaps and grid properties do not apply. Auto margins with an auto width fill, cap and center (below).
              // align-content applies to block containers (measured): center and end move the content; the rest is start.
              // justify-items on a block container aligns its block-level children and shrinks an auto width to fit
              // (measured: justify-items: end puts an empty child at the right edge, 0px wide); that is not modeled.
              if (style.display === 'block' && !box.text && !['normal', 'stretch', 'legacy', 'auto'].includes(String(style['justify-items'] ?? 'normal'))) { alignBrowserDependent(box, 'justify-items', style['justify-items']); throw Object.assign(new Error(`${box.label}: justify-items: ${style['justify-items']} on a block container aligns its children and shrinks them to fit, which is not modeled`), { code: 'U_LAYOUT_CSS', box }); }
              if (style.display === 'block' && !box.text) style = { ...style, display: 'grid', 'grid-template-columns': 'minmax(0,1fr)', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'grid-template-areas': 'none', 'align-content': ['center', 'safe center'].includes(String(style['align-content'])) ? 'center' : ['end', 'flex-end'].includes(String(style['align-content'])) ? 'end' : 'start', 'justify-content': 'normal', 'align-items': 'normal', 'justify-items': 'normal', 'row-gap': 'normal', 'column-gap': 'normal', $blockFlow: true };
              if (!['grid', 'flex'].includes(style.display)) { issue('E_LAYOUT_CONTAINER', 'Layout containers must use grid or the flex subset', box, bs.region); continue; }
              const isFlex = style.display === 'flex';
              if (!isFlex && !['row', 'row dense', 'dense', 'column', 'column dense'].includes(String(style['grid-auto-flow']))) throw new Error('Only row auto-placement, and column auto-placement over listed rows, is supported (sparse or dense)');
              // Child boxes per region. display: contents is replaced by its
              // children, which inherit from it (the element tree) but are
              // laid out as items of this container.
              const collect = region => {
                let states = [{ region, children: [] }];
                const visit = (child, inheritedStyle) => {
                  states = bounded(states.flatMap(s => styles(child, s.region, ancestors, inheritedStyle, false).flatMap(c => {
                    if (child.tableCell || child.tableCaption) c = { ...c, style: tablePlacement(child, c.style) };
                    if (child.tablePart && ['table-row-group', 'table-header-group', 'table-footer-group', 'table-row'].includes(c.style.display)) c = { ...c, style: { ...c.style, display: 'contents' } };
                    if (c.style.display === 'none') return [{ region: c.region, children: s.children }];
                    // F53: in block flow, an in-flow box's auto margin-top / margin-bottom are 0 (CSS 2.2 §10.6.3; measured in
                    // Chromium, Firefox and WebKit, also in a flow-root or overflow: hidden parent): no vertical centring.
                    if (style.$blockFlow && !['absolute', 'fixed'].includes(c.style.position) && !c.style.$fixed && c.style.display !== 'contents') {
                      const autos = ['margin-top', 'margin-bottom'].filter(key => String(c.style[key]) === 'auto');
                      if (autos.length) {
                        c = { ...c, style: { ...c.style, ...Object.fromEntries(autos.map(key => [key, '0'])) } };
                        if (!child.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === child.path && w.properties.includes(autos[0])))
                          layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: child.label, path: child.path, properties: autos, css: autos.filter(key => c.style.$sources?.[key]).map(key => ({ property: key, file: c.style.$sources[key].file, line: c.style.$sources[key].line, selector: c.style.$sources[key].selector })),
                            message: `${child.label}: ${autos.join(' and ')}: auto ${autos.length === 1 ? 'is' : 'are'} 0 in block flow (its parent ${box.label} is display: block), so it is not centred or pushed down vertically. Make the parent display: flex (or grid) for auto margins to take the free space` });
                      }
                    }
                    if (c.style.display !== 'contents') return [{ region: c.region, children: [...s.children, { box: child, style: c.style, inherited: inheritedStyle }] }];
                    if (child.text || child.contract || child.targets?.length) throw new Error('display: contents with text, contracts or noshift targets needs anonymous or absent boxes');
                    if (emit) contentsInert(child, c.style, c.region);
                    if (emit && child.tablePart) tableRowRadius(child, c.style);
                    if (emit && child.tablePart && droppedOf(c.style, 'aspect-ratio').length) aspectInert(child, c.style);
                    return [{ region: c.region, children: s.children, contents: c.style }];
                  })));
                  const nested = states.filter(state => state.contents);
                  if (!nested.length) return;
                  if (nested.length !== states.length) throw new Error('display: contents that varies across regions is outside the subset');
                  const contentsStyle = nested[0].contents;
                  for (const state of states) delete state.contents;
                  for (const grandchild of child.children) visit(grandchild, contentsStyle);
                };
                // ::before/::after: an empty, absolutely positioned box with explicit sizes (decorative layers, overlays)
                // takes part as a child painted before or after the others; generated text is not modeled.
                const pseudo = kind => {
                  const pbox = { ...box, tag: box.tag, path: `${box.path}/${kind === 'before' ? -1 : box.children.length}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind,
                    named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
                  states = bounded(states.flatMap(s => styles(pbox, s.region, ancestors, style, false, false, new Set([`::${kind}`])).map(c => {
                    const content = c.style.content ?? 'none';
                    if (content === 'none' || c.style.display === 'none') return { region: c.region, children: s.children };
                    // Generated text in a grid/flex container is an item of its own: sized by a selector::kind contract.
                    if (content.startsWith('text:')) {
                      const sized = pseudoContracts.find(p => p.kind === kind && matches(p.base, box));
                      if (!sized || c.style.position !== 'static') throw Object.assign(new Error(`${pbox.label} generates text${sized ? ' out of flow' : '; give it a contract (' + box.label + '::' + kind + ')'}`), { code: 'U_LAYOUT_PSEUDO' });
                      const tbox = { ...pbox, text: true, textContent: content.slice(5), generated: { [kind]: content.slice(5) }, contract: sized.contract, contractSelector: sized.selector };
                      return { region: c.region, children: kind === 'before' ? [{ box: tbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: tbox, style: c.style, inherited: style }] };
                    }
                    if (c.style.position !== 'absolute') throw Object.assign(new Error(`${pbox.label} is generated in flow; only absolutely positioned generated boxes are modeled`), { code: 'U_LAYOUT_PSEUDO' });
                    return { region: c.region, children: kind === 'before' ? [{ box: pbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: pbox, style: c.style, inherited: style }] };
                  })));
                };
                if (!box.pseudo) pseudo('before');
                // A closed details renders only its first summary (measured); an open attribute set by script is Unknown.
                if (box.tag === 'details' && box.detailsOpen === 'dynamic') throw Object.assign(new Error(`${box.label}: whether this details is open is decided at run time`), { code: 'U_LAYOUT_ELEMENT', box });
                const summary = box.tag === 'details' ? box.children.find(child => child.tag === 'summary') : null;
                for (const child of box.children) if (child !== rendered?.box && !(box.tag === 'details' && box.detailsOpen === false && child !== summary)) visit(child, style);
                if (!box.pseudo) pseudo('after');
                // order: items are laid out (and painted) in order-modified document order, a stable sort by order. Modeled
                // where in-flow items cannot overlap (so paint order does not matter): flex items, and grid items that are
                // all auto-placed; with a transform or relative offsets on a reordered item it stays Unknown. Tab order
                // still follows the DOM (visual-order reports the difference).
                for (const state of states) {
                  if (state.children.every(child => child.style.order === '0')) continue;
                  const reject = why => { throw Object.assign(new Error(`order changes the item sequence; ${why}`), { code: isFlex ? 'U_LAYOUT_FLEX' : 'U_LAYOUT_CSS', box }); };
                  if (state.children.some(child => !/^-?\d+$/.test(String(child.style.order)))) reject('only integer order values are modeled');
                  if (!isFlex && state.children.some(child => child.style['grid-column'] !== 'auto' || child.style['grid-row'] !== 'auto' || child.style['grid-area'] && child.style['grid-area'] !== 'auto')) reject('with explicitly placed grid items (which may overlap) it is not modeled');
                  if (state.children.some(child => child.style.transform !== 'none' || (child.style.position === 'relative' && ['top', 'left', 'right', 'bottom'].some(k => child.style[k] !== 'auto')))) reject('with transformed or offset items (whose paint order matters) it is not modeled');
                  state.children = [...state.children].sort((a, b) => Number(a.style.order) - Number(b.style.order));
                }
                return states;
              };
              if (isFlex) { for (const result of layoutFlex({ box, style, region: geometryRegion, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit })) results.push(result); continue; }
              // Checklist D2: percentage tracks and gaps of a container whose size on that axis is one constant (a px width,
              // a declared px height): written as px. Columns and column-gap against the content width; rows and row-gap
              // against the content height where the height is declared (otherwise a percentage row is auto: not modeled).
              {
                const constantOf = e => e && cmp(e.x, zero) === 0 && cmp(e.y, zero) === 0 ? e.b : null;
                const inlineBasis = constantOf(contentInline), blockBasis = style['block-size'] !== 'auto' ? constantOf(knownBlock) : null;
                const share = (token, basis) => /^\d+(?:\.\d+)?%$/.test(token) && basis ? `${number(mul(basis, div(q(token.slice(0, -1)), q(100))))}px` : token;
                const exactShare = (token, basis) => { const v = mul(basis, div(q(token.slice(0, -1)), q(100))); return /^\d+(?:\.\d{1,6})?$/.test(String(number(v))) && cmp(q(String(number(v))), v) === 0; };
                const rewrite = (key, basis) => {
                  const text = String(style[key] ?? '');
                  if (!/%/.test(text) || !basis || /\bmin\(/.test(text) || /auto-(?:fill|fit)/.test(text)) return;
                  let list; try { list = expandTracks(text); } catch { return; }
                  if (list.some(t => /%/.test(t) && (!/^\d+(?:\.\d+)?%$/.test(t) || !exactShare(t, basis)))) return;
                  style = { ...style, [key]: list.map(t => share(t, basis)).join(' ') };
                };
                rewrite('grid-template-columns', inlineBasis); rewrite('grid-template-rows', blockBasis);
                for (const [key, basis] of [['column-gap', inlineBasis], ['row-gap', blockBasis]])
                  if (/^\d+(?:\.\d+)?%$/.test(String(style[key])) && basis && exactShare(String(style[key]), basis)) style = { ...style, [key]: share(String(style[key]), basis) };
              }
              const sharedColumns = inheritedAxes.inline;
              // Flex: the items' flex properties define one row of tracks.
              // repeat(auto-fill, T) with T = Lpx or minmax(Lpx | min(Lpx, 100%), Nfr): as many tracks as fit at their
              // minimum, at least one (css-grid-1 §7.2.3.2). The count is a region split on the container width.
              const autoRepeat = !sharedColumns && /^\s*repeat\(\s*auto-(fill|fit)\s*,(.*)\)\s*$/.exec(String(style['grid-template-columns']));
              let plans;
              if (autoRepeat) {
                // auto-fit collapses the tracks no item occupies (and their gaps): with k auto-placed single-span items
                // it is auto-fill capped at k tracks (measured). The item count is checked per state below.
                const fitItems = autoRepeat[1] === 'fit' ? (box.children ?? []).filter(child => !child.pseudo).length : null;
                const [track] = tracks(autoRepeat[2].trim());
                const size = track.fixed ?? track.min;
                if (!size || cmp(size, zero) <= 0) throw Object.assign(new Error(`repeat(auto-fill, ${autoRepeat[2].trim()}) needs a px or minmax(px, fr) track`), { code: 'U_LAYOUT_CSS' });
                const gapPx = resolvedGap(style, 'column-gap');
                if (gapPx.x !== undefined) throw Object.assign(new Error('Viewport-varying auto-repeat gaps are not modeled'), {code:'U_LAYOUT_CSS'});
                const step = add(size, gapPx);
                const widest = Math.max(...geometryRegion.vertices.map(v => Number(number(evaluate(contentInline, v)))));
                const most = Math.min(64, Math.max(1, Math.floor((widest + Number(number(gapPx))) / Number(number(step)))));
                plans = [];
                for (let n = 1; n <= most; n++) {
                  // n tracks: n·size + (n−1)·gap ≤ W < (n+1)·size + n·gap (n = 1 also below one track: at least one).
                  let r = [geometryRegion];
                  if (n > 1) r = r.flatMap(x => partition(x, diff(contentInline, scalar(sub(mul(q(n), step), gapPx))), '>=').yes);
                  if (n < most) r = r.flatMap(x => partition(x, diff(contentInline, scalar(sub(mul(q(n + 1), step), gapPx))), '>=').no);
                  for (const region of r) plans.push({ region, columns: Array.from({ length: fitItems === null ? n : Math.max(1, Math.min(n, fitItems)) }, () => track), ...(fitItems !== null ? { fitItems } : {}) });
                }
              } else plans = [{ region: geometryRegion, columns: sharedColumns ? sharedColumns.values.map(value => ({ definite: value })) :
                style['grid-template-columns'] === 'none' ? [] : tracks(style['grid-template-columns'] ?? 'none') }];
              for (const plan of plans) {
              const columns = plan.columns;
              const columnGap = resolvedGap(style, 'column-gap', sharedColumns);
              const columnBases = columns.map(track => scalar(track.fixed ?? track.edges ?? zero));
              const columnLayouts = sharedColumns ? [{ region: plan.region, values: sharedColumns.values, required: trackArea(sharedColumns.values, columnGap, 0, columns.length) }] :
                flex(plan.region, contentInline, columns, scaleGap(columnGap, Math.max(0, columns.length - 1)), columnBases, false);
              // justify-content distributes free space between tracks (positions only).
              const justified = columnLayouts.flatMap(cs => {
                const d = sharedColumns ? { lead: zero, extra: zero, negative: 'start' } : distribution(style['justify-content'], 'inline', columns.length);
                if (cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0) return [{ ...cs, shift: { lead: scalar(0), extra: scalar(0) } }];
                const free = diff(contentInline, sum(total(cs.values), scaleGap(columnGap, Math.max(0, columns.length - 1))));
                const split = partition(cs.region, free, '>=');
                return [...split.yes.map(region => ({ ...cs, region, shift: { lead: times(free, d.lead), extra: times(free, d.extra) } })),
                  ...split.no.map(region => ({ ...cs, region, shift: d.negative === 'start' ? { lead: scalar(0), extra: scalar(0) } : null }))];
              });
              for (const cs of justified) {
                if (emit) obligation(contentInline, cs.required, box, cs.region, 'E_LAYOUT_TRACKS', 'inline', (box.contract?.overflow ?? 'fit') === 'fit' && !scrolls(style, 'x'), () => explanation(sizeChain([...parents, { box, style }], 'inline', { hostInset: options.hostInset }), trackProperties('inline').map(property => fact(box, style, property))));
                const childStates = bounded(collect(cs.region).flatMap(c=>style.$blockFlow ? responsiveBlockMargins(c,style,box,parents,available) : [c]));
                for (const children of childStates) {
                  if (!block && children.children.some(child=>child.style.position==='absolute')) throw new Error('Absolute boxes require both-axis analysis');
                  if (!columns.length && children.children.some(child=>child.style.position!=='absolute')) throw new Error('In-flow Grid children require explicit supported columns');
                  if (style.$blockFlow) {
                    const flow = children.children.filter(child => child.style.position !== 'absolute');
                    // Two classic inline-level bugs, seen from the DOM and the computed styles alone (the line layout
                    // itself stays Unknown below): whitespace between inline-blocks in the source is a space between
                    // them, and an inline image sits on the baseline with the descender's room under it (measured).
                    const inlineKids = flow.filter(child => child.style.$inlineLevel);
                    const fontless = ['0', '0px'].includes(String(style['font-size']));
                    // (Recorded from any pass: the line layout throws before the emitting one.)
                    if (inlineKids.length >= 2 && box.whitespace && !fontless && ['normal', 'nowrap', 'pre-line'].includes(String(style['white-space'])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_INLINE_GAP' && w.path === box.path))
                      layoutWarnings.push({ code: 'W_LAYOUT_INLINE_GAP', severity: 'warning', box: box.label, path: box.path, items: inlineKids.map(c => c.box.label),
                        message: `${box.label} lays out ${inlineKids.map(c => c.box.label).join(', ')} as inline-level boxes, with whitespace between them in the markup: each gap is a space of ${box.label}'s font (about a quarter of its font-size), not a value you set. Use display: flex with gap on ${box.label} instead`, ...ranges(bs.region) });
                    for (const img of inlineKids.filter(c => c.box.tag === 'img' && String(c.style['vertical-align'] ?? 'baseline') === 'baseline'))
                      if (!fontless && !layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_BASELINE_GAP' && w.path === img.box.path))
                        layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_BASELINE_GAP', severity: 'warning', box: img.box.label, path: img.box.path, parent: box.label,
                          message: `${img.box.label} is an inline image in ${box.label}: it sits on the text baseline, so ${box.label} is taller than the image by the font's descender (a few pixels of gap under it). Give ${img.box.label} display: block (or vertical-align: top)`, ...ranges(bs.region) });
                    for (const child of flow) if (child.style.$inlineLevel) throw Object.assign(new Error(`${child.box.label} is inline-level inside the block container ${box.label}: its line layout is not modeled (give it display: block, or make ${box.label} a grid or flex container)`), { code: 'U_LAYOUT_INLINE', box: child.box, region: children.region });
                    // Grid placement and self-alignment do nothing in block flow: laid out as auto, reported as inert.
                    // (justify-self is not inert: Chromium aligns block-level boxes by it — measured — which is not modeled.)
                    for (const child of flow) if (!['auto', 'normal', 'stretch', 'legacy'].includes(String(child.style['justify-self'] ?? 'auto'))) { alignBrowserDependent(child.box, 'justify-self', child.style['justify-self']); throw Object.assign(new Error(`${child.box.label}: justify-self: ${child.style['justify-self']} aligns a block-level box (CSS Box Alignment), which is not modeled`), { code: 'U_LAYOUT_CSS', box: child.box, region: children.region }); }
                    const inertDefaults = { 'grid-column': 'auto', 'grid-row': 'auto', 'align-self': 'auto' };
                    flow.forEach((child, k) => {
                      const written = Object.keys(inertDefaults).filter(key => child.style.$sources?.[key] && !['auto', 'normal', 'stretch'].includes(String(child.style[key])));
                      if (!written.length) return;
                      if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === child.box.path))
                        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: child.box.label, path: child.box.path, properties: written,
                          css: written.map(key => ({ property: key, file: child.style.$sources[key].file, line: child.style.$sources[key].line, selector: child.style.$sources[key].selector })),
                          message: `${child.box.label}: ${written.map(key => `${key}: ${String(child.style[key]).replace(/^area:/, '')}`).join(', ')} ${written.length > 1 ? 'have' : 'has'} no effect (its parent ${box.label} is display: block, not grid or flex)`, ...ranges(children.region) });
                      const index = children.children.indexOf(child);
                      children.children[index] = { ...child, style: { ...child.style, ...Object.fromEntries(written.map(key => [key, inertDefaults[key]])) } };
                      flow[k] = children.children[index];
                    });
                    // Vertical margins collapse between adjacent siblings (the larger one wins; measured): the next
                    // sibling's top margin becomes max(previous bottom, its top) − previous bottom. Collapsing through the
                    // container (no padding or border on that side) or through an empty child is not modeled.
                    if (!children.$responsiveCollapse) {
                    const mv = (child, side) => /^\d+(?:\.\d+)?px$/.test(String(child.style[`margin-${side}`])) ? px(child.style[`margin-${side}`]) : zero;
                    // A plain block child (not a formatting root, no padding or border on that side) lets its first
                    // (last) child's top (bottom) margin collapse through it: its own margin becomes the larger of the
                    // two, and it lays that grandchild out without it (collapsedTop / collapsedBottom). The grandchild's
                    // style must be the same across this region.
                    const zeroEdge = (st, side) => !positiveEdge(st, side, children.region);
                    const plainBlock = st => st.display === 'block' && !['hidden', 'auto', 'scroll'].includes(String(st['overflow-x'])) && !['hidden', 'auto', 'scroll'].includes(String(st['overflow-y'])) && st.position === 'static';
                    flow.forEach((child, k) => {
                      if (!plainBlock(child.style) || child.box.text || !(child.box.children ?? []).length) return;
                      const childAncestors = [...ancestors, { box: child.box, style: child.style, inline: null, block: null, type: child.style['container-type'], names: [] }];
                      // The in-flow children of a box ({ box, style }), or null when one's style varies here.
                      const flowOf = (owner, ownerStyle, at) => {
                        const out = [];
                        for (const g of owner.children ?? []) {
                          let pieces;
                          try { pieces = styles(g, children.region, at, ownerStyle, false); } catch { return null; }
                          const keys = new Set(pieces.map(p => JSON.stringify([p.style.display, p.style.position, p.style['margin-top'], p.style['margin-bottom'], p.style['padding-top'], p.style['padding-bottom'], p.style['border-top'], p.style['border-bottom'], p.style['block-size'], p.style['overflow-x'], p.style['overflow-y']])));
                          if (keys.size !== 1) return null;
                          const st = pieces[0].style;
                          if (st.display !== 'none' && st.position !== 'absolute') out.push({ box: g, style: st });
                        }
                        return out;
                      };
                      const gm = (st, side) => { if (viewportLength(st[`margin-${side}`])) throw Object.assign(new Error('Responsive margin may collapse through an ancestor'),{code:'U_LAYOUT_CSS'}); return /^\d+(?:\.\d+)?px$/.test(String(st[`margin-${side}`])) ? px(st[`margin-${side}`]) : zero; };
                      // The margin that collapses out of a box on one side: its own and, through every plain block with
                      // no padding or border there (and an auto height, for the bottom), its first (last) child's
                      // (measured: several levels deep). null when that is not known.
                      const outward = (owner, st, at, side, depth) => {
                        const own = gm(st, side);
                        if (depth > 16 || !plainBlock(st) || owner.text || !(owner.children ?? []).length || !zeroEdge(st, side) || (side === 'bottom' && st['block-size'] !== 'auto')) return own;
                        const inner = [...at, { box: owner, style: st, inline: null, block: null, type: st['container-type'], names: [] }];
                        const kids = flowOf(owner, st, inner);
                        if (!kids) return null;
                        if (!kids.length || kids.some(k => /inline|contents|table/.test(String(k.style.display)))) return own;
                        const edge = side === 'top' ? kids[0] : kids.at(-1);
                        const theirs = outward(edge.box, edge.style, inner, side, depth + 1);
                        if (theirs === null) return null;
                        return cmp(theirs, own) > 0 ? theirs : own;
                      };
                      const updates = {};
                      const grand = flowOf(child.box, child.style, childAncestors);
                      if (!grand || grand.some(g => /inline|contents|table/.test(String(g.style.display)))) return;
                      const childOf = [...childAncestors];
                      for (const side of ['top', 'bottom']) {
                        if (!grand.length || !zeroEdge(child.style, side) || (side === 'bottom' && child.style['block-size'] !== 'auto')) continue;
                        const edge = side === 'top' ? grand[0] : grand.at(-1);
                        const theirs = outward(edge.box, edge.style, childOf, side, 1);
                        if (theirs === null) return;
                        if (cmp(theirs, zero) <= 0) continue;
                        // F73: the grandchild's margin goes out through the child, so with a background on the child the space
                        // shows above (below) the background, not inside it (CSS 2.2 §8.3.1; measured in three browsers).
                        if (!['transparent', 'rgba(0,0,0,0)', 'ua', undefined, 'none'].includes(String(child.style['background-color'])) && !child.box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_MARGIN_COLLAPSE_THROUGH' && w.path === child.box.path && w.side === side))
                          layoutWarnings.push({ code: 'W_LAYOUT_MARGIN_COLLAPSE_THROUGH', severity: 'warning', box: child.box.label, path: child.box.path, side,
                            message: `${child.box.label}: the margin-${side} of ${edge.box.label} (${number(theirs)}px) collapses through it — it has no padding-${side} or border-${side} — so the space shows ${side === 'top' ? 'above' : 'below'} ${child.box.label}'s background, not inside it. Give ${child.box.label} a padding-${side} (or display: flow-root), or use padding on ${edge.box.label}` });
                        const total = cmp(theirs, mv(child, side)) > 0 ? theirs : mv(child, side);
                        updates[`margin-${side}`] = cmp(total, zero) === 0 ? '0' : `${number(total)}px`; updates[side === 'top' ? '$collapsedTop' : '$collapsedBottom'] = true;
                      }
                      if (!Object.keys(updates).length) return;
                      const index = children.children.indexOf(child);
                      children.children[index] = { ...child, style: { ...child.style, ...updates } };
                      flow[k] = children.children[index];
                    });
                    // This container's own first/last child margins already moved out by its parent.
                    if (available.collapsedTop && flow.length) { const index = children.children.indexOf(flow[0]); children.children[index] = { ...flow[0], style: { ...flow[0].style, 'margin-top': '0' } }; flow[0] = children.children[index]; }
                    if (available.collapsedBottom && flow.length) { const index = children.children.indexOf(flow.at(-1)); children.children[index] = { ...flow.at(-1), style: { ...flow.at(-1).style, 'margin-bottom': '0' } }; flow[flow.length - 1] = children.children[index]; }
                    if (flow.some(child => cmp(add(mv(child, 'top'), mv(child, 'bottom')), zero) > 0)) {
                      const edge = side => positiveEdge(style, side, children.region);
                      const unknownCollapse = why => { throw Object.assign(new Error(`${box.label}: ${why}; that margin collapsing is not modeled`), { code: 'U_LAYOUT_CSS', box, region: children.region }); };
                      // A container that establishes a formatting context (a grid or flex item, overflow hidden/auto/
                      // scroll, absolute) keeps its children's margins inside it (measured): nothing collapses through.
                      const parentStyle = parents.at(-1)?.style;
                      // (The root element always establishes one.)
                      const formattingRoot = (!parents.length && box.documentRoot) || (parentStyle && ['grid', 'flex', 'inline-grid', 'inline-flex'].includes(parentStyle.display) && !parentStyle.$blockFlow) || ['hidden', 'auto', 'scroll'].includes(String(style['overflow-x'])) || ['hidden', 'auto', 'scroll'].includes(String(style['overflow-y'])) || style.position === 'absolute';
                      if (flow.length && cmp(mv(flow[0], 'top'), zero) > 0 && !edge('top') && !formattingRoot) unknownCollapse(`the top margin of ${flow[0].box.label} collapses through its container (no padding or border on top)`);
                      if (flow.length && cmp(mv(flow.at(-1), 'bottom'), zero) > 0 && !edge('bottom') && style['block-size'] === 'auto' && !formattingRoot) unknownCollapse(`the bottom margin of ${flow.at(-1).box.label} collapses through its container (no padding or border below, auto height)`);
                      for (const child of flow) if (cmp(add(mv(child, 'top'), mv(child, 'bottom')), zero) > 0 && !(child.box.children ?? []).length && !child.box.text && child.style['block-size'] === 'auto' && !['top', 'bottom'].some(side => positivePadding(child.style, side, children.region)))
                        unknownCollapse(`${child.box.label} may be empty, so its own margins would collapse together`);
                      for (let i = 1; i < flow.length; i++) {
                        const previous = mv(flow[i - 1], 'bottom'), top = mv(flow[i], 'top'), adjusted = cmp(top, previous) > 0 ? sub(top, previous) : zero;
                        const index = children.children.indexOf(flow[i]);
                        children.children[index] = { ...flow[i], style: { ...flow[i].style, 'margin-top': cmp(adjusted, zero) === 0 ? '0' : `${number(adjusted)}px` } };
                        flow[i] = children.children[index];
                      }
                    }
                  }
                  }
                  if (plan.fitItems !== undefined) {
                    const flow = children.children.filter(child => child.style.position !== 'absolute');
                    if (flow.length !== plan.fitItems || flow.some(child => child.style['grid-column'] !== 'auto' || child.style['grid-row'] !== 'auto'))
                      throw Object.assign(new Error('repeat(auto-fit, …) is modeled only when every child is an auto-placed, single-cell item that renders'), { code: 'U_LAYOUT_CSS', region: children.region });
                  }
                  let placed;
                  // A grid-area name the parent's grid-template-areas does not define: a typo or a stale name. Chromium
                  // puts the item on implicit lines (outside the subset); the warning names it.
                  const areas = parseAreas(style['grid-template-areas']);
                  for (const child of children.children) for (const key of ['grid-row', 'grid-column']) {
                    const raw = String(child.style[key]), name = raw.startsWith('area:') ? raw.slice(5) : /^-?[A-Za-z_][\w-]*$/.test(raw) && !['auto', 'span'].includes(raw) ? raw : null;
                    if (name && !areas.areas.has(name) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_GRID_AREA_UNKNOWN' && w.path === child.box.path))
                      layoutWarnings.push({ code: 'W_LAYOUT_GRID_AREA_UNKNOWN', severity: 'warning', box: child.box.label, path: child.box.path, area: name, parent: box.label,
                        message: `${child.box.label} is placed in the grid area ${name}, but ${box.label}'s grid-template-areas ${areas.areas.size ? `defines only ${[...areas.areas.keys()].join(', ')}` : 'defines none'}: the browser puts it on new implicit tracks after the explicit grid`, ...ranges(children.region) });
                  }
                  try { placed = place(children.children.filter(child=>child.style.position!=='absolute'), columns.length, { subgridColumns: Boolean(sharedColumns), rows: inheritedAxes.block?.values.length, areas, dense: /dense/.test(String(style['grid-auto-flow'])), columnFlow: /^column/.test(String(style['grid-auto-flow'])), explicitRows: (() => { const v = String(style['grid-template-rows'] ?? 'none'); if (v === 'none' || v === 'subgrid' || /auto-(?:fill|fit)/.test(v)) return undefined; try { return expandTracks(v).length || undefined; } catch { return undefined; } })() }).map(item => ({ ...item, inherited: children.children.find(child => child.box === item.box).inherited })); }
                  catch (error) { error.region = children.region; throw error; }
                  const areaInline = item => trackArea(cs.values, columnGap, item.start, item.span);
                  // A grid item's px margins: the item is laid out in its area less them, offset by the start margins, and
                  // its margin box (block size plus margins) sizes auto rows. rtl with unequal inline margins and margins on
                  // subgrid items are not modeled.
                  const marginOf = (item, side) => marginValue(item.style,side);
                  const marginInline = item => sum(marginOf(item, 'left'), marginOf(item, 'right')), marginBlock = item => sum(marginOf(item, 'top'), marginOf(item, 'bottom'));
                  for (const item of placed) {
                    const st=item.style;
                    if(hasViewportMargin(st)) {
                      if(style.direction!=='ltr'||st.direction!=='ltr'||!block||st.position!=='static'||['left','right'].some(side=>st[`margin-${side}`]==='auto')||
                        (style.$blockFlow&&hasViewportMargin(st,['left','right'])&&(st['inline-size']!=='auto'||st['max-inline-size']!=='none'||!['auto','0','0px'].includes(String(st['min-inline-size'])))))
                        throw Object.assign(new Error('Responsive margins with auto margins, directed/positioned boxes or an overconstrained block width are not modeled'),{code:'U_LAYOUT_CSS',box:item.box});
                    }
                    if (!isZeroAffine(sum(marginInline(item), marginBlock(item)))) {
                      if (st['grid-template-columns'] === 'subgrid' || st['grid-template-rows'] === 'subgrid') throw Object.assign(new Error(`${item.box.label}: margins on a subgrid are not modeled`), { code: 'U_LAYOUT_SUBGRID', box: item.box });
                      if (style.direction === 'rtl' && !isZeroAffine(diff(marginOf(item, 'left'), marginOf(item, 'right')))) throw Object.assign(new Error(`${item.box.label}: unequal inline margins in rtl are not modeled`), { code: 'U_LAYOUT_CSS', box: item.box });
                    }
                  }
                  const itemInline = item => diff(areaInline(item), marginInline(item));
                  // Inline auto margins of a grid item with an explicit width take the free space of its area (both: half
                  // each), and none of it when it is negative (start-aligned; measured). With an auto width the item
                  // would shrink to fit its content: Unknown.
                  const autoMargins = item => ['margin-left', 'margin-right'].some(key => item.style[key] === 'auto');
                  // In block flow an auto width fills the area, max-inline-size caps it, and the auto margins center it.
                  const blockFill = item => style.$blockFlow && String(item.style['inline-size']) === 'auto' && /^(?:none|\d+(?:\.\d+)?px)$/.test(String(item.style['max-inline-size']));
                  // Only ordinary block-flow children with explicit width
                  // and fixed px edges: grid/flex intrinsic contributions,
                  // replaced elements and variable padding need other proofs.
                  const responsiveBlock = item => style.$blockFlow && style.direction==='ltr' &&
                    ['html','body','main','div','section','article','aside','header','footer','nav'].includes(item.box.tag) &&
                    /^(?:min|max|clamp|calc)\(/.test(String(item.style['inline-size'])) &&
                    !ratioOf(item.style) && ['left','right'].every(side =>
                      /^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style['padding-'+side])) &&
                      /^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style['border-'+side])));
                  for (const item of placed) if (autoMargins(item) && !blockFill(item) && !responsiveBlock(item)) {
                    const w = String(item.style['inline-size']);
                    if (!/^\d+(?:\.\d+)?(?:px|%)$/.test(w) || (item.style['box-sizing'] === 'content-box' && ['left', 'right'].some(side => !/^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style[`padding-${side}`])) || !/^(?:0|ua|\d+(?:\.\d+)?px)$/.test(String(item.style[`border-${side}`])))) || style.direction === 'rtl')
                      throw Object.assign(new Error(`${item.box.label}: auto margins on a grid item are modeled only with a px or % width (ltr); with an auto width it shrinks to fit its content`), { code: 'U_LAYOUT_CSS', box: item.box });
                  }
                  // justify-self (or the grid's justify-items) start, center or end: the item keeps its own width and moves by
                  // that share of its area's free space, also when it is negative (Chromium aligns grid items unsafely:
                  // measured −90px for a 300px item at end in a 200px area). Its own width is a px width, or with an auto
                  // width a text leaf's fit-content width min(max-content, max(min-content, area)), capped by a px
                  // max-width. Anything else stays Unknown (finish).
                  const justifyShare = item => {
                    const own = String(item.style['justify-self'] ?? 'auto'), v = ['auto', 'normal'].includes(own) ? String(style['justify-items'] ?? 'normal') : own;
                    if (['start', 'flex-start', 'self-start'].includes(v) || (v === 'left' && style.direction !== 'rtl')) return zero;
                    if (v === 'center') return div(one, q(2));
                    if (['end', 'flex-end', 'self-end'].includes(v) || (v === 'right' && style.direction !== 'rtl')) return one;
                    return null;
                  };
                  const justified = (item, region) => {
                    const share = justifyShare(item);
                    if (share === null || style.$blockFlow || autoMargins(item) || style.direction === 'rtl') return null;
                    const st = item.style, pxOf = v => ['0', '0px'].includes(String(v)) ? zero : /^\d+(?:\.\d+)?px$/.test(String(v)) ? px(v) : null;
                    const sideEdges = ['left', 'right'].flatMap(side => [pxOf(st[`padding-${side}`]), pxOf(st[`border-${side}`])]);
                    if (sideEdges.includes(null)) return null;
                    const edgesInline = sideEdges.reduce(add, zero), area = itemInline(item);
                    const place = (r, w) => ({ region: r, offset: times(diff(area, w), share), inline: w });
                    if (/^\d+(?:\.\d+)?px$/.test(String(st['inline-size']))) { const w = scalar(st['box-sizing'] === 'content-box' ? add(px(st['inline-size']), edgesInline) : px(st['inline-size'])); return [place(region, w)]; }
                    const c = item.box.contract;
                    if (String(st['inline-size']) !== 'auto' || !item.box.text || (item.box.children ?? []).length || c?.minInlineSize === undefined || c?.maxInlineSize === undefined) return null;
                    const maxW = String(st['max-inline-size']) === 'none' ? null : pxOf(st['max-inline-size']);
                    if (maxW === null && String(st['max-inline-size']) !== 'none') return null;
                    let lo = add(q(String(c.minInlineSize)), edgesInline);
                    let hi = add(q(String(c.maxInlineSize)), edgesInline);
                    // max-width caps the fit-content width, its min-content end too (measured: a 260px max-width bubble
                    // with a 339px URL at justify-self: end is 260px wide at the end of its area; the URL overflows it).
                    if (maxW !== null) { const cap = st['box-sizing'] === 'content-box' ? add(maxW, edgesInline) : maxW; if (cmp(cap, hi) < 0) hi = cap; if (cmp(cap, lo) < 0) lo = cap; }
                    const out = [];
                    const wide = partition(region, diff(area, scalar(hi)), '>=');
                    for (const r of wide.yes) out.push(place(r, scalar(hi)));
                    for (const r of wide.no) { const mid = partition(r, diff(area, scalar(lo)), '>='); for (const m of mid.yes) out.push(place(m, area)); for (const m of mid.no) out.push(place(m, scalar(lo))); }
                    return out;
                  };
                  const autoOffsets = (item, region) => {
                    const aligned = justified(item, region);
                    if (aligned) return aligned.map(a => ({ ...a, justified: true }));
                    if (!autoMargins(item)) return [{ region, offset: scalar(0) }];
                    if (responsiveBlock(item)) {
                      const st=item.style, edges=['left','right'].map(side=>edgeValue(st,side)).reduce(sum,scalar(zero));
                      const share=st['margin-left']==='auto'?(st['margin-right']==='auto'?div(one,q(2)):one):zero;
                      return bounded(preferredInlinePieces(st,areaInline(item),region,edges,itemInline(item))
                        .flatMap(p=>maximum(p.region,p.value,edges))
                        .flatMap(p=>{
                          const free=diff(itemInline(item),p.value),split=partition(p.region,free,'>=');
                          return [...split.yes.map(r=>({region:r,offset:times(free,share)})),...split.no.map(r=>({region:r,offset:scalar(0)}))];
                        }));
                    }
                    if (blockFill(item)) {
                      const max = String(item.style['max-inline-size']);
                      if (max === 'none') return [{ region, offset: scalar(0) }];
                      const free = diff(itemInline(item), scalar(px(max))), share = item.style['margin-left'] === 'auto' ? (item.style['margin-right'] === 'auto' ? div(one, q(2)) : one) : zero;
                      const split = partition(region, free, '>=');
                      return [...split.yes.map(r => ({ region: r, offset: times(free, share) })), ...split.no.map(r => ({ region: r, offset: scalar(0) }))];
                    }
                    const w = String(item.style['inline-size']), area = itemInline(item);
                    let outer = w.endsWith('%') ? times(areaInline(item), div(q(w.slice(0, -1)), q(100))) : scalar(px(w));
                    // The used width is the width clamped by max-width, then min-width (measured: width: 300px with
                    // min-width: 350px and margin-left: auto ends at the right edge 350px wide). px bounds on a px width only.
                    const minW = String(item.style['min-inline-size'] ?? 'auto'), maxW = String(item.style['max-inline-size'] ?? 'none');
                    if (!['auto', '0', '0px'].includes(minW) || maxW !== 'none') {
                      if (w.endsWith('%') || ![minW, maxW].every(v => ['auto', '0', '0px', 'none'].includes(v) || /^\d+(?:\.\d+)?px$/.test(v)) || item.style['box-sizing'] === 'content-box') throw Object.assign(new Error(`${item.box.label}: auto margins with a min-width or max-width are modeled for a px width and px bounds (border-box) only`), { code: 'U_LAYOUT_CSS', box: item.box });
                      let used = px(w);
                      if (/px$/.test(maxW) && cmp(px(maxW), used) < 0) used = px(maxW);
                      if (/px$/.test(minW) && cmp(px(minW), used) > 0) used = px(minW);
                      outer = scalar(used);
                    }
                    const extra = item.style['box-sizing'] === 'content-box' ? ['left', 'right'].flatMap(side => [item.style[`padding-${side}`], item.style[`border-${side}`]]).filter(v => v && !['0', 'ua'].includes(String(v))).reduce((acc, v) => add(acc, px(v)), zero) : zero;
                    const free = diff(area, sum(outer, scalar(extra)));
                    const share = item.style['margin-left'] === 'auto' ? (item.style['margin-right'] === 'auto' ? div(one, q(2)) : one) : zero;
                    const split = partition(region, free, '>=');
                    return [...split.yes.map(r => ({ region: r, offset: times(free, share) })), ...split.no.map(r => ({ region: r, offset: scalar(0) }))];
                  };
                  const childColumns = item => trackSlice(cs.values, columnGap, box, item.start, item.span);
                  // Block-axis self-alignment (align-self, or the grid's align-items): an item that is not stretched keeps its
                  // own height and is offset in its area by that share of the free space (CSS Box Alignment §6.1).
                  // (A stretched item of auto height is definite, checklist D2: its children's percentage heights resolve
                  // against it — measured in Chromium, Firefox and WebKit; aligned otherwise, they compute to auto.)
                  const gridAlign = item => { if (style.$blockFlow) return {}; const a = crossAlignment(style['align-items'], item.style['align-self']); return a === 'stretch' ? (item.style['block-size'] === 'auto' ? { definiteBlock: true } : {}) : { alignBlock: a }; };
                  if (!block) {
                    let endings = [children.region];
                    for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: itemInline(item), percentInline: areaInline(item), tracks: { inline: childColumns(item) }, gridItem: true, ...(style.$blockFlow && blockFlowPercent ? { percentBlock: blockFlowPercent } : {}), ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item), marginEnd: { inline: marginOf(item, 'right'), block: marginOf(item, 'bottom') }, fitInline: (box.contract?.overflow ?? 'fit') === 'fit' }, r, ancestors, item.inherited ?? style, emit).map(result => result.region)));
                    for (const r of endings) results.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
                    continue;
                  }
                  const rowCount = placed.length ? Math.max(...placed.map(item => item.row + item.rowSpan)) : 0;
                  const sharedRows = inheritedAxes.block;
                  let rows = sharedRows ? sharedRows.values.map(value => ({ definite: value })) : style['grid-template-rows'] === 'none' ? [] : tracks(style['grid-template-rows'], true);
                  const explicitRowCount = rows.length;
                  const implicit = sharedRows ? [] : tracks(style['grid-auto-rows'], true);
                  while (rows.length < rowCount) rows.push(implicit[(rows.length - explicitRowCount) % implicit.length]);
                  if (rows.length > 2048) throw new Error('Grid row limit exceeded');
                  const rowGap = resolvedGap(style, 'row-gap', sharedRows), gaps = scaleGap(rowGap, Math.max(0, rows.length - 1));
                  for (const item of placed) if (rows.slice(item.row, item.row + item.rowSpan).some(row => row.auto || (!knownBlock && row.weight)) &&
                    (item.rowSpan > 1 || item.style['grid-template-rows'] === 'subgrid')) {
                    throw subgridError('Intrinsic row contributions across subgrids or row spans are not modeled; use independently sized parent rows', item.box, children.region, 'block');
                  }
                  let measurements = [{ region: children.region, bases: rows.map(row => row.definite ?? scalar(row.fixed ?? row.edges ?? zero)) }];
                  for (const item of placed.filter(item => rows[item.row].auto || rows[item.row].autoMin || (!knownBlock && rows[item.row].weight))) {
                    // In a bare fr row an item's minimum contribution is its min-height when set, or its edges for a
                    // scroll container (Grid §6.6); otherwise its measured height.
                    if (rows[item.row].autoMin) {
                      if ((item.rowSpan ?? 1) > 1) throw Object.assign(new Error(`${item.box.label} spans several rows, one of them a bare fr row; that is not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box });
                      const st = item.style, pxOf = v => ['0', '0px'].includes(String(v)) ? zero : /^\d+(?:\.\d+)?px$/.test(String(v)) ? px(v) : null;
                      const edgesOf = ['top', 'bottom'].map(side => [pxOf(st[`padding-${side}`]), pxOf(st[`border-${side}`])]).flat();
                      let lower = null;
                      if (st['min-block-size'] !== 'auto') { const m = pxOf(st['min-block-size']); if (m === null || edgesOf.includes(null)) throw Object.assign(new Error(`${item.box.label}: min-height ${st['min-block-size']} in a bare fr row is not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box }); lower = st['box-sizing'] === 'content-box' ? edgesOf.reduce(add, m) : m; }
                      else if (['hidden', 'auto', 'scroll'].includes(String(st['overflow-y']))) { if (edgesOf.includes(null)) throw Object.assign(new Error(`${item.box.label}: UA edges in a bare fr row are not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box }); lower = edgesOf.reduce(add, zero); }
                      if (lower !== null) { const edgesTotal = edgesOf.includes(null) ? zero : edgesOf.reduce(add, zero); if (cmp(lower, edgesTotal) < 0) lower = edgesTotal; measurements = bounded(measurements.flatMap(m => maximum(m.region, m.bases[item.row], sum(scalar(lower), marginBlock(item))).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) })))); continue; }
                    }
                    measurements = bounded(measurements.flatMap(m => (justified(item, m.region) ?? [{ region: m.region }]).flatMap(jr => solve(item.box, { inline: jr.inline ?? itemInline(item), ...(jr.inline ? { justifyHandled: true } : {}), percentInline: areaInline(item), tracks: { inline: childColumns(item) }, gridItem: true, ...(style.$blockFlow && blockFlowPercent ? { percentBlock: blockFlowPercent } : {}), ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item) }, jr.region, ancestors, item.inherited ?? style, false).flatMap(measured => maximum(measured.region, m.bases[item.row], sum(measured.block, marginBlock(item))).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) }))))));
                  }
                  for (const m of measurements) {
                    let fractions = [{ region: m.region, value: scalar(0) }];
                    if (!knownBlock) for (let i = 0; i < rows.length; i++) if (rows[i].weight) {
                      const divisor = cmp(rows[i].weight, one) > 0 ? rows[i].weight : one;
                      fractions = fractions.flatMap(f => maximum(f.region, f.value, times(m.bases[i], div(one, divisor))));
                    }
                    const layouts = sharedRows ? [{ region: m.region, values: sharedRows.values, required: trackArea(sharedRows.values, rowGap, 0, rows.length) }] : knownBlock ? flex(m.region, knownBlock, rows, gaps, m.bases, !['start', 'center', 'end'].includes(style['align-content'])) : fractions.map(f => {
                      const values = rows.map((row, i) => row.weight ? times(f.value, row.weight) : m.bases[i]);
                      return { region: f.region, values, required: sum(total(values), gaps) };
                    });
                    // A block-flow container raised by min-block-size: its rows stay at the top (align-content: start).
                    for (const rs of layouts.flatMap(rs => minBlock && !knownBlock && style.$blockFlow ? minBlock(rs.region).flatMap(m => maximum(m.region, rs.required, m.value).map(x => ({ ...rs, region: x.region, raised: x.value }))) : [rs])) {
                      const contentBlock = knownBlock ?? rs.raised ?? rs.required, blockSize = sum(contentBlock, blockEdges);
                      const finalAncestors = [...parents, { ...own, block: contentBlock, paddingBlock:diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))) }];
                      // A scroll container's automatic minimum size is 0 (CSS Sizing 3 §4.5): in an auto row of a grid whose
                      // height is definite and too small, Chromium shrinks that row toward the item's padding instead of
                      // its content (measured), clipping the item's content. Row sizes there are not modeled: Unknown in the
                      // region where the rows overflow.
                      // (Block flow does not shrink them: block children keep their size and overflow — measured — which is
                      // what the rows here are.)
                      if (emit && knownBlock && !style.$blockFlow) {
                        const shrinking = placed.filter(item => rows[item.row]?.auto && ['overflow-x', 'overflow-y'].some(key => item.style[key] !== 'visible'));
                        const over = shrinking.length && clip(rs.region, diff(rs.required, knownBlock), true);
                        if (over) diagnostics.push({ code: 'U_LAYOUT_GRID_SHRINK', severity: 'unknown', box: box.label, path: box.path, source: box.source, items: shrinking.map(item => item.box.label),
                          message: `${box.label}'s auto rows need more than its height here, and ${shrinking.map(item => item.box.label).join(', ')} ${shrinking.length > 1 ? 'are scroll containers' : 'is a scroll container'} (overflow not visible), whose minimum size is 0: the browser shrinks those rows below their content, which is not modeled`, ...ranges(over) });
                      }
                      if (emit) obligation(contentBlock, rs.required, box, rs.region, 'E_LAYOUT_TRACKS', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit' && !scrolls(style, 'y'), () => explanation(sizeChain([...parents, { box, style }], 'block', { hostInset: options.hostBlockInset }), trackProperties('block').map(property => fact(box, style, property))));
                      let endings = [rs.region];
                      // align-content center/end (unstretched rows in a known height): the rows move by part of the free space.
                      // The free space is what the resolved rows leave (fr rows take it all, so they do not move; measured), not the
                      // rows' required minimum.
                      const rowsUsed = rs.values ? sum(total(rs.values), gaps) : rs.required;
                      const blockLead = knownBlock && ['center', 'end'].includes(style['align-content']) ? times(diff(knownBlock, rowsUsed), style['align-content'] === 'center' ? div(one, q(2)) : one) : scalar(zero);
                      for (const item of placed) endings = bounded(endings.flatMap(r0 => autoOffsets(item, r0)).flatMap(({ region: r, offset: autoLead, inline: alignedInline, justified }) => solve(item.box, { inline: alignedInline ?? itemInline(item), ...(justified ? { justifyHandled: true } : {}), block: diff(trackArea(rs.values, rowGap, item.row, item.rowSpan), marginBlock(item)), ...gridAlign(item), percentInline: areaInline(item), ...(style.$blockFlow ? (blockFlowPercent ? { percentBlock: blockFlowPercent } : {}) : { percentBlock: trackArea(rs.values, rowGap, item.row, item.rowSpan) }), gridItem: true, ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item), marginEnd: { inline: marginOf(item, 'right'), block: marginOf(item, 'bottom') },
                        origin:cs.shift ? offset(contentOrigin,sum(sum(sum(sum(trackStart(cs.values,columnGap,item.start),cs.shift.lead),times(cs.shift.extra,q(item.start))),marginOf(item, 'left')),autoLead),sum(sum(trackStart(rs.values,rowGap,item.row),blockLead),marginOf(item, 'top'))) : null,
                        tracks: { inline: childColumns(item), block: trackSlice(rs.values, rowGap, box, item.row, item.rowSpan) },
                        fitInline: (box.contract?.overflow ?? 'fit') === 'fit', fitBlock: (box.contract?.overflowBlock ?? 'fit') === 'fit' }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region)));
                      for (const item of children.children.filter(child=>child.style.position==='absolute')) endings = bounded(endings.flatMap(r => {
                        // position: fixed: the viewport is the containing block, unless an ancestor transform (or a clip or
                        // scroll that would move it relative to the page) intervenes, which is not modeled.
                        if (item.style.$fixed) {
                          // An ancestor transform makes that ancestor the containing block of fixed descendants (CSS Transforms 1
                          // §2): the box is placed against it and scrolls with it instead of staying on the viewport.
                          const trap = finalAncestors.findLast(ancestor => ancestor.style && containsFixed(ancestor.style) && ancestor.box);
                          // The trap is a likely bug (a toast or modal meant for the viewport, placed against a header or a
                          // card): a warning besides the Unknown, so it is not only a not-checked line.
                          if (trap && !layoutWarnings.some(w => w.code === 'W_LAYOUT_FIXED_TRAPPED' && w.path === item.box.path)) layoutWarnings.push({ code: 'W_LAYOUT_FIXED_TRAPPED', severity: 'warning', box: item.box.label, path: item.box.path, ancestor: trap.box.label,
                            message: `${item.box.label} is position: fixed, but ${trap.box.label} (${trap.style.transform !== 'none' ? `transform: ${trap.style.transform}` : trap.style['backdrop-filter'] !== 'none' ? `backdrop-filter: ${trap.style['backdrop-filter']}` : `will-change: ${trap.style['will-change']}`}) becomes its containing block: it is placed against ${trap.box.label} and moves with it instead of staying on the viewport. Render it outside that box (a portal to the end of body), or drop the property`, ...ranges(r) });
                          if (trap) throw Object.assign(new Error(`${item.box.label} is position: fixed, but its ancestor ${trap.box.label} has ${trap.style.transform !== 'none' ? `transform: ${trap.style.transform}` : trap.style['backdrop-filter'] !== 'none' ? `backdrop-filter: ${trap.style['backdrop-filter']}` : `will-change: ${trap.style['will-change']}`}, which makes it the containing block: ${item.box.label} is placed against ${trap.box.label} and scrolls with it, not with the viewport. Move it outside that box (for example to the end of body), or drop the property`), { code: 'U_LAYOUT_FIXED_CONTAINED', box: item.box, region: r, ancestor: trap.box.label, ancestorPath: trap.box.path, property: 'transform' });
                          if (finalAncestors.some(ancestor=>ancestor.clipped || ancestor.subgrid || (ancestor.style && (containsFixed(ancestor.style) || ['overflow-x','overflow-y'].some(key=>ancestor.style[key] !== 'visible'))))) throw Object.assign(new Error(`${item.box.label} is position: fixed inside a transformed, clipped or scrolling ancestor`), { code: 'U_LAYOUT_CSS' });
                          const viewport = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
                          return solve(item.box,{inline:viewport.inline,block:viewport.block,containingBlock:{path:'viewport',...viewport}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                        }
                        const containing = finalAncestors.findLast(ancestor=>ancestor.positioned);
                        // No positioned (or transformed) ancestor: the initial containing block — the viewport's size at the
                        // top of the page — places it (CSS 2 §10.1), and it scrolls with the page. Usually a missing
                        // position: relative on the box it was meant to sit in (a badge that jumps to the page corner).
                        // A clipping or scrolling ancestor in between (does it clip the box?) stays Unknown.
                        if (!containing && height && !finalAncestors.some(ancestor=>ancestor.clipped || ancestor.subgrid || (ancestor.style && ['overflow-x','overflow-y'].some(key=>ancestor.style[key] !== 'visible')))) {
                          const parent = finalAncestors.at(-1)?.box;
                          if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_ABSOLUTE_PAGE' && w.path === item.box.path)) layoutWarnings.push({ code: 'W_LAYOUT_ABSOLUTE_PAGE', severity: 'warning', box: item.box.label, path: item.box.path, ...(parent ? { parent: parent.label } : {}),
                            message: `${item.box.label} is position: absolute with no positioned ancestor, so it is placed against the page (the initial containing block), not ${parent ? parent.label : 'its parent'}. Give the box it belongs to position: relative`, ...ranges(r) });
                          const initial = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
                          return solve(item.box,{inline:initial.inline,block:initial.block,containingBlock:{path:'initial',...initial}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                        }
                        // A containing block that hides its overflow (overflow: hidden, not scrolling) clips the box at its
                        // padding box: the box is laid out as usual, and what reaches past that edge is cut off
                        // (E_LAYOUT_ABSOLUTE_CLIPPED). Any other clipping ancestor stays Unknown.
                        const clipping = finalAncestors.filter(ancestor => ancestor.clipped);
                        const immediate = finalAncestors.at(-1);
                        const hiddenClip = ancestor => ['hidden','visible'].includes(ancestor.style?.['overflow-x']) && ['hidden','visible'].includes(ancestor.style?.['overflow-y']);
                        // A projected independent rectangle is explicitly at scroll offset zero.
                        // Nested hidden overflow does not change a direct containing block's
                        // border/padding geometry. Do not relax the ordinary full-page
                        // clipping/integrity model or claim the rectangle is visible.
                        const projectedClip = preferences.includes('independent-rectangle') &&
                          preferences.includes('scroll-zero') && containing===immediate &&
                          clipping.includes(immediate) && clipping.every(hiddenClip) &&
                          !finalAncestors.some(a=>a.clipScope||a.subgrid||containsFixed(a.style??{}));
                        const ownClip = (clipping.length === 1 && clipping[0] === immediate && hiddenClip(immediate)) || projectedClip;
                        // A scroll container that is the containing block: the box is placed against its padding box at
                        // scroll offset 0 and scrolls with the content (what reaches past the end extends the scrollable
                        // area instead of being cut off). Its size is known; its position, like the content's, only at
                        // offset 0 (scroll-zero), so it has none otherwise.
                        const ownScroll = clipping.length === 1 && clipping[0] === finalAncestors.at(-1) && containing === clipping[0] && [clipping[0].style?.['overflow-x'], clipping[0].style?.['overflow-y']].every(v => ['auto', 'scroll', 'hidden', 'visible'].includes(String(v))) && !ownClip;
                        if (!containing?.paddingBlock || containing.subgrid || (clipping.length && !ownClip && !ownScroll)) throw new Error('Absolute boxes require an owned non-scrolling, unclipped containing block without subgrid placement');
                        if (ownClip) containing.clips = { box: immediate.box.label, x: immediate.style['overflow-x'] === 'hidden', y: immediate.style['overflow-y'] === 'hidden' };
                        return solve(item.box,{inline:containing.paddingInline,block:containing.paddingBlock,
                          containingBlock:{path:containing.box.path,inline:containing.paddingInline,block:containing.paddingBlock,origin:containing.paddingOrigin,...(containing.clips ? { clips: containing.clips } : {})}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                      }));
                      for (const r of endings) results.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
                    }
                  }
                }
              }
              }
            }
          }
        }
        }
      }
    } catch (error) {
      if (error.code?.startsWith('E_LAYOUT_')) issue(error.code, error.message, error.box ?? box, error.region ?? region, error.axis);
      else if (error.code === 'U_LAYOUT_FIXED_CONTAINED') diagnostics.push({ code: error.code, severity: 'unknown', message: error.message, box: error.box.label, path: error.box.path, source: error.box.source, ancestor: error.ancestor, ancestorPath: error.ancestorPath, property: error.property, ...ranges(error.region) });
      else if (error.code === 'U_LAYOUT_SUBGRID') diagnostics.push({ code: error.code, severity: 'unknown', message: error.message, box: error.box.label, path: error.box.path, source: error.box.source, axis: error.axis, ...ranges(error.region) });
      else unknown(error.code?.startsWith('U_LAYOUT_') ? error.code : 'U_LAYOUT_GEOMETRY', error.message, error.css?.line, error.box ?? box,error.css?.file);
    }
    return results;
  }
  if (!diagnostics.length) {
    try {
      let environments = [{ region: initial, style: undefined, paint: [] }];
      for (let i = 0; i < (options.ancestors ?? []).length; i++) {
        const ancestor = options.ancestors[i];
        const host = { ...ancestor, classes: ancestor.classes ?? [], documentRoot: i === 0 && ancestor.tag === 'html', label: `ancestor:${ancestor.tag}`, path: `ancestor/${i}` };
        environments = bounded(environments.flatMap(environment => styles(host, environment.region, [], environment.style, false, false).map(state => ({ ...state, paint: [...environment.paint, paintFacts(state.style)] })).filter(state => {
          if (state.style.display === 'none') { unknown('U_LAYOUT_ANCESTOR', 'A hidden ancestor cannot provide the declared containing sizes', undefined, host); return false; }
          if (state.style['container-type'] === 'normal') return true;
          unknown('U_LAYOUT_ANCESTOR', 'Query containers need size geometry; include this ancestor in the analyzed template', undefined, host); return false;
        })));
      }
      for (const environment of environments) (ancestorPaint = environment.paint ?? [], solve(root, { root: true,origin:{inline:scalar(0),block:scalar(0)}, inline: diff(width, scalar(options.hostInset ?? 0)), block: block && options.viewport.height ? diff(height, scalar(options.hostBlockInset ?? 0)) : null }, environment.region, [], environment.style));
    } catch (error) { unknown(error.code?.startsWith('U_LAYOUT_') ? error.code : 'U_LAYOUT_ANCESTOR', error.message,error.css?.line,undefined,error.css?.file); }
  }
  // Checklist F where the layout did not run to the end: a style walk over every box (no layout), so the mistakes in
  // the CSS are reported whatever is Unknown. (Each warning is reported once per box.)
  if (diagnostics.some(d => d.severity === 'unknown') && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !untransformed) {
    const walkStyles = (box, ancestors, inherited) => {
      let state; try { [state] = styles(box, initial, ancestors, inherited, false); } catch { return; }
      if (!state) return;
      try { cssMistakes(box, state.style, ancestors, inherited, true, state.region, undefined); } catch { /* the rest still runs */ }
      for (const kind of ['before', 'after']) try {
        const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : (box.children ?? []).length}`, label: `${box.label}::${kind}`, children: [], pseudo: kind };
        for (const c of styles(pbox, initial, ancestors, state.style, false, false, new Set([`::${kind}`]))) pseudoWithoutContent(pbox, c.style);
      } catch { /* the rest still runs */ }
      if (state.style.display === 'none') return;
      for (const child of box.children ?? []) walkStyles(child, [...ancestors, { box, style: state.style, names: [] }], state.style);
      // The inline elements of a text leaf (links, spans): the checks that hold for an inline box (F36).
      const walkInline = (child, chain, parentStyle) => {
        let c; try { [c] = styles(child, initial, chain, parentStyle, false, false); } catch { return; }
        if (!c || c.style.display === 'none') return;
        try { inlineStateTransforms(child, c.style); } catch { /* the rest still runs */ }
        try { inlineTextAlignment(child, c.style); } catch { /* the rest still runs */ }
        try { inlineAutoMargin(child, c.style); } catch { /* the rest still runs */ }
        try { inlineOverflow(child, c.style); } catch { /* the rest still runs */ }
        try { decorationNone(child, c.style, chain); } catch { /* the rest still runs */ }
        try { firstPseudoInert(child, c.style); } catch { /* the rest still runs */ }
        for (const grand of child.inline ?? child.children ?? []) walkInline(grand, [...chain, { box: child, style: c.style, names: [] }], c.style);
      };
      for (const child of box.inline ?? []) walkInline(child, [...ancestors, { box, style: state.style, names: [] }], state.style);
    };
    try { walkStyles(root, [], undefined); } catch { /* best effort */ }
  }
  // F37: a ::first-letter / ::first-line that may apply (a block container it selects, not shown to have none) restyles
  // text in a way that is not modeled.
  for (const note of firstPseudo) {
    const open = boxes.find(box => !box.pseudo && note.selectors.some(sel => matches(sel, box, new Set([`::${sel.pseudoElement}`, ...(sel.state ? [sel.state] : [])])) && !firstInert.has(`${box.path}|${sel.source}`)));
    if (open) unknown('U_LAYOUT_SELECTOR', `${note.selector} restyles the first letter or line of ${open.label}, which is not modeled`, note.line, open, note.file);
  }
  flushObligations();
  let integrityWarnings = [], integrityExempted = [], accessibilityWarnings = [], accessibilityNotes = [], accessibilityExempted = [];
  if (options.integrity && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeIntegrity({ geometry, waived }, { block, targetSize: options.integrity.targetSize ?? 24, protrusion: options.integrity.protrusion ?? 'all', ranges });
    diagnostics.push(...judged.findings);
    integrityWarnings = judged.warnings; integrityExempted = judged.exempted;
  }
  if (options.accessibility && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeAccessibility({ geometry, waived, root, domain: initial }, { scrollZero: preferences.includes('scroll-zero'), defaultColors: options.defaultColors && !preferences.includes('prefers-color-scheme:dark') && !rules.some(rule => rule.declarations.some(d => d.property === 'color-scheme' && /dark/.test(String(d.value)))) ? { canvas: '#ffffff', canvastext: '#000000' } : null, forcedColorsHandled: rules.some(rule => rule.preferences?.some(p => p.feature === 'forced-colors')), smoothReduced: rules.some(rule => rule.declarations.some(d => d.property === 'scroll-behavior') && (rule.preferences?.some(p => p.feature === 'prefers-reduced-motion'))), keyframeFrames, hostInset: options.hostInset ?? 0, hostBlockInset: options.hostBlockInset ?? 0, viewportBlock: block && options.viewport.height ? height : null, scrollPaddingDeclared: rules.some(rule => rule.declarations.some(d => /^scroll-padding-(?:top|bottom)$/.test(d.property))), viewportMin: options.viewport.min, contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), ranges, block });
    diagnostics.push(...judged.findings, ...judged.unknowns);
    // Dark color scheme: when the CSS has prefers-color-scheme: dark rules, the contrast rules run
    // again with them (paint only, so the geometry is the same). System colors stay the light ones:
    // the color-scheme property is outside the subset.
    if (pristine && rules.some(rule => rule.preferences?.some(p => p.feature === 'prefers-color-scheme' && p.value === 'dark') || rule.declarations.some(d => d.property === 'color-scheme' && /\bdark\b/.test(d.value) && /\blight\b/.test(d.value)))) {
      const dark = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], ['prefers-color-scheme:dark']);
      const contrastCodes = new Set(['E_A11Y_CONTRAST', 'U_A11Y_CONTRAST', 'E_A11Y_STATE_CONTRAST', 'E_A11Y_LINK_IN_TEXT', 'U_A11Y_LINK_IN_TEXT', 'E_A11Y_FOCUS_VISIBLE']);
      // A finding that holds in both schemes is reported once, with `alsoUnder`.
      const same = (a, b) => a.code === b.code && a.path === b.path && a.message === b.message && JSON.stringify([a.range, a.heightRange, a.regionConstraints, a.state]) === JSON.stringify([b.range, b.heightRange, b.regionConstraints, b.state]);
      for (const d of dark.diagnostics.filter(d => contrastCodes.has(d.code))) {
        const light = diagnostics.find(l => same(l, d));
        if (light) light.alsoUnder = [...(light.alsoUnder ?? []), 'prefers-color-scheme: dark'];
        else diagnostics.push({ ...d, preference: 'prefers-color-scheme: dark', message: `${d.message} (prefers-color-scheme: dark)` });
      }
    }
    // Text inside a scroll container under a box painted over it (U_A11Y_SCROLLED_COVER): laid out again at scroll offset
    // 0, the page's initial view, where positions inside are exact. A text start or first line hidden there is an error
    // at the initial scroll position; the other offsets stay Unknown.
    const scrolledCovers = diagnostics.filter(d => d.code === 'U_A11Y_SCROLLED_COVER');
    const alignedScroller = geometry.some(row => row.overflow === 'scroll' && row.alignsContent && !row.box.documentRoot);
    if (pristine && (scrolledCovers.length || alignedScroller)) {
      const zero = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], ['scroll-zero']);
      // Content before a scroll container's start edge (any scroll offset: it never scrolls there).
      for (const d of zero.diagnostics.filter(d => d.code === 'E_A11Y_SCROLL_START_UNREACHABLE'))
        if (!diagnostics.some(x => x.code === d.code && x.path === d.path && x.edge === d.edge && JSON.stringify([x.range, x.heightRange]) === JSON.stringify([d.range, d.heightRange]))) diagnostics.push(d);
      // The scroll range from offset 0: the end of a scroller's content covered at every offset.
      for (const d of zero.diagnostics.filter(d => d.code === 'E_A11Y_SCROLL_END_COVERED'))
        if (scrolledCovers.some(u => d.path.startsWith(`${u.path}/`) && u.cover === d.cover) && !diagnostics.some(x => x.code === d.code && x.path === d.path && JSON.stringify([x.range, x.heightRange]) === JSON.stringify([d.range, d.heightRange]))) diagnostics.push(d);
      for (const d of zero.diagnostics.filter(d => ['E_A11Y_TEXT_START_OBSCURED', 'E_A11Y_TEXT_LINE_OBSCURED'].includes(d.code)))
        if (scrolledCovers.some(u => d.path.startsWith(`${u.path}/`) && u.cover === d.cover) && !diagnostics.some(x => x.code === d.code && x.path === d.path && JSON.stringify([x.range, x.heightRange, x.regionConstraints]) === JSON.stringify([d.range, d.heightRange, d.regionConstraints])))
          diagnostics.push({ ...d, scrollOffset: 0, message: `${d.message} (at the initial scroll position of ${scrolledCovers.find(u => d.path.startsWith(`${u.path}/`)).box}; other scroll offsets are not checked)` });
    }
    // Focus rules that change layout: each focusable box they can reach is laid out again focused, and the geometric
    // focus findings for that box come from that layout instead of the unfocused one.
    if (pristine && rules.some(rule => rule.stateLayout)) {
      const geometricFocus = new Set(['E_A11Y_FOCUS_OBSCURED', 'E_A11Y_FOCUS_OFFSCREEN', 'E_A11Y_FOCUS_CLIPPED', 'E_A11Y_FOCUS_SCROLLED_UNDER', 'E_A11Y_FOCUS_AREA', 'E_A11Y_FOCUS_CLIPPED_AWAY']);
      const layoutRules = rules.filter(rule => rule.stateLayout);
      const all = []; (function walk(box, chain) { all.push({ box, chain }); for (const child of box.children ?? []) walk(child, [...chain, box]); })(root, []);
      const reached = ({ box, chain }) => layoutRules.some(rule => rule.selectors.some(selector => (selector.state !== 'focus-within' && matches(selector, box, new Set(['focus', 'focus-visible', 'focus-within']))) || (selector.state === 'focus-within' && [...chain, box].some(a => matches(selector, a, new Set(['focus-within']))))));
      for (const entry of all.filter(entry => focusableBox(entry.box) && reached(entry))) {
        const focused = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], [`focus-at:${entry.box.path}`]);
        for (let i = diagnostics.length - 1; i >= 0; i--) if (diagnostics[i].path === entry.box.path && geometricFocus.has(diagnostics[i].code)) diagnostics.splice(i, 1);
        if (focused.status === 'unknown') { diagnostics.push({ code: 'U_A11Y_FOCUS_LAYOUT', severity: 'unknown', message: `${entry.box.label}: its focused layout is not decided (${focused.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: entry.box.label, path: entry.box.path, rule: 'focus-obscured' }); continue; }
        for (const d of focused.diagnostics.filter(d => d.path === entry.box.path && geometricFocus.has(d.code))) diagnostics.push({ ...d, message: `${d.message} (in its focused layout)`, focusedLayout: true });
        // Boxes the focused layout moves (a :focus border or padding that changes size): Layout Instability excuses
        // shifts right after a key press, but the content still jumps under the keyboard user. Compared like hover.

        for (const row of sizes) {
          if (layoutWarnings.some(w => w.code === 'W_LAYOUT_FOCUS_SHIFT' && w.path === row.path && w.focusedPath === entry.box.path) || !layoutRectangle(row) || !row.$shown?.region) continue;
          for (const other of focused.sizes.filter(o => o.path === row.path && layoutRectangle(o) && o.$shown?.region)) {
            const shared = intersect(row.$shown.region, other.$shown.region);
            if (!shared) continue;
            const moved = firstStartMove(layoutRectangle(row), layoutRectangle(other), shared);
            if (!moved) continue;
            const { field, v, delta } = moved;
            layoutWarnings.push({ code: 'W_LAYOUT_FOCUS_SHIFT', severity: 'warning', box: row.box, path: row.path, focused: entry.box.label, focusedPath: entry.box.path, field, delta: exact(delta),
              message: `Focusing ${entry.box.label} moves ${row.box} (${field} by ${number(delta)}px at viewport ${number(v.x)}px${block ? ` × ${number(v.y)}px` : ''}): the content jumps as the keyboard user tabs. Draw the focus with outline or box-shadow, or keep the size (border-color instead of border-width)` });
            break;
          }
        }
      }
    }
    // Profile: drop the rules outside it; every accessibility row carries its usefulness tier.
    const keep = accessibilityProfiles[options.accessibility.profile ?? 'all'];
    if (!keep) throw Object.assign(new Error(`Unknown accessibility profile ${options.accessibility.profile}`), { code: 'U_LAYOUT_OPTIONS' });
    const tiered = list => list.filter(d => !d.rule || keep(d.rule)).map(d => d.rule ? { ...d, tier: ruleTier(d.rule) } : d);
    const kept = diagnostics.flatMap(d => d.rule && accessibilityRules.includes(d.rule) ? tiered([d]) : [d]);
    diagnostics.length = 0; diagnostics.push(...kept);
    accessibilityWarnings = tiered(judged.warnings); accessibilityNotes = judged.notes; accessibilityExempted = judged.exempted;
  }
  // accessible-name from the markup alone, where the layout is Unknown (and the geometric checks did not run): a button
  // or link with no text, no image text and no naming attribute has no name whatever its geometry. It is reported
  // only when no CSS rule could hide it (display: none, visibility hidden/collapse, content-visibility: hidden) or
  // give it generated text (content), and no ancestor hides it from the accessibility tree.
  else if (options.accessibility && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant
    && !rules.some(rule => rule.declarations.some(d => d.property === 'content' || (d.property === 'display' && String(d.value) === 'none') || (d.property === 'visibility' && /hidden|collapse/.test(String(d.value))) || (d.property === 'content-visibility' && String(d.value) === 'hidden')))) {
    const speaks = box => box.text || box.inline?.length || (box.textContent ?? '').trim() || (box.tag === 'img' && (box.alt ?? '').trim()) || box.alt === undefined && box.tag === 'img' || (box.tag === 'svg' && box.named) || (box.children ?? []).some(speaks) || (box.inline ?? []).some(speaks);
    // label elements by for= (a field is labelled by a wrapping label or label[for=id] whose text is present).
    const labelsFor = new Map(); (function collect(box) { if (box.tag === 'label' && box.labelFor) labelsFor.set(box.labelFor, [...(labelsFor.get(box.labelFor) ?? []), box]); for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) collect(child); })(root);
    const labelSpeaks = (label, field) => label.text || (label.textContent ?? '').trim() || [...(label.children ?? []), ...(label.inline ?? [])].some(child => child !== field && speaks(child));
    const fieldOf = box => ['select', 'textarea'].includes(box.tag) || (box.tag === 'input' && !['hidden', 'submit', 'reset', 'button', 'image'].includes(box.inputType));
    const widget = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'treeitem', 'gridcell']);
    const owners = { option: ['listbox'], treeitem: ['tree'], gridcell: ['grid', 'treegrid'], menuitem: ['menu', 'menubar'], menuitemcheckbox: ['menu', 'menubar'], menuitemradio: ['menu', 'menubar'] };
    const roleOfBox = box => box.role && box.role !== 'dynamic' ? box.role.split(/\s+/)[0] : undefined;
    const walk = (box, hidden, wrappingLabel = null, ancestorsRoles = []) => {
      // UA-hidden: a popover (closed until shown), a dialog that is not open, and a closed details' content.
      const gone = hidden || box.ariaHidden || box.hiddenAttr || box.inert || box.popover || (box.tag === 'dialog' && box.dialogOpen !== true) || box.tag === 'template';
      const control = !box.pseudo && (box.tag === 'button' || (box.tag === 'a' && box.focusable !== false && box.href !== undefined));
      // An exposed img without an alt attribute (role none/presentation or aria-hidden take it out of the tree).
      if (box.tag === 'img' && !box.pseudo && !gone && box.alt === undefined && !['none', 'presentation'].includes(String(box.role ?? '').split(/\s+/)[0]))
        diagnostics.push({ code: 'E_A11Y_IMAGE_ALT', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'image-alt', ...ranges(initial),
          message: `${box.label} has no alt; use alt="" if it is decorative (checked from the markup; the layout was not analysed)` });
      if (control && !gone && !box.named && !box.labelledBy && !speaks(box))
        diagnostics.push({ code: 'E_A11Y_NAME', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'accessible-name', ...ranges(initial),
          message: `${box.label} has no accessible name: no text, no image text and no aria-label, aria-labelledby or title (checked from the markup; the layout was not analysed)` });
      // form-label: a field with no aria name and no label with text (label[for] or a wrapping label).
      if (!box.pseudo && !gone && fieldOf(box) && box.named !== 'dynamic' && box.inputType !== 'dynamic' && !labelsFor.has('dynamic')) {
        const labelled = box.named === true || (wrappingLabel && labelSpeaks(wrappingLabel, box)) || (box.id && (labelsFor.get(box.id) ?? []).some(l => labelSpeaks(l, box)));
        if (!labelled && !box.labelledBy) diagnostics.push(box.placeholder
          ? { code: 'W_A11Y_PLACEHOLDER_LABEL', severity: 'warning', box: box.label, path: box.path, source: box.source, rule: 'form-label', ...ranges(initial), message: `${box.label} is named only by its placeholder, which disappears on input (checked from the markup; the layout was not analysed)` }
          : { code: 'E_A11Y_LABEL', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'form-label', ...ranges(initial), message: `${box.label} has no label: add a visible <label>, aria-label, aria-labelledby or title (checked from the markup; the layout was not analysed)` });
      }
      // interactive-role-focusable: a widget role on an element that cannot take focus (items of a composite widget get it
      // from their owner).
      const role = roleOfBox(box);
      if (!box.pseudo && !gone && role && widget.has(role) && !(owners[role] ?? []).some(o => ancestorsRoles.includes(o))
        && !(box.focusable === true || box.tabIndex >= 0 || ['button', 'input', 'select', 'textarea'].includes(box.tag) || (box.tag === 'a' && box.href !== undefined && box.focusable !== false)))
        diagnostics.push({ code: 'E_A11Y_ROLE_FOCUS', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'interactive-role-focusable', ...ranges(initial), message: `${box.label} has role ${role} but cannot take focus; add tabindex="0" (checked from the markup; the layout was not analysed)` });
      for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) walk(child, gone || (box.tag === 'details' && box.detailsOpen !== true && child.tag !== 'summary'), box.tag === 'label' ? box : wrappingLabel, role ? [...ancestorsRoles, role] : ancestorsRoles);
    };
    walk(root, false);
  }
  // Layout rectangles: a transform moves the painted box but not the layout box (a layout shift ignores it; measured
  // in docs/cls-evaluation.md). With a transform anywhere, every row's layoutRect comes from the untransformed
  // re-layout, matched by path and condition region; a row without a match gets layoutRect null (not decided).
  if (pristine && sawTransform && !diagnostics.some(d => d.severity === 'unknown')) {
    const plain = analyzeBoxTree(pristine, options, scrollbarProfile, budget, inlineSheets, [], [...preferences, 'untransformed']);
    const matches = matchLayoutRectangles(sizes, plain.sizes, plain.status !== 'unknown');
    sizes.forEach((row, i) => { row.layoutRect = matches[i]; });
  }
  if (pristine && hovered === undefined && !options.$animationFrame && !options.$slideVariant && rules.some(rule => rule.hoverLayout) && !diagnostics.some(d => d.severity === 'unknown')) {
    checkHoverShifts({root,rules,block,sizes,diagnostics,ranges,analyze:path=>analyzeBoxTree(pristine,options,scrollbarProfile,budget,inlineSheets,[],[`hover-at:${path}`])});
  }
  if (pristine && hovered === undefined && !options.$animationFrame && !options.$slideVariant && animated.length && !diagnostics.some(d => d.severity === 'unknown')) {
    checkAnimationShifts({block,sizes,diagnostics,ranges,animated,keyframeFrames,heightKnown:Boolean(options.viewport.height),
      analyze:(path,css)=>analyzeBoxTree(pristine,{...options,$animationFrame:{path,css}},scrollbarProfile,budget,inlineSheets,[],preferences)});
  }
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant)
    checkLayoutWarnings({block,options,scrollbarProfile,geometry,sizes,boxes,diagnostics,layoutWarnings,ranges,context,isZeroAffine});
  if (pristine && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    checkCarouselShifts({root,pristine,block,diagnostics,ranges,
      analyze:copy=>analyzeBoxTree(copy, { ...options, $slideVariant: true }, scrollbarProfile, budget, inlineSheets, [], preferences)});
  }
  checkQueryCoverage({diagnostics,layoutWarnings,sourceUse,queryFacts});
  return buildLayoutReport({component,block,options,initial,rules,styleSources,boxes,geometry,ranges,diagnostics,policies,checks,sizes,queries,subgrids,scrollbars,invalidSubstitutions,layoutWarnings,pageScroll,transitionSizes,textFonts,untransformed,hovered,generatedTexts,accessibilityWarnings,accessibilityExempted,accessibilityNotes,integrityWarnings,integrityExempted});
}
