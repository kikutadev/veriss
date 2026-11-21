// A closed, non-replaced fixed box with ordinary block children. We check
// the source grammar before using the existing cascade/rectangle solver;
// endpoint fits alone are NOT a proof about an arbitrary CSS transition.
import { parse, serialize, defaultTreeAdapter } from 'parse5';
import postcss from 'postcss';
import * as csstree from 'css-tree';
import { q, cmp } from './linear.mjs';
function need(ok, msg) { if (!ok)
    throw Error(msg); }
const ident = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const decimal = String.raw `(?:\d{1,6}(?:\.\d{1,6})?|\.\d{1,6})`;
const px = new RegExp('^(?:0|' + decimal + 'px)$');
const number = (s) => q(s.startsWith('.') ? '0' + s : s);
const signedNumber = (sign, s) => sign === '-' ? q('-' + (s.startsWith('.') ? '0' + s : s)) : number(s);
const term = new RegExp('^(' + decimal + ')(px|vw)(?:\\s+([+-])\\s+(' + decimal + ')px)?$');
function widthTerms(v) {
    let t = v.trim();
    let kind = 'single';
    const fn = /^(min|max)\((.*)\)$/.exec(t);
    if (fn) {
        need(fn[1] === 'min' || fn[1] === 'max', 'Invalid CSS width function');
        kind = fn[1];
        t = fn[2] ?? '';
    }
    const parts = postcss.list.comma(t);
    need(parts.length > 0 && parts.length <= 8 && (kind !== 'single' || parts.length === 1), 'Unsupported width expression');
    return { kind, terms: parts.map(part => {
            let s = part.trim();
            const calc = /^calc\((.*)\)$/.exec(s);
            if (calc)
                s = calc[1].trim();
            if (s === '0')
                s = '0px';
            const m = term.exec(s);
            need(m && (m[2] === 'vw' || !m[3]), 'Width must be px, vw or a corresponding min/max of affine lengths');
            return { slope: m[2] === 'vw' ? number(m[1]) : q(0), offset: m[2] === 'px' ? number(m[1]) : m[3] ? signedNumber(m[3], m[4]) : q(0) };
        }) };
}
function mutuallyBounded(a, b) {
    const x = widthTerms(a), y = widthTerms(b);
    need(x.kind === y.kind && x.terms.length === y.terms.length, 'Incompatible interpolated width functions');
    const signs = x.terms.map((t, i) => { const u = y.terms[i]; need(u, 'Width terms mismatch'); need(cmp(t.slope, u.slope) === 0, 'Different width slopes are not supported'); return cmp(t.offset, u.offset); });
    need(signs.every(s => s >= 0) || signs.every(s => s <= 0), 'Width branches can move in opposite directions');
}
const easing = /^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\([^()]+\))$/;
const time = new RegExp('^' + decimal + '(?:ms|s)$');
function transition(v) {
    // Existing CSS lexer checks syntax; only a width transition with a single
    // optional timing function and no negative delay is admitted.
    need(csstree.lexer.matchProperty('transition', v).matched, 'Invalid transition');
    let timing;
    for (const group of postcss.list.comma(v)) {
        const items = postcss.list.space(group);
        need(time.test(items[1] ?? '') && items.length <= 3 && (items.length === 2 || easing.test(items[2])), 'Require explicit transition property, duration and optional easing');
        if (items[0] === 'width') {
            need(timing === undefined, 'Repeated width transition');
            timing = items[2] ?? 'ease';
        }
        else
            need(paint.test(items[0] ?? ''), 'Unsupported transition target ' + items[0]);
    }
    need(timing !== undefined, 'Explicit width transition required');
    return timing;
}
const tags = new Set(['div', 'main', 'section', 'article', 'aside', 'nav', 'header', 'footer']);
const attrs = (n) => Object.fromEntries(n.attrs.map(a => [a.name, a.value]));
const children = (n) => n?.childNodes?.filter(defaultTreeAdapter.isElementNode) ?? [];
const emptyText = (n) => n.childNodes.every(n => defaultTreeAdapter.isElementNode(n) || defaultTreeAdapter.isCommentNode(n) || defaultTreeAdapter.isTextNode(n) && /^[\t\n\r\f ]*$/.test(n.value));
const paint = /^(?:color|background-color|opacity|border-radius|box-shadow)$/;
function safeDecl(p, v, scope) {
    if (paint.test(p))
        return true;
    if (p === 'box-sizing')
        return v === 'border-box';
    if (p === 'margin' || p === 'padding')
        return /^(?:0|0px)$/.test(v);
    if (scope === 'root')
        return p === 'font-size' && px.test(v);
    if (p === 'height')
        return px.test(v);
    if (p === 'display')
        return v === 'block' || scope === 'outer' && v === 'flex';
    if (p === 'border')
        return v === '0' || scope === 'outer' && /^\d{1,4}px solid #[0-9a-fA-F]{3,8}$/.test(v);
    if (scope === 'child')
        return p === 'width' && ['auto', '100%'].includes(v) || p === 'min-width' && v === '0' || p === 'flex' && v === 'none' || p === 'align-self' && v === 'stretch';
    if (p === 'flex-direction')
        return ['column', 'column-reverse'].includes(v);
    if (p === 'flex-wrap')
        return v === 'nowrap';
    if (p === 'align-items')
        return v === 'stretch';
    if (p === 'position')
        return v === 'fixed';
    if (['left', 'right'].includes(p))
        return px.test(v) || v === '50%';
    if (['top', 'bottom'].includes(p))
        return px.test(v);
    if (p === 'transform')
        return ['none', 'translateX(-50%)', 'translate(-50%)', 'translate(-50%)translateZ(0)', 'translate(-50%) translateZ(0)'].includes(v);
    return false;
}
export function deriveWidthTransition({ html, css, profile, target, stateAttribute, from, to }) {
    need(typeof html === 'string' && typeof css === 'string' && html.length <= 100000 && css.length <= 100000, 'Closed component input limit');
    need(ident.test(target) && /^data-[a-z][a-z0-9-]*$/.test(stateAttribute) && ident.test('s' + from) && ident.test('s' + to) && typeof from === 'string' && typeof to === 'string' && from !== to, 'Invalid state binding');
    need((profile.scrollbar?.inlineSize ?? 0) === 0 && (profile.scrollbar?.blockSize ?? 0) === 0 && (profile.scrollbar?.thinInlineSize ?? 0) === 0 && (profile.scrollbar?.thinBlockSize ?? 0) === 0, 'Overlay scrollbars required');
    const errors = [], doc = parse(html, { scriptingEnabled: true, onParseError: e => errors.push(e.code) });
    const root = children(doc).find(n => n.tagName === 'html'), head = children(root).find(n => n.tagName === 'head'), body = children(root).find(n => n.tagName === 'body');
    need(doc.mode === 'no-quirks' && !errors.length && root && head && body && children(head).every(n => ['title', 'meta'].includes(n.tagName)), 'Closed standards HTML required');
    const nodes = children(body), outer = nodes[0], inner = children(outer);
    need(nodes.length === 1 && outer && tags.has(outer.tagName) && attrs(outer).id === target && attrs(outer)[stateAttribute] === from && inner.length <= 16 && inner.every(n => tags.has(n.tagName) && !children(n).length), 'Fixed box must be the sole body element, with only ordinary block leaf children');
    const ids = [target, ...inner.map(n => attrs(n).id ?? '')];
    need(new Set(ids).size === ids.length && ids.every(v => typeof v === 'string' && ident.test(v)), 'Unique target and child IDs required');
    for (const n of [root, body, outer, ...inner]) {
        need(emptyText(n) && n.attrs.every(a => !a.namespace && ['lang', 'id', ...(n === outer ? [stateAttribute] : [])].includes(a.name)), 'Unsupported component markup or inline styles');
    }
    need(!attrs(root).id && !attrs(body).id, 'Root and body ID aliases are unsupported');
    const beforeSelector = '#' + target, afterSelector = beforeSelector + '[' + stateAttribute + '=' + to + ']', groups = [];
    let timing, baseWidth = false;
    const staticProperties = new Map(), record = (scope, p, v) => {
        // Require every declaration of a geometric property outside width to
        // agree, irrespective of cascade priority. The only changing geometry
        // in the accepted component is the explicit fixed box width.
        const key = scope + '/' + p;
        need(!staticProperties.has(key) || staticProperties.get(key) === v, 'Inconsistent non-width declaration ' + p);
        staticProperties.set(key, v);
    };
    const sheet = postcss.parse(css);
    // Minifiers can emit a separate @media block for each selector.
    // Coalesce only adjacent, textually identical conditions; never move a
    // declaration past another condition or intervening non-comment rule.
    let previous = null;
    for (const rule of [...sheet.nodes]) {
        if (rule.type === 'comment')
            continue;
        if (previous?.type === 'atrule' && rule.type === 'atrule' && previous.name === 'media' && rule.name === 'media' && previous.params === rule.params && previous.nodes && rule.nodes) {
            previous.append([...rule.nodes]);
            rule.remove();
        }
        else
            previous = rule;
    }
    function inspect(container, context = '') {
        let pair = null;
        for (const rule of container.nodes ?? []) {
            if (rule.type === 'comment')
                continue;
            if (rule.type === 'atrule') {
                need(!context && rule.name === 'media' && rule.nodes && /^\(\s*(?:width\s*(?:<=|>=|<|>)\s*\d{1,6}px|(?:min|max)-width:\s*\d{1,6}px)\s*\)$/.test(rule.params), 'Unsupported cascade context');
                need(!pair, 'Width pair interrupted by media rule');
                inspect(rule, rule.params);
                continue;
            }
            need(rule.type === 'rule', 'Unsupported cascade');
            need(!/\\/.test(rule.selector), 'Escaped selector is unsupported');
            const selector = csstree.generate(csstree.parse(rule.selector, { context: 'selectorList' })).replace(/=["']([A-Za-z0-9_-]+)["']\]/g, '=$1]');
            const scope = selector === beforeSelector || selector === afterSelector ? 'outer' : ids.slice(1).some(id => selector === '#' + id) ? 'child' : selector === '*' || selector === 'html' || selector === 'body' ? 'root' : null;
            need(scope, 'Unsupported selector ' + rule.selector);
            for (const d of rule.nodes) {
                if (d.type === 'comment')
                    continue;
                need(d.type === 'decl' && !d.important && !d.raws?.before?.trim() && !/\\|\b(?:var|attr|env)\s*\(/i.test(d.value), 'Unsupported declaration');
                const p = d.prop, v = d.value.trim();
                need(csstree.lexer.matchProperty(p, v).matched, 'Invalid CSS declaration ' + p);
                if (p === 'width' && scope === 'outer') {
                    if (selector === beforeSelector) {
                        need(!pair, 'Missing paired state width');
                        pair = v;
                    }
                    else {
                        need(pair !== null, 'Missing base width in the same media context');
                        mutuallyBounded(pair, v);
                        groups.push({ context, before: pair, after: v });
                        pair = null;
                        if (!context)
                            baseWidth = true;
                    }
                    continue;
                }
                if (p === 'transition' && scope === 'outer' && selector === beforeSelector && !context) {
                    need(timing === undefined, 'Repeated transition declarations');
                    timing = transition(v);
                    continue;
                }
                need((selector !== afterSelector && !context || paint.test(p)) && safeDecl(p, v, scope), 'Changing or unsupported geometry ' + p);
                if (!paint.test(p))
                    record(selector, p, v);
            }
        }
        need(pair === null, 'Missing paired width for state');
    }
    inspect(sheet);
    need(baseWidth && groups.length <= 16 && timing, 'Missing paired base width or transition');
    need(staticProperties.get(beforeSelector + '/position') === 'fixed' && staticProperties.has(beforeSelector + '/height'), 'Fixed box with definite height required');
    const display = staticProperties.get(beforeSelector + '/display');
    if (display === 'flex') {
        need(['column', 'column-reverse'].includes(staticProperties.get(beforeSelector + '/flex-direction') ?? ''), 'Flex width proof requires a single column axis');
        need(ids.slice(1).every(id => staticProperties.get('#' + id + '/min-width') === '0'), 'Flex child needs explicit min-width:0');
    }
    need(staticProperties.has(beforeSelector + '/left') !== staticProperties.has(beforeSelector + '/right'), 'Require exactly one horizontal anchor');
    need(staticProperties.has(beforeSelector + '/top') !== staticProperties.has(beforeSelector + '/bottom'), 'Require exactly one vertical anchor');
    // Uniform reset keeps all margins/padding constant. A fixed-size outer
    // with ordinary block children cannot change its coordinate dependencies
    // through content, flex sizing, floats, or intrinsic sizes.
    need(staticProperties.get('*/margin') !== undefined && staticProperties.get('*/padding') !== undefined && staticProperties.get('*/box-sizing') === 'border-box', 'Uniform border-box and zero margin/padding reset required');
    need(!staticProperties.has('html/box-sizing') || staticProperties.get('html/box-sizing') === 'border-box', 'Unsupported root box sizing');
    // Reverse only changes the block-axis order in this checked subset.
    // Run the existing column model and never publish its block coordinates.
    sheet.walkDecls('flex-direction', d => { if (d.value.trim() === 'column-reverse')
        d.value = 'column'; });
    const original = serialize(doc);
    const stateAttr = outer.attrs.find(a => a.name === stateAttribute);
    need(stateAttr, 'Missing state attribute');
    stateAttr.value = to;
    return { kind: 'fixed-width-transition', before: original, after: serialize(doc), targets: ids, easing: timing, groups, css: sheet.toString() };
}
