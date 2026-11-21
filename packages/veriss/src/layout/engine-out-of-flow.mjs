// Resolve out-of-flow children against their owned containing block, or
// report unknown where clipping, scroll or transforms invalidate the model.
import { containsFixed, fixedContainer } from './css.mjs';
import { scalar, width, height } from './region.mjs';
export function solvePositionedChild({ item, r, finalAncestors, style, emit, preferences, layoutWarnings, ranges, solve }) {
    // position: fixed: the viewport is the containing block, unless an ancestor transform (or a clip or
    // scroll that would move it relative to the page) intervenes, which is not modeled.
    if (item.style.$fixed) {
        // An ancestor transform makes that ancestor the containing block of fixed descendants (CSS Transforms 1
        // §2): the box is placed against it and scrolls with it instead of staying on the viewport.
        const trap = [...finalAncestors].reverse().find(ancestor => ancestor.style && containsFixed(ancestor.style) && ancestor.box);
        // The trap is a likely bug (a toast or modal meant for the viewport, placed against a header or a
        // card): a warning besides the Unknown, so it is not only a not-checked line.
        if (trap && !layoutWarnings.some(w => w.code === 'W_LAYOUT_FIXED_TRAPPED' && w.path === item.box.path))
            layoutWarnings.push({ code: 'W_LAYOUT_FIXED_TRAPPED', severity: 'warning', box: item.box.label, path: item.box.path, ancestor: trap.box.label,
                message: `${item.box.label} is position: fixed, but ${trap.box.label} (${fixedContainer(trap.style)}) becomes its containing block: it is placed against ${trap.box.label} and moves with it instead of staying on the viewport. Render it outside that box (a portal to the end of body), or drop the property`, ...ranges(r) });
        if (trap)
            throw Object.assign(new Error(`${item.box.label} is position: fixed, but its ancestor ${trap.box.label} has ${fixedContainer(trap.style)}, which makes it the containing block: ${item.box.label} is placed against ${trap.box.label} and scrolls with it, not with the viewport. Move it outside that box (for example to the end of body), or drop the property`), { code: 'U_LAYOUT_FIXED_CONTAINED', box: item.box, region: r, ancestor: trap.box.label, ancestorPath: trap.box.path, property: 'transform' });
        if (finalAncestors.some(ancestor => ancestor.clipped || ancestor.subgrid || (ancestor.style && (containsFixed(ancestor.style) || ['overflow-x', 'overflow-y'].some(key => ancestor.style[key] !== 'visible')))))
            throw Object.assign(new Error(`${item.box.label} is position: fixed inside a transformed, clipped or scrolling ancestor`), { code: 'U_LAYOUT_CSS' });
        const viewport = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
        return solve(item.box, { inline: viewport.inline, block: viewport.block, containingBlock: { path: 'viewport', ...viewport } }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region);
    }
    const containing = [...finalAncestors].reverse().find(ancestor => ancestor.positioned);
    // No positioned (or transformed) ancestor: the initial containing block — the viewport's size at the
    // top of the page — places it (CSS 2 §10.1), and it scrolls with the page. Usually a missing
    // position: relative on the box it was meant to sit in (a badge that jumps to the page corner).
    // A clipping or scrolling ancestor in between (does it clip the box?) stays Unknown.
    if (!containing && height && !finalAncestors.some(ancestor => ancestor.clipped || ancestor.subgrid || (ancestor.style && ['overflow-x', 'overflow-y'].some(key => ancestor.style[key] !== 'visible')))) {
        const parent = finalAncestors.at(-1)?.box;
        if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_ABSOLUTE_PAGE' && w.path === item.box.path))
            layoutWarnings.push({ code: 'W_LAYOUT_ABSOLUTE_PAGE', severity: 'warning', box: item.box.label, path: item.box.path, ...(parent ? { parent: parent.label } : {}),
                message: `${item.box.label} is position: absolute with no positioned ancestor, so it is placed against the page (the initial containing block), not ${parent ? parent.label : 'its parent'}. Give the box it belongs to position: relative`, ...ranges(r) });
        const initial = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
        return solve(item.box, { inline: initial.inline, block: initial.block, containingBlock: { path: 'initial', ...initial } }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region);
    }
    // A containing block that hides its overflow (overflow: hidden, not scrolling) clips the box at its
    // padding box: the box is laid out as usual, and what reaches past that edge is cut off
    // (E_LAYOUT_ABSOLUTE_CLIPPED). Any other clipping ancestor stays Unknown.
    const clipping = finalAncestors.filter(ancestor => ancestor.clipped);
    const immediate = finalAncestors.at(-1);
    const hiddenClip = (ancestor) => !!ancestor && ['hidden', 'visible'].includes(ancestor.style['overflow-x']) && ['hidden', 'visible'].includes(ancestor.style['overflow-y']);
    // A projected independent rectangle is explicitly at scroll offset zero.
    // Nested hidden overflow does not change a direct containing block's
    // border/padding geometry. Do not relax the ordinary full-page
    // clipping/integrity model or claim the rectangle is visible.
    const projectedClip = preferences.includes('independent-rectangle') &&
        preferences.includes('scroll-zero') && containing === immediate &&
        immediate !== undefined && clipping.includes(immediate) && clipping.every(hiddenClip) &&
        !finalAncestors.some(a => a.clipScope || a.subgrid || containsFixed(a.style ?? {}));
    const ownClip = (clipping.length === 1 && clipping[0] === immediate && hiddenClip(immediate)) || projectedClip;
    // A scroll container that is the containing block: the box is placed against its padding box at
    // scroll offset 0 and scrolls with the content (what reaches past the end extends the scrollable
    // area instead of being cut off). Its size is known; its position, like the content's, only at
    // offset 0 (scroll-zero), so it has none otherwise.
    const ownScroll = clipping.length === 1 && clipping[0] === finalAncestors.at(-1) && containing === clipping[0] && [clipping[0].style?.['overflow-x'], clipping[0].style?.['overflow-y']].every(v => ['auto', 'scroll', 'hidden', 'visible'].includes(String(v))) && !ownClip;
    if (!containing?.paddingBlock || !containing.paddingInline || containing.subgrid || (clipping.length && !ownClip && !ownScroll))
        throw new Error('Absolute boxes require an owned non-scrolling, unclipped containing block without subgrid placement');
    if (ownClip && immediate)
        containing.clips = { box: immediate.box.label, x: immediate.style['overflow-x'] === 'hidden', y: immediate.style['overflow-y'] === 'hidden' };
    return solve(item.box, { inline: containing.paddingInline, block: containing.paddingBlock,
        containingBlock: { path: containing.box.path, inline: containing.paddingInline, block: containing.paddingBlock, origin: containing.paddingOrigin, ...(containing.clips ? { clips: containing.clips } : {}) } }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region);
}
