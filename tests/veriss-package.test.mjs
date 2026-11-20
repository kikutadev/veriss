import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rename, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const packageRoot = fileURLToPath(new URL('../packages/veriss/', import.meta.url));
test('CSS verifier implementation and types have no imports outside their package source', async () => {
    const root = join(packageRoot, 'src');
    for (const entry of await readdir(root, { recursive: true })) {
        if (!/\.(?:mjs|mts|ts)$/.test(entry))
            continue;
        const file = join(root, entry), source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /ProgramIR|\.isle\b|from ['"].*(?:playwright|compiler)/, entry);
        for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
            assert.ok(match[1]);
            assert.ok(resolve(dirname(file), match[1]).startsWith(root + '/'), `${entry} imports outside the core: ${match[1]}`);
        }
    }
});
test('an isolated npm consumer verifies HTML and runs Z3 without installing Isle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'veriss-consumer-'));
    try {
        const packed = spawnSync('pnpm', ['pack', '--config.ignore-scripts=true', '--pack-destination', directory], { cwd: packageRoot, encoding: 'utf8' });
        assert.equal(packed.status, 0, packed.stderr || packed.stdout);
        const archive = (await readdir(directory)).find(file => file.endsWith('.tgz'));
        assert.ok(archive);
        const unpacked = spawnSync('tar', ['-xzf', join(directory, archive), '-C', directory], { encoding: 'utf8' });
        assert.equal(unpacked.status, 0, unpacked.stderr);
        const app = join(directory, 'app');
        await mkdir(join(app, 'node_modules/@mizchi'), { recursive: true });
        await rename(join(directory, 'package'), join(app, 'node_modules/@mizchi/veriss'));
        const metadata = JSON.parse(await readFile(join(app, 'node_modules/@mizchi/veriss/package.json'), 'utf8'));
        assert.ok(metadata && typeof metadata === 'object' && 'exports' in metadata && metadata.exports && typeof metadata.exports === 'object');
        assert.ok('dependencies' in metadata && metadata.dependencies && typeof metadata.dependencies === 'object');
        const entries = Object.values(metadata.exports);
        for (const entry of entries) {
            if (typeof entry === 'string')
                continue; // a deep-import pattern (./src/*), not an entry point
            assert.ok(entry && typeof entry === 'object' && 'types' in entry && typeof entry.types === 'string');
            assert.ok((await readFile(join(app, 'node_modules/@mizchi/veriss', entry.types), 'utf8')).length);
        }
        for (const name of Object.keys(metadata.dependencies)) {
            await symlink(join(packageRoot, 'node_modules', name), join(app, 'node_modules', name), 'dir');
        }
        // Install all adapter archives into the same isolated consumer. Peer dependencies
        // resolve to the packed verifier/core, never the workspace TypeScript sources.
        for (const folder of ['adapter-core', 'react-adapter', 'vue-adapter', 'svelte-adapter']) {
            const root = join(packageRoot, '..', folder);
            const result = spawnSync('pnpm', ['pack', '--config.ignore-scripts=true', '--pack-destination', directory], { cwd: root, encoding: 'utf8' });
            assert.equal(result.status, 0, result.stderr || result.stdout);
            const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
            assert.ok(manifest && typeof manifest === 'object' && 'name' in manifest && typeof manifest.name === 'string' && 'version' in manifest && typeof manifest.version === 'string' && 'dependencies' in manifest && manifest.dependencies && typeof manifest.dependencies === 'object');
            const archive = manifest.name.replace(/^@/, '').replace('/', '-') + '-' + manifest.version + '.tgz';
            const unpacked = spawnSync('tar', ['-xzf', join(directory, archive), '-C', directory], { encoding: 'utf8' });
            assert.equal(unpacked.status, 0, unpacked.stderr);
            await rename(join(directory, 'package'), join(app, 'node_modules', manifest.name));
            for (const name of Object.keys(manifest.dependencies)) {
                const dest = join(app, 'node_modules', name);
                await mkdir(dirname(dest), { recursive: true });
                try {
                    await symlink(join(root, 'node_modules', name), dest, 'dir');
                }
                catch (error) {
                    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST'))
                        throw error;
                }
            }
        }
        for (const name of ['veriss', 'veriss-adapter-core', 'veriss-react', 'veriss-vue', 'veriss-svelte']) {
            const src = join(app, 'node_modules/@mizchi', name, 'src');
            assert.ok((await readdir(src, { recursive: true })).every(file => !(/\\.mts$/.test(file) && !file.endsWith('.d.mts'))), name + ' contains handwritten TypeScript');
        }
        await writeFile(join(app, 'package.json'), '{"type":"module"}');
        await writeFile(join(app, 'check.mjs'), `import assert from 'node:assert/strict';
import {expandReact} from '@mizchi/veriss-react';
import {expandVue} from '@mizchi/veriss-vue';
import {expandSvelte} from '@mizchi/veriss-svelte';
assert.ok(expandReact('export default function App(){return <div/>}').states.length>0);
assert.ok(expandVue('<template><div/></template>').states.length>0);
assert.ok(expandSvelte('<div/>').states.length>0);
import {analyzeHTML} from '@mizchi/veriss/html';
import {verifyLayoutReport} from '@mizchi/veriss/z3/node';
import {createContractIR,createLayoutIR,createObligationIR,createStateIR,createEnvironmentIR,createEvidenceIR,layoutGeometry,createRelationalProofSession} from '@mizchi/veriss/contracts';
import {verifyContractObligation} from '@mizchi/veriss/contracts/node';
import {createNoShiftContract} from '@mizchi/veriss/transitions';
import {verifyNoShift} from '@mizchi/veriss/transitions/node';
import {analyzeLayout} from '@mizchi/veriss';
const report=analyzeHTML('<main class="row"><div></div><div></div></main>',{
  name:'Document',css:'*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));height:100px;grid-template-rows:100px}',viewport:{min:160,max:400,height:{min:100,max:100}}
});
assert.equal(report.status,'verified');
assert.equal((await verifyLayoutReport(report)).status,'verified');
const contract=createContractIR({component:'Document',requires:{inlineSize:{min:160,max:400},blockSize:{min:100,max:100}}});
assert.equal((await verifyContractObligation(createObligationIR(contract,createLayoutIR(report)))).status,'verified');
const stable=createNoShiftContract({name:'Stable',targets:[{name:'root',before:'Document',after:'Document'}]});
assert.equal((await verifyNoShift(report,report,stable)).status,'verified');
const named=analyzeLayout({tag:'main',classes:['row'],children:[{tag:'div',targets:['action']},{tag:'div'}]},{name:'Document',css:'*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));height:100px;grid-template-rows:100px}',viewport:{min:160,max:400,height:{min:100,max:100}}});
const target=createNoShiftContract({name:'Named',targets:[{name:'action',before:{id:'action',within:'Document'},after:{id:'action',within:'Document'}}]});
assert.equal((await verifyNoShift(named,named,target)).status,'verified');
const profile={id:'web',viewport:{min:160,max:400,height:{min:100,max:100}}};
const relation=createContractIR({component:'Document',profile:'relational/1',contracts:[{id:'width',kind:'predicate',predicate:{op:'compare',relation:'ge',left:{target:'root',field:'inlineSize'},right:'160'}}]});
const state=createStateIR({initial:'ready',states:['ready'],transitions:[]}),environment=createEnvironmentIR([profile]);
const evidence=createEvidenceIR(layoutGeometry({state:'ready',profile,layout:createLayoutIR(report),targets:['root'],paths:{root:'Document'}}));
const relationalObligation=createObligationIR(relation,{state,environment,evidence});
assert.equal((await verifyContractObligation(relationalObligation)).status,'verified');
const session=createRelationalProofSession();
assert.equal(session.verify(relationalObligation).status,'verified');
assert.equal(session.verify(relationalObligation).status,'verified');
assert.equal(session.stats().hits,1);
await assert.rejects(import('@isle/prototype/compiler'),{code:'ERR_MODULE_NOT_FOUND'});
`);
        // The consumer cannot rely on the workspace's TypeScript paths or ambient dependencies.
        await mkdir(join(app, 'node_modules/@types'), { recursive: true });
        await symlink(fileURLToPath(new URL('../node_modules/@types/node', import.meta.url)), join(app, 'node_modules/@types/node'), 'dir');
        const consumerSource = (await readFile(join(app, 'check.mjs'), 'utf8')).split('\n').filter(line => !line.includes("await assert.rejects(import('@isle/")).join('\n');
        await writeFile(join(app, 'check.mts'), consumerSource);
        const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
        const typed = spawnSync(process.execPath, [compiler, '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--types', 'node', 'check.mts'], { cwd: app, encoding: 'utf8', timeout: 30000 });
        assert.equal(typed.status, 0, typed.stdout || typed.stderr);
        const checked = spawnSync(process.execPath, ['check.mjs'], { cwd: app, encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' }, timeout: 30000 });
        assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
});
