// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Axis-aligned transforms, relative positioning and translations for the layout engine.
import { q, add, mul, cmp, div } from './linear.mjs';
import { scalar, sum, diff, times } from './region.mjs';
import { px } from './css.mjs';
const zero = q(0), one = q(1), minusOne = q(-1);
export const offset = (origin, inline, block) => origin ? { inline: sum(origin.inline, inline), block: sum(origin.block, block) } : null;
// A linear transform with one nonzero entry per row (scale, quarter-turn rotation) about the box's centre keeps
// rectangles axis-aligned: each new axis interval is a scaled (and possibly flipped) old one, so it stays affine.
export const rational = (v) => { const [n, d = '1'] = v.split('/'); return div(q(n), q(d)); };
export const affineOf = (style) => { const m = /^affine\((.+)\)$/.exec(style.transform ?? 'none'); return m ? m[1].split(' ').map(rational) : null; };
export function linearOf(style) {
    const m = affineOf(style);
    return m && !(cmp(m[0], one) === 0 && cmp(m[1], zero) === 0 && cmp(m[2], zero) === 0 && cmp(m[3], one) === 0) ? m.slice(0, 4) : null;
}
export function mapper(matrix, centre) {
    const [a, b, c, d] = matrix;
    const axis = (p, r) => cmp(p, zero) !== 0 ? { coef: p, from: 'inline' } : { coef: r, from: 'block' };
    const rows = [axis(a, b), axis(c, d)];
    return (rect) => {
        if (!rect?.origin || !rect.block)
            return rect;
        const rel = { inline: [diff(rect.origin.inline, centre.inline), diff(sum(rect.origin.inline, rect.inline), centre.inline)], block: [diff(rect.origin.block, centre.block), diff(sum(rect.origin.block, rect.block), centre.block)] };
        const size = { inline: rect.inline, block: rect.block };
        const out = rows.map(({ coef, from }) => cmp(coef, zero) > 0 ? { lo: times(rel[from][0], coef), size: times(size[from], coef) } : { lo: times(rel[from][1], coef), size: times(size[from], mul(coef, minusOne)) });
        return { origin: { inline: sum(centre.inline, out[0].lo), block: sum(centre.block, out[1].lo) }, inline: out[0].size, block: out[1].size };
    };
}
export function scaled(style, origin, inline, blockSize) {
    // An arbitrary rotation leaves no axis-aligned painted box: no position (its circumscribed rectangle is recorded).
    if (/^(?:rotate|linear)-any\(/.test(String(style.transform)))
        return { origin: null, inline, block: blockSize };
    const matrix = linearOf(style);
    if (!matrix || !origin || !blockSize)
        return { origin: matrix ? null : origin, inline, block: blockSize };
    const half = div(one, q(2)), centre = { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) };
    return mapper(matrix, centre)({ origin, inline, block: blockSize });
}
export function translated(style, origin, size, rootFontSize) {
    const m = affineOf(style);
    if (!origin || !m)
        return origin;
    // Percentages scale with the box's own size: t0 + W·u + H·v.
    const needsH = cmp(m[8], zero) !== 0 || cmp(m[9], zero) !== 0;
    if (needsH && !size?.block)
        return null;
    // em: the element's font-size, which must be a px value.
    const needsEm = cmp(m[10], zero) !== 0 || cmp(m[11], zero) !== 0;
    if (needsEm && !/^\d+(?:\.\d{1,6})?px$/.test(style['font-size']))
        throw Object.assign(new Error(`An em translation needs a px font-size (got ${style['font-size']})`), { code: 'U_LAYOUT_CSS' });
    const em = needsEm ? px(style['font-size']) : zero;
    // rem: the root element's font-size, known only when the analysed root is html with a px font-size.
    const needsRem = cmp(m[12], zero) !== 0 || cmp(m[13], zero) !== 0;
    if (needsRem && !rootFontSize)
        throw Object.assign(new Error('A rem translation needs the html root with a px font-size in the analysed tree'), { code: 'U_LAYOUT_CSS' });
    const rem = needsRem ? rootFontSize : zero;
    const along = (k) => sum(sum(sum(scalar(m[4 + k]), times(size.inline, m[6 + k])), needsH ? times(size.block, m[8 + k]) : scalar(zero)), scalar(add(mul(em, m[10 + k]), mul(rem, m[12 + k]))));
    return offset(origin, along(0), along(1));
}
// position: relative (checklist D1): the box and its contents move by its offsets, nothing else is laid out again
// (CSS 2 §9.4.3: top over bottom; left over right in ltr). The offsets are px here; an inline offset in an rtl box is
// refused before (its children are placed mirrored).
export function relativelyOffset(style, origin) {
    if (!origin || style.position !== 'relative')
        return origin;
    const v = (key) => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))px$|^(0)$/.exec(String(style[key] ?? 'auto')); return m ? q(m[1] ?? '0') : null; };
    const [top, bottom, left, right] = ['top', 'bottom', 'left', 'right'].map(v);
    const dy = top ?? (bottom === null ? zero : mul(bottom, minusOne));
    const dx = left ?? (right === null ? zero : mul(right, minusOne));
    if (cmp(dx, zero) === 0 && cmp(dy, zero) === 0)
        return origin;
    return offset(origin, scalar(dx), scalar(dy));
}
