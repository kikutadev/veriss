// Block size resolution: definite lengths, ratios, min/max, and content bounds.
import { q, cmp, number, div, mul } from './linear.mjs';
import { scalar, sum, diff, times, clip, sample, evaluate } from './region.mjs';
import { px } from './css.mjs';
import { length, lengthPieces } from './engine-geometry.mjs';
import { ratioOf, maximum, minimumOf, clamp } from './engine-edges.mjs';
const zero = q(0);
const requireSize = (size) => { if (!size)
    throw new Error('Block size is unresolved'); return size; };
export function resolveBlockSizes({ box, style, block, available, parents, inline, contentInline, cssBlockEdges, blockEdges, content, emit, obligation, edgeExplanation }) {
    let fixedBlock = null;
    if (block) {
        if (style['block-size'] !== 'auto')
            fixedBlock = /^\d+(?:\.\d+)?(?:px|%)$/.test(style['block-size']) ? length(style['block-size'], available.percentBlock ?? available.block, style) : scalar(zero);
        // aspect-ratio with an auto block-size (an img, or a box with no content): the block size follows the
        // inline size, on the box named by box-sizing (the content box by default).
        else if (ratioOf(style) && (['img', 'video'].includes(box.tag) || (!(box.children ?? []).length && !box.text && !box.inline?.length))) {
            const r = ratioOf(style);
            if (!r)
                throw new Error("Unresolved aspect ratio");
            // Where the container sets the block size, it wins over the ratio (measured: a growing column flex item,
            // and a grid item with an explicit align-self: stretch, take the container's size); that is not modeled.
            const parentStyle = parents.at(-1)?.style;
            const explicitStretch = String(style['align-self']) === 'stretch' || (['auto', 'normal'].includes(String(style['align-self'] ?? 'auto')) && String(parentStyle?.['align-items']) === 'stretch');
            const growing = available.flexItem?.main === 'block' && cmp(q(String(style['flex-grow'] ?? '0')), zero) > 0;
            // (A flex row stretches its items by default: align-items normal; measured: a ratio item is the line's height.)
            const rowStretch = available.flexItem?.main === 'inline' && available.alignBlock === undefined;
            if (growing || rowStretch || (explicitStretch && available.gridItem))
                throw Object.assign(new Error(`${box.label}: aspect-ratio with an auto height where its container ${growing ? 'grows it (flex-grow in a column)' : 'stretches it (align-self: stretch, or a flex row\'s default)'} is not modeled`), { code: 'U_LAYOUT_CSS', box });
            fixedBlock = style['box-sizing'] === 'border-box' ? times(inline, r) : sum(times(contentInline, r), cssBlockEdges);
        }
        // aspect-ratio on a box with content: the ratio sets the height, raised to the content's by the automatic
        // minimum in some layouts and not in others (measured: a grid item with a 30px child is 30px, a flex container
        // whose content is 38px follows the ratio's 20px); that is not modeled.
        else if (ratioOf(style) && ((box.children ?? []).length || box.text || box.inline?.length))
            throw Object.assign(new Error(`${box.label}: aspect-ratio on a box with content (its height is the ratio's or its content's) is not modeled; give it a height, or put the ratio on an empty box`), { code: 'U_LAYOUT_CSS', box });
        else if (!available.root && available.block && available.alignBlock === undefined)
            fixedBlock = available.block;
        // A container raised to its min-height keeps that height also when it is aligned (not stretched) in its area
        // (measured: align-self: center on a 38px flex container with min-height: 50px is 50px tall).
        else if (available.$minRaised && (available.$raisedBlock || available.block))
            fixedBlock = available.$raisedBlock ?? available.block ?? null;
        else if (style['container-type'] === 'size')
            fixedBlock = blockEdges;
        if (style['block-size'] !== 'auto' && style['box-sizing'] === 'content-box')
            fixedBlock = sum(requireSize(fixedBlock), cssBlockEdges);
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
        ? (region) => lengthPieces(style['min-block-size'], available.percentBlock ?? available.block, region, style).map(m => ({ region: m.region, value: diff(sum(m.value, contentEdges), blockEdges) })) : null;
    const raisedPieces = !minBlock ? fixedPieces : fixedPieces.flatMap(piece => !piece.value ? [piece] : minBlock(piece.region).flatMap(m => maximum(m.region, piece.value, sum(m.value, blockEdges))));
    const blockStates = raisedPieces.flatMap((piece) => piece.value ? clamp(piece.region, diff(piece.value, blockEdges)) : [{ region: piece.region, value: null }]);
    for (const piece of fixedPieces)
        if (piece.value && emit)
            obligation(piece.value, blockEdges, box, piece.region, 'E_LAYOUT_BOX_EDGES', 'block', true, edgeExplanation('block'));
    return { maxBlock, minBlock, blockStates };
}
export function leafHeights({ box, style, block, geometryRegion, knownBlock, contentInline, maxBlock, blockEdges, minBlock, intrinsic, layoutWarnings, ranges, obligation, emit }) {
    let heights = !block ? [{ region: geometryRegion, value: null }] : knownBlock ? [{ region: geometryRegion, value: knownBlock }] : intrinsic(box, contentInline, geometryRegion);
    // A line clamp caps the text's height at N lines; where the text needs more, the rest is cut off (a warning).
    const lineClamp = style.$lineClamp;
    if (lineClamp && !knownBlock)
        heights = heights.flatMap((h) => h.value ? minimumOf(h.region, h.value, scalar(mul(q(String(style.$lineClamp)), px(String(style['line-height']))))).map(c => {
            const cut = clip(c.region, diff(h.value, c.value), true);
            if (cut && !layoutWarnings.some(w => w.code === 'W_LAYOUT_LINE_CLAMPED' && w.path === box.path)) {
                const p = sample(cut);
                layoutWarnings.push({ code: 'W_LAYOUT_LINE_CLAMPED', severity: 'warning', box: box.label, path: box.path, lines: lineClamp, message: `${box.label} is clamped to ${style.$lineClamp} lines and its text needs ${number(div(evaluate(h.value, p), px(String(style['line-height']))))} at viewport ${number(p.x)}px: the rest of the text is cut off (keep the full text available elsewhere, such as the page the card links to)`, ...ranges(cut) });
            }
            return c;
        }) : [h]);
    // A content height above max-block-size is capped; the content then has to fit (or overflow by contract).
    if (maxBlock && !knownBlock)
        heights = heights.flatMap((h) => h.value ? minimumOf(h.region, h.value, diff(maxBlock, blockEdges)).map(c => {
            if (c.value !== h.value && emit)
                obligation(c.value, h.value, box, c.region, 'E_LAYOUT_CONTENT', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit');
            return c;
        }) : [h]);
    if (minBlock && !knownBlock)
        heights = heights.flatMap((h) => h.value ? minBlock(h.region).flatMap(m => maximum(m.region, h.value, m.value)) : [h]);
    return heights;
}
