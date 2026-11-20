// TypeScript source. Run pnpm build:ts to regenerate adjacent ESM and declarations.
import { q, add, cmp, exact } from './linear.mjs';
import { sum, times, diff, partition, affine } from './region.mjs';
import { px } from './css.mjs';
import { absoluteOrigin } from './positioned.mjs';
import { intersect } from './integrity.mjs';
import { inheritTracks } from './subgrid.mjs';
import { offset, relativelyOffset, translated as translatedWithRoot } from './engine-transforms.mjs';
const zero = q(0);
export const subgridError = (message, box, region, axis) => Object.assign(new Error(message), { code: 'U_LAYOUT_SUBGRID', box, region, axis });
// Root-relative border coordinates. Scroll offsets/gutter placement and shared
// subgrid line offsets are deliberately outside the first transition profile.
// A px translate moves the box (and, through its origin, its descendants) after layout.
export const isDescendant = (a, b) => b.startsWith(a + '/');
export const intersectRegions = (a, b) => Boolean(intersect(a, b));
export function createPositionSolver({ block, preferences, rootFontSize, resolvedGap, bounded, diagnostics, ranges, subgrids }) {
    const translated = (style, origin, size) => translatedWithRoot(style, origin, size, rootFontSize());
    function resolvedOrigin(style, available, inline, blockSize, parents) {
        return relativelyOffset(style, translated(style, untranslatedOrigin(style, available, inline, blockSize, parents), { inline, block: blockSize }));
    }
    function untranslatedOrigin(style, available, inline, blockSize, parents) {
        // overflow: clip never scrolls, so positions inside it stay exact; hidden/auto/scroll may be scrolled.
        // (The document root's overflow is the viewport's: its scrolling is the page scroll, already modeled; at scroll 0
        // positions inside it are exact.)
        // scroll-zero (an internal re-analysis): positions inside scroll containers at their initial scroll offset 0, exact
        // there; only the cover findings at that offset are taken from it.
        const scrollZero = preferences.includes('scroll-zero');
        if (!block || parents.some(p => (p.clipped && !scrollZero) || p.subgrid) || (!scrollZero && !available.root && ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(style[key]))) ||
            ['grid-template-columns', 'grid-template-rows'].some(key => style[key] === 'subgrid'))
            return null;
        if (style.position !== 'absolute') {
            // Cross-axis alignment of a flex item that is not stretched.
            let origin = available.origin ?? null;
            if (origin && available.alignBlock !== undefined)
                origin = blockSize ? { inline: origin.inline, block: sum(origin.block, times(diff(available.block, blockSize), available.alignBlock)) } : null;
            if (origin && available.alignInline !== undefined)
                origin = { inline: sum(origin.inline, times(diff(available.inline, inline), available.alignInline)), block: origin.block };
            return origin;
        }
        const containing = available.containingBlock;
        if (!containing?.origin || !blockSize)
            return null;
        const local = absoluteOrigin(style, containing, { inline, block: blockSize });
        return offset(containing.origin, local.inline, local.block);
    }
    function subgridGeometry(style, box, available, region, emit) {
        const axes = {};
        let geometryRegions = [region];
        for (const [axis, property, sides, gapProperty] of [
            ['inline', 'grid-template-columns', ['left', 'right'], 'column-gap'],
            ['block', 'grid-template-rows', ['top', 'bottom'], 'row-gap'],
        ]) {
            if (style.display !== 'grid' || !/^subgrid\b/.test(style[property]))
                continue;
            if (style[property] !== 'subgrid')
                throw subgridError('Subgrid line names and repeat syntax are not modeled', box, region, axis);
            if (style['container-type'] !== 'normal')
                throw subgridError('Subgrid size-query containment differs across target browsers; put the size query container on a parent', box, region, axis);
            const parent = available.tracks?.[axis];
            if (!parent)
                throw subgridError('Subgrid requires resolved parent tracks; external parents and intrinsic row contributions are not modeled', box, region, axis);
            if (style[`${axis}-size`] !== 'auto')
                throw subgridError('Checked subgrids require auto size in their shared axis', box, region, axis);
            if (style[`min-${axis}-size`] !== 'auto' && cmp(px(style[`min-${axis}-size`]), zero) !== 0)
                throw subgridError('Minimum size on a shared subgrid axis is outside the checked subset', box, region, axis);
            const edge = (side) => add(px(style[`padding-${side}`]), px(style[`border-${side}`]));
            const insets = [edge(sides[0]), edge(sides[1])];
            const gap = resolvedGap(style, gapProperty, parent);
            if ('x' in gap || 'x' in parent.gap)
                throw subgridError('Viewport-varying subgrid gaps are not modeled', box, region, axis);
            const values = inheritTracks({ ...parent, gap: parent.gap }, gap, ...insets);
            axes[axis] = { ...parent, gap, values, insets };
            for (const value of values)
                geometryRegions = bounded(geometryRegions.flatMap(region => {
                    const parts = partition(region, value, '>=');
                    for (const failed of parts.no)
                        diagnostics.push({ code: 'U_LAYOUT_SUBGRID', severity: 'unknown', message: 'Subgrid gap/insets produce a negative effective track; CSS collapse is not modeled', box: box.label, path: box.path, source: box.source, axis, ...ranges(failed) });
                    return parts.yes;
                }));
        }
        if (emit)
            for (const geometryRegion of geometryRegions)
                for (const axis of ['inline', 'block']) {
                    const inheritedAxis = axes[axis];
                    if (!inheritedAxis)
                        continue;
                    subgrids.push({ box: box.label, path: box.path, axis,
                        parent: inheritedAxis.box.label, parentPath: inheritedAxis.box.path, startLine: inheritedAxis.startLine, span: inheritedAxis.values.length,
                        gap: exact(inheritedAxis.gap), insets: [exact(inheritedAxis.insets[0]), exact(inheritedAxis.insets[1])], tracks: inheritedAxis.values.map(affine), ...ranges(geometryRegion) });
                }
        return { axes, regions: geometryRegions };
    }
    return { translated, resolvedOrigin, untranslatedOrigin, subgridGeometry };
}
