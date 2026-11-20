// Block-flow normalization and exact constant margin collapse.
import { q, cmp, add, sub, number } from './linear.mjs';
import { px, viewportLength } from './css.mjs';
const zero = q(0);
export function prepareBlockChildren({ children, box, style, parents, ancestors, available, emit, warningRegion, layoutWarnings, ranges, styles, positiveEdge, positivePadding, alignBrowserDependent }) {
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
                message: `${box.label} lays out ${inlineKids.map(c => c.box.label).join(', ')} as inline-level boxes, with whitespace between them in the markup: each gap is a space of ${box.label}'s font (about a quarter of its font-size), not a value you set. Use display: flex with gap on ${box.label} instead`, ...ranges(warningRegion) });
        for (const img of inlineKids.filter(c => c.box.tag === 'img' && String(c.style['vertical-align'] ?? 'baseline') === 'baseline'))
            if (!fontless && !layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_BASELINE_GAP' && w.path === img.box.path))
                layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_BASELINE_GAP', severity: 'warning', box: img.box.label, path: img.box.path, parent: box.label,
                    message: `${img.box.label} is an inline image in ${box.label}: it sits on the text baseline, so ${box.label} is taller than the image by the font's descender (a few pixels of gap under it). Give ${img.box.label} display: block (or vertical-align: top)`, ...ranges(warningRegion) });
        for (const child of flow)
            if (child.style.$inlineLevel)
                throw Object.assign(new Error(`${child.box.label} is inline-level inside the block container ${box.label}: its line layout is not modeled (give it display: block, or make ${box.label} a grid or flex container)`), { code: 'U_LAYOUT_INLINE', box: child.box, region: children.region });
        // Grid placement and self-alignment do nothing in block flow: laid out as auto, reported as inert.
        // (justify-self is not inert: Chromium aligns block-level boxes by it — measured — which is not modeled.)
        for (const child of flow)
            if (!['auto', 'normal', 'stretch', 'legacy'].includes(String(child.style['justify-self'] ?? 'auto'))) {
                alignBrowserDependent(child.box, 'justify-self', child.style['justify-self']);
                throw Object.assign(new Error(`${child.box.label}: justify-self: ${child.style['justify-self']} aligns a block-level box (CSS Box Alignment), which is not modeled`), { code: 'U_LAYOUT_CSS', box: child.box, region: children.region });
            }
        const inertDefaults = { 'grid-column': 'auto', 'grid-row': 'auto', 'align-self': 'auto' };
        flow.forEach((child, k) => {
            const written = Object.keys(inertDefaults).filter(key => child.style.$sources?.[key] && !['auto', 'normal', 'stretch'].includes(String(child.style[key])));
            if (!written.length)
                return;
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
            const plainBlock = (st) => st.display === 'block' && !['hidden', 'auto', 'scroll'].includes(String(st['overflow-x'])) && !['hidden', 'auto', 'scroll'].includes(String(st['overflow-y'])) && st.position === 'static';
            flow.forEach((child, k) => {
                if (!plainBlock(child.style) || child.box.text || !(child.box.children ?? []).length)
                    return;
                const childAncestors = [...ancestors, { box: child.box, style: child.style, inline: null, block: null, type: child.style['container-type'], names: [] }];
                // The in-flow children of a box ({ box, style }), or null when one's style varies here.
                const flowOf = (owner, ownerStyle, at) => {
                    const out = [];
                    for (const g of owner.children ?? []) {
                        let pieces;
                        try {
                            pieces = styles(g, children.region, at, ownerStyle, false);
                        }
                        catch {
                            return null;
                        }
                        const keys = new Set(pieces.map(p => JSON.stringify([p.style.display, p.style.position, p.style['margin-top'], p.style['margin-bottom'], p.style['padding-top'], p.style['padding-bottom'], p.style['border-top'], p.style['border-bottom'], p.style['block-size'], p.style['overflow-x'], p.style['overflow-y']])));
                        if (keys.size !== 1)
                            return null;
                        const st = pieces[0].style;
                        if (st.display !== 'none' && st.position !== 'absolute')
                            out.push({ box: g, style: st });
                    }
                    return out;
                };
                const gm = (st, side) => { if (viewportLength(st[`margin-${side}`]))
                    throw Object.assign(new Error('Responsive margin may collapse through an ancestor'), { code: 'U_LAYOUT_CSS' }); return /^\d+(?:\.\d+)?px$/.test(String(st[`margin-${side}`])) ? px(st[`margin-${side}`]) : zero; };
                // The margin that collapses out of a box on one side: its own and, through every plain block with
                // no padding or border there (and an auto height, for the bottom), its first (last) child's
                // (measured: several levels deep). null when that is not known.
                const outward = (owner, st, at, side, depth) => {
                    const own = gm(st, side);
                    if (depth > 16 || !plainBlock(st) || owner.text || !(owner.children ?? []).length || !zeroEdge(st, side) || (side === 'bottom' && st['block-size'] !== 'auto'))
                        return own;
                    const inner = [...at, { box: owner, style: st, inline: null, block: null, type: st['container-type'], names: [] }];
                    const kids = flowOf(owner, st, inner);
                    if (!kids)
                        return null;
                    if (!kids.length || kids.some(k => /inline|contents|table/.test(String(k.style.display))))
                        return own;
                    const edge = side === 'top' ? kids[0] : kids.at(-1);
                    const theirs = outward(edge.box, edge.style, inner, side, depth + 1);
                    if (theirs === null)
                        return null;
                    return cmp(theirs, own) > 0 ? theirs : own;
                };
                const updates = {};
                const grand = flowOf(child.box, child.style, childAncestors);
                if (!grand || grand.some(g => /inline|contents|table/.test(String(g.style.display))))
                    return;
                const childOf = [...childAncestors];
                for (const side of ['top', 'bottom']) {
                    if (!grand.length || !zeroEdge(child.style, side) || (side === 'bottom' && child.style['block-size'] !== 'auto'))
                        continue;
                    const edge = side === 'top' ? grand[0] : grand.at(-1);
                    const theirs = outward(edge.box, edge.style, childOf, side, 1);
                    if (theirs === null)
                        return;
                    if (cmp(theirs, zero) <= 0)
                        continue;
                    // F73: the grandchild's margin goes out through the child, so with a background on the child the space
                    // shows above (below) the background, not inside it (CSS 2.2 §8.3.1; measured in three browsers).
                    if (!['transparent', 'rgba(0,0,0,0)', 'ua', undefined, 'none'].includes(String(child.style['background-color'])) && !child.box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_MARGIN_COLLAPSE_THROUGH' && w.path === child.box.path && w.side === side))
                        layoutWarnings.push({ code: 'W_LAYOUT_MARGIN_COLLAPSE_THROUGH', severity: 'warning', box: child.box.label, path: child.box.path, side,
                            message: `${child.box.label}: the margin-${side} of ${edge.box.label} (${number(theirs)}px) collapses through it — it has no padding-${side} or border-${side} — so the space shows ${side === 'top' ? 'above' : 'below'} ${child.box.label}'s background, not inside it. Give ${child.box.label} a padding-${side} (or display: flow-root), or use padding on ${edge.box.label}` });
                    const total = cmp(theirs, mv(child, side)) > 0 ? theirs : mv(child, side);
                    updates[`margin-${side}`] = cmp(total, zero) === 0 ? '0' : `${number(total)}px`;
                    updates[side === 'top' ? '$collapsedTop' : '$collapsedBottom'] = true;
                }
                if (!Object.keys(updates).length)
                    return;
                const index = children.children.indexOf(child);
                children.children[index] = { ...child, style: { ...child.style, ...updates } };
                flow[k] = children.children[index];
            });
            // This container's own first/last child margins already moved out by its parent.
            if (available.collapsedTop && flow.length) {
                const index = children.children.indexOf(flow[0]);
                children.children[index] = { ...flow[0], style: { ...flow[0].style, 'margin-top': '0' } };
                flow[0] = children.children[index];
            }
            if (available.collapsedBottom && flow.length) {
                const index = children.children.indexOf(flow.at(-1));
                children.children[index] = { ...flow.at(-1), style: { ...flow.at(-1).style, 'margin-bottom': '0' } };
                flow[flow.length - 1] = children.children[index];
            }
            if (flow.some(child => cmp(add(mv(child, 'top'), mv(child, 'bottom')), zero) > 0)) {
                const edge = (side) => positiveEdge(style, side, children.region);
                const unknownCollapse = (why) => { throw Object.assign(new Error(`${box.label}: ${why}; that margin collapsing is not modeled`), { code: 'U_LAYOUT_CSS', box, region: children.region }); };
                // A container that establishes a formatting context (a grid or flex item, overflow hidden/auto/
                // scroll, absolute) keeps its children's margins inside it (measured): nothing collapses through.
                const parentStyle = parents.at(-1)?.style;
                // (The root element always establishes one.)
                const formattingRoot = (!parents.length && box.documentRoot) || (parentStyle && ['grid', 'flex', 'inline-grid', 'inline-flex'].includes(String(parentStyle.display)) && !parentStyle.$blockFlow) || ['hidden', 'auto', 'scroll'].includes(String(style['overflow-x'])) || ['hidden', 'auto', 'scroll'].includes(String(style['overflow-y'])) || style.position === 'absolute';
                if (flow.length && cmp(mv(flow[0], 'top'), zero) > 0 && !edge('top') && !formattingRoot)
                    unknownCollapse(`the top margin of ${flow[0].box.label} collapses through its container (no padding or border on top)`);
                if (flow.length && cmp(mv(flow.at(-1), 'bottom'), zero) > 0 && !edge('bottom') && style['block-size'] === 'auto' && !formattingRoot)
                    unknownCollapse(`the bottom margin of ${flow.at(-1).box.label} collapses through its container (no padding or border below, auto height)`);
                for (const child of flow)
                    if (cmp(add(mv(child, 'top'), mv(child, 'bottom')), zero) > 0 && !(child.box.children ?? []).length && !child.box.text && child.style['block-size'] === 'auto' && !['top', 'bottom'].some(side => positivePadding(child.style, side, children.region)))
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
}
