// Automatic, deliberately conservative dependency slicing for independent rectangles.
// The original whole-document report is never changed. No stylesheet or node is
// discarded on the basis of an Unknown diagnostic alone.
import { parseCondition } from './layout/conditions.mjs';
import { parse, serialize } from 'parse5';
import postcss from 'postcss';
import * as csstree from 'css-tree';
import { htmlBoxTree } from './html.mjs';
import { analyzeInput } from './analyze.mjs';
const HTML = 'http://www.w3.org/1999/xhtml';
const blocks = new Set('html body main div section article aside header footer nav'.split(' '));
const allowed = new Set([...blocks, 'canvas']);
const attrs = (n) => Object.fromEntries(n.attrs.map(a => [a.name, a.value]));
const element = (n) => !!n && 'tagName' in n;
const children = (n) => (n?.childNodes ?? []).filter(element);
const nonWhitespace = (n) => n.childNodes.some(c => c.nodeName === '#text' && 'value' in c && /[^\t\n\r\f ]/.test(c.value));
function walk(root) {
    const nodes = [], visit = (n, depth) => {
        if (depth > 64 || nodes.length >= 2048)
            refuse('DOM projection limit');
        nodes.push(n);
        children(n).forEach(c => visit(c, depth + 1));
    };
    visit(root, 0);
    return nodes;
}
function refuse(reason) { throw Error(reason); }
function need(value) { if (value === undefined || value === null)
    refuse('Incomplete projection dependency'); return value; }
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function plain(v) {
    if (!object(v) || typeof v.type !== 'string')
        refuse('Invalid CSS AST node');
    return { ...v, type: v.type };
}
function nodes(v) {
    if (!Array.isArray(v))
        refuse('Invalid CSS AST children');
    return Array.from(v, (n) => plain(n));
}
function selector(v) {
    const n = plain(v);
    if (n.type !== 'Selector')
        refuse('Invalid CSS selector AST');
    return { ...n, type: 'Selector', children: nodes(n.children) };
}
function selectors(v) {
    const n = plain(v);
    if (n.type !== 'SelectorList' || !Array.isArray(n.children))
        refuse('Invalid CSS selector list');
    return Array.from(n.children, (v) => selector(v));
}
function name(t) { if (typeof t.name !== 'string')
    refuse('Invalid CSS AST name'); return t.name; }
function nested(t) {
    if (!Array.isArray(t.children) || !t.children.length)
        return undefined;
    const first = t.children[0];
    return object(first) && first.type === 'SelectorList' ? selectors(first) : undefined;
}
const attrName = (t) => object(t.name) && typeof t.name.name === 'string' ? t.name.name : undefined;
const attrValue = (t) => object(t.value) ? t.value.value ?? t.value.name : undefined;
const ascii = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const dataAttr = /^(?:data|aria)-[a-z0-9_-]+$/;
const definite = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|[sld]?v(?:w|h|min|max)))$/i;
const compoundLength = (v) => {
    v = v.trim();
    if (definite.test(v))
        return true;
    const f = /^(min|max|clamp)\((.*)\)$/i.exec(v);
    if (!f)
        return false;
    const args = postcss.list.comma(need(f[2]));
    return args.length === (need(f[1]).toLowerCase() === 'clamp' ? 3 : Math.max(2, args.length)) && args.every(a => definite.test(a.trim()));
};
// No font-relative units, external variables, intrinsic sizing, anchoring,
// CSS-wide resets, containment, transforms or animation in a dependency.
const geometry = /^(?:position|display|(?:min-|max-)?(?:width|height)|top|right|bottom|left|inset|box-sizing|(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|border(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?(?:-(?:width|style))?|overflow(?:-[xy])?|flex(?:-(?:direction|wrap|flow|grow|shrink|basis))?|align-(?:items|content|self)|justify-(?:items|content|self)|gap|row-gap|column-gap|visibility|direction|writing-mode)$/;
const paint = /^(?:--[\w-]+|background(?:-[\w-]+)?|color|color-scheme|border(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?-color|border-radius|box-shadow|text-shadow|opacity|cursor|pointer-events|touch-action|user-select|-webkit-user-select|-webkit-touch-callout|-webkit-tap-highlight-color|isolation|z-index|image-rendering|font(?:-(?:family|size|weight|style|stretch|variant|synthesis|feature-settings|variation-settings))?|line-height|letter-spacing|word-spacing|text-align|text-decoration(?:-[\w-]+)?|-webkit-text-size-adjust|text-size-adjust)$/;
// Three-valued selector matching. Unsupported tests are possible matches,
// never evidence of non-match. A known false compound/ancestor can eliminate
// a rule even if another test in it is not implemented.
const triAnd = (a, b) => a === false || b === false ? false : a === null || b === null ? null : true;
const triOr = (a, b) => a === true || b === true ? true : a === null || b === null ? null : false;
function generatedName(t) {
    if (!t || !['PseudoClassSelector', 'PseudoElementSelector'].includes(t.type) || t.children)
        return undefined;
    const n = name(t);
    return n === 'before' || n === 'after' ? n : undefined;
}
const isGeneratedPseudo = (t) => generatedName(t) !== undefined;
const generatedSelector = (s) => generatedName(s.children.at(-1)) !== undefined;
function simpleBranch(s) {
    const t = s.children[0];
    return s.children.length === 1 && !!t && ['ClassSelector', 'IdSelector'].includes(t.type) && ascii.test(name(t));
}
function matchPart(t, n) {
    const a = attrs(n);
    if (t.type === 'TypeSelector')
        return name(t) === '*' ? true : ascii.test(name(t)) ? n.tagName === name(t).toLowerCase() : null;
    if (t.type === 'IdSelector')
        return ascii.test(name(t)) ? a.id === name(t) : null;
    if (t.type === 'ClassSelector')
        return ascii.test(name(t)) ? (a.class ?? '').split(/[\t\n\r\f ]+/).includes(name(t)) : null;
    if (t.type === 'AttributeSelector') {
        const k = attrName(t);
        if (k === undefined || !/^[a-z][a-z0-9_-]*$/.test(k) || t.flags || !['=', null].some(v => v === t.matcher))
            return null;
        if (t.matcher === null)
            return Object.hasOwn(a, k);
        if (!dataAttr.test(k))
            return null;
        const v = attrValue(t);
        return typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) ? a[k] === v : null;
    }
    if (t.type === 'PseudoClassSelector' && name(t) === 'root' && !t.children)
        return n.tagName === 'html';
    if (t.type === 'PseudoClassSelector') {
        const pseudo = name(t), branches = nested(t);
        if (branches && ['is', 'where', 'not'].includes(pseudo)) {
            const result = branches.reduce((a, sel) => triOr(a, matchSelector(sel, n)), false);
            return pseudo === 'not' && result !== null ? !result : result;
        }
        // Only a known absent simple descendant can exclude a :has rule.
        if (branches && pseudo === 'has' && branches.every(simpleBranch)) {
            const descendants = walk(n).slice(1);
            if (!branches.some(s => descendants.some(d => matchPart(need(s.children[0]), d) !== false)))
                return false;
        }
    }
    if (isGeneratedPseudo(t))
        return true;
    return null;
}
function matchSelector(selector, n) {
    const parts = [[]], combinators = [];
    for (const t of selector.children) {
        if (t.type === 'Combinator') {
            combinators.push(name(t));
            parts.push([]);
        }
        else
            need(parts.at(-1)).push(t);
    }
    function visit(i, node) {
        if (!element(node))
            return false;
        const result = need(parts[i]).reduce((a, t) => triAnd(a, matchPart(t, node)), true);
        if (result === false || i === 0)
            return result;
        const c = combinators[i - 1];
        if (c === '>')
            return triAnd(result, visit(i - 1, node.parentNode));
        if (c === ' ') {
            let match = false;
            for (let p = node.parentNode; element(p); p = p.parentNode)
                match = triOr(match, visit(i - 1, p));
            return triAnd(result, match);
        }
        return triAnd(result, null);
    }
    return visit(parts.length - 1, n);
}
function staticSelector(s) {
    return s.children.every((t, i) => {
        if (isGeneratedPseudo(t))
            return i === s.children.length - 1;
        if (t.type === 'Combinator')
            return [' ', '>'].includes(name(t));
        if (t.type === 'TypeSelector')
            return name(t) === '*' || ascii.test(name(t));
        if (['IdSelector', 'ClassSelector'].includes(t.type))
            return ascii.test(name(t));
        if (t.type === 'PseudoClassSelector') {
            const branches = nested(t);
            return name(t) === 'root' && !t.children || ['is', 'where', 'not'].includes(name(t)) && !!branches && branches.every(sel => !generatedSelector(sel) && staticSelector(sel));
        }
        const k = attrName(t), v = attrValue(t);
        return t.type === 'AttributeSelector' && k !== undefined && /^[a-z][a-z0-9_-]*$/.test(k) && !t.flags &&
            (t.matcher === null || dataAttr.test(k) && t.matcher === '=' && typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v));
    });
}
function declarations(items) {
    if (items.some(n => !['decl', 'comment'].includes(n.type)))
        refuse('CSS nesting is not a closed independent projection');
    return items.filter((n) => n.type === 'decl');
}
// Do not use the broader paint list here: custom properties, fonts,
// filters, transforms, visibility and discrete properties may change
// layout or its coordinate system. Only explicitly named, non-geometric
// transition targets are removable. Omitted transition-property means all.
const paintTransitionTarget = /^(?:none|color|background(?:-color|-image|-position(?:-[xy])?|-size|-repeat|-attachment|-origin|-clip)?|opacity|box-shadow|text-shadow|border(?:-(?:top|right|bottom|left|inline(?:-start|-end)?|block(?:-start|-end)?))?-color|border-radius|outline-color|text-decoration-color|fill|stroke)$/i;
function paintTransition(d) {
    const property = d.prop.toLowerCase();
    if (!['transition', 'transition-property'].includes(property))
        return false;
    if (d.raws?.before?.trim() || /\\|\b(?:var|attr|env)\s*\(/i.test(d.value))
        return false;
    try {
        const ast = csstree.parse(d.value, { context: 'value' });
        const lexer = csstree.lexer;
        if (!object(lexer) || typeof lexer.matchProperty !== 'function')
            return false;
        const match = lexer.matchProperty(property, ast);
        if (!object(match) || !match.matched)
            return false;
        const groups = [[]];
        const value = plain(csstree.toPlainObject(ast));
        for (const t of nodes(value.children)) {
            if (t.type === 'Operator' && t.value === ',')
                groups.push([]);
            else
                need(groups.at(-1)).push(t);
        }
        return groups.every(tokens => {
            const targets = tokens.filter(t => t.type === 'Identifier' && paintTransitionTarget.test(name(t)));
            if (targets.length !== 1)
                return false;
            if (property === 'transition-property')
                return tokens.length === 1;
            // lexer validates grammar; only time and an explicit standard easing
            // can accompany the selected property.
            return tokens.every(t => t === targets[0] || t.type === 'Dimension' && typeof t.unit === 'string' && /^(ms|s)$/i.test(t.unit) ||
                t.type === 'Identifier' && /^(?:ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end|normal|allow-discrete)$/i.test(name(t)) ||
                t.type === 'Function' && /^(?:cubic-bezier|steps|linear)$/i.test(name(t)));
        });
    }
    catch {
        return false;
    }
}
const ignorable = (d) => paintTransition(d) || /^(?:scroll-behavior|overscroll-behavior(?:-[xy]|-inline|-block)?)$/i.test(d.prop) || paint.test(d.prop.toLowerCase()) || /^(?:animation|transition)-(?:duration|delay|timing-function)$/i.test(d.prop) || /^(?:animation|animation-name|transition|transition-property)$/i.test(d.prop) && d.value.trim().toLowerCase() === 'none';
function validateDecl(d) {
    const p = d.prop.toLowerCase(), v = d.value.trim();
    if (ignorable(d))
        return false;
    if (d.raws?.before?.trim())
        refuse('Nonstandard declaration prefix');
    if (!geometry.test(p))
        refuse('Dependent or unsupported property ' + p);
    const checked = v.replace(/env\(\s*safe-area-inset-(?:top|right|bottom|left)\s*(?:,\s*(?:0|\d+(?:\.\d+)?px)\s*)?\)/g, '0px');
    if (/\\|(?:^|[^\w-])(?:var|attr|env|anchor|anchor-size|calc)\s*\(|(?:^|[^a-z-])(?:inherit|initial|unset|revert(?:-layer)?|fit-content|min-content|max-content|stretch|normal)(?:$|[^a-z-])|\d(?:em|rem|ex|ch|cap|ic|lh|rlh|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i.test(checked))
        refuse('Dependent value ' + p + ': ' + v);
    if (p === 'display' && !['block', 'flex', 'grid', 'none'].includes(v))
        refuse('Unmodeled formatting context ' + v);
    if (p === 'position' && !['static', 'relative', 'absolute', 'fixed'].includes(v))
        refuse('Dependent positioning ' + v);
    if (p === 'writing-mode' && v !== 'horizontal-tb' || p === 'direction' && v !== 'ltr')
        refuse('Only horizontal-tb ltr projection');
    return true;
}
const expand = (r, d) => {
    const p = d.prop.toLowerCase(), v = d.value.trim();
    if (p === 'inset' || p === 'overflow') {
        if (p === 'inset')
            r.push([p, v]);
        const values = postcss.list.space(v), a = need(values[0]), b = values[1] ?? a, c = values[2] ?? a, e = values[3] ?? b;
        if (!a || values.length > (p === 'inset' ? 4 : 2))
            refuse('Unsupported ' + p + ' shorthand');
        if (p === 'inset')
            for (const [k, value] of [['top', a], ['right', b], ['bottom', c], ['left', e]])
                r.push([k, value]);
        else
            r.push(['overflow-x', a], ['overflow-y', b]);
    }
    else
        r.push([p, v]);
};
function summary(records, p, condition = () => true) {
    return records.filter(r => condition(r)).flatMap(r => r.props.filter(([k]) => k === p).map(([, v]) => v));
}
const all = (rs, p, pred) => summary(rs, p).every(pred);
const guaranteed = (rs, p, pred) => summary(rs, p, r => !r.conditional).some(pred) && all(rs, p, pred);
const mode = (rs, n) => {
    const positions = summary(rs, 'position');
    const out = positions.filter(v => ['absolute', 'fixed'].includes(v));
    if (out.length) {
        if (new Set(out).size !== 1 || positions.some(v => v !== out[0]) || !guaranteed(rs, 'position', v => v === out[0]))
            refuse('Position can change for ' + n.tagName);
        return need(out[0]);
    }
    return 'flow';
};
const noContent = (n) => !children(n).length && !nonWhitespace(n);
const bfc = (rs) => guaranteed(rs, 'overflow-x', v => ['hidden', 'auto', 'scroll'].includes(v)) && guaranteed(rs, 'overflow-y', v => ['hidden', 'auto', 'scroll'].includes(v));
const blockDisplay = (rs) => all(rs, 'display', v => ['block', 'none'].includes(v));
const axisSize = (rs, p) => guaranteed(rs, p, compoundLength);
const widthIndependent = (rs, n) => axisSize(rs, 'width') || blocks.has(n.tagName) && all(rs, 'width', v => v === 'auto' || compoundLength(v));
const stretched = (rs, n, axis) => blocks.has(n.tagName) && all(rs, axis, v => v === 'auto' || compoundLength(v)) &&
    (axis === 'width' ? ['left', 'right'] : ['top', 'bottom']).every(p => guaranteed(rs, p, compoundLength));
const anchored = (rs) => (guaranteed(rs, 'left', compoundLength) || guaranteed(rs, 'right', compoundLength)) && (guaranteed(rs, 'top', compoundLength) || guaranteed(rs, 'bottom', compoundLength));
const plainAttrs = (n) => n.attrs.every(a => !a.namespace && (['id', 'class', 'style', 'lang', 'title', 'role'].includes(a.name) || dataAttr.test(a.name) ||
    n.tagName === 'canvas' && ['width', 'height'].includes(a.name) || a.name === 'dir' && a.value === 'ltr'));
/** Produce a reduced full document for a single rectangle, or throw with a
 * dependency reason. The retained selectors still run through veriss's own
 * cascade and layout engine; we do not calculate CSS dimensions here. */
export function projectIndependentGeometry(html, css, target, profile, binding, axis = false) {
    if (axis !== true && axis !== false && axis !== 'inline' && axis !== 'block')
        refuse('Invalid projection axis');
    const inlineOnly = axis === true || axis === 'inline', blockOnly = axis === 'block';
    if (typeof html !== 'string' || typeof css !== 'string' || html.length > 1e6 || css.length > 1e6)
        refuse('Projection input limit');
    if ((profile.scrollbar?.inlineSize ?? 0) !== 0 || (profile.scrollbar?.blockSize ?? 0) !== 0 || (profile.scrollbar?.thinInlineSize ?? 0) !== 0 || (profile.scrollbar?.thinBlockSize ?? 0) !== 0)
        refuse('Projection requires overlay scrollbars');
    const errors = [], doc = parse(html, { scriptingEnabled: true, onParseError: e => errors.push(e.code) });
    const root = children(doc).find(n => n.tagName === 'html'), body = children(root).find(n => n.tagName === 'body'), head = children(root).find(n => n.tagName === 'head');
    if (doc.mode !== 'no-quirks' || errors.length || !root || !body || !head)
        refuse('Projection requires a well-formed standards document');
    if (children(head).some(n => !['meta', 'title'].includes(n.tagName)))
        refuse('Document head has an unresolved stylesheet or rendering dependency');
    const elements = walk(root);
    if (elements.some(n => ['style', 'link', 'base'].includes(n.tagName) || n.tagName === 'template' && Object.hasOwn(attrs(n), 'shadowrootmode')))
        refuse('Document has unresolved style sources or exceeds projection limit');
    if (binding !== undefined && !(typeof binding === 'string' && (/^[.#][A-Za-z_][A-Za-z0-9_-]*$/.test(binding) || allowed.has(binding))))
        refuse('Partial target binding requires a simple id, class or supported tag selector');
    const matches = elements.filter(n => binding?.startsWith('.') ? (attrs(n).class ?? '').split(/[\t\n\r\f ]+/).includes(binding.slice(1)) : binding && !binding.startsWith('#') ? n.namespaceURI === HTML && n.tagName === binding : attrs(n).id === (binding?.slice(1) ?? target));
    if (matches.length !== 1)
        refuse('DOM target not unique');
    const chain = [];
    for (let n = matches[0]; element(n); n = n.parentNode)
        chain.unshift(n);
    if (chain.length < 3 || chain.length > 32 || chain[0] !== root || chain[1] !== body || chain.some(n => n.namespaceURI !== HTML || !allowed.has(n.tagName) || !plainAttrs(n)))
        refuse('Unsupported ancestor or target markup');
    const records = new Map(chain.map(n => [n, []]));
    const pseudoRecords = new Map(chain.map(n => [n, { before: [], after: [] }]));
    // UA script boxes are display:none unless author cascade changes that.
    // Only remove sibling scripts with no inline style and no potentially
    // matching declaration that could make them render.
    const inertScripts = new Set(chain.slice(0, -1).flatMap(n => children(n).filter(c => c.tagName === 'script' && !Object.hasOwn(attrs(c), 'style'))));
    const sheet = postcss.parse(css);
    if (inlineOnly) {
        // A float in an omitted sibling (even nested inside another flow block)
        // can narrow or displace a BFC. Check the complete cascade, including
        // keyframes and inline styles, before dropping any DOM nodes.
        const floatDecl = (d) => d.prop.includes('\\') || /^(?:float|(?:-[a-z]+-)?float)$/i.test(d.prop) && d.value.trim().toLowerCase() !== 'none';
        sheet.walkDecls(d => { if (floatDecl(d))
            refuse('Inline projection has a possible float dependency'); });
        for (const n of elements)
            if (attrs(n).style) {
                const style = postcss.parse('*{' + attrs(n).style + '}');
                style.walkDecls(d => { if (floatDecl(d))
                    refuse('Inline projection has a possible inline float dependency'); });
            }
        if (elements.some(n => ['applet', 'embed', 'iframe', 'img', 'input', 'object', 'table', 'hr'].includes(n.tagName) && Object.hasOwn(attrs(n), 'align')))
            refuse('Inline projection has a legacy float/alignment dependency');
    }
    // Purely block-axis declarations cannot affect inline geometry in the
    // restricted ordinary-flow profile. Drop them before dependency checking;
    // never drop mixed shorthands such as padding, margin or border.
    const onlyBlock = (d) => inlineOnly && /^(?:height|min-height|max-height|block-size|min-block-size|max-block-size|top|bottom|(?:padding|margin)-(?:top|bottom|block(?:-start|-end)?)|border-(?:top|bottom|block(?:-start|-end)?)(?:-width|-style|-color)?)$/i.test(d.prop);
    // Track declarations do not affect a normal block. This is conditional
    // on the later proof that *every* retained element is a normal block;
    // a possible grid/flex display must still cause refusal.
    const inactiveTracks = (d) => inlineOnly && /^(?:grid-template(?:-columns|-rows|-areas)?|grid-auto-(?:columns|rows|flow)|grid-(?:row|column)(?:-start|-end)?|grid-area)$/i.test(d.prop);
    // A viewport-fixed non-replaced box with a definite block size and
    // anchor does not depend on its horizontal used size. The complete
    // retained chain is checked below for fixed containing-block creators
    // and cross-axis sizing. Do not discard mixed shorthands.
    const onlyInline = (d) => blockOnly && /^(?:width|min-width|max-width|inline-size|min-inline-size|max-inline-size|left|right|(?:padding|margin)-(?:left|right|inline(?:-start|-end)?)|border-(?:left|right|inline(?:-start|-end)?)(?:-width|-style|-color)?)$/i.test(d.prop);
    const discard = (d) => ignorable(d) || onlyBlock(d) || onlyInline(d) || inactiveTracks(d);
    // html/body are unique in this standards HTML document. Freeze a simple
    // root :has() against the *original* DOM. A never-matching class/ID (or
    // its negation) has precisely the same specificity as the original
    // class/ID argument; no DOM attributes are added. Leave non-root or
    // complex :has() dependencies unresolved.
    const marker = '__veriss_projection_absent__';
    const markerAbsent = !elements.some(n => attrs(n).id === marker || (attrs(n).class ?? '').split(/[\t\n\r\f ]+/).includes(marker));
    function freezeRootHas(selectors) {
        if (!(inlineOnly || blockOnly) || !markerAbsent)
            return false;
        let changed = false;
        for (const selector of selectors) {
            let start = 0;
            while (start < selector.children.length) {
                let end = start;
                while (end < selector.children.length && need(selector.children[end]).type !== 'Combinator')
                    end++;
                const compound = selector.children.slice(start, end);
                const tag = compound.find(t => t.type === 'TypeSelector' && ['html', 'body'].includes(name(t).toLowerCase()));
                if (tag && compound.every(t => t.type !== 'PseudoElementSelector')) {
                    const subject = name(tag).toLowerCase() === 'html' ? root : body;
                    for (let i = start; i < end; i++) {
                        const t = need(selector.children[i]), branches = nested(t);
                        if (t.type !== 'PseudoClassSelector' || name(t) !== 'has' || !branches?.length || !branches.every(simpleBranch))
                            continue;
                        const atom = { type: branches.some(s => need(s.children[0]).type === 'IdSelector') ? 'IdSelector' : 'ClassSelector', name: marker };
                        const present = walk(need(subject)).slice(1).some(n => branches.some(s => matchPart(need(s.children[0]), n) === true));
                        selector.children[i] = present ? { type: 'PseudoClassSelector', name: 'not', children: [{ type: 'SelectorList', children: [{ type: 'Selector', children: [atom] }] }] } : atom;
                        changed = true;
                    }
                }
                start = end + 1;
            }
        }
        return changed;
    }
    let ruleCount = 0;
    function visit(container, conditional = false, unsafeCondition = false, depth = 0) {
        if (depth > 32)
            refuse('CSS projection nesting limit');
        for (const node of [...need(container.nodes)]) {
            if (node.type === 'comment') {
                node.remove();
                continue;
            }
            if (node.type === 'atrule') {
                // These rules do not affect explicitly sized, font-independent rectangles
                // in a settled screen. All other global cascade mechanisms are refused.
                const name = node.name.toLowerCase();
                if (['font-face', 'keyframes', '-webkit-keyframes', 'charset', 'page', 'counter-style', 'font-palette-values', 'view-transition'].includes(name)) {
                    node.remove();
                    continue;
                }
                if (['media', 'supports', 'container', 'starting-style', 'scope'].includes(name) && node.nodes) {
                    let activeConditional = true;
                    if (name === 'media' && profile.mediaFeatures !== undefined) {
                        // Resolve only parsed, explicitly fixed screen media. The kept
                        // CSS still runs through the core cascade with the same profile.
                        let condition;
                        try {
                            condition = parseCondition(node.params, 'media', profile.mediaFeatures);
                        }
                        catch { /* unresolved: keep conservatively */ }
                        if (condition && condition.groups.length === 0) {
                            node.remove();
                            continue;
                        }
                        if (condition?.groups.some(g => g?.length === 0))
                            activeConditional = false;
                    }
                    visit(node, conditional || activeConditional, unsafeCondition || name !== 'media', depth + 1);
                    if (!node.nodes.length)
                        node.remove();
                    continue;
                }
                refuse('Unresolved global CSS @' + name);
            }
            if (node.type !== 'rule' || ++ruleCount > 12000)
                refuse('CSS rule limit or unsupported statement');
            const ds = declarations(node.nodes ?? []);
            const geometryDecls = ds.filter(d => !discard(d));
            if (!geometryDecls.length) {
                node.remove();
                continue;
            }
            // Parse all selector branches before pruning: a branch with unknown
            // syntax may invalidate its entire comma-separated rule.
            let parsed;
            try {
                parsed = selectors(csstree.toPlainObject(csstree.parse(node.selector, { context: 'selectorList' })));
            }
            catch {
                refuse('Unparsed CSS selector ' + node.selector);
            }
            if (freezeRootHas(parsed))
                node.selector = csstree.generate(csstree.fromPlainObject(structuredClone({ type: 'SelectorList', children: parsed })));
            if (parsed.every(s => s.children.length === 1 && need(s.children[0]).type === 'PseudoElementSelector' && /^view-transition(?:-group|-image-pair|-old|-new)?$/.test(name(need(s.children[0]))))) {
                node.remove();
                continue;
            }
            for (const script of inertScripts)
                if (geometryDecls.some(d => !/^(?:box-sizing|(?:margin|padding)(?:-[\w-]+)?|border(?:-[\w-]+)?)$/i.test(d.prop)) && parsed.some(sel => matchSelector(sel, script) !== false))
                    inertScripts.delete(script);
            // Do not count pseudo rules as size guarantees; inspect their possible
            // generated content and positioning separately.
            const generated = parsed.filter(generatedSelector);
            for (const sel of generated)
                for (const n of chain) {
                    const match = matchSelector(sel, n);
                    if (match !== false)
                        need(pseudoRecords.get(n))[need(generatedName(sel.children.at(-1)))].push({
                            unconditional: !conditional && !unsafeCondition && match === true && parsed.every(staticSelector),
                            declarations: geometryDecls
                        });
                }
            const regular = parsed.filter(s => !generatedSelector(s));
            const candidates = chain.map(n => [n, regular.reduce((a, s) => triOr(a, matchSelector(s, n)), false)]).filter(([, m]) => m !== false);
            if (!candidates.length) {
                node.remove();
                continue;
            }
            if (unsafeCondition || !parsed.every(staticSelector) || candidates.some(([, m]) => m !== true))
                refuse('Selector or condition depends on excluded state: ' + node.selector);
            const props = [];
            for (const d of ds) {
                if (!discard(d) && validateDecl(d))
                    expand(props, d);
                else
                    d.remove();
            }
            for (const [n] of candidates)
                need(records.get(n)).push({ conditional, props });
        }
    }
    visit(sheet);
    // Generated boxes may be dropped only if they cannot exist, or every
    // possible positioning declaration leaves them out of normal flow. A
    // conditional override or an animation is not evidence of independence.
    for (const pair of pseudoRecords.values())
        for (const rs of Object.values(pair)) {
            const ds = rs.flatMap(r => r.declarations);
            if (!ds.some(d => /^(?:content|all)$/i.test(d.prop)))
                continue;
            const position = (d) => d.prop.toLowerCase() === 'position';
            if (ds.some(d => d.prop.toLowerCase() === 'all' || /^animation(?:-name)?$/i.test(d.prop) ||
                position(d) && d.value.trim() !== 'absolute' ||
                d.prop.toLowerCase() === 'display' && !['block', 'inline', 'none', 'flex', 'grid'].includes(d.value.trim())) ||
                !rs.some(r => r.unconditional && r.declarations.some(d => position(d) && d.value.trim() === 'absolute')))
                refuse('Generated content may affect projected geometry');
        }
    for (const n of chain) {
        const s = attrs(n).style;
        if (!s)
            continue;
        const inline = postcss.parse('*{' + s + '}');
        const rule = inline.first;
        if (inline.nodes.length !== 1 || rule?.type !== 'rule' || rule.selector !== '*')
            refuse('Malformed inline style');
        const props = [];
        for (const d of declarations(rule.nodes)) {
            if (!discard(d) && validateDecl(d))
                expand(props, d);
            else
                d.remove();
        }
        need(records.get(n)).push({ conditional: false, props });
        need(n.attrs.find(a => a.name === 'style')).value = rule.nodes.map(d => d.toString()).join(';');
    }
    // All ancestors are ordinary block boxes. An anchored out-of-flow target
    // may have unrelated siblings only inside an independently sized BFC.
    const modes = chain.map(n => mode(need(records.get(n)), n)), targetMode = modes.at(-1);
    if (modes.slice(0, -1).some(m => m !== 'flow'))
        refuse('Nested positioned ancestor requires a separate containing-size proof');
    for (let i = 0; i < chain.length; i++) {
        const n = need(chain[i]), rs = need(records.get(n)), next = chain[i + 1], last = !next;
        if (inlineOnly) {
            // Normal non-replaced blocks in ordinary block flow: with overlay
            // scrollbars and no floats, aspect ratios or intrinsic width rules, the
            // horizontal border-box position and size do not depend on child heights.
            // No out-of-flow boxes or flex/grid ancestors in this profile.
            if (!blocks.has(n.tagName) || modes[i] !== 'flow' || !blockDisplay(rs) || !widthIndependent(rs, n))
                refuse('Inline projection requires ordinary width-independent block flow');
            continue;
        }
        if (blockOnly) {
            if (!blocks.has(n.tagName) || !blockDisplay(rs))
                refuse('Block projection requires ordinary block ancestors and target');
            if (last) {
                const signed = (v) => compoundLength(v) || v.startsWith('-') && compoundLength(v.slice(1));
                if (targetMode !== 'fixed' || !axisSize(rs, 'height') || !(guaranteed(rs, 'top', signed) || guaranteed(rs, 'bottom', signed)))
                    refuse('Block projection requires a viewport-fixed box with definite height and block anchor');
                if (summary(rs, 'inset').length || summary(rs, 'margin').some(v => /\bauto\b/.test(v)) || ['margin-top', 'margin-bottom', 'margin-block', 'margin-block-start', 'margin-block-end'].some(p => summary(rs, p).some(v => /\bauto\b/.test(v))))
                    refuse('Block projection cannot resolve mixed inset or auto block margins');
                // Use an arbitrary horizontal surrogate only inside the reduced
                // document. No horizontal coordinate from it may become evidence.
                const style = n.attrs.find(a => a.name === 'style');
                const surrogate = 'width:100px!important;left:0!important;right:auto!important';
                if (style)
                    style.value += ';' + surrogate;
                else
                    n.attrs.push({ name: 'style', value: surrogate });
            }
            continue;
        }
        if (!last && !blockDisplay(rs))
            refuse('Ancestor layout depends on omitted flex/grid items');
        if (last) {
            if (targetMode === 'flow' && (!axisSize(rs, 'height') || !widthIndependent(rs, n)))
                refuse('Target has content-dependent dimensions');
            if (targetMode !== 'flow' && (!(axisSize(rs, 'width') || stretched(rs, n, 'width')) || !(axisSize(rs, 'height') || stretched(rs, n, 'height')) || !anchored(rs)))
                refuse('Positioned target requires definite dimensions and two inset anchors');
            if (targetMode === 'flow' && !blocks.has(n.tagName))
                refuse('In-flow replaced/inline target not independent');
            if (!noContent(n) && targetMode === 'flow' && !bfc(rs))
                refuse('Target contents can change margin collapse or intrinsic size');
        }
        else {
            const omitted = children(n).filter(c => c !== next && (n !== root || c !== head) && !inertScripts.has(c));
            if (omitted.length || nonWhitespace(n)) {
                const nextMode = modes[i + 1];
                if (nextMode === 'flow')
                    refuse('In-flow sibling or text dependency');
                if (nextMode !== 'fixed' && (!axisSize(rs, 'height') || !widthIndependent(rs, n) || !bfc(rs)))
                    refuse('Containing block depends on omitted contents');
            }
        }
    }
    // Preserve the original chain and author selector identities, so retained
    // selector specificity and inheritance remain unchanged. No artificial ID.
    for (let i = 0; i < chain.length; i++) {
        const n = need(chain[i]), next = chain[i + 1];
        n.childNodes = (n.childNodes ?? []).filter(c => c === next || n === root && c === head);
    }
    return { html: serialize(doc), css: sheet.toString(), path: 'Document' + '/0'.repeat(chain.length - 1),
        assumptions: [...(blockOnly ? ['Only block start and size are proved: explicitly sized viewport-fixed non-replaced target, with no containing-block creator or cross-axis sizing dependency; horizontal declarations were removed and the reduced target uses an arbitrary horizontal surrogate.'] : []), ...(inlineOnly ? ['Only inline start and size are proved; supported root descendant-presence selectors are fixed to the supplied DOM. Block-axis-only declarations and omitted block-flow siblings and descendants may change vertical position or height. Overlay scrollbars and absence of intrinsic/float/aspect-ratio dependencies are required.'] : []), 'Automatically derived independent rectangle for ' + (binding ?? '#' + target) + ': retained original ancestor chain and matching layout cascade; removed rules have no possible subject in the retained chain or are non-geometric for explicit font-independent dimensions.', 'Closed, settled, scripting-enabled document; overlay scrollbars, unscrolled horizontal-tb/ltr CSS pixels; geometry only, not clipping, paint, hit testing, or full-document correctness.'] };
}
// Use the engine's existing initial-scroll re-analysis; no scroll-dependent
// coordinate is promoted to a proof for arbitrary scroll positions.
export function analyzeProjectedGeometry(projection, options) {
    const { tree, diagnostics } = htmlBoxTree(projection.html);
    return analyzeInput(tree, { ...options, css: projection.css, integrity: true }, diagnostics, ['scroll-zero', 'independent-rectangle']);
}
