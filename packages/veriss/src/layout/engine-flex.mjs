// TypeScript source. Run pnpm build:ts to regenerate adjacent ESM and declarations.
// Flex container orchestration, with the recursive engine supplied by callbacks.
import { q, cmp, add, mul, div, number } from './linear.mjs';
import { scalar, asAffine, sum, diff, times, clip, partition } from './region.mjs';
import { validateFlexContainer, flexItem, crossAlignment, flexUnknown } from './flex.mjs';
import { scaleGap, constantLess, maximumConstant } from './engine-tracks.mjs';
import { maximum, clamp } from './engine-edges.mjs';
import { offset } from './engine-transforms.mjs';
import { lengthPieces } from './engine-geometry.mjs';
import { explanation, sizeChain, trackProperties, fact } from './explain.mjs';
import { px } from './css.mjs';
const zero = q(0), one = q(1);
const total = (values) => values.reduce(sum, scalar(0));
function fixedItem(item) {
    if (item.base === 'content')
        throw flexUnknown('Flex item requires content measurement');
    return item;
}
function rationalMargin(value) {
    if ('x' in value)
        throw flexUnknown('Flex margin requires a constant length');
    return value;
}
export function createFlexLayout({ block, options, viewportLength, bounded, frAutoMinimums, scrolls, obligation, solve, finish, resolvedGap, hasViewportMargin, hasViewportPadding, resolvedViewportLength, isZeroAffine, constantItem, resolveFlexLine, breakLines, mainStarts }) {
    function layoutFlex({ box, style, region, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit }) {
        const out = [], { main, wrap } = validateFlexContainer(style);
        const fitInline = (box.contract?.overflow ?? 'fit') === 'fit', fitBlock = (box.contract?.overflowBlock ?? 'fit') === 'fit';
        const mainGap = resolvedGap(style, main === 'inline' ? 'column-gap' : 'row-gap'), crossGap = resolvedGap(style, main === 'inline' ? 'row-gap' : 'column-gap');
        const explainTracks = (axis) => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), trackProperties(axis).map(property => fact(box, style, property)));
        const gaps = (gap, count) => scaleGap(gap, Math.max(0, count - 1));
        // Checklist D2: in a column whose height is declared and one constant, the items' percentage heights and bases
        // (and min/max heights) are shares of it: written as px before the items are modeled.
        const columnBasis = main === 'block' && style['block-size'] !== 'auto' && knownBlock && cmp(knownBlock.x, zero) === 0 && cmp(knownBlock.y, zero) === 0 ? knownBlock.b : null;
        const columnShares = (child) => {
            if (!columnBasis)
                return child;
            let st = child.style;
            for (const key of ['block-size', 'flex-basis', 'min-block-size', 'max-block-size']) {
                const m = /^(\d+(?:\.\d+)?)%$/.exec(String(st[key]));
                if (!m)
                    continue;
                const v = mul(columnBasis, div(q(m[1]), q(100))), text = String(number(v));
                if (!/^\d+(?:\.\d{1,6})?$/.test(text) || cmp(q(text), v) !== 0)
                    continue;
                st = { ...st, [key]: `${text}px` };
            }
            return st === child.style ? child : { ...child, style: st };
        };
        for (const state of collect(region)) {
            if (state.children.some(child => child.style.position === 'absolute'))
                throw flexUnknown('Absolute children of a flex container use flex static positions');
            if (columnBasis)
                state.children = state.children.map(columnShares);
            const model = state.children.map(child => {
                try {
                    if (hasViewportMargin(child.style) && (!block || style.direction !== 'ltr' || child.style.direction !== 'ltr' || child.style.position !== 'static'))
                        throw flexUnknown('Responsive flex margins need both axes and static ltr items');
                    if (hasViewportPadding(child.style))
                        throw flexUnknown('Viewport-dependent padding on a flex item is not modeled');
                    const align = crossAlignment(style['align-items'], child.style['align-self']);
                    // A column item that is not stretched is as wide as its own px width.
                    if (main === 'block' && align !== 'stretch' && !/^\d+(?:\.\d+)?px$/.test(child.style['inline-size']))
                        throw flexUnknown('A column item that is not stretched (align) shrink-wraps its content; give it a px width');
                    // px margins of a row item: its outer main size (base, minimum, maximum) includes them; layoutFlex lays the
                    // item out inside them on both axes.
                    const m = (side) => viewportLength(child.style[`margin-${side}`]) ? resolvedViewportLength(child.style, `margin-${side}`, () => { throw flexUnknown('Unresolved responsive flex margin'); }) : /^\d+(?:\.\d+)?px$/.test(String(child.style[`margin-${side}`])) ? px(child.style[`margin-${side}`]) : main === 'inline' && ['left', 'right'].includes(side) && /^-\d+(?:\.\d+)?px$/.test(String(child.style[`margin-${side}`])) ? q(String(child.style[`margin-${side}`]).slice(0, -2)) : zero;
                    const margins = { left: m('left'), right: m('right'), top: m('top'), bottom: m('bottom') };
                    // A row item sized by its content (flex-basis auto or content, auto width): its max- and min-content widths
                    // are its flex base size and automatic minimum.
                    // (A px basis with min-width auto too: its automatic minimum is the min-content width, §4.5.)
                    const pxBasis = /^\d+(?:\.\d+)?px$/.test(String(child.style['flex-basis'])) && child.style['min-inline-size'] === 'auto';
                    const contentSized = main === 'inline' && (['auto', 'content'].includes(String(child.style['flex-basis'])) || /%$/.test(String(child.style['flex-basis'])) || pxBasis) && child.style['inline-size'] === 'auto'
                        && ['auto', '0', '0px'].includes(String(child.style['min-inline-size'])) && ['visible', 'clip'].includes(child.style['overflow-x']) && !['inline-size', 'size'].includes(child.style['container-type']);
                    const contentSizes = contentSized ? frAutoMinimums(child.box, child.style, state.region, [...parents, { box, style }], /%$/.test(String(child.style['flex-basis'])) || pxBasis ? 'min' : true) : null;
                    let item = flexItem(child.style, { empty: !child.box.text && !child.box.children.length, axis: main, ...(contentSizes ? { contentSizes } : {}) });
                    const sides = main === 'inline' ? ['left', 'right'] : ['top', 'bottom'];
                    const marginMainAffine = sum(asAffine(margins[sides[0]]), asAffine(margins[sides[1]]));
                    const responsiveMain = hasViewportMargin(child.style, sides);
                    if (responsiveMain) {
                        // Only the outer size varies. The inner flex base used by the
                        // scaled shrink factor remains constant. A percentage/content
                        // basis would need a separate ordering and shrink proof.
                        if (item.base === 'content' || item.percentBasis !== undefined || item.autoStart || item.autoEnd)
                            throw flexUnknown('A responsive main margin needs a constant flex basis without auto main margins');
                        item = { ...item, marginMainAffine };
                    }
                    else {
                        const marginMain = add(rationalMargin(margins[sides[0]]), rationalMargin(margins[sides[1]]));
                        if (!isZeroAffine(marginMainAffine)) {
                            if (item.autoStart || item.autoEnd)
                                throw flexUnknown('A flex item with both auto and px main-axis margins is outside the subset');
                            item = item.base === 'content' ? { ...item, marginMain } : { ...item, base: add(item.base, marginMain), minimum: add(item.minimum, marginMain), ...(item.maximum !== undefined ? { maximum: add(item.maximum, marginMain) } : {}), marginMain };
                        }
                    }
                    if (style.direction === 'rtl' && !isZeroAffine(diff(asAffine(margins.left), asAffine(margins.right))))
                        throw flexUnknown('Unequal inline margins of a flex item in rtl are outside the subset');
                    return { child, item, align, margins };
                }
                catch (error) {
                    if (error instanceof Error && (!("box" in error) || error.box == null))
                        Object.assign(error, { box: child.box });
                    throw error;
                }
            });
            const inheritedOf = (entry) => entry.child.inherited ?? style;
            const itemAvailable = (entry, extra) => ({ ...extra,
                ...(entry.margins ? { ...(extra.inline ? { inline: diff(extra.inline, sum(asAffine(entry.margins.left), asAffine(entry.margins.right))) } : {}), ...(extra.block ? { block: diff(extra.block, sum(asAffine(entry.margins.top), asAffine(entry.margins.bottom))) } : {}),
                    ...(extra.origin ? { origin: { inline: sum(extra.origin.inline, asAffine(entry.margins.left)), block: sum(extra.origin.block, asAffine(entry.margins.top)) } } : {}), marginEnd: { inline: entry.margins.right, block: entry.margins.bottom } } : {}),
                // A percentage height resolves against the container's definite height, not the area left after the item's
                // margins (measured: height: 50% with margin-top: 10px in a 100px row is 50px).
                ...(knownBlock ? { percentBlock: knownBlock } : {}),
                flexItem: { main }, ...(main === 'block' ? { flexBlockMinimum: true } : {}),
                // Checklist D2: the item's height is definite — stretched in a single-line row of a definite height, or flexed
                // in a column of a definite height — so its children's percentage heights resolve against it (measured in
                // Chromium, Firefox and WebKit).
                ...(knownBlock && ((main === 'inline' && !wrap && entry.align === 'stretch' && entry.child.style['block-size'] === 'auto') || main === 'block') ? { definiteBlock: true } : {}),
                ...(entry.align !== 'stretch' ? (main === 'inline' ? { alignBlock: entry.align } : { alignInline: entry.align }) : {}) });
            if (main === 'inline') {
                // A percentage basis (a frozen item): its size is that share of the content width (plus its edges in
                // content-box), affine in the viewport. Where its minimum would exceed that, the browser would use the
                // minimum instead: Unknown there. In a wrapping container its size breaks lines at width thresholds.
                // Where an item's minimum exceeds its share (P% of a narrow container), its hypothetical size is the minimum
                // (§9.7): the region is split there. Below, the item starts at the minimum (shrink mode freezes it there; grow
                // mode grows it from its base and clamps it to the minimum).
                let parts = [{ region: state.region, below: new Set() }];
                // (A linear basis, checklist D2: its calc() / vw length evaluated against the content width.)
                // A min() / max() / clamp() basis is piecewise: the parts are split where each piece holds (picks).
                model.forEach((entry, index) => {
                    if (!entry.item.linearBasis || !/\b(?:min|max|clamp)\(/.test(entry.item.linearBasis))
                        return;
                    parts = bounded(parts.flatMap(part => lengthPieces(entry.item.linearBasis, contentInline, part.region, entry.child.style).filter(piece => piece.region).map(piece => ({ ...part, region: piece.region, picks: new Map([...(part.picks ?? []), [index, piece.value]]) }))));
                });
                const percentBase = (entry, part) => sum(sum(entry.item.linearBasis ? (part?.picks?.get(model.indexOf(entry)) ?? lengthPieces(entry.item.linearBasis, contentInline, null, entry.child.style)[0].value) : times(contentInline, entry.item.percentBasis), scalar(entry.item.contentBox ? entry.item.edges : zero)), scalar(entry.item.marginMain ?? zero));
                model.forEach((entry, index) => {
                    if (entry.item.percentBasis === undefined || cmp(entry.item.shrink, zero) === 0)
                        return;
                    const minimum = scalar(constantItem(fixedItem(entry.item)).minimum.b);
                    parts = bounded(parts.flatMap(part => { const split = partition(part.region, diff(percentBase(entry, part), minimum), '>='); return [...split.yes.map(r => ({ region: r, below: part.below, picks: part.picks })), ...split.no.map(r => ({ region: r, picks: part.picks, below: new Set([...part.below, index]) }))]; }));
                });
                for (const part of parts) {
                    const items = model.map((entry, index) => {
                        const item = constantItem(fixedItem(entry.item));
                        if (entry.item.percentBasis === undefined)
                            return item;
                        // Its outer size: the share, its edges in content-box, and its main-axis margins.
                        const base = percentBase(entry, part);
                        if (cmp(entry.item.shrink, zero) === 0 && clip(part.region, diff(item.minimum, base), true))
                            throw flexUnknown(`${entry.child.box.label}: its minimum width can exceed its flex-basis ${entry.child.style['flex-basis']} here, which is not modeled`);
                        // A non-shrinking item never goes below its base; a shrinking one down to its (explicit) minimum.
                        // Its inner base size is P% of the content width when it has no constant part (no edges, margins or
                        // content-box padding): shrinking is then weighted by the constant shrink × P (innerShare).
                        const constantPart = add(entry.item.contentBox ? zero : mul(entry.item.edges, q(-1)), zero);
                        const innerShare = !entry.item.linearBasis && cmp(constantPart, zero) === 0 && cmp(entry.item.marginMain ?? zero, zero) === 0 && (!entry.item.contentBox || cmp(entry.item.edges, zero) === 0) ? entry.item.percentBasis : null;
                        const below = part.below.has(index);
                        return { ...item, base, minimum: cmp(entry.item.shrink, zero) === 0 ? base : item.minimum, maximum: null, baseAtLeastMinimum: !below, baseBelowMinimum: below, innerShare, percentItem: true };
                    });
                    // Lines break by the hypothetical main sizes: the base clamped by the maximum, then the minimum (§9.3, §9.7;
                    // measured: a 180px item with max-width: 20px takes 20px of its line).
                    const hypothetical = wrap ? items.map((item, i) => item.baseBelowMinimum ? item.minimum : model[i].item.percentBasis !== undefined ? item.base : maximumConstant(item.maximum && constantLess(item.maximum, item.base) ? item.maximum : item.base, item.minimum)) : items.map(item => item.base);
                    const sets = wrap ? breakLines(part.region, contentInline, hypothetical, mainGap) : [{ region: part.region, lines: model.length ? [model.map((_, i) => i)] : [] }];
                    for (const set of sets) {
                        let combos = [{ region: set.region, lines: [] }];
                        for (const indices of set.lines)
                            combos = bounded(combos.flatMap(c => resolveFlexLine(c.region, contentInline, indices.map(i => items[i]), gaps(mainGap, indices.length))
                                .flatMap(r => mainStarts(r.region, r.values, r.free, indices.map(i => items[i]), mainGap, main, style['justify-content'])
                                .map(m => ({ region: m.region, lines: [...c.lines, { indices, values: r.values, starts: m.starts }] })))));
                        for (const combo of combos) {
                            // The last item's end margin may stick out (it hides nothing; measured for grid and flex items).
                            for (const line of combo.lines)
                                if (emit)
                                    obligation(contentInline, diff(sum(total(line.values), gaps(mainGap, line.indices.length)), asAffine(line.indices.length ? model[line.indices.at(-1)].margins.right : zero)), box, combo.region, 'E_LAYOUT_TRACKS', 'inline', fitInline && !scrolls(style, 'x'), explainTracks('inline'), () => ({ layout: 'flex' }));
                            if (!block) {
                                let endings = [combo.region];
                                for (const line of combo.lines)
                                    line.indices.forEach((i, k) => { endings = bounded(endings.flatMap(r => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], fitInline }), r, ancestors, inheritedOf(model[i]), emit).map(result => result.region))); });
                                for (const r of endings)
                                    out.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
                                continue;
                            }
                            // Cross sizes of the lines: a definite single line is the container; otherwise the tallest item.
                            let measured = [{ region: combo.region, sizes: combo.lines.map(() => scalar(0)) }];
                            if (wrap || !knownBlock)
                                combo.lines.forEach((line, l) => line.indices.forEach((i, k) => {
                                    // An item's hypothetical cross size is its content height raised to its px min-height (§9.4): the line is the
                                    // tallest of them, and the item is then stretched to the line (never below that minimum).
                                    const ms = model[i].child.style, minCross = /^\d+(?:\.\d+)?px$/.test(String(ms['min-block-size'])) ? add(px(ms['min-block-size']), ms['box-sizing'] === 'content-box' ? ['top', 'bottom'].map(side => add(px(ms[`padding-${side}`]), px(ms[`border-${side}`]))).reduce(add, zero) : zero) : null;
                                    measured = bounded(measured.flatMap(m => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], ...(minCross ? { $crossMeasure: true } : {}) }), m.region, ancestors, inheritedOf(model[i]), false)
                                        .flatMap(result => (minCross ? maximum(result.region, result.block, scalar(minCross)) : [{ region: result.region, value: result.block }]).flatMap(h => maximum(h.region, m.sizes[l], sum(h.value, sum(asAffine(model[i].margins.top), asAffine(model[i].margins.bottom)))).map(mx => ({ region: mx.region, sizes: m.sizes.map((v, j) => j === l ? mx.value : v) }))))));
                                }));
                            else
                                measured = [{ region: combo.region, sizes: [knownBlock] }];
                            for (const m of measured) {
                                const crossGaps = gaps(crossGap, combo.lines.length), used = sum(total(m.sizes), crossGaps);
                                let stretched = [{ region: m.region, sizes: m.sizes }];
                                if (wrap && knownBlock && ['normal', 'stretch'].includes(style['align-content']))
                                    stretched = clamp(m.region, diff(knownBlock, used)).map(({ region: r, value: extra }) => ({ region: r, sizes: m.sizes.map(v => sum(v, times(extra, div(one, q(combo.lines.length))))) }));
                                for (const st of stretched) {
                                    const contentBlock = knownBlock ?? used, blockSize = sum(contentBlock, blockEdges);
                                    if (emit && knownBlock)
                                        obligation(knownBlock, used, box, st.region, 'E_LAYOUT_TRACKS', 'block', fitBlock && !scrolls(style, 'y'), explainTracks('block'), () => ({ layout: 'flex' }));
                                    let endings = [st.region], lineStart = scalar(0);
                                    combo.lines.forEach((line, l) => {
                                        const top = lineStart;
                                        line.indices.forEach((i, k) => {
                                            const origin = line.starts ? offset(contentOrigin, line.starts[k], top) : null;
                                            endings = bounded(endings.flatMap(r => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], block: st.sizes[l], origin, fitInline, fitBlock }), r, ancestors, inheritedOf(model[i]), emit).map(result => result.region)));
                                        });
                                        lineStart = sum(sum(lineStart, st.sizes[l]), asAffine(crossGap));
                                    });
                                    for (const r of endings)
                                        out.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
                                }
                            }
                        }
                    }
                }
                continue;
            }
            // Column: the main axis is the block axis; items are as wide as the content box unless aligned.
            if (!block) {
                let endings = [state.region];
                for (const entry of model)
                    endings = bounded(endings.flatMap(r => solve(entry.child.box, itemAvailable(entry, { inline: contentInline, fitInline }), r, ancestors, inheritedOf(entry), emit).map(result => result.region)));
                for (const r of endings)
                    out.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
                continue;
            }
            // Measure content-sized items (their block size is both base and minimum).
            let measured = [{ region: state.region, items: model.map(entry => entry.item.base === 'content' ? null : constantItem(fixedItem(entry.item))) }];
            model.forEach((entry, i) => {
                if (entry.item.base !== 'content')
                    return;
                const contentItem = entry.item;
                measured = bounded(measured.flatMap(m => solve(entry.child.box, itemAvailable(entry, { inline: contentInline }), m.region, ancestors, inheritedOf(entry), false)
                    .map(result => {
                    const outer = sum(result.block, scalar(contentItem.marginMain ?? zero));
                    // With an explicit minimum the item is an ordinary one from its measured base (it may shrink below its
                    // content down to that minimum, and its hypothetical size is at least it).
                    const item = contentItem.contentMinimum !== undefined ? { ...contentItem, base: outer, minimum: scalar(add(contentItem.contentMinimum, contentItem.marginMain ?? zero)), contentMinimum: undefined } : { ...contentItem, base: outer, minimum: outer, content: true };
                    return { region: result.region, items: m.items.map((v, j) => j === i ? item : v) };
                })));
            });
            for (const m of measured) {
                const measuredItems = m.items.map(item => { if (!item)
                    throw flexUnknown("Flex item measurement missing"); return item; });
                let lines;
                if (knownBlock)
                    lines = resolveFlexLine(m.region, knownBlock, measuredItems, gaps(mainGap, measuredItems.length));
                else {
                    // (Measuring the natural height for min-height only: the container is then sized to its content, which
                    // is the sum of the items' content heights whatever they grow by; the layout itself is done at the minimum.)
                    if (measuredItems.some(item => cmp(item.grow, zero) > 0) && !(available.$minNatural && !emit))
                        throw flexUnknown('Flexible items in a column with an indefinite height grow from their content; give the container a definite height');
                    const values = measuredItems.map(item => item.content ? item.base : maximumConstant(item.base, item.minimum));
                    lines = [{ region: m.region, values, free: scalar(0) }];
                }
                for (const line of lines)
                    for (const placed of mainStarts(line.region, line.values, line.free, measuredItems, mainGap, main, style['justify-content'])) {
                        const used = sum(total(line.values), gaps(mainGap, line.values.length));
                        const contentBlock = knownBlock ?? used, blockSize = sum(contentBlock, blockEdges);
                        // The last item's bottom margin may stick out (it hides nothing).
                        if (emit && knownBlock)
                            obligation(knownBlock, diff(used, asAffine(model.length ? model.at(-1).margins.bottom : zero)), box, placed.region, 'E_LAYOUT_TRACKS', 'block', fitBlock && !scrolls(style, 'y'), explainTracks('block'), () => ({ layout: 'flex' }));
                        let endings = [placed.region];
                        model.forEach((entry, i) => {
                            const origin = placed.starts ? offset(contentOrigin, scalar(0), placed.starts[i]) : null;
                            endings = bounded(endings.flatMap(r => solve(entry.child.box, itemAvailable(entry, { inline: contentInline, block: line.values[i], origin, fitInline, fitBlock }), r, ancestors, inheritedOf(entry), emit).map(result => result.region)));
                        });
                        for (const r of endings)
                            out.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
                    }
            }
        }
        return out;
    }
    return layoutFlex;
}
