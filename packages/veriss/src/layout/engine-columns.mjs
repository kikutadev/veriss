// Grid columns: normalize exact percentage tracks, partition auto-repeat counts,
// and distribute free space without changing track sizes.
import { q, cmp, add, sub, mul, div, number } from './linear.mjs';
import { scalar, sum, diff, times, partition, evaluate } from './region.mjs';
import { tracks, expandTracks } from './grid.mjs';
import { distribution } from './flex.mjs';
import { trackArea } from './subgrid.mjs';
import { scaleGap } from './engine-tracks.mjs';
const zero = q(0);
const total = (values) => values.reduce(sum, scalar(0));
export function normalizeGridPercentages(style, contentInline, knownBlock) {
    // Checklist D2: percentage tracks and gaps of a container whose size on that axis is one constant (a px width,
    // a declared px height): written as px. Columns and column-gap against the content width; rows and row-gap
    // against the content height where the height is declared (otherwise a percentage row is auto: not modeled).
    {
        const constantOf = (e) => e && cmp(e.x, zero) === 0 && cmp(e.y, zero) === 0 ? e.b : null;
        const inlineBasis = constantOf(contentInline), blockBasis = style['block-size'] !== 'auto' ? constantOf(knownBlock) : null;
        const share = (token, basis) => /^\d+(?:\.\d+)?%$/.test(token) && basis ? `${number(mul(basis, div(q(token.slice(0, -1)), q(100))))}px` : token;
        const exactShare = (token, basis) => { const v = mul(basis, div(q(token.slice(0, -1)), q(100))); return /^\d+(?:\.\d{1,6})?$/.test(String(number(v))) && cmp(q(String(number(v))), v) === 0; };
        const rewrite = (key, basis) => {
            const text = String(style[key] ?? '');
            if (!/%/.test(text) || !basis || /\bmin\(/.test(text) || /auto-(?:fill|fit)/.test(text))
                return;
            let list;
            try {
                list = expandTracks(text);
            }
            catch {
                return;
            }
            if (list.some(t => /%/.test(t) && (!/^\d+(?:\.\d+)?%$/.test(t) || !exactShare(t, basis))))
                return;
            style = { ...style, [key]: list.map(t => share(t, basis)).join(' ') };
        };
        rewrite('grid-template-columns', inlineBasis);
        rewrite('grid-template-rows', blockBasis);
        for (const [key, basis] of [['column-gap', inlineBasis], ['row-gap', blockBasis]])
            if (/^\d+(?:\.\d+)?%$/.test(String(style[key])) && basis && exactShare(String(style[key]), basis))
                style = { ...style, [key]: share(String(style[key]), basis) };
    }
    return style;
}
export function planGridColumns({ box, style, geometryRegion, contentInline, sharedColumns, resolvedGap }) {
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
        if (!track)
            throw new Error("Auto-repeat has no track");
        const size = track.fixed ?? track.min;
        if (!size || cmp(size, zero) <= 0)
            throw Object.assign(new Error(`repeat(auto-fill, ${autoRepeat[2].trim()}) needs a px or minmax(px, fr) track`), { code: 'U_LAYOUT_CSS' });
        const gapPx = resolvedGap(style, 'column-gap');
        if ("x" in gapPx)
            throw Object.assign(new Error('Viewport-varying auto-repeat gaps are not modeled'), { code: 'U_LAYOUT_CSS' });
        const step = add(size, gapPx);
        const widest = Math.max(...geometryRegion.vertices.map(v => Number(number(evaluate(contentInline, v)))));
        const most = Math.min(64, Math.max(1, Math.floor((widest + Number(number(gapPx))) / Number(number(step)))));
        plans = [];
        for (let n = 1; n <= most; n++) {
            // n tracks: n·size + (n−1)·gap ≤ W < (n+1)·size + n·gap (n = 1 also below one track: at least one).
            let r = [geometryRegion];
            if (n > 1)
                r = r.flatMap(x => partition(x, diff(contentInline, scalar(sub(mul(q(n), step), gapPx))), '>=').yes);
            if (n < most)
                r = r.flatMap(x => partition(x, diff(contentInline, scalar(sub(mul(q(n + 1), step), gapPx))), '>=').no);
            for (const region of r)
                plans.push({ region, columns: Array.from({ length: fitItems === null ? n : Math.max(1, Math.min(n, fitItems)) }, () => track), ...(fitItems !== null ? { fitItems } : {}) });
        }
    }
    else
        plans = [{ region: geometryRegion, columns: sharedColumns ? sharedColumns.values.map(value => ({ definite: value })) :
                    style['grid-template-columns'] === 'none' ? [] : tracks(style['grid-template-columns'] ?? 'none') }];
    return plans;
}
export function resolveGridColumns({ plan, style, contentInline, sharedColumns, resolvedGap, flex }) {
    const columns = plan.columns;
    const columnGap = resolvedGap(style, 'column-gap', sharedColumns);
    const columnBases = columns.map(track => scalar(track.fixed ?? track.edges ?? zero));
    const columnLayouts = sharedColumns ? [{ region: plan.region, values: sharedColumns.values, required: trackArea(sharedColumns.values, columnGap, 0, columns.length) }] :
        flex(plan.region, contentInline, columns.map(track => { if ("definite" in track)
            throw new Error("Unexpected shared column"); return track; }), scaleGap(columnGap, Math.max(0, columns.length - 1)), columnBases, false);
    // justify-content distributes free space between tracks (positions only).
    const justified = columnLayouts.flatMap((cs) => {
        const d = sharedColumns ? { lead: zero, extra: zero, negative: 'start' } : distribution(String(style['justify-content']), 'inline', columns.length);
        if (cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0)
            return [{ ...cs, shift: { lead: scalar(0), extra: scalar(0) } }];
        const free = diff(contentInline, sum(total(cs.values), scaleGap(columnGap, Math.max(0, columns.length - 1))));
        const split = partition(cs.region, free, '>=');
        return [...split.yes.map(region => ({ ...cs, region, shift: { lead: times(free, d.lead), extra: times(free, d.extra) } })),
            ...split.no.map(region => ({ ...cs, region, shift: d.negative === 'start' ? { lead: scalar(0), extra: scalar(0) } : null }))];
    });
    return { columnGap, justified };
}
