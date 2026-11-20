import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { verifyUI, domGeometry, createGeometrySession } from '../packages/adapter-core/src/ui-contracts.mjs';
import { verifyFiniteUI } from '../packages/adapter-core/src/finite-state.mjs';
import { loadTextMetrics } from '../packages/veriss/src/text-node.mjs';
import { record, array, string, strings, stringRecord, objectRecord, profiles, uiModel } from './ui-input.mjs';
export async function checkUIManifest(file, { session, geometrySession } = {}) {
    const path = (rel) => resolve(dirname(file), rel), read = (rel) => readFileSync(path(rel), 'utf8');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const manifest = record(parsed, 'manifest');
    const { model, evidence = [], observations = [], documents = [], finiteComponent } = manifest;
    const docs = array(documents, 'document list'), supplied = array(evidence, 'evidence'), samples = array(observations, 'observations');
    // The proof engine validates serialized evidence and observations; samples
    // are not promoted to proof by the CLI.
    if (finiteComponent) {
        const finite = record(finiteComponent, 'finite component'), m = record(model, 'model');
        if (docs.length || supplied.length || m.version !== 1 || Object.keys(m).some(k => !['version', 'profiles', 'contracts'].includes(k)) || Object.keys(finite).some(k => !['source', 'css', 'targets', 'boxes', 'defaultFontSize', 'fonts'].includes(k)))
            throw Error('Finite component must supply its own state graph and geometry');
        const loaders = { '.jsx': async () => (await import('../packages/react-adapter/src/index.mjs')).deriveReactState, '.tsx': async () => (await import('../packages/react-adapter/src/index.mjs')).deriveReactState, '.vue': async () => (await import('../packages/vue-adapter/src/index.mjs')).deriveVueState, '.svelte': async () => (await import('../packages/svelte-adapter/src/index.mjs')).deriveSvelteState };
        const source = string(finite.source, 'component source'), ext = extname(source);
        if (ext !== '.jsx' && ext !== '.tsx' && ext !== '.vue' && ext !== '.svelte')
            throw Error('Unsupported finite component format');
        const analysis = (await loaders[ext]())(read(source));
        let boxes = finite.boxes === undefined ? undefined : objectRecord(finite.boxes, 'boxes'), knownFonts;
        if (finite.fonts) {
            const fonts = Object.fromEntries(Object.entries(stringRecord(finite.fonts, 'fonts')).map(([family, file]) => [family, { file: path(file) }]));
            boxes = (await loadTextMetrics({ fonts })).resolveBoxes(boxes ?? {});
            knownFonts = Object.keys(fonts);
        }
        // The legacy JS inference treats its default [] as never[]. The
        // actual adapter forwards these point observations to the proof engine.
        const finiteVerify = verifyFiniteUI;
        const result = finiteVerify(analysis, { ...m, profiles: profiles(m.profiles), contracts: array(m.contracts, 'contracts'), targets: strings(finite.targets, 'targets'), css: finite.css ? read(string(finite.css, 'CSS')) : '', boxes, knownFonts, defaultFontSize: finite.defaultFontSize, observations: samples, geometrySession, proofSession: session });
        return { ...result, finiteAnalysis: analysis };
    }
    if (docs.length > 256)
        throw Error('Invalid document list');
    const checkedModel = uiModel(model);
    const derived = [];
    for (const value of docs) {
        const d = record(value, 'document'), profile = checkedModel.profiles.find(p => p.id === d.profile);
        if (!profile)
            throw Error('Unknown document profile');
        let boxes = d.boxes === undefined ? undefined : objectRecord(d.boxes, 'boxes'), knownFonts;
        if (d.fonts) {
            const fonts = Object.fromEntries(Object.entries(stringRecord(d.fonts, 'fonts')).map(([family, file]) => [family, { file: path(file) }]));
            const metrics = await loadTextMetrics({ fonts });
            boxes = metrics.resolveBoxes(boxes ?? {});
            knownFonts = Object.keys(fonts);
        }
        derived.push(...(geometrySession?.domGeometry ?? domGeometry)({ ...d, profile, html: read(string(d.html, 'HTML')), css: read(string(d.css, 'CSS')), boxes, knownFonts }));
    }
    return (session?.verifyUI ?? verifyUI)({ model: checkedModel, evidence: [...supplied, ...derived], observations: samples });
}
