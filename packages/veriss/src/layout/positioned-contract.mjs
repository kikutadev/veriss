import { affine, and, or, region as encodeRegion } from './smt.mjs';
import { simpleSelector } from './simple-selector.mjs';
const region = (row) => encodeRegion({ range: row.range, ...(row.heightRange ? { heightRange: row.heightRange } : {}), ...(row.region ? { region: { constraints: [...row.region.constraints] } } : {}) });
const axisNames = ['inline', 'block'];
const array = (v) => Array.isArray(v);
const selector = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256 && simpleSelector.test(value);
const object = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const isSpace = (s) => object(s, ['name', 'selector']) && typeof s.name === 'string' && /^[A-Za-z_][\w]{0,127}$/.test(s.name) && selector(s.selector);
const isOverlay = (o) => object(o, ['selector', 'within']) && selector(o.selector) && typeof o.within === 'string';
export function validatePositionedBindings(spaces, overlays) {
    if (!array(spaces) || !spaces.length || spaces.length > 64 || !array(overlays) || !overlays.length || overlays.length > 64 ||
        !spaces.every(isSpace) || new Set(spaces.map(s => s.name)).size !== spaces.length ||
        !overlays.every(isOverlay) || overlays.some(o => !spaces.some(s => s.name === o.within)) ||
        new Set(overlays.map(o => o.selector)).size !== overlays.length)
        throw new TypeError('Invalid PositionedGrid space/overlay bindings');
}
// This is the closed selector contract, not the implementation CSS parser.
export const matchesBindingSelector = (selector, element) => {
    const tag = selector.match(/^(?:[a-z][a-z0-9-]*|\*)/)?.[0];
    return (!tag || tag === '*' || tag === element.tag) && [...selector.matchAll(/([.#])([\w-]+)/g)].every(([, kind, value]) => value !== undefined && (kind === '.' ? element.classes.includes(value) : element.id === value));
};
const identity = (row) => JSON.stringify([row.variant ?? null, row.scrollbarProfile ?? null]);
const metadata = (row) => ({ box: row.box, path: row.path, ...(row.axis ? { axis: row.axis } : {}), ...(row.variant !== undefined ? { variant: row.variant } : {}), ...(row.scrollbarProfile !== undefined ? { scrollbarProfile: row.scrollbarProfile } : {}) });
const plus = (a, b) => `(+ ${affine(a)} ${affine(b)})`;
/** Contract predicates use only independently extracted facts. */
export function positionedObligations(contract, implementation, path, { exposed = [], external = [] } = {}) {
    const obligations = [], coverage = [];
    const key = (row) => JSON.stringify([identity(row), row.path]);
    const exposedKeys = new Set(exposed.map(key)), externalKeys = new Set(external.map(key));
    let work = 0;
    const spend = (count = 1) => { work += count; if (work > 2_000_000 || obligations.length + coverage.length > 8192)
        throw new RangeError('Positioned layout obligation limit exceeded'); };
    for (const scenario of implementation.cases) {
        spend(implementation.boxes.length + (implementation.elements?.length ?? 0));
        const boxes = implementation.boxes.filter(row => identity(row) === identity(scenario));
        const roots = boxes.filter(row => row.path === path);
        const elements = (implementation.elements ?? []).filter(row => identity(row) === identity(scenario));
        const owner = elements.find(row => row.path === path)?.owner;
        const owned = elements.filter(row => row.owner === owner && !exposedKeys.has(key(row)) && (row.path === path || row.path.startsWith(path + '/')));
        const selectable = [...owned, ...elements.filter(row => exposedKeys.has(key(row)))];
        const ownedPaths = new Set(owned.map(row => row.path));
        for (const row of boxes)
            if (row.position === 'absolute' && (row.path === path || row.path.startsWith(path + '/')) && !ownedPaths.has(row.path) && !exposedKeys.has(key(row)) && !externalKeys.has(key(row)))
                coverage.push({ ...metadata(row), code: 'U_LAYOUT_POSITIONED_OWNER', domain: region(row), failure: 'true' });
        const rootDomain = or(roots.map(region));
        const fail = (code, failure = 'true', row = { path, ...scenario }, domain = rootDomain) => { spend(); obligations.push({ ...metadata(row), code, domain, failure }); };
        if (!roots.length || !owner)
            coverage.push({ ...scenario, path, code: 'U_LAYOUT_POSITIONED', domain: 'true', failure: 'true' });
        const select = (selector, roots = owned) => { spend(roots.length); return roots.filter(element => matchesBindingSelector(selector, element)); };
        const spaces = new Map();
        for (const binding of contract.spaces) {
            const selected = new Set(select(binding.selector).map(row => row.path));
            spend(boxes.length);
            const rows = boxes.filter(row => selected.has(row.path));
            spaces.set(binding.name, rows);
            fail('E_LAYOUT_SPACE', `(not ${or(rows.map(region))})`);
            for (const row of rows) {
                if (row.position !== 'relative')
                    fail('E_LAYOUT_SPACE', 'true', row, region(row));
                if (!row.padding?.block)
                    coverage.push({ ...metadata(row), code: 'U_LAYOUT_POSITIONED', domain: region(row), failure: 'true' });
            }
            for (let a = 0; a < rows.length; a++)
                for (let b = a + 1; b < rows.length; b++) {
                    spend();
                    const A = rows[a], B = rows[b];
                    if (A && B && A.path !== B.path)
                        fail('E_LAYOUT_SPACE_AMBIGUOUS', 'true', A, and([region(A), region(B)]));
                }
        }
        const bound = new Map();
        for (const binding of contract.overlays) {
            const selected = new Set(select(binding.selector, selectable).map(row => row.path));
            spend(boxes.length + (!selected.size ? implementation.elements?.length ?? 0 : 0));
            // Optional Show/For arms may omit an overlay in this case. A typo that
            // matches no owned element in any reachable case is still an error.
            if (!selected.size && !(implementation.elements ?? []).some(element => (element.owner === owner || exposedKeys.has(key(element))) &&
                (element.path === path || element.path.startsWith(path + '/')) && matchesBindingSelector(binding.selector, element)))
                fail('E_LAYOUT_OVERLAY');
            const rows = boxes.filter(row => selected.has(row.path));
            for (const row of rows) {
                const bindings = bound.get(row.path) ?? new Set();
                bindings.add(binding);
                bound.set(row.path, bindings);
                if (row.position !== 'absolute') {
                    fail('E_LAYOUT_OVERLAY', 'true', row, region(row));
                    continue;
                }
                const candidates = (spaces.get(binding.within) ?? []).filter(space => space.position === 'relative' && space.path === row.containingBlock?.path);
                fail('E_LAYOUT_SPACE_BINDING', `(not ${or(candidates.map(region))})`, row, region(row));
                for (const space of candidates)
                    if (space.padding?.block && row.containingBlock) {
                        const padding = { inline: space.padding.inline, block: space.padding.block };
                        for (const axis of axisNames)
                            fail('E_LAYOUT_SPACE_GEOMETRY', `(not (= ${affine(padding[axis])} ${affine(row.containingBlock[axis])}))`, row, and([region(space), region(row)]));
                    }
            }
        }
        const absolute = boxes.filter(row => row.position === 'absolute' && !externalKeys.has(key(row)) && (ownedPaths.has(row.path) || exposedKeys.has(key(row))));
        for (const row of absolute) {
            if (bound.get(row.path)?.size !== 1)
                fail('E_LAYOUT_OVERLAY', 'true', row, region(row));
            if (!row.origin || !row.containingBlock || !row.border.block) {
                coverage.push({ ...metadata(row), code: 'U_LAYOUT_POSITIONED', domain: region(row), failure: 'true' });
                continue;
            }
            const border = { inline: row.border.inline, block: row.border.block };
            for (const axis of axisNames) {
                fail('E_LAYOUT_ABSOLUTE_START', `(< ${affine(row.origin[axis])} 0)`, { ...row, axis }, region(row));
                fail('E_LAYOUT_ABSOLUTE_END', `(> ${plus(row.origin[axis], border[axis])} ${affine(row.containingBlock[axis])})`, { ...row, axis }, region(row));
            }
        }
        for (let a = 0; a < absolute.length; a++)
            for (let b = a + 1; b < absolute.length; b++) {
                spend();
                const A = absolute[a], B = absolute[b];
                if (!A || !B || A.path === B.path || !A.origin || !B.origin || A.containingBlock?.path !== B.containingBlock?.path || !A.border.block || !B.border.block)
                    continue;
                // Positive-area intersection: touching edges and zero-sized boxes are disjoint.
                const originA = A.origin, originB = B.origin, borderA = { inline: A.border.inline, block: A.border.block }, borderB = { inline: B.border.inline, block: B.border.block };
                const failure = and(axisNames.flatMap(axis => [
                    `(< 0 ${affine(borderA[axis])})`, `(< 0 ${affine(borderB[axis])})`,
                    `(< ${affine(originA[axis])} ${plus(originB[axis], borderB[axis])})`,
                    `(< ${affine(originB[axis])} ${plus(originA[axis], borderA[axis])})`,
                ]));
                fail('E_LAYOUT_OVERLAY_OVERLAP', failure, A, and([region(A), region(B)]));
            }
    }
    return { obligations, coverage };
}
