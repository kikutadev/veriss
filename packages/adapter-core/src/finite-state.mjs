// Deliberately closed boolean fragment. No JavaScript evaluation. Framework
// adapters validate the entire component and hand us literal assignments.
import { parseFragment } from 'parse5';
import { createStateIR } from '@mizchi/veriss/contracts';
import { domGeometry, verifyUI } from './ui-contracts.mjs';
const record = (n) => n !== null && typeof n === 'object';
export function requireFinite(condition, message) { if (!condition)
    throw Error(message); }
;
const need = requireFinite;
export const finiteName = (n) => typeof n === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !Object.hasOwn(Object.prototype, n);
export const finiteBool = (n) => record(n) && typeof n.type === 'string' && ['BooleanLiteral', 'Literal'].includes(n.type) && typeof n.value === 'boolean';
export const finiteString = (n) => record(n) && typeof n.type === 'string' && ['StringLiteral', 'Literal'].includes(n.type) && typeof n.value === 'string';
export const finiteCondition = (n, vars) => {
    if (record(n) && n.type === 'Identifier' && typeof n.name === 'string' && vars.has(n.name))
        return { variable: n.name, negate: false };
    if (record(n) && n.type === 'UnaryExpression' && n.operator === '!' && record(n.argument) && n.argument.type === 'Identifier' && typeof n.argument.name === 'string' && vars.has(n.argument.name))
        return { variable: n.argument.name, negate: true };
    throw Error('Condition must be a declared boolean or its negation');
};
export const finiteUpdate = (n, vars) => finiteBool(n) ? { value: n.value } : finiteCondition(n, vars);
export function finiteTag(tag, ancestorTags) {
    need(['div', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'article', 'span', 'p', 'button'].includes(tag), 'Unsupported element ' + tag);
    need(!ancestorTags.includes('button') || ['span'].includes(tag), 'Invalid nested button content');
    need(!ancestorTags.some(t => t === 'p' || t === 'span') || ['span'].includes(tag), 'Unsupported phrasing nesting');
}
export function finiteAttribute(name, value) {
    need(/^(?:id|class|className|role|title|aria-label|data-[a-z0-9_-]+|type)$/.test(name) && typeof value === 'string', 'Unsupported attribute ' + name);
    if (name === 'type')
        need(value === 'button', 'Only button type is supported');
    if (name === 'id')
        need(value !== 'app' && /^[A-Za-z_][A-Za-z0-9_-]{0,100}$/.test(value), 'Static unique id required (app is the mount root)');
}
export const finiteAttempt = (fn) => { try {
    return fn();
}
catch (e) {
    return { status: 'unknown', reason: e instanceof Error ? e.message : String(e) };
} };
export function buildFiniteState(expanded, variables, handlers, { framework, scopedCSS = false }) {
    need(variables.size > 0 && variables.size <= 6 && handlers.size <= 128, 'Finite state variable or handler limit');
    need(!expanded.unknowns.length && !expanded.assumptions.length && expanded.states.length > 0, 'Template expansion is incomplete or uses placeholder values');
    for (const v of expanded.states)
        need(Object.entries(v.choices).every(([k, val]) => variables.has(k) && typeof val === 'boolean'), 'Unsupported render choice');
    const names = [...variables.keys()], initial = Object.fromEntries(variables), states = [], variants = [], transitions = [], ids = new Map();
    const intern = (values) => {
        const k = JSON.stringify(names.map(n => values[n]));
        const existing = ids.get(k);
        if (existing !== undefined)
            return existing;
        need(states.length < 64, 'Finite state limit');
        const id = 's' + states.length;
        ids.set(k, id);
        states.push(id);
        variants.push({ id, values, html: '' });
        return id;
    };
    intern(initial);
    for (const variant of variants) {
        const matches = expanded.states.filter(v => Object.entries(v.choices).every(([k, val]) => variant.values[k] === val));
        need(matches.length === 1 && matches[0], 'Render variants do not uniquely cover reachable value');
        variant.html = matches[0].html;
        const nodes = new Map(), walk = (n) => { if ('tagName' in n) {
            const id = n.attrs.find(a => a.name === 'id')?.value;
            if (id) {
                need(!nodes.has(id), 'Duplicate rendered id');
                nodes.set(id, n);
            }
        } if ('childNodes' in n)
            for (const c of n.childNodes)
                walk(c); };
        walk(parseFragment(variant.html));
        for (const [target, update] of handlers) {
            const node = nodes.get(target);
            if (!node)
                continue;
            need(node.tagName === 'button', 'Click target must remain a button');
            const value = update.expression.variable === undefined ? update.expression.value : variant.values[update.expression.variable] !== update.expression.negate;
            const to = intern({ ...variant.values, [update.variable]: value });
            transitions.push({ from: variant.id, event: 'click:' + target, to });
            need(transitions.length <= 256, 'Finite transition limit');
        }
    }
    return { status: 'derived', framework, scopedCSS, state: createStateIR({ initial: 's0', states, transitions }), variants, css: expanded.css,
        assumptions: ['Closed standalone component, stable render between single dispatched button clicks; no external props, remounts, effects, event batching, arbitrary callbacks or asynchronous writes. Click dispatch is modeled, not visibility, hit testing or browser action success.'] };
}
export function verifyFiniteUI(analysis, { profiles, contracts, targets, css = '', geometrySession, proofSession, boxes, knownFonts, defaultFontSize, observations = [] }) {
    if (analysis.status !== 'derived' || analysis.scopedCSS)
        return { status: 'unknown', outcome: 'unknown', reason: analysis.reason ?? (analysis.scopedCSS ? 'Scoped component CSS requires a compiled geometry snapshot' : 'Finite state graph unavailable') };
    // Keep the derivation assumptions visible in every environment; use the
    // same profile for evidence and validation. Caller supplies CSS environment.
    const scoped = profiles.map(p => ({ ...p, assumptions: [...(p.assumptions ?? []), ...analysis.assumptions, 'Geometry is for the standalone #app mount and closed supplied CSS, not caller-specific wrappers or inherited context.'] }));
    const { initial, states, transitions } = analysis.state;
    const mount = '<div id="app"' + (analysis.framework === 'vue' ? ' data-v-app=""' : '') + '>';
    const evidence = analysis.variants.flatMap(v => scoped.flatMap(profile => (geometrySession?.domGeometry ?? domGeometry)({
        state: v.id, profile, targets, html: '<!doctype html><html lang="en"><head><title>Component</title></head><body>' + mount + v.html + '</div></body></html>', css: css + '\n' + analysis.css, ...(boxes === undefined ? {} : { boxes }), ...(knownFonts === undefined ? {} : { knownFonts }), ...(defaultFontSize === undefined ? {} : { defaultFontSize })
    })));
    return (proofSession?.verifyUI ?? verifyUI)({ model: { version: 1, initial, states, transitions, profiles: scoped, contracts }, evidence, observations });
}
