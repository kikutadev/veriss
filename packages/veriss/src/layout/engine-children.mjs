// Collect region-specific layout children, keeping DOM inheritance separate
// from the formatting tree (display: contents and generated pseudo-elements).
import { matches } from './css.mjs';
import { droppedOf } from './dropped.mjs';
import { tablePlacement } from './engine-table.mjs';
export function collectLayoutChildren({ region, box, style, ancestors, styles, bounded, emit, rendered, isFlex, pseudoContracts, layoutWarnings, contentsInert, tableRowRadius, aspectInert }) {
    // Child boxes per region. display: contents is replaced by its
    // children, which inherit from it (the element tree) but are
    // laid out as items of this container.
    let states = [{ region, children: [] }];
    const visit = (child, inheritedStyle) => {
        states = bounded(states.flatMap(s => styles(child, s.region, ancestors, inheritedStyle, false).flatMap((c) => {
            if (child.tableCell || child.tableCaption)
                c = { ...c, style: { ...c.style, ...tablePlacement(child, c.style), $sources: c.style.$sources } };
            if (child.tablePart && ['table-row-group', 'table-header-group', 'table-footer-group', 'table-row'].includes(c.style.display))
                c = { ...c, style: { ...c.style, display: 'contents' } };
            if (c.style.display === 'none')
                return [{ region: c.region, children: s.children }];
            // F53: in block flow, an in-flow box's auto margin-top / margin-bottom are 0 (CSS 2.2 §10.6.3; measured in
            // Chromium, Firefox and WebKit, also in a flow-root or overflow: hidden parent): no vertical centring.
            if (style.$blockFlow && !['absolute', 'fixed'].includes(c.style.position) && !c.style.$fixed && c.style.display !== 'contents') {
                const autos = ['margin-top', 'margin-bottom'].filter(key => String(c.style[key]) === 'auto');
                if (autos.length) {
                    c = { ...c, style: { ...c.style, ...Object.fromEntries(autos.map(key => [key, '0'])) } };
                    if (!child.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === child.path && w.properties?.includes(autos[0])))
                        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: child.label, path: child.path, properties: autos, css: autos.filter(key => c.style.$sources?.[key]).map(key => ({ property: key, file: c.style.$sources[key].file, line: c.style.$sources[key].line, selector: c.style.$sources[key].selector })),
                            message: `${child.label}: ${autos.join(' and ')}: auto ${autos.length === 1 ? 'is' : 'are'} 0 in block flow (its parent ${box.label} is display: block), so it is not centred or pushed down vertically. Make the parent display: flex (or grid) for auto margins to take the free space` });
                }
            }
            if (c.style.display !== 'contents')
                return [{ region: c.region, children: [...s.children, { box: child, style: c.style, inherited: inheritedStyle }] }];
            if (child.text || child.contract || child.targets?.length)
                throw new Error('display: contents with text, contracts or noshift targets needs anonymous or absent boxes');
            if (emit)
                contentsInert(child, c.style, c.region);
            if (emit && child.tablePart)
                tableRowRadius(child, c.style);
            if (emit && child.tablePart && droppedOf(c.style, 'aspect-ratio').length)
                aspectInert(child, c.style);
            return [{ region: c.region, children: s.children, contents: c.style }];
        })));
        const nested = states.filter(state => state.contents);
        if (!nested.length)
            return;
        if (nested.length !== states.length)
            throw new Error('display: contents that varies across regions is outside the subset');
        const contentsStyle = nested[0].contents;
        if (!contentsStyle)
            throw new Error("Unresolved contents inheritance");
        for (const state of states)
            delete state.contents;
        for (const grandchild of child.children)
            visit(grandchild, contentsStyle);
    };
    // ::before/::after: an empty, absolutely positioned box with explicit sizes (decorative layers, overlays)
    // takes part as a child painted before or after the others; generated text is not modeled.
    const pseudo = (kind) => {
        const pbox = { ...box, tag: box.tag, path: `${box.path}/${kind === 'before' ? -1 : box.children.length}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind,
            named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
        states = bounded(states.flatMap(s => styles(pbox, s.region, ancestors, style, false, false, new Set([`::${kind}`])).map(c => {
            const content = c.style.content ?? 'none';
            if (content === 'none' || c.style.display === 'none')
                return { region: c.region, children: s.children };
            // Generated text in a grid/flex container is an item of its own: sized by a selector::kind contract.
            if (content.startsWith('text:')) {
                const sized = pseudoContracts.find(p => p.kind === kind && matches(p.base, box));
                if (!sized || c.style.position !== 'static')
                    throw Object.assign(new Error(`${pbox.label} generates text${sized ? ' out of flow' : '; give it a contract (' + box.label + '::' + kind + ')'}`), { code: 'U_LAYOUT_PSEUDO' });
                const tbox = { ...pbox, text: true, textContent: content.slice(5), generated: { [kind]: content.slice(5) }, contract: sized.contract, contractSelector: sized.selector };
                return { region: c.region, children: kind === 'before' ? [{ box: tbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: tbox, style: c.style, inherited: style }] };
            }
            if (c.style.position !== 'absolute')
                throw Object.assign(new Error(`${pbox.label} is generated in flow; only absolutely positioned generated boxes are modeled`), { code: 'U_LAYOUT_PSEUDO' });
            return { region: c.region, children: kind === 'before' ? [{ box: pbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: pbox, style: c.style, inherited: style }] };
        })));
    };
    if (!box.pseudo)
        pseudo('before');
    // A closed details renders only its first summary (measured); an open attribute set by script is Unknown.
    if (box.tag === 'details' && box.detailsOpen === 'dynamic')
        throw Object.assign(new Error(`${box.label}: whether this details is open is decided at run time`), { code: 'U_LAYOUT_ELEMENT', box });
    const summary = box.tag === 'details' ? box.children.find(child => child.tag === 'summary') : null;
    for (const child of box.children)
        if (child !== rendered?.box && !(box.tag === 'details' && box.detailsOpen === false && child !== summary))
            visit(child, style);
    if (!box.pseudo)
        pseudo('after');
    // order: items are laid out (and painted) in order-modified document order, a stable sort by order. Modeled
    // where in-flow items cannot overlap (so paint order does not matter): flex items, and grid items that are
    // all auto-placed; with a transform or relative offsets on a reordered item it stays Unknown. Tab order
    // still follows the DOM (visual-order reports the difference).
    for (const state of states) {
        if (state.children.every(child => child.style.order === '0'))
            continue;
        const reject = (why) => { throw Object.assign(new Error(`order changes the item sequence; ${why}`), { code: isFlex ? 'U_LAYOUT_FLEX' : 'U_LAYOUT_CSS', box }); };
        if (state.children.some(child => !/^-?\d+$/.test(String(child.style.order))))
            reject('only integer order values are modeled');
        if (!isFlex && state.children.some(child => child.style['grid-column'] !== 'auto' || child.style['grid-row'] !== 'auto' || child.style['grid-area'] && child.style['grid-area'] !== 'auto'))
            reject('with explicitly placed grid items (which may overlap) it is not modeled');
        if (state.children.some(child => child.style.transform !== 'none' || (child.style.position === 'relative' && ['top', 'left', 'right', 'bottom'].some(k => child.style[k] !== 'auto'))))
            reject('with transformed or offset items (whose paint order matters) it is not modeled');
        state.children = [...state.children].sort((a, b) => Number(a.style.order) - Number(b.style.order));
    }
    return states;
}
