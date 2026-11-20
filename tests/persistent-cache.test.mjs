import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openLocalVerificationCache } from '../tools/persistent-cache.mjs';
import { createGeometrySession, domGeometry } from '../packages/adapter-core/src/ui-contracts.mjs';
import { createRelationalProofSession } from '../packages/veriss/src/layout-contract.mjs';
const profile = { id: 'web', viewport: { min: 320, max: 800, height: { min: 400, max: 900 } } };
const html = '<!doctype html><html lang="en"><head><title>Settings</title></head><body><main id="control"></main></body></html>';
const css = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{height:48px}';
const input = { state: 'ready', profile, html, css, targets: ['control'] };
const model = { version: 1, initial: 'ready', states: ['ready'], transitions: [], profiles: [profile], contracts: [{ id: 'size', kind: 'min-size', target: 'control', width: 44, height: 44 }] };
test('local persistent cache reuses exact geometry and case proof across sessions, fails closed on edits and corruption', () => {
    const dir = mkdtempSync(join(tmpdir(), 'veriss-local-cache-'));
    try {
        const open = (revision = 'test-engine/1') => openLocalVerificationCache(dir, { revision });
        function run(store, cssText = css) {
            const geometry = createGeometrySession({ trustedStorage: store.geometry }), proof = createRelationalProofSession({ trustedStorage: store.proofs });
            const evidence = geometry.domGeometry({ ...input, css: cssText });
            const report = proof.verifyUI({ model, evidence });
            store.flush();
            return { report, evidence, geometry: geometry.stats(), proof: proof.stats() };
        }
        const first = run(open());
        assert.equal(first.report.status, 'verified');
        const second = run(open());
        assert.deepEqual(second.report, first.report);
        assert.deepEqual(second.evidence, domGeometry(input));
        assert.equal(second.geometry.full.hits, 1);
        assert.equal(second.proof.hits, 1);
        const edit = run(open(), css + 'main{height:30px}');
        assert.equal(edit.report.status, 'violated');
        assert.equal(edit.geometry.full.misses, 1);
        assert.equal(edit.proof.misses, 1);
        const incompatible = run(open('different-engine'));
        assert.equal(incompatible.geometry.full.misses, 1);
        assert.equal(incompatible.proof.misses, 1);
        const f = join(dir, 'cache.bin'), data = readFileSync(f);
        data[data.length - 1] = data[data.length - 1] ^ 255;
        writeFileSync(f, data);
        const corrupted = run(open('different-engine'));
        assert.equal(corrupted.report.status, 'verified');
        assert.equal(corrupted.geometry.full.misses, 1);
        assert.equal(corrupted.proof.misses, 1);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('Node CLI persists results across actual processes and preserves finite report outcomes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'veriss-persistent-cli-'));
    try {
        const manifest = join(dir, 'manifest.json'), cacheDir = join(dir, 'cache'), component = join(dir, 'Panel.jsx'), stylesheet = join(dir, 'style.css');
        writeFileSync(component, `import {useState} from 'react';export default function Panel(){const [open,setOpen]=useState(false);return <main><button id="toggle" aria-label="Toggle" onClick={()=>setOpen(!open)}/>{open&&<div id="panel"/>}</main>}`);
        const style = '*{box-sizing:border-box;margin:0;padding:0}html,body,#app,main{display:grid;grid-template-columns:minmax(0,1fr)}button{width:100%;height:48px;border:0;appearance:none}#panel{height:80px}';
        writeFileSync(stylesheet, style);
        writeFileSync(manifest, JSON.stringify({ model: { version: 1, profiles: [profile], contracts: [{ id: 'size', kind: 'min-size', target: 'toggle', width: 44, height: 44 }] }, finiteComponent: { source: 'Panel.jsx', css: 'style.css', targets: ['toggle'] } }));
        const cli = fileURLToPath(new URL('../tools/ui-check.mjs', import.meta.url)), lint = fileURLToPath(new URL('../tools/css-lint.mjs', import.meta.url));
        function run() {
            const r = spawnSync(process.execPath, [cli, '--cache-dir', cacheDir, manifest], { encoding: 'utf8' });
            return { code: r.status, report: JSON.parse(r.stdout), err: r.stderr };
        }
        const first = run();
        assert.equal(first.code, 0, JSON.stringify(first));
        const data = readFileSync(join(cacheDir, 'cache.bin'));
        const second = run();
        assert.deepEqual(second, first);
        assert.deepEqual(readFileSync(join(cacheDir, 'cache.bin')), data); // no misses rewritten
        writeFileSync(stylesheet, style + 'button{height:32px}');
        const broken = run();
        assert.equal(broken.code, 1);
        assert.equal(broken.report.status, 'violated');
        writeFileSync(component, readFileSync(component, 'utf8').replace('!open', 'Boolean(Date.now())'));
        const unknown = run();
        assert.equal(unknown.code, 2);
        assert.equal(unknown.report.status, 'unknown');
        const result = spawnSync(process.execPath, [lint, '--contracts', '--cache-dir', cacheDir, '--fail-on-unknown', '--format', 'json', manifest], { encoding: 'utf8' });
        assert.equal(result.status, 2, JSON.stringify(result));
        assert.equal(JSON.parse(result.stdout)[0].code, 'U_UI_CONTRACT');
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
