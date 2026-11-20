// Vue 3 SFC adapter for @mizchi/veriss. The template's branches are choices: v-if / v-else-if / v-else chains,
// v-show (display: none when false), :class objects, arrays and literal conditionals, literal-conditional bindings
// of other attributes, and v-for item counts. Every combination is analysed by the core (adapter-core), the same way
// as the Svelte adapter. A condition is named by its expression source; !x negates x.
//
// Unknown (never verified): child components, <slot>, v-html, <component :is>, a dynamic :class or :style that is
// not a literal shape, <style module>, and more states than maxStates. Scoped styles are unscoped (:deep(x),
// :slotted(x) and :global(x) become x): analysed alone, a component's scoped selectors match its own elements.
import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc';
import { parseExpression, parse as parseScript } from '@babel/parser';
import { product, merge, choose, conditionKey, analyzeStates, scopeEscapes, boundary, literalUnionProps, propsMembers, literalChoicesAgree } from '@mizchi/veriss-adapter-core';
const record = (v) => typeof v === 'object' && v !== null;
const list = (v) => Array.isArray(v) ? v : [];
const prop = (v, key) => record(v) ? v[key] : undefined;
const content = (v) => v?.type === 4 && 'content' in v && typeof v.content === 'string' ? v.content : undefined;
const literal = (v) => {
    const value = prop(v, 'value');
    return (prop(v, 'type') === 'StringLiteral' && typeof value === 'string') || (prop(v, 'type') === 'NumericLiteral' && typeof value === 'number') ? value : undefined;
};
const keyOf = (p) => {
    const k = prop(p, 'key');
    const value = prop(k, 'type') === 'Identifier' ? prop(k, 'name') : prop(k, 'value');
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
};
const ELEMENT = 1, TEXT = 2, COMMENT = 3, INTERPOLATION = 5, ATTRIBUTE = 6, DIRECTIVE = 7;
const COMPONENT = 1, SLOT = 2, TEMPLATE = 3;
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export const unscopeVueCSS = (css) => css.replace(/:(?:deep|slotted|global)\(([^()]*)\)/g, '$1');
export function expandVue(source, { maxStates = 64, eachCounts = [0, 1, 2], sourceLines = false, finiteScopeAttr } = {}) {
    const { descriptor, errors } = parse(source);
    const unknowns = [], assumptions = new Set();
    const unknown = (code, message) => { if (!unknowns.some(u => u.message === message))
        unknowns.push({ code, message }); };
    if (errors.length)
        unknown('U_VUE_PARSE', `the SFC does not parse: ${errors[0] instanceof Error ? errors[0].message : errors[0]}`);
    for (const style of descriptor.styles)
        if (style.module)
            unknown('U_VUE_CSS_MODULE', '<style module> class names come from $style at run time');
    const css = descriptor.styles.filter(s => !s.module).map(s => unscopeVueCSS(s.content)).join('\n');
    // Props typed as literal unions (defineProps<{ status: 'Active' | 'Pending' }>()): their text is each value.
    // Props with a literal default (withDefaults(defineProps<…>(), { label: 'Save' }), or defineProps({ label: { default:
    // 'Save' } })): the default (the prop left out) is a state of its own, beside placeholder text for any other value.
    let literalProps = new Map();
    const defaultProps = new Map();
    if (descriptor.scriptSetup) {
        try {
            const body = parseScript(descriptor.scriptSetup.content, { sourceType: 'module', plugins: ['typescript'] }).program.body;
            let call, defaults;
            const find = (node) => {
                if (!record(node))
                    return;
                if (node.type === 'CallExpression') {
                    const args = list(node.arguments);
                    if (prop(node.callee, 'name') === 'withDefaults' && prop(args[1], 'type') === 'ObjectExpression')
                        defaults = args[1];
                    if (prop(node.callee, 'name') === 'defineProps' && !call)
                        call = node;
                }
                for (const v of Object.values(node))
                    if (record(v))
                        Array.isArray(v) ? v.forEach(find) : find(v);
            };
            body.forEach(find);
            if (prop(call, 'typeParameters'))
                literalProps = literalUnionProps(propsMembers(list(prop(prop(call, 'typeParameters'), 'params'))[0], body));
            for (const p of list(prop(defaults, 'properties'))) {
                const k = keyOf(p), v = literal(prop(p, 'value'));
                if (prop(p, 'type') === 'ObjectProperty' && k !== undefined && v !== undefined)
                    defaultProps.set(k, v);
            }
            const arg = list(prop(call, 'arguments'))[0];
            if (prop(arg, 'type') === 'ObjectExpression')
                for (const p of list(prop(arg, 'properties'))) {
                    const value = prop(p, 'value');
                    const d = prop(p, 'type') === 'ObjectProperty' && prop(value, 'type') === 'ObjectExpression' ? list(prop(value, 'properties')).find(q => prop(q, 'type') === 'ObjectProperty' && keyOf(q) === 'default') : null;
                    const k = keyOf(p), v = literal(prop(d, 'value'));
                    if (k !== undefined && v !== undefined)
                        defaultProps.set(k, v);
                }
            for (const k of literalProps.keys())
                defaultProps.delete(k);
        }
        catch { /* not parsed: the props stay placeholder text */ }
        if (literalProps.size)
            assumptions.add(`text of props typed as literal unions (${[...literalProps.keys()].join(', ')}) is each of their values`);
        if (defaultProps.size)
            assumptions.add(`props with a literal default (${[...defaultProps.keys()].join(', ')}) are checked with that default and with placeholder text for any other value`);
    }
    const limit = { maxStates, onLimit: (max) => unknown('U_VUE_STATES', `more than ${max} template states; raise maxStates or split the component`) };
    const empty = [{ html: '', choices: {} }];
    const exprChoice = (text, value) => { const { key, negate } = conditionKey(text); return choose(key, value !== negate); };
    // :class (and static class) to class-list variants.
    function classVariants(expr) {
        let node;
        try {
            node = parseExpression(expr);
        }
        catch {
            unknown('U_VUE_DYNAMIC_CLASS', `:class="${expr}" does not parse`);
            return null;
        }
        const of = (n) => {
            if (n.type === 'StringLiteral')
                return [{ classes: n.value.split(/\s+/).filter(Boolean), choices: {} }];
            if (n.type === 'ObjectExpression') {
                let acc = [{ classes: [], choices: {} }];
                for (const p of n.properties) {
                    if (p.type !== 'ObjectProperty' || p.computed)
                        return null;
                    const name = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null;
                    if (name === null)
                        return null;
                    const cond = expr.slice(p.value.start ?? undefined, p.value.end ?? undefined);
                    const next = [];
                    for (const left of acc)
                        for (const on of [true, false]) {
                            const choices = merge(left.choices, exprChoice(cond, on));
                            if (choices)
                                next.push({ classes: on ? [...left.classes, ...name.split(/\s+/)] : left.classes, choices });
                        }
                    acc = next;
                }
                return acc;
            }
            if (n.type === 'ArrayExpression') {
                let acc = [{ classes: [], choices: {} }];
                for (const el of n.elements) {
                    const part = el && el.type !== "SpreadElement" && of(el);
                    if (!part)
                        return null;
                    const next = [];
                    for (const left of acc)
                        for (const right of part) {
                            const choices = merge(left.choices, right.choices);
                            if (choices)
                                next.push({ classes: [...left.classes, ...right.classes], choices });
                        }
                    acc = next;
                }
                return acc;
            }
            if (n.type === 'ConditionalExpression') {
                const yes = of(n.consequent), no = of(n.alternate), cond = expr.slice(n.test.start ?? undefined, n.test.end ?? undefined);
                if (!yes || !no)
                    return null;
                return [...yes.map(v => ({ ...v, choices: merge(v.choices, exprChoice(cond, true)) })), ...no.map(v => ({ ...v, choices: merge(v.choices, exprChoice(cond, false)) }))].filter((v) => v.choices !== null);
            }
            return null;
        };
        const out = of(node);
        if (!out)
            unknown('U_VUE_DYNAMIC_CLASS', `:class="${expr}" is not a literal string, object, array or conditional`);
        return out;
    }
    function element(node) {
        if (node.tagType === COMPONENT) {
            unknown('U_VUE_COMPONENT', `child component <${node.tag}>: its markup is analysed with that component, not here`);
            return [{ html: boundary('component', node.tag, node.props.some(p => p.name === 'data-noshift' || p.type === DIRECTIVE && content(p.arg) === 'data-noshift') ? 'data-noshift' : undefined), choices: {} }];
        }
        if (node.tagType === SLOT) {
            unknown('U_VUE_SLOT', '<slot> content comes from the parent');
            return [{ html: boundary('slot'), choices: {} }];
        }
        if (node.tag === 'component') {
            unknown('U_VUE_DYNAMIC_COMPONENT', '<component :is> has a dynamic tag');
            return empty;
        }
        const statics = finiteScopeAttr ? [' ' + finiteScopeAttr + '=""'] : [], classes = [];
        let classLists = [{ classes: [], choices: {} }], show;
        const attrLists = [];
        let rawHTML = false;
        for (const p of node.props) {
            if (p.type === ATTRIBUTE) {
                if (p.name === 'class')
                    classes.push(...(p.value?.content ?? '').split(/\s+/).filter(Boolean));
                else
                    statics.push(p.value ? ` ${p.name}="${escapeAttr(p.value.content)}"` : ` ${p.name}`);
                continue;
            }
            if (p.type !== DIRECTIVE || ['if', 'else-if', 'else', 'for', 'on', 'model', 'once', 'memo', 'cloak', 'pre'].includes(p.name))
                continue;
            if (p.name === 'show') {
                show = content(p.exp);
                if (show === undefined)
                    unknown("U_VUE_DIRECTIVE", "v-show without a simple expression");
                continue;
            }
            if (p.name === 'html') {
                unknown('U_VUE_HTML', 'v-html inserts markup that is not known statically');
                rawHTML = true;
                continue;
            }
            if (p.name === 'text') {
                assumptions.add('v-text content is placeholder text; its size comes from the box contracts');
                continue;
            }
            if (p.name !== 'bind' || !content(p.arg)) {
                unknown('U_VUE_DIRECTIVE', `v-${p.name} on <${node.tag}> is not modeled`);
                continue;
            }
            const attr = content(p.arg);
            if (attr === undefined)
                continue;
            const expr = content(p.exp) ?? attr;
            if (attr === 'key')
                continue;
            if (attr === 'class') {
                const variants = classVariants(expr);
                if (variants)
                    classLists = classLists.flatMap(l => variants.map(v => { const choices = merge(l.choices, v.choices); return choices && { classes: [...l.classes, ...v.classes], choices }; })).filter((v) => v !== null);
                continue;
            }
            if (attr === 'style') {
                unknown('U_VUE_DYNAMIC_STYLE', `<${node.tag}> has a dynamic :style`);
                continue;
            }
            let lit;
            try {
                lit = parseExpression(expr);
            }
            catch {
                lit = null;
            }
            if (lit?.type === 'ConditionalExpression' && (lit.consequent.type === 'StringLiteral' || lit.consequent.type === 'NumericLiteral') && (lit.alternate.type === 'StringLiteral' || lit.alternate.type === 'NumericLiteral')) {
                const cond = expr.slice(lit.test.start ?? undefined, lit.test.end ?? undefined);
                const yes = lit.consequent.value, no = lit.alternate.value;
                attrLists.push([true, false].map(v => ({ html: ` ${attr}="${escapeAttr(String(v ? yes : no))}"`, choices: exprChoice(cond, v) })));
            }
            else if (lit?.type === 'StringLiteral' || lit?.type === 'NumericLiteral')
                statics.push(` ${attr}="${escapeAttr(String(lit.value))}"`);
            else {
                assumptions.add(`dynamic attribute ${attr} on <${node.tag}> is rendered with a non-empty placeholder value`);
                statics.push(` ${attr}="dynamic"`);
            }
        }
        const own = [];
        for (const c of classLists)
            for (const a of product(attrLists)) {
                const choices = merge(c.choices, a.choices);
                if (!choices)
                    continue;
                for (const shown of show ? [true, false] : [null]) {
                    const all = shown === null ? choices : merge(choices, exprChoice(show ?? "", shown));
                    if (!all)
                        continue;
                    const list = [...classes, ...c.classes];
                    own.push({ open: `<${node.tag}${list.length ? ` class="${escapeAttr(list.join(' '))}"` : ''}${statics.join('')}${a.html}${shown === false ? ' style="display: none"' : ''}${sourceLines ? ` data-src-line="${node.loc.start.line}"` : ''}>`, choices: all });
                }
            }
        if (node.tag === 'template' || node.tagType === TEMPLATE)
            return children(node.children);
        const inner = voidTags.has(node.tag) ? empty : rawHTML ? [{ html: boundary('html'), choices: {} }] : children(node.children);
        const out = [];
        for (const o of own)
            for (const i of inner) {
                const choices = merge(o.choices, i.choices);
                if (choices)
                    out.push({ html: `${o.open}${voidTags.has(node.tag) ? '' : `${i.html}</${node.tag}>`}`, choices });
            }
        return out;
    }
    // v-for over one element: the item counts, every item taking the same choices.
    function withFor(node, render) {
        const dir = node.props.find(p => p.type === DIRECTIVE && p.name === 'for');
        if (!dir)
            return render();
        const key = `#for ${content(dir.type === DIRECTIVE ? dir.exp : undefined) ?? ''}`;
        assumptions.add(`v-for is checked at ${eachCounts.join(', ')} items, all items taking the same branch choices`);
        const body = render();
        return eachCounts.flatMap(n => body.map(v => ({ html: v.html.repeat(n), choices: merge(v.choices, choose(key, n)) }))).filter((v) => v.choices !== null);
    }
    function children(nodes) {
        const lists = [];
        const list = (nodes ?? []).filter(n => !(n.type === COMMENT) && !(n.type === TEXT && !n.content.trim()));
        for (let i = 0; i < list.length; i++) {
            const n = list[i];
            if (!n)
                continue;
            if (n.type === TEXT) {
                lists.push([{ html: escapeText(n.content), choices: {} }]);
                continue;
            }
            if (n.type === INTERPOLATION && defaultProps.has((content(n.content) ?? '').trim().replace(/^props\./, ''))) {
                const name = (content(n.content) ?? '').trim().replace(/^props\./, '');
                lists.push([{ html: escapeText(String(defaultProps.get(name))), choices: choose(`${name} given`, false) }, { html: '…', choices: choose(`${name} given`, true) }]);
                continue;
            }
            if (n.type === INTERPOLATION && literalProps.has((content(n.content) ?? '').trim().replace(/^props\./, ''))) {
                const name = (content(n.content) ?? '').trim().replace(/^props\./, '');
                lists.push((literalProps.get(name) ?? []).map(value => ({ html: escapeText(String(value)), choices: choose(name, value) })));
                continue;
            }
            if (n.type === INTERPOLATION) {
                assumptions.add('{{ interpolation }} text is placeholder text; its size comes from the box contracts');
                lists.push([{ html: '…', choices: {} }]);
                continue;
            }
            if (n.type !== ELEMENT)
                continue;
            const directive = (name) => n.props.find(p => p.type === DIRECTIVE && p.name === name);
            if (directive('if')) {
                // A v-if chain: branch k holds when its condition does and every earlier one does not.
                const chain = [n];
                while (true) {
                    const next = list[i + 1];
                    if (next?.type !== ELEMENT || !next.props.some(p => p.type === DIRECTIVE && ['else-if', 'else'].includes(p.name)))
                        break;
                    chain.push(next);
                    i++;
                }
                const variants = [];
                let earlier = {};
                for (const b of chain) {
                    const cond = b.props.find(p => p.type === DIRECTIVE && ['if', 'else-if'].includes(p.name));
                    const expression = cond?.type === DIRECTIVE ? content(cond.exp) : undefined;
                    if (cond && expression === undefined) {
                        unknown("U_VUE_DIRECTIVE", "v-if without a simple expression");
                        earlier = null;
                        break;
                    }
                    const taken = expression !== undefined ? merge(earlier, exprChoice(expression, true)) : earlier;
                    if (taken)
                        for (const v of withFor(b, () => element(b))) {
                            const choices = merge(v.choices, taken);
                            if (choices)
                                variants.push({ html: v.html, choices });
                        }
                    if (!cond) {
                        earlier = null;
                        break;
                    }
                    earlier = merge(earlier, exprChoice(expression ?? "", false));
                    if (!earlier)
                        break;
                }
                if (earlier)
                    variants.push({ html: '', choices: earlier });
                lists.push(variants);
                continue;
            }
            lists.push(withFor(n, () => element(n)));
        }
        return product(lists, limit);
    }
    const states = descriptor.template?.ast ? children(descriptor.template.ast.children).filter(v => literalChoicesAgree(v.choices, literalProps)).map(v => ({ html: v.html.trim(), choices: v.choices })) : [];
    if (!descriptor.template?.ast)
        unknown('U_VUE_TEMPLATE', 'the SFC has no <template>');
    // <style scoped> hashes the styled element of each selector, not its ancestors; :deep, :slotted and :global reach past
    // the component (E_SCOPE_ESCAPE). A plain <style> is global CSS: its selectors are not pinned to this component.
    const sheets = descriptor.styles.filter(s => !s.module);
    const scope = { mode: sheets.every(s => s.scoped) ? 'scoped' : 'global', owned: [], escapes: sheets.flatMap(s => scopeEscapes(s.content, ['deep', 'slotted', 'global'])) };
    return { states, css, unknowns, assumptions: [...assumptions], scope };
}
/** Analyse every template state of a Vue SFC (options: veriss options, pageCSS, page, maxStates, eachCounts). */
export function analyzeVue(source, { maxStates, eachCounts, sourceLines, ...options } = {}) {
    return analyzeStates(expandVue(source, { maxStates, eachCounts, sourceLines }), options);
}
import { requireFinite as need, finiteName, finiteBool, finiteCondition, finiteUpdate, finiteTag, finiteAttribute, finiteAttempt, buildFiniteState } from '@mizchi/veriss-adapter-core';
export function deriveVueState(source) {
    return finiteAttempt(() => {
        const { descriptor: d, errors } = parse(source);
        need(!errors.length && d.scriptSetup && !d.script && d.template && !d.customBlocks.length && !d.template.lang && !d.template.src && !d.scriptSetup.src && d.styles.every(s => !s.src && !s.module && !s.lang), 'Expected closed script setup and native template');
        const scopeAttr = 'data-v-veriss-finite';
        const script = compileScript(d, { id: scopeAttr });
        const compiled = compileTemplate({ source: d.template.content, filename: 'Component.vue', id: scopeAttr, scoped: d.styles.some(s => s.scoped), compilerOptions: { ...(script.bindings ? { bindingMetadata: script.bindings } : {}) } });
        need(!compiled.errors.length, 'Vue template does not compile');
        const body = parseScript(d.scriptSetup.content, { sourceType: 'module', plugins: ['typescript'] }).program.body;
        const imp = body[0];
        const spec = imp?.type === 'ImportDeclaration' ? imp.specifiers[0] : undefined;
        need(imp?.type === 'ImportDeclaration' && imp.source.value === 'vue' && imp.specifiers.length === 1 && spec?.type === 'ImportSpecifier' && spec.imported.type === 'Identifier' && spec.imported.name === 'ref' && spec.local.name === 'ref', 'Expected ref import');
        const vars = new Map(), handlers = new Map(), ids = new Set();
        for (const stmt of body.slice(1)) {
            need(stmt.type === 'VariableDeclaration' && stmt.kind === 'const', 'Only ref declarations are supported');
            for (const decl of stmt.declarations) {
                need(decl.id.type === "Identifier", "Only ref declarations are supported");
                const n = decl.id.name, c = decl.init;
                need(decl.id.type === 'Identifier' && finiteName(n) && n !== 'ref' && !vars.has(n) && c?.type === 'CallExpression' && c.callee.type === 'Identifier' && c.callee.name === 'ref' && c.arguments.length === 1 && finiteBool(c.arguments[0]), 'Only boolean refs are supported');
                vars.set(n, c.arguments[0].value);
            }
        }
        function render(n, ancestors = []) {
            if ([TEXT, COMMENT].includes(n.type))
                return;
            need(n.type === ELEMENT && n.tagType === 0, 'Unsupported Vue template node');
            finiteTag(n.tag, ancestors);
            let id, event;
            const attrs = new Set();
            for (const p of n.props) {
                need(!attrs.has(p.type === ATTRIBUTE ? p.name : p.name + ':' + (content(p.arg) ?? '')), 'Duplicate template attribute');
                attrs.add(p.type === ATTRIBUTE ? p.name : p.name + ':' + (content(p.arg) ?? ''));
                if (p.type === ATTRIBUTE) {
                    need(p.name !== scopeAttr && p.name !== 'className', 'Reserved or unsupported Vue attribute');
                    const value = p.value?.content;
                    finiteAttribute(p.name, value);
                    if (p.name === 'id')
                        id = value;
                    continue;
                }
                need(p.type === DIRECTIVE && !p.modifiers?.length, 'Unsupported Vue directive');
                if (['if', 'else-if'].includes(p.name)) {
                    finiteCondition(parseExpression(content(p.exp) ?? ""), vars);
                    continue;
                }
                if (p.name === 'else')
                    continue;
                if (p.name === 'on' && p.arg?.type === 4 && p.arg.isStatic && p.arg.content === 'click') {
                    const a = parseExpression(content(p.exp) ?? "");
                    need(a.type === 'AssignmentExpression' && a.operator === '=' && a.left.type === 'Identifier' && vars.has(a.left.name), 'Unsupported click assignment');
                    event = { variable: a.left.name, expression: finiteUpdate(a.right, vars) };
                    continue;
                }
                if (p.name === 'bind' && p.arg?.type === 4 && p.arg.isStatic && p.arg.content === 'class') {
                    const c = parseExpression(content(p.exp) ?? "");
                    need(c.type === 'ConditionalExpression' && c.consequent.type === 'StringLiteral' && c.alternate.type === 'StringLiteral', 'Only literal class branches');
                    finiteCondition(c.test, vars);
                    continue;
                }
                throw Error('Unsupported Vue directive ' + p.name);
            }
            if (id) {
                need(!ids.has(id), 'Duplicate id');
                ids.add(id);
            }
            if (event) {
                need(n.tag === 'button' && id, 'Click handler requires button id');
                handlers.set(id, event);
            }
            n.children.forEach(c => render(c, [...ancestors, n.tag]));
        }
        need(d.template.ast, "Missing template AST");
        d.template.ast.children.forEach(n => render(n));
        const scoped = d.styles.some(s => s.scoped);
        const result = buildFiniteState(expandVue(source, { finiteScopeAttr: scoped ? scopeAttr : undefined }), vars, handlers, { framework: 'vue' });
        // CSS vars are installed by Vue at runtime, not the static cascade.
        // The compiler's CSS transformation is used directly, not a selector rewrite.
        if (d.cssVars.length)
            return { ...result, scopedCSS: true, reason: 'Vue runtime CSS variables are not modeled' };
        const styles = d.styles.map(s => compileStyle({ source: s.content, filename: 'Component.vue', id: scopeAttr, scoped: !!s.scoped }));
        if (styles.some(s => s.errors.length))
            return { ...result, scopedCSS: true, reason: 'Vue scoped stylesheet failed compilation' };
        return { ...result, css: styles.map(s => s.code).join('\n'), assumptions: [...result.assumptions, ...(scoped ? ['Vue scoped CSS is compiled for standalone scope ID ' + scopeAttr + '; use the same build ID for exact external selector matching.'] : [])] };
    });
}
