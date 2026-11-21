// Finalize exact geometry and collect obligations; recursive layout stays in the caller.
import { q, cmp, number, add, div, mul } from './linear.mjs';
import { scalar, sum, diff, times, clip, partition, evaluate, sample, affine, asAffine } from './region.mjs';
import { px, matches, viewportLength, animationsOf, transitionsOf } from './css.mjs';
import { visuallyHiddenStyle } from './engine-validate.mjs';
import { checkSettledStyle } from './engine-settled-style.mjs';
import { absoluteOrigin } from './positioned.mjs';
import { affineOf, linearOf, mapper, scaled } from './engine-transforms.mjs';
import { isDescendant, intersectRegions } from './engine-positioning.mjs';
import { fact, sizeChain, sizeProperties, trackProperties, contractFact, explanation } from './explain.mjs';
import { fittingLength, fittingLines } from './text-font.mjs';
import { paintFacts } from './accessibility.mjs';
const zero = q(0), one = q(1);
const requireBlock = (v) => { if (!v)
    throw new Error('Block geometry is unresolved'); return v; };
const pairMap = (pair, fn) => [fn(pair[0]), fn(pair[1])];
const focusState = new Set(['focus', 'focus-visible', 'focus-within']), hoverState = new Set(['hover']);
export const focusableBox = (box) => box.focusable === true || (box.tabIndex ?? -1) >= 0 || (['button', 'select', 'textarea'].includes(box.tag) && box.focusable !== false) || (box.tag === 'input' && box.focusable !== false && box.inputType !== 'hidden');
export function createFinalizer({ options, block, hovered, scrollbarProfile, getPageScroll, setPageScroll, geometry, sizes, layoutWarnings, animated, styles, inlineContent, ancestorPaint, paints, captionBackdrop, startingRules, keyframeFrames, fontFaces, rules, cover, metaViewport, intrinsic, unknown, translated, resolvedOrigin, padding, edgeValue, obligation, cellGrows, ranges }) {
    // A :focus rule that moves an absolutely positioned box by its insets: where the focused box lands (stateGeometry
    // rules; accessibility checks only). Any other focused inset change is not modeled.
    function focusMove(box, style, focused, available, inline, blockSize, parents) {
        const moved = ['left', 'right', 'top', 'bottom'].some(key => focused[key] !== style[key]), turned = focused.transform !== style.transform;
        if (!moved && !turned)
            return {};
        if (moved && style.position !== 'absolute')
            throw Object.assign(new Error(`${box.label}: a :focus rule changes the insets of a box that is not absolutely positioned`), { code: 'U_LAYOUT_SELECTOR' });
        // The focused box: placed by its focused insets, then painted through its focused transform.
        const painted = scaled(focused, resolvedOrigin(focused, available, inline, blockSize, parents), inline, blockSize);
        return painted.origin ? { origin: painted.origin, inline: painted.inline, block: painted.block } : { originUnknown: true };
    }
    function finish(box, style, region, inline, contentInline, blockSize, contentBlock, available, parents, emit) {
        const contract = box.contract ?? {};
        // Justify alignment is modeled as the default (stretch / start) only: where it applies — a grid container's items,
        // a grid item, an absolute box — any other value is Unknown; on a flex item or container it does nothing.
        {
            const parentStyle = parents.at(-1)?.style, aligned = (value) => !['auto', 'normal', 'stretch', 'legacy'].includes(String(value ?? 'auto'));
            const ownSelf = aligned(style['justify-self']), fromItems = String(style['justify-self'] ?? 'auto') === 'auto' && aligned(parentStyle?.['justify-items']);
            const where = style.position === 'absolute' ? 'an absolute box' : ['grid', 'inline-grid'].includes(String(parentStyle?.display)) ? 'a grid item' : null;
            if (where && (ownSelf || fromItems) && !available.justifyHandled)
                throw Object.assign(new Error(`${box.label}: justify alignment ${ownSelf ? `justify-self: ${style['justify-self']}` : `justify-items: ${parentStyle?.['justify-items']} (from its parent)`} of ${where} is not modeled`), { code: 'U_LAYOUT_CSS', box });
        }
        if (emit) {
            const self = [...parents, { box, style }];
            const offered = (axis) => () => parents.length ? [...trackProperties(axis).map(property => fact(parents.at(-1).box, parents.at(-1).style, property)),
                fact(box, style, axis === 'inline' ? 'grid-column' : 'grid-row'), ...sizeChain(parents, axis, { hostInset: options.hostInset })] : [{ kind: 'viewport', axis }];
            const own = (axis) => sizeProperties(axis).filter(property => style.$sources[property] || property === (axis === 'inline' ? 'inline-size' : 'block-size')).map(property => fact(box, style, property));
            const item = (axis) => () => explanation(offered(axis)(), own(axis));
            const content = (axis, property) => () => explanation(sizeChain(self, axis, { hostInset: options.hostInset }), [contractFact({ ...box, contract }, property)]);
            // An end margin may stick out of the area: it creates no overflow and hides nothing (measured), so the fit check
            // is start margin + border box against the area.
            // (The end margin may stick out; a negative one does not narrow the box's room.)
            obligation(available.marginEnd && ('x' in available.marginEnd.inline || cmp(available.marginEnd.inline, zero) > 0) ? sum(available.inline, asAffine(available.marginEnd.inline)) : available.inline, inline, box, region, 'E_LAYOUT_ITEM_SIZE', 'inline', available.fitInline !== false, item('inline'));
            // A text domain reports how many characters still fit at the witness.
            const metrics = contract.textMetrics;
            const domain = metrics?.kind === 'domain' ? (offeredInline) => ({ text: { maxLength: metrics.maxLength, fitsUpTo: fittingLength(metrics, offeredInline), widest: metrics.widest } }) : undefined;
            // A one-line text cut with an ellipsis (text-overflow: ellipsis, overflow hidden or clip, nowrap) is intended
            // truncation: where the text needs more than the box, it is a warning, not a content violation.
            const ellipsis = style['text-overflow'] === 'ellipsis' && ['hidden', 'clip'].includes(String(style['overflow-x'])) && ['nowrap', 'pre'].includes(String(style['white-space'])) && box.text;
            if (ellipsis && contract.minInlineSize !== undefined && emit) {
                const cut = clip(region, diff(scalar(contract.minInlineSize), contentInline), true);
                if (cut && !layoutWarnings.some(w => w.code === 'W_LAYOUT_TRUNCATED' && w.path === box.path)) {
                    const p = sample(cut);
                    layoutWarnings.push({ code: 'W_LAYOUT_TRUNCATED', severity: 'warning', box: box.label, path: box.path,
                        message: `${box.label} is cut with an ellipsis: its text needs ${number(q(String(contract.minInlineSize)))}px but the box offers ${number(evaluate(contentInline, p))}px at viewport ${number(p.x)}px (keep the full text available, e.g. in its accessible name or the page it links to)`, ...ranges(cut) });
                }
            }
            if (contract.minInlineSize !== undefined && !visuallyHiddenStyle(style))
                obligation(contentInline, scalar(contract.minInlineSize), box, region, 'E_LAYOUT_CONTENT', 'inline', (contract.overflow ?? 'fit') === 'fit' && !ellipsis, content('inline', 'minInlineSize'), domain);
            if (block) {
                // The document root may be taller than the viewport when the viewport scrolls (html overflow-y not hidden/clip):
                // that is an ordinary long page. With overflow-y visible and a classic scrollbar profile the scrollbar would
                // appear and narrow the page, which is not laid out, so the root is still required to fit there. A hidden or
                // clipped root cannot scroll: content below the viewport is unreachable (the obligation stays).
                if (box.documentRoot && available.root && available.block && blockSize && !hovered && !options.$animationFrame) {
                    const overflows = Boolean(clip(region, diff(requireBlock(blockSize), available.block), true)), fits = Boolean(clip(region, diff(available.block, blockSize)));
                    const pageScroll = getPageScroll();
                    setPageScroll({ fits: (pageScroll?.fits ?? false) || fits, overflows: (pageScroll?.overflows ?? false) || overflows, stable: String(style['scrollbar-gutter']).startsWith('stable') || ['scroll', 'hidden', 'clip'].includes(String(style['overflow-y'])) });
                }
                const viewportScrolls = box.documentRoot && available.root && !['hidden', 'clip'].includes(String(style['overflow-y'])) && (['auto', 'scroll'].includes(String(style['overflow-y'])) || (scrollbarProfile !== undefined && !(scrollbarProfile.inlineSize > 0)));
                // Without a scrollbar profile, a root taller than the viewport scrolls with a platform scrollbar of unknown width.
                if (box.documentRoot && available.root && available.block && !['hidden', 'clip', 'auto', 'scroll'].includes(String(style['overflow-y'])) && scrollbarProfile === undefined && clip(region, diff(requireBlock(blockSize), available.block), true))
                    throw Object.assign(new Error(`${box.label} is taller than the viewport, so the viewport scrolls: declare scrollbar profiles (the scrollbars option) for the platforms the page is checked on`), { code: 'U_LAYOUT_SCROLLBAR' });
                // With a classic scrollbar and overflow-y visible, a long page scrolls too (the root's visible is the viewport's
                // auto), and the scrollbar narrows it; that narrowing is laid out only for an explicit auto or scroll, so a
                // root taller than the viewport here is Unknown, not a violation (the page does scroll in a browser).
                if (box.documentRoot && available.root && available.block && !['hidden', 'clip', 'auto', 'scroll'].includes(String(style['overflow-y'])) && (scrollbarProfile?.inlineSize ?? 0) > 0 && clip(region, diff(requireBlock(blockSize), available.block), true))
                    throw Object.assign(new Error(`${box.label} is taller than the viewport, so the viewport scrolls and its ${scrollbarProfile.name ?? 'classic'} scrollbar (${scrollbarProfile.inlineSize}px) narrows the page; that is laid out when html sets overflow-y: auto or scroll (the same in a browser)`), { code: 'U_LAYOUT_SCROLLBAR' });
                // An absolute box taller than its containing block (a dropdown under a short field) hangs out of it: that hides
                // nothing by itself (clipping and page overflow are checked on their own), so there is no block-size obligation
                // against a positioned ancestor or the initial containing block. A fixed box taller than the viewport keeps it.
                const hangs = available.containingBlock && available.containingBlock.path !== 'viewport';
                if (available.block && !hangs)
                    obligation(available.marginEnd ? sum(available.block, asAffine(available.marginEnd.block)) : available.block, requireBlock(blockSize), box, region, 'E_LAYOUT_ITEM_SIZE', 'block', available.fitBlock !== false && !viewportScrolls, item('block'));
                if (contract.minBlockSize !== undefined && !visuallyHiddenStyle(style)) {
                    if (box.tableCell && (contract.overflowBlock ?? 'fit') === 'fit')
                        cellGrows(requireBlock(contentBlock), scalar(contract.minBlockSize), box, region);
                    else
                        obligation(requireBlock(contentBlock), scalar(contract.minBlockSize), box, region, 'E_LAYOUT_CONTENT', 'block', (contract.overflowBlock ?? 'fit') === 'fit', content('block', 'minBlockSize'));
                }
            }
            let positioned;
            if (style.position === 'absolute') {
                const containing = available.containingBlock;
                if (!containing || !blockSize)
                    throw new Error('Absolute box has no independently resolved local containing block');
                const origin = absoluteOrigin(style, containing, { inline, block: blockSize });
                // A viewport-fixed box with a pure translation is positioned visually
                // after layout; unlike ordinary absolute descendants it does not extend
                // the scrollable document by its untranslated rectangle. Preserve the
                // original layout coordinate for provenance and shift analysis.
                const fitOrigin = style.$fixed && containing.path === 'viewport' && affineOf(style) && !linearOf(style) && style.visibility === 'visible'
                    ? translated(style, origin, { inline, block: blockSize }) : origin;
                if (!fitOrigin)
                    throw Object.assign(new Error('Fixed painted origin cannot be resolved'), { code: 'U_LAYOUT_CSS' });
                // Fully off-canvas drawers are intentionally outside the paint area. Keep
                // their original layout obligation and let the accessibility pass decide
                // whether hidden/offscreen controls are focusable. For partially visible
                // fixed boxes use the painted origin, on the precise region where visible.
                const pieces = fitOrigin === origin ? { yes: [region], no: [] } : partition(region, sum(fitOrigin.inline, inline), '>');
                for (const [part, fit] of [...pieces.yes.map(r => [r, fitOrigin]), ...pieces.no.map(r => [r, origin])]) {
                    for (const [axis, dimension] of [['inline', inline], ['block', blockSize]]) {
                        // Against a containing block that clips on this axis, reaching past it is the box being cut off.
                        const cut = containing.clips && containing.clips[axis === 'inline' ? 'x' : 'y'];
                        obligation(fit[axis], scalar(0), box, part, cut ? 'E_LAYOUT_ABSOLUTE_CLIPPED' : 'E_LAYOUT_ABSOLUTE_START', axis);
                        obligation(containing[axis], sum(fit[axis], dimension), box, part, cut ? 'E_LAYOUT_ABSOLUTE_CLIPPED' : 'E_LAYOUT_ABSOLUTE_END', axis);
                    }
                }
                positioned = { origin: { inline: affine(origin.inline), block: affine(origin.block) }, containingBlock: { path: containing.path, inline: affine(containing.inline), block: affine(containing.block) } };
            }
            const origin = resolvedOrigin(style, available, inline, blockSize, parents);
            const overflowValue = [style['overflow-x'], style['overflow-y']].find(v => v !== 'visible') ?? 'visible';
            // A box's own overflow clips its content, not its border box.
            const unscaledOrigin = origin ?? resolvedOrigin({ ...style, 'overflow-x': 'visible', 'overflow-y': 'visible' }, available, inline, blockSize, parents);
            const painted = scaled(style, unscaledOrigin, inline, blockSize), ownOrigin = painted.origin;
            // Inside an overflow: clip box positions are exact but parts may be clipped away: the other rules see no
            // position (as before), focus-clipped reads clipOrigin.
            const underClip = parents.some(p => p.clipScope);
            // Sticky inside an overflow: hidden box (a scroll container nobody scrolls): it sticks to that box, not to the page,
            // so it never sticks; at the initial scroll position it is where the flow puts it (a warning, laid out as relative).
            // overflow-x: clip with overflow-y visible is not a scroll container (CSS Overflow 3): a sticky box inside still
            // sticks to the page, and a horizontal clip does not cut its vertical sticking.
            const xClipOnly = (p) => p.style && p.style['overflow-x'] === 'clip' && p.style['overflow-y'] === 'visible';
            const scrolling = (p) => p.style && !xClipOnly(p) && ['overflow-x', 'overflow-y'].some(key => p.style[key] !== 'visible');
            const scroller = [...parents].reverse().find(scrolling);
            // A scroll container nobody scrolls vertically: overflow hidden, or overflow-x auto/scroll (so y computes to auto)
            // with a content-sized block size. A top/bottom sticky box sticks to it, which does not move, so it never sticks
            // to the page; at the initial scroll position it is where the flow puts it (a warning, laid out as relative).
            // A sticky left/right box (a sticky first column) does stick inside a horizontal scroller: not judged here.
            const stillY = (p) => ['overflow-x', 'overflow-y'].every(key => p.style[key] === 'hidden')
                || (['auto', 'scroll'].includes(p.style['overflow-x']) && ['visible', 'auto', 'hidden'].includes(p.style['overflow-y']) && p.style['block-size'] === 'auto' && (p.style['max-block-size'] === 'none' || p.style['max-block-size'] === undefined) && p.style['overflow-y'] !== 'scroll');
            const horizontalStick = ['left', 'right'].some(side => style[side] !== undefined && style[side] !== 'auto');
            if (style.$sticky && scroller && !horizontalStick && stillY(scroller) && !parents.some(p => p !== scroller && scrolling(p))) {
                const how = ['overflow-x', 'overflow-y'].every(key => scroller.style[key] === 'hidden') ? 'overflow: hidden' : `overflow-x: ${scroller.style['overflow-x']} (so its overflow-y is auto) and no height of its own`;
                if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER' && w.path === box.path))
                    layoutWarnings.push({ code: 'W_LAYOUT_STICKY_SCROLLER', severity: 'warning', box: box.label, path: box.path, scroller: scroller.box.label,
                        message: `${box.label} is position: sticky inside ${scroller.box.label}, which has ${how}: it sticks to that box, which does not scroll vertically, so it never sticks to the page. Use overflow-x: clip on the ancestor (not a scroll container), or move the sticky box out of it`, ...ranges(region) });
                style = { ...style, $sticky: false };
            }
            if (style.$sticky && parents.some(p => (p.clipped || p.clipScope || scrolling(p)) && !xClipOnly(p)))
                throw Object.assign(new Error(`${box.label} is position: sticky inside a scrolling or clipping ancestor, which it would stick to`), { code: 'U_LAYOUT_CSS' });
            // @starting-style (checklist A1): a starting value that lays out, of a property this box transitions, eases from it
            // to the settled value when the box appears — a two-keyframe animation from the starting values (the settled
            // values are the implicit 100%). Untransitioned starting values are never drawn.
            if (startingRules.length && !box.pseudo) {
                const won = new Map(), rankCmp = (a, b) => { for (let i = 0; i < a.length; i++)
                    if (a[i] !== b[i])
                        return a[i] - b[i]; return 0; };
                for (const rule of startingRules) {
                    if (rule.contexts?.length)
                        continue; // conditional starting rules: not modeled here (Unknown below)
                    const hit = rule.selectors.filter(sel => matches(sel, box, new Set())).sort((a, b) => rankCmp(b.specificity, a.specificity))[0];
                    if (!hit)
                        continue;
                    for (const d of rule.declarations) {
                        const prior = won.get(d.property);
                        const rank = [d.important ? 1 : 0, ...hit.specificity, rule.order];
                        if (!prior || rankCmp(rank, prior.rank) > 0)
                            won.set(d.property, { value: d.value, rank });
                    }
                }
                if (startingRules.some(rule => rule.contexts?.length && rule.selectors.some(sel => matches(sel, box, new Set()))))
                    throw Object.assign(new Error(`${box.label} has a @starting-style rule inside a conditional rule, which is not modeled`), { code: 'U_LAYOUT_CSS' });
                const transitions = transitionsOf(style), seconds = (v) => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(m?s)$/.exec(String(v)); return m ? Number(m[1]) / (m[2] === 'ms' ? 1000 : 1) : 0; };
                const covering = (property) => [...transitions].reverse().find(t => (t.property === 'all' || t.property === property || property.startsWith(`${t.property}-`)));
                const groups = new Map();
                for (const [property, d] of won) {
                    const t = covering(property);
                    if (!t || !(seconds(t.duration) > 0))
                        continue;
                    const key = `${t.duration}|${t.easing}`;
                    if (!groups.has(key))
                        groups.set(key, { t, layout: [] });
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
            for (const a of animationsOf(style)) {
                const scrollDriven = /^(?:scroll|view)\(/.test(a.timeline);
                if (a.playState !== 'paused' && (scrollDriven || !/^-?0+(?:\.0+)?m?s$/.test(a.duration)) && keyframeFrames.get(a.name)?.some(frame => frame.layout))
                    animated.push({ box, region, name: a.name, position: style.position, duration: a.duration, count: a.count, direction: a.direction, easing: a.easing, delay: a.delay, fill: a.fill, scrollDriven, style });
            }
            checkSettledStyle({ box, style, region, parents, emit, cover, options, metaViewport, fontFaces, rules, layoutWarnings, ranges });
            const row = { box, path: box.path, region, origin: underClip ? null : ownOrigin, ...(style.$listItem && style['list-style-type'] !== 'none' && style['list-style-position'] !== 'inside' && style.direction !== 'rtl' ? { outsideMarker: style['list-style-type'] } : {}), ...(style.display === 'grid' && /^(?:\s*(?:repeat\(\s*\d+\s*,\s*\d+(?:\.\d+)?px\s*\)|\d+(?:\.\d+)?px))+\s*$/.test(String(style['grid-template-columns'])) ? { fixedTracks: style['grid-template-columns'] } : {}), ...((box.text || box.inline?.length) && !box.pseudo && ['normal', 'pre-wrap', 'pre-line'].includes(String(style['white-space'])) && style['overflow-wrap'] === 'normal' ? { wrapsByWords: true } : {}), ...(style.$widthFromAttribute ? { widthFromAttribute: style.$widthFromAttribute } : {}), ...(/\dvw\b|\bvw\)/.test(String(style.$sources?.['inline-size']?.specified ?? '')) ? { vwInline: style.$sources['inline-size']?.specified } : {}), ...(/^100%$/.test(String(style.$sources?.['inline-size']?.specified ?? '').trim()) && ['left', 'right'].some(side => /^\d+(?:\.\d+)?px$/.test(String(style[`margin-${side}`])) && cmp(px(String(style[`margin-${side}`])), zero) > 0) ? { fullWidthMargins: ['left', 'right'].map(side => `margin-${side}`).filter(key => /^\d+(?:\.\d+)?px$/.test(String(style[key])) && cmp(px(String(style[key])), zero) > 0).map(key => `${key}: ${style[key]}`) } : {}), ...(style['box-sizing'] === 'content-box' && /^100%$/.test(String(style.$sources?.['inline-size']?.specified ?? '').trim()) && ['left', 'right'].some(side => cmp(px(String(style[`padding-${side}`] === 'ua' ? '0' : style[`padding-${side}`])), zero) > 0 || cmp(px(String(style[`border-${side}`] === 'ua' ? '0' : style[`border-${side}`])), zero) > 0) ? { contentBoxFull: ['left', 'right'].flatMap(side => [`padding-${side}`, `border-${side}`]).filter(key => style[key] && !['0', '0px', 'ua'].includes(String(style[key]))) } : {}), ...(style.$imageRatio ? { imageRatio: style.$imageRatio } : {}), clipOrigin: ownOrigin, ...(style.position === 'absolute' ? { containingPath: available.containingBlock?.path } : {}), ...(style.$fixed ? { fixed: true } : {}), ...(style.$uaControl ? { uaControl: true } : {}), ...(style.$sticky ? { sticky: { parent: parents.at(-1)?.box.path ?? null } } : {}), inline: painted.inline, block: painted.block, position: style.position,
                borders: { left: px(style['border-left']), right: px(style['border-right']), top: px(style['border-top']), bottom: px(style['border-bottom']) },
                // Content aligned towards the end (center, end): overflowing content may lie before the start edge.
                ...(['justify-content', 'align-content', 'align-items'].some(key => /^(?:center|end|flex-end|unsafe\b)/.test(String(style[key] ?? ''))) ? { alignsContent: true } : {}),
                ...((/^(?:0|\d+(?:\.\d+)?px)$/.test(String(style['padding-bottom'])) || viewportLength(style['padding-bottom'])) ? { paddingBlockEnd: padding(style, 'bottom') } : {}),
                ...((/^(?:0|\d+(?:\.\d+)?px)$/.test(String(style['padding-right'])) || viewportLength(style['padding-right'])) ? { paddingInlineEnd: padding(style, 'right') } : {}),
                // overflow: clip clips without scrolling (hidden still scrolls a focused descendant into view).
                clipAxes: { inline: style['overflow-x'] === 'clip', block: style['overflow-y'] === 'clip' },
                overflow: ['hidden', 'clip'].includes(overflowValue) ? 'clip' : ['auto', 'scroll'].includes(overflowValue) ? 'scroll' : 'visible', overflowValue,
                // Where a single line of text starts inside the box (font-derived text extents).
                content: { left: edgeValue(style, 'left'), top: edgeValue(style, 'top'), inline: contentInline },
                textAlign: style['text-align'], lineHeight: style['line-height'], direction: style.direction, overflowX: style['overflow-x'], painted: paints(style),
                // z-index applies to positioned boxes and to grid/flex items.
                zIndex: style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(String(parents.at(-1)?.style.display))) ? Number(style['z-index']) : null,
                paint: paintFacts(style), chain: [...ancestorPaint(), ...parents.map((parent, i) => captionBackdrop(parent, parents[i + 1]?.box ?? box, paintFacts(parent.style))), paintFacts(style)],
                contentBlockSize: contentBlock ?? null, fontSize: style['font-size'],
                // The focused paint (paint-only :focus/:focus-visible/:focus-within rules) of focusable boxes.
                ...(focusableBox(box) || box.tag === 'a' ? { hoverStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, hoverState).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
                // (a transition too, checklist E4: whether reduce shortens it)
                ...(style['animation-name'] !== 'none' || /[1-9]/.test(String(style['transition-duration'] ?? '')) ? { reducedMotion: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set(['prefers-reduced-motion:reduce'])).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
                // Both checked states of a checkbox/radio (paint-only :checked rules), for the checked-indicator rule.
                // A ::before/::after generated in a state is described by its content and paint (`marks`); one that is not
                // absolutely positioned would move the layout (`markUnknown`).
                ...(box.tag === 'input' && ['checkbox', 'radio'].includes(String(box.inputType)) ? { checkedStates: pairMap(['checked', 'unchecked'], name => styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set([name])).flatMap(s => {
                        const owner = [...parents.map(p => ({ ...p, names: p.names ?? [] })), { box, style: s.style, names: [] }];
                        let pieces = [{ region: s.region, marks: [], markUnknown: false }];
                        for (const kind of ['before', 'after'])
                            pieces = pieces.flatMap(piece => styles({ ...box, pseudo: kind }, piece.region, owner, s.style, false, false, new Set([name])).map(m => {
                                const generated = !['none', 'normal'].includes(String(m.style.content ?? 'none')) && m.style.display !== 'none';
                                return { region: m.region, marks: generated ? [...piece.marks, JSON.stringify([kind, m.style.content, m.style['background-color'], m.style.color, m.style.visibility, m.style.opacity])] : piece.marks, markUnknown: piece.markUnknown || (generated && m.style.position !== 'absolute') };
                            }));
                        return pieces.map(piece => ({ region: piece.region, paint: paintFacts(s.style), marks: piece.marks.join('|'), markUnknown: piece.markUnknown }));
                    })) } : {}),
                // The placeholder text's paint (::placeholder rules; Chromium's UA color is rgb(117, 117, 117), measured).
                ...(box.placeholder && ['input', 'textarea'].includes(box.tag) ? { placeholderPaint: styles({ ...box, pseudo: 'placeholder' }, region, [...parents, { box, style, names: [] }], style, false, false, new Set(['::placeholder'])).map(s => ({ region: s.region, color: s.style.$sources.color ? s.style.color : '#757575', opacity: s.style.opacity })) } : {}),
                ...(focusableBox(box) ? { focusStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, focusState).map(s => ({ region: s.region, paint: paintFacts(s.style), authorOutline: Boolean(s.style.$sources['outline-style']), ...focusMove(box, style, s.style, available, inline, blockSize, parents), ...(s.style['z-index'] !== style['z-index'] ? { zIndex: s.style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(String(parents.at(-1)?.style.display))) ? Number(s.style['z-index']) : null } : {}) })) } : {}) };
            geometry.push(row);
            if (box.inline?.length)
                inlineContent(box, style, region, [...parents, { box, style }], row.chain, row);
            const shown = scaled(style, parents.some(p => p.clipScope) ? null : origin, inline, blockSize);
            const rect = shown.origin && shown.block ? { inlineStart: affine(shown.origin.inline), blockStart: affine(shown.origin.block), inlineSize: affine(shown.inline), blockSize: affine(shown.block) } : null;
            if (style.position !== 'static' && style.position !== 'relative' && style.position !== 'absolute')
                throw new Error('Unresolved position');
            if (style['box-sizing'] !== 'border-box' && style['box-sizing'] !== 'content-box')
                throw new Error('Unresolved box sizing');
            const sizeRow = { box: box.label, path: box.path, position: style.position, display: style.$blockFlow ? 'block' : String(style.$inlineDisplay ?? style.display), float: String(style.float), alignContent: String(style['align-content'] ?? 'normal'), ...positioned, ...(rect ? { rect } : {}), boxSizing: style['box-sizing'], boxSizingSource: style.$sources['box-sizing'],
                paddingInlineSize: affine(diff(inline, scalar(add(px(String(style['border-left'])), px(String(style['border-right'])))))),
                ...(blockSize ? { paddingBlockSize: affine(diff(blockSize, scalar(add(px(String(style['border-top'])), px(String(style['border-bottom'])))))) } : {}),
                // Explicit absolute sizing determines its public allocation independently
                // from child requirements. The enclosing padding box stays separate.
                allocatedInlineSize: affine(style.position === 'absolute' ? inline : available.inline),
                ...(available.block ? { allocatedBlockSize: affine(style.position === 'absolute' ? requireBlock(blockSize) : available.block) } : {}),
                inlineSize: affine(inline), contentInlineSize: affine(contentInline),
                ...(blockSize ? { blockSize: affine(blockSize) } : {}), ...(contentBlock ? { contentBlockSize: affine(contentBlock) } : {}), ...ranges(region) };
            Object.defineProperty(sizeRow, '$shown', { value: { region, ...shown }, writable: true, enumerable: false });
            sizes.push(sizeRow);
            // rtl: the container places its children mirrored in its content box (each child's subtree moves; its own
            // interior follows its own direction). Absolute descendants use physical insets, so they are not modeled here.
            if (style.direction === 'rtl' && box.children.length && origin && box.$starts) {
                const L = sum(origin.inline, edgeValue(style, 'left')), R = diff(sum(origin.inline, inline), edgeValue(style, 'right'));
                const childOf = (path) => path.slice(0, path.lastIndexOf('/')) === box.path;
                const rows = geometry.slice(box.$starts.geometry), sizeRows = sizes.slice(box.$starts.sizes);
                // An absolute child is placed by physical insets: the container does not mirror it.
                for (const child of rows.filter(row => childOf(row.path) && row.position !== 'absolute' && intersectRegions(row.region, region) && (row.origin || row.clipOrigin))) {
                    const at = child.origin ?? child.clipOrigin;
                    if (!at || !child.inline)
                        throw new Error('Incomplete mirrored geometry');
                    const dx = diff(diff(sum(L, R), times(at.inline, q(2))), child.inline);
                    // An absolute box keeps its physical place unless its containing block moves with this child.
                    const within = (path) => path === child.path || isDescendant(child.path, path);
                    const stays = rows.filter(row => row.position === 'absolute' && row !== child && isDescendant(child.path, row.path) && !(row.containingPath && within(row.containingPath))).map(row => row.path);
                    const moved = (row) => (row === child || (isDescendant(child.path, row.path) && intersectRegions(row.region, child.region))) && !stays.some(path => row.path === path || isDescendant(path, row.path));
                    const shift = (o) => ({ inline: sum(o.inline, dx), block: o.block });
                    for (const row of rows.filter(row => moved(row) && !row.$mirrored?.has(box.path))) {
                        row.origin = row.origin && shift(row.origin);
                        if (row.clipOrigin !== undefined)
                            row.clipOrigin = row.clipOrigin && shift(row.clipOrigin);
                        if (row.bounds)
                            row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && { ...piece.outer, origin: shift(piece.outer.origin) }, inner: piece.inner && { ...piece.inner, origin: shift(piece.inner.origin) } }));
                        (row.$mirrored ??= new Set()).add(box.path);
                    }
                    for (const row of sizeRows.filter(row => row.$shown && (row.path === child.path || isDescendant(child.path, row.path)) && !stays.some(path => row.path === path || isDescendant(path, row.path)) && intersectRegions(row.$shown.region, child.region))) {
                        const shown = row.$shown;
                        row.$shown = { ...shown, origin: shown.origin && shift(shown.origin) };
                        if (row.rect && row.$shown.origin)
                            row.rect = { ...row.rect, inlineStart: affine(row.$shown.origin.inline) };
                    }
                }
            }
            // An arbitrary rotation: the box's circumscribed rectangle (an upper bound: |cos|·w/2 + |sin|·h/2 per half
            // extent, rounded up) is what it may cover; its descendants have no position either.
            // Composed with translations and scales (linear-any, checklist B2): |L11|·w/2 + |L12|·h/2 and |L21|·w/2 + |L22|·h/2
            // per half extent, about the centre moved by the translation t + W·u + H·w (each rounded outward by 1e-5 px).
            const turn = /^rotate-any\((-?[\d.]+)\)$/.exec(String(style.transform)), general = /^linear-any\((.+)\)$/.exec(String(style.transform));
            if ((turn || general) && origin && blockSize) {
                const radians = turn ? Number(turn[1]) * Math.PI / 180 : 0, up = (v) => q(String(Math.ceil(Math.abs(v) * 1e6 + 1) / 1e6));
                const L = general ? general[1].split(' ').map(Number) : [Math.cos(radians), -Math.sin(radians), Math.sin(radians), Math.cos(radians), 0, 0, 0, 0, 0, 0];
                const half = div(one, q(2)), slack = q('0.00001');
                const extentInline = sum(sum(times(inline, mul(up(L[0]), half)), times(blockSize, mul(up(L[1]), half))), scalar(slack)), extentBlock = sum(sum(times(inline, mul(up(L[2]), half)), times(blockSize, mul(up(L[3]), half))), scalar(slack));
                const exactly = (v) => q((Math.round(v * 1e6) / 1e6).toFixed(6));
                const move = (k) => sum(sum(scalar(exactly(L[4 + k])), times(inline, exactly(L[6 + k]))), times(blockSize, exactly(L[8 + k])));
                const centre = { inline: sum(sum(origin.inline, times(inline, half)), move(0)), block: sum(sum(origin.block, times(blockSize, half)), move(1)) };
                const own = [...geometry].reverse().find(row => row.path === box.path && intersectRegions(row.region, region));
                if (own)
                    own.rotatedBounds = { origin: { inline: diff(centre.inline, extentInline), block: diff(centre.block, extentBlock) }, inline: times(extentInline, q(2)), block: times(extentBlock, q(2)) };
                if (box.$starts)
                    for (const row of geometry.slice(box.$starts.geometry).filter(row => isDescendant(box.path, row.path) && intersectRegions(row.region, region))) {
                        row.origin = null;
                        row.clipOrigin = null;
                        row.rotatedBy = box.path;
                    }
            }
            // A scale maps the painted descendants too: r ↦ C + s·(r − C) about the box's centre C (affine, s constant).
            const matrix = linearOf(style);
            if (matrix && (box.children.length || box.inline?.length) && origin && blockSize && box.$starts) {
                const half = div(one, q(2));
                const map = mapper(matrix, { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) });
                const inside = (row) => isDescendant(box.path, row.path) && intersectRegions(row.region, region);
                for (const row of geometry.slice(box.$starts.geometry).filter(inside)) {
                    Object.assign(row, map(row));
                    if (row.bounds)
                        row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && map(piece.outer), inner: piece.inner && map(piece.inner) }));
                }
                for (const row of sizes.slice(box.$starts.sizes).filter(row => row.$shown && isDescendant(box.path, row.path) && intersectRegions(row.$shown.region, region))) {
                    const moved = map(row.$shown);
                    row.$shown = { ...row.$shown, ...moved };
                    if (row.rect && moved.origin && moved.block)
                        row.rect = { inlineStart: affine(moved.origin.inline), blockStart: affine(moved.origin.block), inlineSize: affine(moved.inline), blockSize: affine(moved.block) };
                }
            }
        }
        if (!box.children.length) {
            if (box.text && contract.minInlineSize === undefined && (contract.overflow ?? 'fit') === 'fit')
                unknown('U_LAYOUT_INTRINSIC', 'Text needs a minInlineSize bound or an explicit overflow policy', undefined, box);
            if (block && box.text && (contract.overflowBlock ?? 'fit') === 'fit' && !style.$lineClamp) {
                if (contract.intrinsicBlockSize !== undefined)
                    for (const required of intrinsic(box, contentInline, region)) {
                        // Wrapped text reports the lines it needs at this width and how many the box holds.
                        const font = contract.font;
                        const needed = contract.textMetrics?.kind === 'lines' && font ? Math.round(number(evaluate(required.value, { x: zero, y: zero })) / font.lineHeight) : 0;
                        const annotate = needed && font ? (offered) => ({ text: { lines: needed, fitsLines: fittingLines(font.lineHeight, offered, needed) } }) : undefined;
                        if (emit && !visuallyHiddenStyle(style)) {
                            if (box.tableCell)
                                cellGrows(requireBlock(contentBlock), required.value, box, required.region);
                            else
                                obligation(requireBlock(contentBlock), required.value, box, required.region, 'E_LAYOUT_CONTENT', 'block', true, undefined, annotate);
                        }
                    }
                else if (contract.minBlockSize === undefined)
                    unknown('U_LAYOUT_INTRINSIC', 'Text needs a block-height contract or an explicit overflowBlock policy', undefined, box);
            }
        }
        return { region, inline, block: blockSize };
    }
    return finish;
}
