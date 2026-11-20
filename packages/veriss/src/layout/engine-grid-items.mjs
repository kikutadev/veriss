// Grid item allocation: margin boxes, fit-content alignment and auto margins.
import { q, cmp, add, div } from './linear.mjs';
import { scalar, sum, diff, times, partition } from './region.mjs';
import { px } from './css.mjs';
import { crossAlignment } from './flex.mjs';
import { trackArea, trackSlice } from './subgrid.mjs';
import { preferredInlinePieces, maximum, ratioOf } from './engine-edges.mjs';
const zero = q(0), one = q(1);
export function createGridItemAllocator({ cs, columnGap, box, style, placed, block, bounded, marginValue, hasViewportMargin, isZeroAffine, edgeValue }) {
    const areaInline = (item) => trackArea(cs.values, columnGap, item.start, item.span);
    // A grid item's px margins: the item is laid out in its area less them, offset by the start margins, and
    // its margin box (block size plus margins) sizes auto rows. rtl with unequal inline margins and margins on
    // subgrid items are not modeled.
    const marginOf = (item, side) => marginValue(item.style, side);
    const marginInline = (item) => sum(marginOf(item, 'left'), marginOf(item, 'right')), marginBlock = (item) => sum(marginOf(item, 'top'), marginOf(item, 'bottom'));
    for (const item of placed) {
        const st = item.style;
        if (hasViewportMargin(st)) {
            if (style.direction !== 'ltr' || st.direction !== 'ltr' || !block || st.position !== 'static' || ['left', 'right'].some(side => st[`margin-${side}`] === 'auto') ||
                (style.$blockFlow && hasViewportMargin(st, ['left', 'right']) && (st['inline-size'] !== 'auto' || st['max-inline-size'] !== 'none' || !['auto', '0', '0px'].includes(String(st['min-inline-size'])))))
                throw Object.assign(new Error('Responsive margins with auto margins, directed/positioned boxes or an overconstrained block width are not modeled'), { code: 'U_LAYOUT_CSS', box: item.box });
        }
        if (!isZeroAffine(sum(marginInline(item), marginBlock(item)))) {
            if (st['grid-template-columns'] === 'subgrid' || st['grid-template-rows'] === 'subgrid')
                throw Object.assign(new Error(`${item.box.label}: margins on a subgrid are not modeled`), { code: 'U_LAYOUT_SUBGRID', box: item.box });
            if (style.direction === 'rtl' && !isZeroAffine(diff(marginOf(item, 'left'), marginOf(item, 'right'))))
                throw Object.assign(new Error(`${item.box.label}: unequal inline margins in rtl are not modeled`), { code: 'U_LAYOUT_CSS', box: item.box });
        }
    }
    const itemInline = (item) => diff(areaInline(item), marginInline(item));
    // Inline auto margins of a grid item with an explicit width take the free space of its area (both: half
    // each), and none of it when it is negative (start-aligned; measured). With an auto width the item
    // would shrink to fit its content: Unknown.
    const autoMargins = (item) => ['margin-left', 'margin-right'].some(key => item.style[key] === 'auto');
    // In block flow an auto width fills the area, max-inline-size caps it, and the auto margins center it.
    const blockFill = (item) => style.$blockFlow && String(item.style['inline-size']) === 'auto' && /^(?:none|\d+(?:\.\d+)?px)$/.test(String(item.style['max-inline-size']));
    // Only ordinary block-flow children with explicit width
    // and fixed px edges: grid/flex intrinsic contributions,
    // replaced elements and variable padding need other proofs.
    const responsiveBlock = (item) => style.$blockFlow && style.direction === 'ltr' &&
        ['html', 'body', 'main', 'div', 'section', 'article', 'aside', 'header', 'footer', 'nav'].includes(item.box.tag) &&
        /^(?:min|max|clamp|calc)\(/.test(String(item.style['inline-size'])) &&
        !ratioOf(item.style) && ['left', 'right'].every(side => /^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style['padding-' + side])) &&
        /^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style['border-' + side])));
    for (const item of placed)
        if (autoMargins(item) && !blockFill(item) && !responsiveBlock(item)) {
            const w = String(item.style['inline-size']);
            if (!/^\d+(?:\.\d+)?(?:px|%)$/.test(w) || (item.style['box-sizing'] === 'content-box' && ['left', 'right'].some(side => !/^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style[`padding-${side}`])) || !/^(?:0|ua|\d+(?:\.\d+)?px)$/.test(String(item.style[`border-${side}`])))) || style.direction === 'rtl')
                throw Object.assign(new Error(`${item.box.label}: auto margins on a grid item are modeled only with a px or % width (ltr); with an auto width it shrinks to fit its content`), { code: 'U_LAYOUT_CSS', box: item.box });
        }
    // justify-self (or the grid's justify-items) start, center or end: the item keeps its own width and moves by
    // that share of its area's free space, also when it is negative (Chromium aligns grid items unsafely:
    // measured −90px for a 300px item at end in a 200px area). Its own width is a px width, or with an auto
    // width a text leaf's fit-content width min(max-content, max(min-content, area)), capped by a px
    // max-width. Anything else stays Unknown (finish).
    const justifyShare = (item) => {
        const own = String(item.style['justify-self'] ?? 'auto'), v = ['auto', 'normal'].includes(own) ? String(style['justify-items'] ?? 'normal') : own;
        if (['start', 'flex-start', 'self-start'].includes(v) || (v === 'left' && style.direction !== 'rtl'))
            return zero;
        if (v === 'center')
            return div(one, q(2));
        if (['end', 'flex-end', 'self-end'].includes(v) || (v === 'right' && style.direction !== 'rtl'))
            return one;
        return null;
    };
    const justified = (item, region) => {
        const share = justifyShare(item);
        if (share === null || style.$blockFlow || autoMargins(item) || style.direction === 'rtl')
            return null;
        const st = item.style, pxOf = (v) => ['0', '0px'].includes(String(v)) ? zero : /^\d+(?:\.\d+)?px$/.test(String(v)) ? px(String(v)) : null;
        const sideEdges = ['left', 'right'].flatMap(side => [pxOf(st[`padding-${side}`]), pxOf(st[`border-${side}`])]);
        if (sideEdges.includes(null))
            return null;
        const edgesInline = sideEdges.reduce((a, b) => { if (b === null)
            throw new Error("Unresolved inline edge"); return add(a, b); }, zero), area = itemInline(item);
        const place = (r, w) => ({ region: r, offset: times(diff(area, w), share), inline: w });
        if (/^\d+(?:\.\d+)?px$/.test(String(st['inline-size']))) {
            const w = scalar(st['box-sizing'] === 'content-box' ? add(px(st['inline-size']), edgesInline) : px(st['inline-size']));
            return [place(region, w)];
        }
        const c = item.box.contract;
        if (String(st['inline-size']) !== 'auto' || !item.box.text || (item.box.children ?? []).length || c?.minInlineSize === undefined || c?.maxInlineSize === undefined)
            return null;
        const maxW = String(st['max-inline-size']) === 'none' ? null : pxOf(st['max-inline-size']);
        if (maxW === null && String(st['max-inline-size']) !== 'none')
            return null;
        let lo = add(q(String(c.minInlineSize)), edgesInline);
        let hi = add(q(String(c.maxInlineSize)), edgesInline);
        // max-width caps the fit-content width, its min-content end too (measured: a 260px max-width bubble
        // with a 339px URL at justify-self: end is 260px wide at the end of its area; the URL overflows it).
        if (maxW !== null) {
            const cap = st['box-sizing'] === 'content-box' ? add(maxW, edgesInline) : maxW;
            if (cmp(cap, hi) < 0)
                hi = cap;
            if (cmp(cap, lo) < 0)
                lo = cap;
        }
        const out = [];
        const wide = partition(region, diff(area, scalar(hi)), '>=');
        for (const r of wide.yes)
            out.push(place(r, scalar(hi)));
        for (const r of wide.no) {
            const mid = partition(r, diff(area, scalar(lo)), '>=');
            for (const m of mid.yes)
                out.push(place(m, area));
            for (const m of mid.no)
                out.push(place(m, scalar(lo)));
        }
        return out;
    };
    const autoOffsets = (item, region) => {
        const aligned = justified(item, region);
        if (aligned)
            return aligned.map(a => ({ ...a, justified: true }));
        if (!autoMargins(item))
            return [{ region, offset: scalar(0) }];
        if (responsiveBlock(item)) {
            const st = item.style, edges = ['left', 'right'].map(side => edgeValue(st, side)).reduce(sum, scalar(zero));
            const share = st['margin-left'] === 'auto' ? (st['margin-right'] === 'auto' ? div(one, q(2)) : one) : zero;
            return bounded(preferredInlinePieces(st, areaInline(item), region, edges, itemInline(item))
                .flatMap(p => maximum(p.region, p.value, edges))
                .flatMap(p => {
                const free = diff(itemInline(item), p.value), split = partition(p.region, free, '>=');
                return [...split.yes.map(r => ({ region: r, offset: times(free, share) })), ...split.no.map(r => ({ region: r, offset: scalar(0) }))];
            }));
        }
        if (blockFill(item)) {
            const max = String(item.style['max-inline-size']);
            if (max === 'none')
                return [{ region, offset: scalar(0) }];
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
            if (w.endsWith('%') || ![minW, maxW].every(v => ['auto', '0', '0px', 'none'].includes(v) || /^\d+(?:\.\d+)?px$/.test(v)) || item.style['box-sizing'] === 'content-box')
                throw Object.assign(new Error(`${item.box.label}: auto margins with a min-width or max-width are modeled for a px width and px bounds (border-box) only`), { code: 'U_LAYOUT_CSS', box: item.box });
            let used = px(w);
            if (/px$/.test(maxW) && cmp(px(maxW), used) < 0)
                used = px(maxW);
            if (/px$/.test(minW) && cmp(px(minW), used) > 0)
                used = px(minW);
            outer = scalar(used);
        }
        const extra = item.style['box-sizing'] === 'content-box' ? ['left', 'right'].flatMap(side => [item.style[`padding-${side}`], item.style[`border-${side}`]]).filter(v => v && !['0', 'ua'].includes(String(v))).reduce((acc, v) => add(acc, px(String(v))), zero) : zero;
        const free = diff(area, sum(outer, scalar(extra)));
        const share = item.style['margin-left'] === 'auto' ? (item.style['margin-right'] === 'auto' ? div(one, q(2)) : one) : zero;
        const split = partition(region, free, '>=');
        return [...split.yes.map(r => ({ region: r, offset: times(free, share) })), ...split.no.map(r => ({ region: r, offset: scalar(0) }))];
    };
    const childColumns = (item) => trackSlice(cs.values, columnGap, box, item.start, item.span);
    // Block-axis self-alignment (align-self, or the grid's align-items): an item that is not stretched keeps its
    // own height and is offset in its area by that share of the free space (CSS Box Alignment §6.1).
    // (A stretched item of auto height is definite, checklist D2: its children's percentage heights resolve
    // against it — measured in Chromium, Firefox and WebKit; aligned otherwise, they compute to auto.)
    const gridAlign = (item) => { if (style.$blockFlow)
        return {}; const a = crossAlignment(style['align-items'], item.style['align-self']); return a === 'stretch' ? (item.style['block-size'] === 'auto' ? { definiteBlock: true } : {}) : { alignBlock: a }; };
    return { areaInline, marginOf, marginInline, marginBlock, itemInline, autoMargins, autoOffsets, childColumns, gridAlign, justified };
}
