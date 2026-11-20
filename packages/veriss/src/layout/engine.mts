// Recursive layout orchestration. Geometry and diagnostics are delegated to the typed solver modules.
import type {SolverBox,SolverStyle,SolverAncestor,SolverAvailable,SolvedBox,ResolveStyle} from './engine-solver-types.mjs';
import type {EngineOptions} from './input.mjs';
import type {NormalizedBox,TreeDiagnostic} from '../tree.mjs';
import type {LayoutSummary,LayoutDiagnostic,LayoutWarning,LayoutScrollbarProfile,LayoutTransitionSize,LayoutGeneratedText,LayoutSubgrid} from '../layout-contracts.d.ts';
import type {EngineGeometry,EngineSize} from './engine-finish.mjs';
import type {PaintFacts} from './accessibility.mjs';
import type {Rational} from './linear.mjs';
import type {Affine2,Region} from './region.mjs';
import type {Axis,DimensionValue,Dimensions,Side} from './engine-types.mjs';
import type {TableProbe} from './engine-table.mjs';
import type {AnimatedBox} from './engine-state-shifts.mjs';
import type {PseudoContract} from './engine-children.mjs';
import {measureGridRows} from './engine-rows.mjs';
import {resolveBlockSizes,leafHeights} from './engine-block-size.mjs';
import {solvePositionedChild} from './engine-out-of-flow.mjs';
import {collectLayoutChildren} from './engine-children.mjs';
import {createGridItemAllocator} from './engine-grid-items.mjs';
import {normalizeGridPercentages,planGridColumns,resolveGridColumns} from './engine-columns.mjs';
import {prepareBlockChildren} from './engine-block-flow.mjs';
import {checkUnknownStyles,checkMarkupAccessibility} from './engine-fallback.mjs';
import {normalizeLayoutState} from './engine-normalize.mjs';
import {createFinalizer,focusableBox} from './engine-finish.mjs';
import {createInlineSolver} from './engine-inline.mjs';
import {createStyleValidator} from './engine-validate.mjs';
import {createStyleResolver} from './engine-style.mjs';
import {layoutError} from './engine-errors.mjs';
import type {EngineReport} from './engine-report.mjs';
import {buildLayoutReport} from './engine-report.mjs';
import {checkQueryCoverage} from './engine-coverage.mjs';
import {checkHoverShifts,checkAnimationShifts} from './engine-state-shifts.mjs';
import {checkLayoutWarnings} from './engine-warnings.mjs';
import {hasCarousel,checkCarouselShifts} from './engine-carousel.mjs';
import {preflight} from './engine-preflight.mjs';
import {createObligationCollector} from './engine-obligations.mjs';
import {createPositionSolver} from './engine-positioning.mjs';
import { createQuerySolver } from './engine-queries.mjs';
import { createFlexLayout } from './engine-flex.mjs';
import {createEdgeSolver,clamp,ratioOf,preferredInlinePieces} from './engine-edges.mjs';
import {q,add,mul,cmp,div,exact,number} from './linear.mjs';
import {scalar,asAffine,width,height,sum,diff,times,evaluate,sample,rectangle,clip,partition} from './region.mjs';
import { validateOptions } from './input.mjs';
import { parseLayoutCSS, matches, px, setRootFontSize, setSafeArea, containsFixed, setUAProfile, viewportLength, animationsOf, transitionsOf, dependentProperty } from './css.mjs';
import { resolveUAProfile } from './ua-profile.mjs';
import {place,parseAreas,expandTracks} from './grid.mjs';
import {PARENT,ignoringSiblings,placeholderField,requiredCapable,optionalDivergent,optionalDivergence,asFormField,readWriteKnown,asEditable,langMatches,directionality} from './selectors.mjs';
import { droppedOf, droppedPairs, droppedValue } from './dropped.mjs';
import { createCssMistakes } from '../rules/css-mistakes.mjs';
import {trackArea,trackSlice} from './subgrid.mjs';
import { scrollbarFrames } from './scrollbars.mjs';
import {judgeIntegrity, intersect } from './integrity.mjs';
import {judgeAccessibility, accessibilityRules, accessibilityProfiles, ruleTier, paintFacts} from './accessibility.mjs';
import {fact,sizeChain,sizeProperties,trackProperties,explanation} from './explain.mjs';
import { createIntrinsicSolver, intrinsicBlock, measureLegend } from './engine-intrinsic.mjs';
import { tableAsGrid as tableAsGridImpl, tablePlacement } from './engine-table.mjs';
import {offset} from './engine-transforms.mjs';
import {createTrackSolver} from './engine-tracks.mjs';
import { unitContext, lengthPieces, length, layoutRectangle, firstStartMove, matchLayoutRectangles } from './engine-geometry.mjs';

type StyleContext=Parameters<typeof createStyleResolver>[0];
type A11y=NonNullable<LayoutSummary['accessibility']>;
type Integrity=NonNullable<LayoutSummary['integrity']>;

const zero = q(0), one = q(1);
const total = (values:readonly Affine2[]) => values.reduce(sum, scalar(0));
const trackStart = (values:readonly Affine2[],gap:DimensionValue,index:number) => sum(total(values.slice(0,index)),times(asAffine(gap),q(index)));
let uaEngine:string|undefined; // the engine of the ua option's profile (set per analysis, like the UA profile in css.mjs)

// `preferences` (internal) names non-default user preferences, e.g. 'prefers-color-scheme:dark'.
export function analyzeBoxTree(root:SolverBox,options:EngineOptions,scrollbarProfile:LayoutScrollbarProfile|undefined,budget:{remaining:number},inlineSheets:readonly {css:string;file:string}[]=[],inputDiagnostics:readonly TreeDiagnostic[]=[],preferences:readonly string[]=[]):EngineReport {
  // A hovered re-layout (hover-at:<path>) still needs its own untransformed re-layout, so it keeps a pristine copy.
  const hovered = preferences.find(p => p.startsWith('hover-at:'))?.slice(9);
  const pristine = (options.accessibility || options.integrity || /:hover|@(?:-webkit-)?keyframes|@starting-style/i.test(String(options.css ?? '')) || inlineSheets.length || hasCarousel(root)) && preferences.every(p => p.startsWith('hover-at:')) ? structuredClone(root) : null;
  // The untransformed re-layout (CSS transforms removed): the layout boxes, which is what a layout shift compares.
  const untransformed = preferences.includes('untransformed');
  let sawTransform = false;
  const layoutWarnings:LayoutWarning[] = [], generatedTexts:LayoutGeneratedText[] = [], textFonts:StyleContext["textFonts"] = new Map(), transitionSizes:LayoutTransitionSize[] = [];
  // Checklist E1: whether the page fits the viewport and whether it overflows it somewhere in the viewport range, and
  // whether html keeps a scrollbar gutter either way (scrollbar-gutter: stable, overflow-y: scroll) or never shows one
  // (overflow-y: hidden or clip).
  let pageScroll:LayoutSummary['pageScroll'];
  const animated:AnimatedBox[] = []; // boxes with a running animation whose keyframes lay out: {box, region, name}
  const domain = validateOptions(options), block = options.block ?? Boolean(options.viewport.height);
  const component = options.name ?? 'Document';
  const h = options.viewport.height ?? { min: 0, max: 0 };
  const initial = rectangle(domain, { min: q(h.min), max: q(h.max) });
  const diagnostics:LayoutDiagnostic[] = [...inputDiagnostics], policies:LayoutSummary['policies'] = [], sizes:EngineSize[] = [], queries:LayoutSummary['queries'] = [], queryFacts:StyleContext['queryFacts'] = [], sourceUse:StyleContext['sourceUse'] = new Map(), subgrids:LayoutSubgrid[] = [], scrollbars:NonNullable<LayoutSummary['scrollbars']> = [], invalidSubstitutions:NonNullable<LayoutSummary['invalidSubstitutions']> = [];
  // Live geometry and waived obligations for the opt-in integrity rules.
  const geometry:EngineGeometry[] = [];
  const {checks, waived, ranges, cellGrows, scrolls, obligation, flush:flushObligations} = createObligationCollector<SolverBox>({block, diagnostics, scrollIntent:options.scrollIntent});
  // Paint facts of the options.ancestors chain (html, body, …) for the accessibility rules.
  let ancestorPaint:PaintFacts[] = [];
  let work = 0;
  const spend = (count:number) => {
    work += count;
    if(budget) {budget.remaining-=count;if(budget.remaining<0) throw Object.assign(new Error('Combined layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});}
    if (work > 2_000_000) throw Object.assign(new Error('Layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});
  };
  const unknown = (code:string,message:string,line?:number,box?:{label:string;path:string;source?:NormalizedBox["source"]},file = options.cssFile ?? '<css>') => diagnostics.push({ code, severity: 'unknown', message, ...(line ? { css: { file, line } } : {}), ...(box ? { box: box.label, path: box.path, source: box.source } : {}) });
  const issue = (code:string,message:string,box:{label:string;path:string;source?:NormalizedBox["source"]},region:Region,axis?:Axis) => diagnostics.push({ code, severity: 'error', message, box: box.label, path: box.path, source: box.source, ...(axis ? { axis } : {}), ...ranges(region) });
  const boxes:SolverBox[] = [];
  // Parent links for combinator matching (a symbol: a structuredClone of the tree drops them, so set them here).
  const collect = (box:SolverBox):void => { if (box) { boxes.push(box); for (const child of [...box.children, ...(box.inline ?? [])]) child[PARENT] = box; box.children.forEach(collect); } };
  collect(root);
  // Contracts of generated boxes (selector::before / ::after) are applied when the pseudo-element is generated.
  const pseudoContracts:PseudoContract[] = Object.entries(options.boxes ?? {}).flatMap(([selector, contract]) => { const m = /^(.*)::(before|after)$/.exec(selector); return m ? [{ base: m[1]!, kind: m[2]!, selector, contract }] : []; });
  for (const [selector, contract] of Object.entries(options.boxes ?? {}).filter(([selector]) => !/::(?:before|after)$/.test(selector))) {
    const selected = boxes.filter(box => matches(selector, box));
    if (!selected.length) throw new Error(`Layout contract does not match a box: ${selector}`);
    for (const box of selected) { if (box.contract) throw new Error(`Ambiguous layout contracts for ${box.label}`); box.contract = contract; box.contractSelector = selector; }
  }
  // A cell's textRuns contracts size its anonymous text blocks, in DOM order.
  for (const box of boxes.filter(box => box.anonymousRuns)) {
    const runs = box.contract?.textRuns ?? [], anonymous = box.children.filter(child => child.anonymous);
    if (runs.length !== anonymous.length) unknown('U_LAYOUT_INTRINSIC', `${box.label} has ${anonymous.length} anonymous text block(s); give its contract one textRuns entry per text run`, undefined, box);
    anonymous.forEach((child, k) => { if (runs[k]) { child.contract = runs[k]!; child.contractSelector = `${box.contractSelector} text ${k}`; } });
  }
  const styleSources = [...(options.reset ?? []).map((sheet, index) => ({ ...sheet, kind: 'reset' as const, file: sheet.file ?? `<reset:${index}>` })), { css: options.css, kind: 'app' as const, file: options.cssFile ?? '<css>' },...inlineSheets];
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
  const bounded = <T,>(values:T[]):T[] => { spend(values.length); if (values.length > 512) throw new Error('Layout state limit exceeded'); return values; };

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
  function styles(...args:Parameters<ResolveStyle>):ReturnType<ResolveStyle> { return resolveStyles(...args); }
  // A box paints when it has a border or a background (vlmkit's painted-parent filter).
  const paints = (style:SolverStyle) => (['left','right','top','bottom'] as const).some(side => cmp(px(style[`border-${side}`]), zero) > 0) || style['background-image'] !== 'none' ||
    !/^(?:transparent|initial|unset|revert|rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0\s*\)|#(?:[\da-f]{3}0|[\da-f]{6}00)|hsla\([^)]*,\s*0\s*\))$/.test(style['background-color']);
  // Flex sizes: constants compared without splitting a region.
  const intrinsic = (box:SolverBox,content:Affine2,region:Region) => intrinsicBlock(box, content, region, unknown, ranges);
  const validate=createStyleValidator({block,options,rootTag:root.tag,uaEngine:()=>uaEngine,layoutWarnings,policies,issue,ranges});
  const { hasViewportMargin, marginValue, resolvedViewportLength, resolvedGap, padding, edgeValue, hasViewportPadding, isZeroAffine, positivePadding, positiveEdge, responsiveBlockMargins} = createEdgeSolver(viewportLength, bounded, block);
  const {flex, resolveFlexLine, constantItem, breakLines, mainStarts} = createTrackSolver(bounded);
  const layoutFlex = (input:Parameters<ReturnType<typeof createFlexLayout>>[0]) => createFlexLayout({block, options, viewportLength, bounded, frAutoMinimums, scrolls, obligation, solve, finish, resolvedGap, hasViewportMargin, hasViewportPadding, resolvedViewportLength, isZeroAffine, constantItem, resolveFlexLine, breakLines, mainStarts})(input);
  const {generatedElsewhere,inlineContent}=createInlineSolver({styles,edgeValue,generatedTexts,layoutWarnings,geometry,ranges,paints,pseudoWithoutContent,inlineStateTransforms,inlineTextAlignment,inlineAutoMargin,inlineOverflow,firstPseudoInert,decorationNone});
  let finalize:ReturnType<typeof createFinalizer>|undefined;
  function finish(...args:Parameters<ReturnType<typeof createFinalizer>>):SolvedBox {
    finalize ??= createFinalizer({options,block,hovered,scrollbarProfile,getPageScroll:()=>pageScroll,setPageScroll:v=>{pageScroll=v;},geometry,sizes,layoutWarnings,animated,styles,inlineContent,ancestorPaint:()=>ancestorPaint,paints,captionBackdrop,startingRules,keyframeFrames,fontFaces,rules,cover,metaViewport:root.metaViewport,intrinsic,unknown,translated,resolvedOrigin,padding,edgeValue,obligation,cellGrows,ranges});
    return finalize(...args);
  }
  const {translated, resolvedOrigin, subgridGeometry} = createPositionSolver({block, preferences, rootFontSize: () => rootFontSize, resolvedGap, bounded, diagnostics, ranges, subgrids});

  const tableAsGrid = (table:SolverBox,style:SolverStyle,region:Region,parents:readonly SolverAncestor[],emit:boolean,available:SolverAvailable,probe?:TableProbe[]) => tableAsGridImpl({styles, uaEngine}, table, style, region, parents, emit, available, probe);
  // The table's background paints the table box only, not its caption (measured): content of the
  // caption sees through the table's background.
  function captionBackdrop(parent:{box:SolverBox},next:SolverBox,paint:PaintFacts):PaintFacts {
    return parent.box.tag === 'table' && next?.tableCaption ? { ...paint, backgroundColor: 'transparent', backgroundImage: 'none' } : paint;
  }
  const frAutoMinimums = createIntrinsicSolver(styles);
  const renderedLegend = (box:SolverBox,style:SolverStyle,region:Region,parents:readonly SolverAncestor[]) => measureLegend(styles, box, style, region, parents);
  function placeLegend(rendered:NonNullable<ReturnType<typeof renderedLegend>>,origin:Dimensions|null,region:Region,ancestors:readonly SolverAncestor[],emit:boolean) {
    if (rendered.hidden) return;
    const inline = scalar(rendered.inlineSize), block = scalar(rendered.blockSize);
    const legendOrigin = origin ? { inline: sum(origin.inline, scalar(rendered.offset.inline)), block: sum(origin.block, scalar(rendered.offset.block)) } : null;
    finish(rendered.box, rendered.style, region, inline, diff(inline, scalar(rendered.horizontal)), block, diff(block, scalar(rendered.vertical)),
      { inline, block, ...(legendOrigin ? { origin: legendOrigin } : {}) }, ancestors, emit);
  }
  let rootFontSize:Rational|null = null;
  // Safe-area insets: the declared ones under viewport-fit=cover (Unknown when not declared), else 0.
  const cover = /viewport-fit\s*=\s*cover/i.test(String(root.metaViewport ?? ''));
  setSafeArea(cover ? (options.safeArea ? { top: 0, right: 0, bottom: 0, left: 0, ...options.safeArea } : 'unknown') : null);
  unitContext.rootFontSize = null; setRootFontSize(null); setUAProfile(resolveUAProfile(options.ua)); uaEngine = resolveUAProfile(options.ua)?.engine; unitContext.heightKnown = Boolean(block && options.viewport.height);
  // A flex item's main size that a non-auto flex-basis replaces, when no automatic minimum reads it (flex.mjs keeps
  // that case Unknown): the property, or null. The layout treats it as auto; finish() reports it as inert.
  // Shared by actual sizing and block-flow auto-margin placement. CSS uses
  // the final border-box width (after min/max and edge floors), not the
  // specified preferred width, to distribute remaining inline space.
  function solve(box:SolverBox,available:SolverAvailable,region:Region,parents:readonly SolverAncestor[]=[],inherited?:SolverStyle,emit=true):SolvedBox[] {
    const results:SolvedBox[] = [];
    if (emit) box.$starts = { geometry: geometry.length, sizes: sizes.length };
    try {
      // A table with measured rowspan cells whose width varies: split the region where a cell's line count changes.
      const tableStates = (state:{style:SolverStyle;region:Region}) => {
        if (box.tag !== 'table' || state.style.display !== 'table') return [state];
        const probe:TableProbe[] = [];
        try { tableAsGrid(box, state.style, state.region, parents, false, available, probe); } catch { return [state]; }
        let pieces = [state.region];
        for (const { inner, thresholds } of probe) for (const t of thresholds) pieces = pieces.flatMap(r => { const p = partition(r, diff(inner, scalar(t)), '>='); return [...p.yes, ...p.no]; });
        if (pieces.length > 256) throw new Error('Table region limit exceeded');
        return pieces.map(r => ({ ...state, region: r }));
      };
      for (const state of styles(box, region, parents, inherited, emit, !available.root).flatMap(tableStates)) {
        const normalized=normalizeLayoutState({box,state,available,parents,inherited,emit,layoutWarnings,ranges,styles});
        box=normalized.box;
        let {style}=normalized;
        if (box.tag === 'html' && !parents.length && /^\d+(?:\.\d{1,6})?px$/.test(style['font-size']??'')) { rootFontSize = px(style['font-size']!); unitContext.rootFontSize = rootFontSize; setRootFontSize(rootFontSize); }
        // defaultFontSize (the user's default font size, an assumption the caller states): the root's medium, %, em
        // or rem font-size resolves against it, so rem lengths do too.
        else if (box.tag === 'html' && !parents.length && options.defaultFontSize) {
          const fs = String(style['font-size']), base = q(String(options.defaultFontSize));
          const m = fs.match(/^(\d+(?:\.\d{1,6})?)(%|em|rem)$/);
          const size = ['medium', 'ua-default', 'initial', 'unset', 'revert'].includes(fs) ? base : m ? mul(base, m[2] === '%' ? div(q(m[1]!), q('100')) : q(m[1]!)) : null;
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
          const edges = (['top', 'bottom'] as const).map(side => sum(style[`padding-${side}`] === 'ua' ? scalar(zero) : asAffine(padding(style, side)), scalar(style[`border-${side}`] === 'ua' ? zero : px(style[`border-${side}`])))).reduce(sum, scalar(zero));
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
        if (box.tag==='body' && parents.at(-1)?.box.documentRoot && inherited && inherited['overflow-x']==='visible' && inherited['overflow-y']==='visible' && inherited['container-type']==='normal' && style['container-type']==='normal' && (style['overflow-x']!=='visible' || style['overflow-y']!=='visible')) throw Object.assign(new Error('Body overflow propagation requires explicit overflow on html; set html overflow to auto or hidden'),{code:'U_LAYOUT_SCROLLBAR'});
        const incoming=available;
        for (const frame of scrollbarFrames(style,scrollbarProfile,box.documentRoot)) {
        const active=frame.inlineSize>0 || frame.blockSize>0;
        if (active && (style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid')) throw Object.assign(new Error('Scrollbar insets on a shared subgrid axis need an adapter'),{code:'U_LAYOUT_SUBGRID',box,region:state.region,axis:'inline'});
        // Root scrollbars reduce the viewport; local scrollbars reduce the content box.
        const available=box.documentRoot ? {...incoming,inline:diff(incoming.inline,scalar(frame.inlineSize)),block:incoming.block ? diff(incoming.block,scalar(frame.blockSize)) : null,scrollbarFrame:active} : {...incoming,scrollbarFrame:active};
        if(emit && (active || ['auto','scroll'].includes(style['overflow-x']) || ['auto','scroll'].includes(style['overflow-y']))) scrollbars.push({box:box.label,path:box.path,...frame,viewport:Boolean(box.documentRoot),...ranges(state.region)});
        const edge = (sides:readonly Side[]) => sides.map(side => edgeValue(style, side)).reduce(sum, scalar(zero));
        const cssInlineEdges=edge(['left','right']),cssBlockEdges=edge(['top','bottom']);
        const inlineEdges = sum(cssInlineEdges,scalar(box.documentRoot ? 0 : frame.inlineSize)), blockEdges = sum(cssBlockEdges,scalar(box.documentRoot ? 0 : frame.blockSize));
        // The preferred width (a viewport unit or calc() may split the region), as a border-box size.
        // A grid item (or block-flow child) with an aspect-ratio, a definite height and an auto width is not
        // stretched: justify-self: normal behaves as start for it, and its width follows the ratio (Grid §6.2, CSS
        // Sizing 4; measured). Flex items stretch on the cross axis or size by flex: not this case.
        const ratioWidth = block && style['inline-size'] === 'auto' && ratioOf(style) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && available.gridItem && !available.flexItem
          && ['auto', 'normal'].includes(String(style['justify-self'] ?? 'auto')) && style.direction !== 'rtl' && !(typeof available.autoMargins==='object'&&available.autoMargins.inline);
        const ratioInline = () => {
          const h = length(style['block-size'], available.percentBlock ?? available.block, style), r = ratioOf(style);
          if(!r)throw new Error('Unresolved aspect ratio');
          // ratio = height / width, on the box named by box-sizing.
          return style['box-sizing'] === 'content-box' ? sum(times(h, div(one, r)), cssInlineEdges) : times(h, div(one, r));
        };
        const preferredStates = preferredInlinePieces(style,available.percentInline ?? available.inline,state.region,cssInlineEdges,
          style['inline-size']==='auto' && ratioWidth ? ratioInline() : available.inline);
        const edgeExplanation = (axis:Axis) => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), sizeProperties(axis).filter(property => /^(?:padding|border)-/.test(property)).map(property => fact(box, style, property)));
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
          const {maxBlock,minBlock,blockStates}=resolveBlockSizes({box,style,block,available,parents,inline,contentInline,cssBlockEdges,blockEdges,content,emit,obligation,edgeExplanation});
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
            if (emit && style.tableAutoMinimum) { const narrow = clip(bs.region, diff(sum(scalar(style.tableAutoMinimum), scalar(style.tableGaps!)), contentInline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} is narrower than its px columns; automatic layout then shares the width by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableShrink && available.inline) { const narrow = clip(bs.region, diff(scalar(style.tableShrink), available.inline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} has an automatic width wider than its container here, where it shrinks by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableColumns) obligation(diff(contentInline, scalar(style.tableGaps!)), scalar(style.tableColumns), box, bs.region, 'E_LAYOUT_TABLE_WIDTH', 'inline');
            const { axes: inheritedAxes, regions: geometryRegions } = subgridGeometry(style, box, available, bs.region, emit);
            for (const geometryRegion of geometryRegions) {
              // Even an empty Grid has explicit tracks and contributes their
              // height/overflow. Only ordinary leaves use intrinsic height.
              if (!box.children.length && style.display !== 'grid') {
                const heights=leafHeights({box,style,block,geometryRegion,knownBlock,contentInline,maxBlock,blockEdges,minBlock,intrinsic,layoutWarnings,ranges,obligation,emit});
                for (const h of heights) {
                  results.push(finish(box, style, h.region, inline, contentInline, h.value ? sum(h.value, blockEdges) : null, h.value, available, parents, emit));
                  // Absolute ::before/::after of the leaf, against the nearest positioned box (this leaf when it is).
                  for (const kind of box.absolutePseudo ?? []) {
                    const leafOwn = { ...own, paddingBlock: own.paddingBlock ?? (h.value ? diff(sum(h.value, blockEdges), scalar(add(px(style['border-top']), px(style['border-bottom'])))) : null) };
                    const chain = [...parents, leafOwn], containing = [...chain].reverse().find(a => a.positioned);
                    if (!block || !containing?.paddingBlock || !containing.paddingInline || containing.subgrid || chain.some(a => a.clipped)) throw Object.assign(new Error(`${box.label}::${kind} is absolutely positioned without an owned non-scrolling, unclipped containing block`), { code: 'U_LAYOUT_PSEUDO' });
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
              const collect=(region:Region)=>collectLayoutChildren({region,box,style,ancestors,styles,bounded,emit,rendered,isFlex,pseudoContracts,layoutWarnings,contentsInert,tableRowRadius,aspectInert});
              if (isFlex) { for (const result of layoutFlex({ box, style, region: geometryRegion, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit })) results.push(result); continue; }
              style=normalizeGridPercentages(style,contentInline,knownBlock);
              const sharedColumns=inheritedAxes.inline;
              const plans=planGridColumns({box,style,geometryRegion,contentInline,sharedColumns,resolvedGap});
              for (const plan of plans) {
              const columns=plan.columns;
              const {columnGap,justified}=resolveGridColumns({plan,style,contentInline,sharedColumns,resolvedGap,flex});
              for (const cs of justified) {
                if (emit) obligation(contentInline, cs.required, box, cs.region, 'E_LAYOUT_TRACKS', 'inline', (box.contract?.overflow ?? 'fit') === 'fit' && !scrolls(style, 'x'), () => explanation(sizeChain([...parents, { box, style }], 'inline', { hostInset: options.hostInset }), trackProperties('inline').map(property => fact(box, style, property))));
                const childStates = bounded(collect(cs.region).flatMap(c=>style.$blockFlow ? responsiveBlockMargins(c,style,box,parents,available) : [c]));
                for (const children of childStates) {
                  if (!block && children.children.some(child=>child.style.position==='absolute')) throw new Error('Absolute boxes require both-axis analysis');
                  if (!columns.length && children.children.some(child=>child.style.position!=='absolute')) throw new Error('In-flow Grid children require explicit supported columns');
                  prepareBlockChildren({children,box,style,parents,ancestors,available,emit,warningRegion:bs.region,layoutWarnings,ranges,styles,positiveEdge,positivePadding,alignBrowserDependent});
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
                  try { placed = place(children.children.filter(child=>child.style.position!=='absolute'), columns.length, { subgridColumns: Boolean(sharedColumns), rows: inheritedAxes.block?.values.length, areas, dense: /dense/.test(String(style['grid-auto-flow'])), columnFlow: /^column/.test(String(style['grid-auto-flow'])), explicitRows: (() => { const v = String(style['grid-template-rows'] ?? 'none'); if (v === 'none' || v === 'subgrid' || /auto-(?:fill|fit)/.test(v)) return undefined; try { return expandTracks(v).length || undefined; } catch { return undefined; } })() }).map(item => ({ ...item, inherited: children.children.find(child => child.box === item.box)?.inherited })); }
                  catch (error) { if(error instanceof Error)Object.assign(error,{region:children.region});throw error; }
                  const allocator=createGridItemAllocator({cs,columnGap,box,style,placed,block,bounded,marginValue,hasViewportMargin,isZeroAffine,edgeValue});
                  const {areaInline,marginOf,marginBlock,itemInline,autoMargins,autoOffsets,childColumns,gridAlign}=allocator;
                  if (!block) {
                    let endings = [children.region];
                    for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: itemInline(item), percentInline: areaInline(item), tracks: { inline: childColumns(item) }, gridItem: true, ...(style.$blockFlow && blockFlowPercent ? { percentBlock: blockFlowPercent } : {}), ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item), marginEnd: { inline: marginOf(item, 'right'), block: marginOf(item, 'bottom') }, fitInline: (box.contract?.overflow ?? 'fit') === 'fit' }, r, ancestors, item.inherited ?? style, emit).map(result => result.region)));
                    for (const r of endings) results.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
                    continue;
                  }
                  const {rows,rowGap,gaps,layouts}=measureGridRows({placed,style,sharedRows:inheritedAxes.block,children,knownBlock,blockFlowPercent,ancestors,solve,bounded,resolvedGap,flex,allocator,minBlock});
                  for (const rs of layouts) {
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
                        return solvePositionedChild({item,r,finalAncestors,style,emit,preferences,layoutWarnings,ranges,solve});
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
    } catch (error) {
      const e=layoutError(error), target=e.box??box, area=e.region??region;
      if (e.code?.startsWith('E_LAYOUT_')) issue(e.code,e.message,target,area,e.axis);
      else if (e.code === 'U_LAYOUT_FIXED_CONTAINED') diagnostics.push({code:e.code,severity:'unknown',message:e.message,box:target.label,path:target.path,source:target.source,...(e.ancestor!==undefined?{ancestor:e.ancestor}:{}),...(e.ancestorPath!==undefined?{ancestorPath:e.ancestorPath}:{}),...(e.property!==undefined?{property:e.property}:{}),...ranges(area)});
      else if (e.code === 'U_LAYOUT_SUBGRID') diagnostics.push({code:e.code,severity:'unknown',message:e.message,box:target.label,path:target.path,source:target.source,...(e.axis?{axis:e.axis}:{}),...ranges(area)});
      else unknown(e.code?.startsWith('U_LAYOUT_') ? e.code : 'U_LAYOUT_GEOMETRY', e.message,e.line,target,e.file);
    }
    return results;
  }
  if (!diagnostics.length) {
    try {
      let environments:{region:Region;style:SolverStyle|undefined;paint:PaintFacts[]}[] = [{region:initial,style:undefined,paint:[]}];
      for (let i = 0; i < (options.ancestors ?? []).length; i++) {
        const ancestor = options.ancestors![i]!;
        const host:SolverBox = { children:[],text:false,owner:"",...ancestor, classes: [...(ancestor.classes ?? [])], documentRoot: i === 0 && ancestor.tag === 'html', label: `ancestor:${ancestor.tag}`, path: `ancestor/${i}` };
        environments = bounded(environments.flatMap(environment => styles(host, environment.region, [], environment.style, false, false).map(state => ({ ...state, paint: [...environment.paint, paintFacts(state.style)] })).filter(state => {
          if (state.style.display === 'none') { unknown('U_LAYOUT_ANCESTOR', 'A hidden ancestor cannot provide the declared containing sizes', undefined, host); return false; }
          if (state.style['container-type'] === 'normal') return true;
          unknown('U_LAYOUT_ANCESTOR', 'Query containers need size geometry; include this ancestor in the analyzed template', undefined, host); return false;
        })));
      }
      for (const environment of environments) (ancestorPaint = environment.paint ?? [], solve(root, { root: true,origin:{inline:scalar(0),block:scalar(0)}, inline: diff(width, scalar(options.hostInset ?? 0)), block: block && options.viewport.height ? diff(height, scalar(options.hostBlockInset ?? 0)) : null }, environment.region, [], environment.style));
    } catch (error) { const e=layoutError(error);unknown(e.code?.startsWith('U_LAYOUT_') ? e.code : 'U_LAYOUT_ANCESTOR',e.message,e.line,undefined,e.file); }
  }
  // Checklist F where the layout did not run to the end: a style walk over every box (no layout), so the mistakes in
  // the CSS are reported whatever is Unknown. (Each warning is reported once per box.)
  if (diagnostics.some(d => d.severity === 'unknown') && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !untransformed) {
    checkUnknownStyles({root,initial,styles,cssMistakes,pseudoWithoutContent,inlineStateTransforms,inlineTextAlignment,inlineAutoMargin,inlineOverflow,decorationNone,firstPseudoInert});
  }
  // F37: a ::first-letter / ::first-line that may apply (a block container it selects, not shown to have none) restyles
  // text in a way that is not modeled.
  for (const note of firstPseudo) {
    const open = boxes.find(box => !box.pseudo && note.selectors.some(sel => matches(sel, box, new Set([`::${sel.pseudoElement}`, ...(sel.state ? [sel.state] : [])])) && !firstInert.has(`${box.path}|${sel.source}`)));
    if (open) unknown('U_LAYOUT_SELECTOR', `${note.selector} restyles the first letter or line of ${open.label}, which is not modeled`, note.line, open, note.file);
  }
  flushObligations();
  let integrityWarnings:Integrity['warnings'] = [], integrityExempted:Integrity['exempted'] = [], accessibilityWarnings:A11y['warnings'] = [], accessibilityNotes:A11y['notes'] = [], accessibilityExempted:A11y['exempted'] = [];
  if (options.integrity && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeIntegrity({ geometry, waived }, { block, targetSize: (typeof options.integrity==='object'?options.integrity.targetSize:undefined) ?? 24, protrusion: (typeof options.integrity==='object'?options.integrity.protrusion:undefined) ?? 'all', ranges });
    diagnostics.push(...judged.findings);
    integrityWarnings = judged.warnings; integrityExempted = judged.exempted;
  }
  if (options.accessibility && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeAccessibility({ geometry, waived, root, domain: initial }, { scrollZero: preferences.includes('scroll-zero'), defaultColors: options.defaultColors && !preferences.includes('prefers-color-scheme:dark') && !rules.some(rule => rule.declarations.some(d => d.property === 'color-scheme' && /dark/.test(String(d.value)))) ? { canvas: '#ffffff', canvastext: '#000000' } : null, forcedColorsHandled: rules.some(rule => rule.preferences?.some(p => p.feature === 'forced-colors')), smoothReduced: rules.some(rule => rule.declarations.some(d => d.property === 'scroll-behavior') && (rule.preferences?.some(p => p.feature === 'prefers-reduced-motion'))), keyframeFrames, hostInset: options.hostInset ?? 0, hostBlockInset: options.hostBlockInset ?? 0, viewportBlock: block && options.viewport.height ? height : null, scrollPaddingDeclared: rules.some(rule => rule.declarations.some(d => /^scroll-padding-(?:top|bottom)$/.test(d.property))), viewportMin: options.viewport.min, contrast: (typeof options.accessibility==='object'?options.accessibility.contrast:undefined) ?? 'AA', targetLevel: (typeof options.accessibility==='object'?options.accessibility.targetLevel:undefined) ?? 'AA', targetSize: (typeof options.accessibility==='object'?options.accessibility.targetSize:undefined) ?? ((typeof options.accessibility==='object'?options.accessibility.targetLevel:undefined) === 'AAA' ? 44 : 24), ranges, block });
    diagnostics.push(...judged.findings, ...judged.unknowns);
    // Dark color scheme: when the CSS has prefers-color-scheme: dark rules, the contrast rules run
    // again with them (paint only, so the geometry is the same). System colors stay the light ones:
    // the color-scheme property is outside the subset.
    if (pristine && rules.some(rule => rule.preferences?.some(p => p.feature === 'prefers-color-scheme' && p.value === 'dark') || rule.declarations.some(d => d.property === 'color-scheme' && /\bdark\b/.test(String(d.value)) && /\blight\b/.test(String(d.value))))) {
      const dark = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], ['prefers-color-scheme:dark']);
      const contrastCodes = new Set(['E_A11Y_CONTRAST', 'U_A11Y_CONTRAST', 'E_A11Y_STATE_CONTRAST', 'E_A11Y_LINK_IN_TEXT', 'U_A11Y_LINK_IN_TEXT', 'E_A11Y_FOCUS_VISIBLE']);
      // A finding that holds in both schemes is reported once, with `alsoUnder`.
      const same = (a:LayoutDiagnostic,b:LayoutDiagnostic) => a.code === b.code && a.path === b.path && a.message === b.message && JSON.stringify([a.range, a.heightRange, a.regionConstraints, a.state]) === JSON.stringify([b.range, b.heightRange, b.regionConstraints, b.state]);
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
        if (scrolledCovers.some(u => d.path?.startsWith(`${u.path}/`) && u.cover === d.cover) && !diagnostics.some(x => x.code === d.code && x.path === d.path && JSON.stringify([x.range, x.heightRange]) === JSON.stringify([d.range, d.heightRange]))) diagnostics.push(d);
      for (const d of zero.diagnostics.filter(d => ['E_A11Y_TEXT_START_OBSCURED', 'E_A11Y_TEXT_LINE_OBSCURED'].includes(d.code)))
        if (scrolledCovers.some(u => d.path?.startsWith(`${u.path}/`) && u.cover === d.cover) && !diagnostics.some(x => x.code === d.code && x.path === d.path && JSON.stringify([x.range, x.heightRange, x.regionConstraints]) === JSON.stringify([d.range, d.heightRange, d.regionConstraints])))
          diagnostics.push({ ...d, scrollOffset: 0, message: `${d.message} (at the initial scroll position of ${scrolledCovers.find(u => d.path?.startsWith(`${u.path}/`))?.box}; other scroll offsets are not checked)` });
    }
    // Focus rules that change layout: each focusable box they can reach is laid out again focused, and the geometric
    // focus findings for that box come from that layout instead of the unfocused one.
    if (pristine && rules.some(rule => rule.stateLayout)) {
      const geometricFocus = new Set(['E_A11Y_FOCUS_OBSCURED', 'E_A11Y_FOCUS_OFFSCREEN', 'E_A11Y_FOCUS_CLIPPED', 'E_A11Y_FOCUS_SCROLLED_UNDER', 'E_A11Y_FOCUS_AREA', 'E_A11Y_FOCUS_CLIPPED_AWAY']);
      const layoutRules = rules.filter(rule => rule.stateLayout);
      const all:{box:SolverBox;chain:SolverBox[]}[] = []; (function walk(box:SolverBox,chain:SolverBox[]) { all.push({ box, chain }); for (const child of box.children ?? []) walk(child, [...chain, box]); })(root, []);
      const reached = ({box,chain}:{box:SolverBox;chain:SolverBox[]}) => layoutRules.some(rule => rule.selectors.some(selector => (selector.state !== 'focus-within' && matches(selector, box, new Set(['focus', 'focus-visible', 'focus-within']))) || (selector.state === 'focus-within' && [...chain, box].some(a => matches(selector, a, new Set(['focus-within']))))));
      for (const entry of all.filter(entry => focusableBox(entry.box) && reached(entry))) {
        const focused = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], [`focus-at:${entry.box.path}`]);
        for (let i = diagnostics.length - 1; i >= 0; i--) if (diagnostics[i]!.path === entry.box.path && geometricFocus.has(diagnostics[i]!.code)) diagnostics.splice(i, 1);
        if (focused.status === 'unknown') { diagnostics.push({ code: 'U_A11Y_FOCUS_LAYOUT', severity: 'unknown', message: `${entry.box.label}: its focused layout is not decided (${focused.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: entry.box.label, path: entry.box.path, rule: 'focus-obscured' }); continue; }
        for (const d of focused.diagnostics.filter(d => d.path === entry.box.path && geometricFocus.has(d.code))) diagnostics.push({ ...d, message: `${d.message} (in its focused layout)`, focusedLayout: true });
        // Boxes the focused layout moves (a :focus border or padding that changes size): Layout Instability excuses
        // shifts right after a key press, but the content still jumps under the keyboard user. Compared like hover.

        for (const row of sizes) {
          if (layoutWarnings.some(w => w.code === 'W_LAYOUT_FOCUS_SHIFT' && w.path === row.path && w.focusedPath === entry.box.path) || !layoutRectangle(row) || !row.$shown?.region) continue;
          for (const other of focused.sizes.filter(o => o.path === row.path && layoutRectangle(o) && o.$shown?.region)) {
            const rect=layoutRectangle(row), otherRect=layoutRectangle(other);
            if (!rect || !otherRect || !other.$shown) continue;
            const shared = intersect(row.$shown.region, other.$shown.region);
            if (!shared) continue;
            const moved = firstStartMove(rect, otherRect, shared);
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
    const keep = accessibilityProfiles[(typeof options.accessibility==='object'?options.accessibility.profile:undefined) ?? 'all'];
    if (!keep) throw Object.assign(new Error(`Unknown accessibility profile ${(typeof options.accessibility==='object'?options.accessibility.profile:undefined)}`), { code: 'U_LAYOUT_OPTIONS' });
    const tiered = <T extends {rule?:string}>(list:T[]):T[] => list.filter(d => !d.rule || keep(d.rule)).map(d => d.rule ? { ...d, tier: ruleTier(d.rule) } : d);
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
    checkMarkupAccessibility({root,initial,diagnostics,ranges});
  }
  // Layout rectangles: a transform moves the painted box but not the layout box (a layout shift ignores it; measured
  // in docs/cls-evaluation.md). With a transform anywhere, every row's layoutRect comes from the untransformed
  // re-layout, matched by path and condition region; a row without a match gets layoutRect null (not decided).
  if (pristine && sawTransform && !diagnostics.some(d => d.severity === 'unknown')) {
    const plain = analyzeBoxTree(pristine, options, scrollbarProfile, budget, inlineSheets, [], [...preferences, 'untransformed']);
    const matches = matchLayoutRectangles(sizes, plain.sizes, plain.status !== 'unknown');
    sizes.forEach((row, i) => { row.layoutRect = matches[i] ?? null; });
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
