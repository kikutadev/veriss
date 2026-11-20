// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import { normalizeTree } from './tree.mjs';
import { analyzeBoxTree } from './layout/engine.mjs';
import { validateOptions } from './layout/input.mjs';
// Shared with the HTML adapter; not part of the package export surface.
export function analyzeInput(tree, options, adapterDiagnostics = [], preferences = []) {
    if (!options || Object.hasOwn(options, 'component') || Object.hasOwn(options, 'props'))
        throw new TypeError('Invalid CSS verifier options: use name and a finite box tree');
    const { name = 'Document', ...configuration } = options;
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(name))
        throw new TypeError('Invalid CSS verification subject name');
    validateOptions({ ...configuration, name });
    const { root, diagnostics } = normalizeTree(tree, name, configuration.scripting);
    const inputDiagnostics = [...diagnostics, ...adapterDiagnostics], budget = { remaining: 2_000_000 };
    const reports = [];
    const ratios = configuration.devicePixelRatios ?? [undefined];
    for (const profile of configuration.scrollbars ?? [undefined])
        for (const ratio of ratios) {
            // Contracts are attached by the engine; each case owns its tree.
            reports.push(analyzeBoxTree(structuredClone(root), { ...configuration, name, ...(ratio !== undefined ? { $devicePixelRatio: ratio } : {}) }, profile, budget, [], inputDiagnostics, [...preferences]));
            if (budget.remaining < 0)
                break;
        }
    const report = reports[0];
    if (!report)
        throw new TypeError("No layout analysis case");
    if (!configuration.scrollbars && !configuration.devicePixelRatios)
        return report;
    // Each device pixel ratio is a case like a scrollbar profile: rows carry it, and a finding in every case is kept per case.
    const tag = (row, i) => ({ ...row, ...(configuration.scrollbars ? { scrollbarProfile: configuration.scrollbars[Math.floor(i / ratios.length)].name } : {}), ...(configuration.devicePixelRatios ? { devicePixelRatio: ratios[i % ratios.length] } : {}) });
    const collect = (get) => reports.flatMap((r, i) => (get(r) ?? []).map(row => tag(row, i)));
    // Collect all case rows before overwriting the first report.
    report.diagnostics = collect(r => r.diagnostics);
    report.policies = collect(r => r.policies);
    report.checks = collect(r => r.checks);
    report.sizes = collect(r => r.sizes);
    report.queries = collect(r => r.queries);
    report.subgrids = collect(r => r.subgrids);
    if (reports.some(r => r.elements))
        report.elements = collect(r => r.elements);
    if (reports.some(r => r.scrollbars))
        report.scrollbars = collect(r => r.scrollbars);
    if (reports.some(r => r.layoutBindings))
        report.layoutBindings = collect(r => r.layoutBindings);
    // transitionSizes (checklist F8): the same in every case (computed values, not layout).
    const transitionSizes = reports.find(r => r.transitionSizes)?.transitionSizes;
    if (transitionSizes)
        report.transitionSizes = transitionSizes;
    // pageScroll (checklist E1): fits or overflows in any case.
    if (reports.some(r => r.pageScroll))
        report.pageScroll = { fits: reports.some(r => r.pageScroll?.fits), overflows: reports.some(r => r.pageScroll?.overflows), stable: reports.every(r => r.pageScroll?.stable ?? true) };
    if (configuration.devicePixelRatios)
        report.scope = { ...report.scope, devicePixelRatios: configuration.devicePixelRatios };
    if (!configuration.scrollbars) {
        report.status = reports.some(r => r.status === 'unknown') ? 'unknown' : reports.some(r => r.status === 'violated') ? 'violated' : 'verified';
        report.ok = report.status === 'verified';
        return report;
    }
    report.scope = { ...report.scope, scrollbarProfiles: configuration.scrollbars };
    report.assumptions = [...report.assumptions, 'Native scrollbar geometry must match one of the declared exact platform profiles; auto visibility states are conservatively combined.'];
    report.status = reports.some(r => r.status === 'unknown') ? 'unknown' : reports.some(r => r.status === 'violated') ? 'violated' : 'verified';
    report.ok = report.status === 'verified';
    return report;
}
