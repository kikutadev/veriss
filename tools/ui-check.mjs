// Usage: node tools/ui-check.mjs [--independent-first] manifest.json
import { checkUIManifest } from './ui-manifest.mjs';
import { createGeometrySession } from '../packages/adapter-core/src/ui-contracts.mjs';
import { createRelationalProofSession } from '../packages/veriss/src/layout-contract.mjs';
try {
    const args = process.argv.slice(2);
    let file, preferIndependent = false, cacheDir;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--independent-first')
            preferIndependent = true;
        else if (args[i] === '--cache-dir') {
            cacheDir = args[++i];
            if (!cacheDir)
                throw Error('Expected cache directory');
        }
        else if (!file && args[i] !== undefined && !args[i]?.startsWith('--'))
            file = args[i];
        else
            throw Error('Invalid argument ' + args[i]);
    }
    if (!file)
        throw Error('usage: ui-check.mjs [--independent-first] [--cache-dir path] manifest.json');
    let persistent;
    if (cacheDir)
        try {
            persistent = (await import('./persistent-cache.mjs')).openLocalVerificationCache(cacheDir);
        }
        catch (e) {
            console.error('cache disabled: ' + (e instanceof Error ? e.message : String(e)));
        }
    const geometryOptions = { preferIndependent, ...(persistent ? { trustedStorage: persistent.geometry } : {}) };
    const report = await checkUIManifest(file, { geometrySession: createGeometrySession(geometryOptions), session: createRelationalProofSession(persistent ? { trustedStorage: persistent.proofs } : {}) });
    try {
        persistent?.flush();
    }
    catch (e) {
        console.error('cache not saved: ' + (e instanceof Error ? e.message : String(e)));
    }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.outcome === 'failed' ? 1 : report.outcome === 'unknown' ? 2 : 0;
}
catch (e) {
    console.error((e instanceof Error ? e.message : String(e)));
    process.exitCode = 2;
}
