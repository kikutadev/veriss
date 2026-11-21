import { verifyUI, layoutGeometry } from './relational-contract.mjs';
import { deriveWidthTransition } from './layout/width-transition.mjs';
import { analyzeHTML } from './html.mjs';
import { expandPredicate } from './layout/relational-predicate.mjs';
import { easingRange, overshoots } from './layout/easing.mjs';
// Endpoint relations over extracted CSS geometry, independent of UI syntax.
import { createLayoutIR, copyDiagnostic, solverModel } from './layout-contract.mjs';
import { verifyLayoutModel } from './layout-z3.mjs';
import { affine, and, or, interval, region as encodeRegion, rational } from './layout/smt.mjs';
import { sub, number, exact } from './layout/linear.mjs';
import { obligationModel } from './layout/model.mjs';
// The SMT encoder currently accepts mutable array types. Copy only the
// arrays crossing that boundary; keep the exposed IR deeply immutable.
function region(row) {
    return encodeRegion({ range: row.range, ...(row.heightRange ? { heightRange: row.heightRange } : {}),
        ...(row.region ? { region: { constraints: [...row.region.constraints] } } : {}) });
}
const fields = ['inlineStart', 'blockStart', 'inlineSize', 'blockSize'];
// The layout box: a transform moves only the painted box, and a layout shift ignores it (the Layout Instability
// API; measured). A row whose layout box is not decided (layoutRect null) has no geometry.
const isAffine = (v) => object(v, ['coefficient', 'constant', 'heightCoefficient']) && typeof v.coefficient === 'string' && typeof v.constant === 'string' && (v.heightCoefficient === undefined || typeof v.heightCoefficient === 'string');
function box(row) {
    if (!('layoutRect' in row))
        return row.rect;
    const value = row.layoutRect;
    if (value == null)
        return undefined;
    if (!object(value, fields) || !isAffine(value.inlineStart) || !isAffine(value.blockStart) || !isAffine(value.inlineSize) || !isAffine(value.blockSize))
        return undefined;
    return { inlineStart: value.inlineStart, blockStart: value.blockStart, inlineSize: value.inlineSize, blockSize: value.blockSize };
}
const codes = { inlineStart: 'E_NOSHIFT_INLINE_START', blockStart: 'E_NOSHIFT_BLOCK_START', inlineSize: 'E_NOSHIFT_INLINE_SIZE', blockSize: 'E_NOSHIFT_BLOCK_SIZE' };
const isArray = (v) => Array.isArray(v);
const object = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const identifier = (value) => typeof value === 'string' && /^[A-Za-z_][\w.-]{0,127}$/.test(value);
const path = (value) => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f]/.test(value);
function reference(value) {
    if (typeof value === 'string' && path(value))
        return value;
    if (object(value, ['id', 'within']) && path(value.id) && value.id.length <= 256 && (value.within === undefined || path(value.within)))
        return { id: value.id, ...(value.within !== undefined ? { within: value.within } : {}) };
    throw new TypeError('Invalid noshift target reference');
}
const freeze = (value) => { if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
} return value; };
const snapshot = (value) => freeze(structuredClone(value));
const unknown = (code, message) => ({ code, severity: 'unknown', message });
export function createNoShiftContract(input) {
    if (!object(input, ['name', 'targets']) || !identifier(input.name) || !Array.isArray(input.targets) || !input.targets.length || input.targets.length > 256)
        throw new TypeError('Invalid noshift contract');
    const names = new Set(), before = new Set(), after = new Set();
    const targets = Array.from(input.targets, (target) => {
        if (!object(target, ['name', 'before', 'after']) || !identifier(target.name))
            throw new TypeError('Invalid noshift target');
        const result = { name: target.name, before: reference(target.before), after: reference(target.after) };
        const left = JSON.stringify(result.before), right = JSON.stringify(result.after);
        if (names.has(target.name) || before.has(left) || after.has(right))
            throw new TypeError('Ambiguous noshift target correspondence');
        names.add(target.name);
        before.add(left);
        after.add(right);
        return result;
    });
    return snapshot({ version: 1, kind: 'noshift-contract', profile: 'noshift/1', name: input.name, targets });
}
function environment(scope) {
    const range = (value) => value && [value.minExact, value.maxExact, value.minInclusive, value.maxInclusive];
    return JSON.stringify([scope.axis, range(scope.viewport), range(scope.viewport.height), scope.hostInset, scope.hostBlockInset ?? 0, scope.scrollbarProfiles ?? []]);
}
/** Extract both states before consulting any target contract. */
export function createTransitionIR(input) {
    if (!object(input, ['before', 'after']))
        throw new TypeError('Invalid transition input');
    const before = createLayoutIR(input.before), after = createLayoutIR(input.after);
    const diagnostics = [...before.diagnostics, ...after.diagnostics];
    if (input.before.status !== 'verified' || input.after.status !== 'verified')
        diagnostics.push(unknown('U_NOSHIFT_LAYOUT', 'Both endpoint layouts must satisfy their static layout checks'));
    if (before.cases.length !== 1 || after.cases.length !== 1)
        diagnostics.push(unknown('U_NOSHIFT_CASES', 'Supply one concrete structural/platform case per endpoint; case correspondence is not inferred'));
    if (environment(before.scope) !== environment(after.scope))
        diagnostics.push(unknown('U_NOSHIFT_ENVIRONMENT', 'Endpoint viewport ranges and host/platform environments must be identical'));
    const assumptions = [...new Set([...before.assumptions, ...after.assumptions,
            'Both endpoints share the viewport, root border origin, host allocation and unscrolled environment.',
            'Target correspondence and this endpoint transition are supplied by the adapter; intermediate frames, text/paint and browser CLS are outside noshift/1.'])];
    return snapshot({ version: 1, kind: 'transition', before, after, complete: before.complete && after.complete && !diagnostics.length, diagnostics, assumptions });
}
/** Coverage and equality are separate queries; missing geometry never proves equality. */
export function createTransitionObligation(contract, transition) {
    if (!object(contract, ['version', 'kind', 'profile', 'name', 'targets']) || contract.version !== 1 || contract.kind !== 'noshift-contract' || contract.profile !== 'noshift/1')
        throw new TypeError('Invalid NoShiftContract');
    contract = createNoShiftContract({ name: contract.name, targets: contract.targets });
    if (!object(transition, ['version', 'kind', 'before', 'after', 'complete', 'diagnostics', 'assumptions']) || transition.version !== 1 || transition.kind !== 'transition' ||
        typeof transition.complete !== 'boolean' || !isArray(transition.diagnostics) || !isArray(transition.assumptions))
        throw new TypeError('Invalid TransitionIR');
    const diagnostics = transition.diagnostics.map(copyDiagnostic), { before, after } = transition;
    for (const state of [before, after]) {
        if (state?.kind !== 'layout' || !isArray(state.boxes) || !isArray(state.elements) || state.boxes.length + state.elements.length > 32768)
            throw new TypeError('Invalid transition layout facts');
    }
    const scope = before.scope;
    const domain = and([...interval(scope.viewport, 'width'), ...(scope.viewport.height ? interval(scope.viewport.height, 'height') : ['(= height 0)'])]);
    const coverage = [], obligations = [];
    const append = (row) => { if (obligations.length >= 8192)
        throw new RangeError('Noshift obligation limit exceeded'); obligations.push(row); };
    for (const target of contract.targets) {
        const sets = [];
        for (const [side, state] of [['before', before], ['after', after]]) {
            const ref = target[side];
            let selected, rows;
            if (typeof ref === 'string') {
                selected = ref;
                rows = state.boxes.filter(row => row.path === selected);
                if (!state.elements.some(row => row.path === selected))
                    diagnostics.push(unknown('U_NOSHIFT_TARGET', `No native box mapping for ${target.name} in ${side}: ${selected}`));
            }
            else {
                const elements = state.elements.filter(row => !ref.within || row.path === ref.within || row.path.startsWith(ref.within + '/'));
                if (!elements.length)
                    diagnostics.push(unknown('U_NOSHIFT_TARGET', `No structural inventory for target ${ref.id} in ${side}`));
                const candidates = elements.filter(row => row.targets?.includes(ref.id));
                if (candidates.length > 1)
                    diagnostics.push(unknown('U_NOSHIFT_TARGET', `Ambiguous target ID ${ref.id} in ${side}`));
                if (candidates.some(row => row.targetIdentity === 'unknown'))
                    diagnostics.push(unknown('U_NOSHIFT_IDENTITY', `Target ${ref.id} needs a proven key/lifetime correspondence in ${side}`));
                selected = candidates.length === 1 && candidates[0] ? candidates[0].path : `${ref.within ?? ''}/[target:${ref.id}]`;
                rows = candidates.length === 1 ? state.boxes.filter(row => row.path === selected) : [];
            }
            const measured = rows.flatMap(row => { const rect = box(row); return rect && fields.every(field => rect[field]) ? [{ row, rect }] : []; });
            // Validate all compared affine expressions at the strict SMT boundary.
            for (const row of measured)
                for (const field of fields)
                    affine(row.rect[field]);
            const visible = or(rows.map(region));
            coverage.push({ code: 'U_NOSHIFT_GEOMETRY', box: target.name, path: selected, domain: visible, failure: `(not ${or(measured.map(({ row }) => region(row)))})` });
            append({ code: 'E_NOSHIFT_PRESENCE', box: target.name, path: selected, domain: 'true', failure: `(not ${visible})` });
            sets.push({ rows: measured, path: selected });
        }
        const [first, second] = sets;
        if (!first || !second)
            throw new TypeError('Missing endpoint facts');
        for (const left of first.rows)
            for (const right of second.rows)
                for (const field of fields) {
                    append({ code: codes[field], box: target.name, path: first.path, axis: field.startsWith('inline') ? 'inline' : 'block',
                        target: target.name, beforePath: first.path, afterPath: second.path, field,
                        domain: and([region(left.row), region(right.row)]), failure: `(not (= ${affine(left.rect[field])} ${affine(right.rect[field])}))`, available: left.rect[field], required: right.rect[field] });
                }
    }
    const base = { component: contract.name, scope, complete: transition.complete && !diagnostics.length, diagnostics, assumptions: [...transition.assumptions] };
    return snapshot({ version: 1, kind: 'transition-obligation', contract, transition, coverage: obligationModel(base, domain, coverage), model: obligationModel(base, domain, obligations) });
}
export async function verifyTransitionObligation(obligation, api, options) {
    if (obligation?.version !== 1 || obligation.kind !== 'transition-obligation')
        throw new TypeError('Invalid transition obligation');
    const coverage = await verifyLayoutModel(solverModel(obligation.coverage), api, options);
    if (coverage.status !== 'verified') {
        const proof = { ...coverage, status: 'unknown', complete: false, diagnostics: [...coverage.diagnostics,
                ...(coverage.status === 'violated' ? [unknown('U_NOSHIFT_GEOMETRY', 'Visible target geometry does not cover the full endpoint domain')] : [])] };
        return { version: 1, status: 'unknown', contract: obligation.contract, coverage, proof };
    }
    const proof = await verifyLayoutModel(solverModel(obligation.model), api, options);
    const witness = proof.witness;
    const row = witness?.obligationIndex !== undefined ? obligation.model.obligations[witness.obligationIndex] : undefined;
    const change = row?.field && row.target !== undefined && row.beforePath !== undefined && row.afterPath !== undefined && witness?.availableExact !== undefined && witness.requiredExact !== undefined && witness.available !== undefined && witness.required !== undefined ? {
        target: row.target, field: row.field, beforePath: row.beforePath, afterPath: row.afterPath,
        before: { value: witness.available, exact: witness.availableExact }, after: { value: witness.required, exact: witness.requiredExact },
        delta: { value: number(sub(rational(witness.requiredExact), rational(witness.availableExact))), exact: exact(sub(rational(witness.requiredExact), rational(witness.availableExact))) },
    } : null;
    return { version: 1, status: proof.status, contract: obligation.contract, coverage, proof, ...(change ? { change } : {}) };
}
const errorText = (e) => e instanceof Error ? e.message : String(e);
export function verifyInterpolatedPredicate(input) {
    const assumptions = input.interpolation?.assumptions;
    const unknown = (reason) => ({
        status: 'unknown', reason, assumptions: Array.isArray(assumptions) ? [...assumptions] : [],
    });
    if (input.interpolation?.kind !== 'shared-affine' || !Array.isArray(assumptions) ||
        !assumptions.length || !assumptions.every(a => typeof a === 'string' && a.trim()))
        return unknown('Explicit shared affine interpolation assumptions required');
    const timing = typeof input.interpolation.easing === 'string'
        ? input.interpolation.easing.trim().toLowerCase() : '';
    const curve = /^cubic-bezier\(([^()]*)\)$/.exec(timing);
    // A cubic Bezier stays in its control point convex hull. Finite decimal
    // coordinates between 0 and 1 bound the output without numerical root finding.
    const unitDecimal = /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?|\.\d{1,6})$/;
    const guaranteed = curve
        ? curve[1].split(',').length === 4 && curve[1].split(',').every(v => unitDecimal.test(v.trim()))
        : ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(timing);
    const range = guaranteed ? easingRange(timing) : undefined;
    if (!range || overshoots(range))
        return unknown('Unknown or unproved bounded easing progress');
    if (input.from === input.to)
        return unknown('Distinct endpoint states required');
    try {
        const expanded = expandPredicate(input.predicate);
        const convex = (p) => p.op === 'all'
            ? p.items.every(convex) : p.op === 'compare' && p.relation !== 'ne';
        if (!convex(expanded))
            return unknown('Predicate is not in the supported convex conjunction subset');
        const endpoints = verifyUI({
            model: { version: 1, initial: input.from, states: [input.from, input.to],
                transitions: [{ from: input.from, event: 'interpolate', to: input.to }],
                profiles: [input.profile],
                contracts: [{ id: 'invariant', kind: 'predicate', predicate: expanded }] },
            evidence: input.evidence,
        });
        return {
            status: endpoints.status, endpoints,
            assumptions: [...new Set([...assumptions, ...endpoints.assumptions,
                    'All referenced coordinates are a shared affine combination of the corresponding endpoint coordinates at the same fixed viewport; progress is bounded in [0,1]. CSS implementation correspondence is not established by this proof.'])],
            progress: { min: range.min, max: range.max },
        };
    }
    catch (e) {
        return unknown(errorText(e));
    }
}
export function verifyCSSWidthTransition(input) {
    try {
        const { profile, predicate, from, to } = input;
        const derived = deriveWidthTransition(input);
        const assumptions = ['Closed CSS component and supplied data-attribute event, fixed viewport, overlay scrollbar; no external CSS, runtime override or additional concurrent animation. The fixed border-box and normal block or stretched column flex child inline coordinates (column-reverse is projected onto column; block-axis coordinates are discarded) are affine in the sole changing width. Paired width branches share slopes and their offsets move in one direction.'];
        const evidence = [[from, derived.before], [to, derived.after]];
        const rows = evidence.flatMap(([state, html]) => {
            const layout = createLayoutIR(analyzeHTML(html, {
                css: derived.css, viewport: profile.viewport, ua: profile.ua,
                ...(profile.mediaFeatures !== undefined ? { mediaFeatures: profile.mediaFeatures } : {}),
                safeArea: profile.safeArea ?? {}, scripting: 'enabled', integrity: true,
                scrollbars: [profile.scrollbar ?? { name: 'overlay', inlineSize: 0, blockSize: 0 }],
                ...(profile.dpr ? { devicePixelRatios: [profile.dpr] } : {}),
            }));
            return layoutGeometry({ state, profile, layout, targets: derived.targets, local: { assumptions } })
                .map(e => !e.rows?.length ? e : {
                ...e, axes: ['inline'],
                rows: e.rows.map(row => ({ ...row, rect: {
                        ...(row.rect.inlineStart !== undefined ? { inlineStart: row.rect.inlineStart } : {}),
                        ...(row.rect.inlineSize !== undefined ? { inlineSize: row.rect.inlineSize } : {}),
                    } })),
            });
        });
        const result = verifyInterpolatedPredicate({
            profile, from, to, evidence: rows, predicate,
            interpolation: { kind: 'shared-affine', easing: derived.easing, assumptions },
        });
        return {
            ...result,
            derivation: { kind: derived.kind, groups: derived.groups, easing: derived.easing, targets: derived.targets },
        };
    }
    catch (e) {
        return { status: 'unknown', reason: errorText(e), assumptions: [] };
    }
}
