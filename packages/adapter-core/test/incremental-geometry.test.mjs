import test from 'node:test';
import assert from 'node:assert/strict';
import { domGeometry, createGeometrySession } from '../src/ui-contracts.mjs';
const profile = { id: 'web', viewport: { min: 320, max: 1280, height: { min: 400, max: 900 } } };
const html = '<!doctype html><html lang="en"><head><title>Panel</title></head><body><main id="panel"><div id="left"></div><div id="right"></div><kbd>native</kbd></main></body></html>';
const css = '*{box-sizing:border-box;margin:0;padding:0}#panel{position:relative;overflow:hidden;height:100dvh}#left,#right{position:absolute;top:20px;width:40%;height:48px}#left{left:0}#right{right:0}';
const input = { state: 'ready', profile, html, css, targets: ['left', 'right'] };
test('independent extraction rechecks full source before reusing a reduced input', () => {
    const s = createGeometrySession({ preferIndependent: true });
    const first = s.domGeometry(input);
    assert.ok(first.every(x => x.rows?.length), JSON.stringify(first));
    assert.deepEqual(first, domGeometry(input));
    assert.equal(s.stats().projected.misses, 2);
    assert.equal(s.stats().full.misses, 0);
    const next = { ...input, css: css + '#left{height:60px}' };
    const changed = s.domGeometry(next);
    assert.deepEqual(changed, domGeometry(next));
    assert.ok(changed[0] && first[0]);
    assert.notDeepEqual(changed[0].rows, first[0].rows);
    assert.deepEqual(changed[1], first[1]);
    assert.equal(s.stats().projected.hits, 1);
    assert.equal(s.stats().projected.misses, 3);
    const unrelated = { ...next, html: html.replace('<kbd>native</kbd>', '<kbd>new content</kbd>') };
    assert.deepEqual(s.domGeometry(unrelated), domGeometry(unrelated));
    assert.equal(s.stats().projected.hits, 3);
    const bad = { ...next, css: next.css + '#panel:has(kbd){height:30px}' };
    const rejected = s.domGeometry(bad);
    assert.deepEqual(rejected, domGeometry(bad));
    assert.ok(rejected.every(x => !x.rows?.length));
    assert.equal(s.stats().projected.hits, 3);
    assert.equal(s.stats().full.misses, 1);
});
test('full extraction cache shares identical source across states and target sets; invalidates on CSS or environment edits', () => {
    const s = createGeometrySession();
    const whole = { ...input, html: '<!doctype html><html lang="en"><head><title>T</title></head><body><main id="left"></main><main id="right"></main></body></html>', css: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{height:48px}' };
    const first = s.domGeometry(whole);
    assert.ok(first.every(x => x.rows?.length));
    const second = s.domGeometry({ ...whole, state: 'loaded', targets: ['right'] });
    assert.deepEqual(second, domGeometry({ ...whole, state: 'loaded', targets: ['right'] }));
    assert.equal(s.stats().full.hits, 1);
    assert.equal(s.stats().full.misses, 1);
    const changed = { ...whole, css: whole.css + 'main{height:50px}' };
    assert.deepEqual(s.domGeometry(changed), domGeometry(changed));
    const resized = { ...whole, profile: { ...profile, viewport: { ...profile.viewport, max: 1600 } } };
    assert.deepEqual(s.domGeometry(resized), domGeometry(resized));
    assert.equal(s.stats().full.misses, 3);
    const font = { ...whole, defaultFontSize: 18 };
    assert.deepEqual(s.domGeometry(font), domGeometry(font));
    assert.equal(s.stats().full.misses, 4);
    // Caller mutation must not affect the cached LayoutIR.
    const constant = first[0]?.rows?.[0]?.rect.blockSize;
    assert.ok(constant);
    try {
        constant.constant = '900';
    }
    catch { }
    assert.deepEqual(s.domGeometry(whole), domGeometry(whole));
    s.clear();
    assert.equal(s.stats().entries, 0);
});
test('dependency mutation cannot reuse independent source: ancestor, media, duplicate identity, and profile', () => {
    const s = createGeometrySession({ preferIndependent: true });
    s.domGeometry(input);
    const edits = [
        { ...input, css: css + '#panel{height:50dvh}' },
        { ...input, css: css + '@media(max-width:600px){#left{height:32px}}' },
        { ...input, css: css + '#left:hover{width:100%}' },
        { ...input, html: html.replace('</main>', '<div id="left"></div></main>') },
        { ...input, profile: { ...profile, ua: 'firefox' } },
        { ...input, profile: { ...profile, scrollbar: { name: 'classic', inlineSize: 15, blockSize: 15 } } },
        { ...input, css: '@import "unknown.css";' + css },
        { ...input, boxes: { left: {} } }
    ];
    for (const edited of edits) {
        const r = s.domGeometry(edited), expected = domGeometry(edited);
        assert.deepEqual(r, expected, JSON.stringify(edited));
    }
});
test('bounded session does not retain unknown or incomplete layout', () => {
    const s = createGeometrySession({ maxEntries: 1, preferIndependent: true });
    s.domGeometry(input);
    assert.equal(s.stats().entries, 1);
    assert.ok(s.stats().evictions > 0);
    const broken = { ...input, css: '@import "unknown.css";' + css };
    s.domGeometry(broken);
    const before = s.stats().full.misses;
    s.domGeometry(broken);
    assert.equal(s.stats().full.misses, before + 1);
});
test('whole-layout fallback covers dependent targets, and unsupported options never collide', () => {
    const s = createGeometrySession({ preferIndependent: true });
    const whole = { ...input, html: '<!doctype html><html lang="en"><head><title>T</title></head><body><main id="left"></main><main id="right"></main></body></html>', css: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{height:48px}' };
    assert.deepEqual(s.domGeometry(whole), domGeometry(whole));
    assert.equal(s.stats().full.misses, 1);
    assert.deepEqual(s.domGeometry(whole), domGeometry(whole));
    assert.equal(s.stats().full.hits, 1);
    const custom = { ...whole, profile: { ...profile, viewport: Object.assign(Object.create(null), profile.viewport) } };
    assert.deepEqual(s.domGeometry(custom), domGeometry(custom));
    assert.equal(s.stats().full.bypassed, 1);
    const tiny = createGeometrySession({ maxBytes: 20 });
    assert.deepEqual(tiny.domGeometry(whole), domGeometry(whole));
    assert.equal(tiny.stats().entries, 0);
    assert.equal(tiny.stats().full.bypassed, 1);
});
test('manifest and both CLI entry points support independent extraction without weakening strict outcomes', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { execFileSync } = await import('node:child_process');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const manifestModule = await import(new URL('../../../tools/ui-manifest.mjs', import.meta.url).href);
    assert.ok(manifestModule && typeof manifestModule === 'object' && 'checkUIManifest' in manifestModule && typeof manifestModule.checkUIManifest === 'function');
    const check = manifestModule.checkUIManifest;
    const checkUIManifest = async (file, options) => {
        const report = await Reflect.apply(check, undefined, [file, options]);
        assert.ok(report && typeof report === 'object' && 'status' in report);
        return report;
    };
    const dir = mkdtempSync(join(tmpdir(), 'veriss-incremental-'));
    try {
        const file = join(dir, 'manifest.json');
        const model = { version: 1, initial: 'ready', states: ['ready'], transitions: [], profiles: [profile], contracts: [{ id: 'fits', kind: 'within-viewport', target: 'left' }] };
        writeFileSync(join(dir, 'page.html'), html);
        writeFileSync(join(dir, 'page.css'), css);
        writeFileSync(file, JSON.stringify({ model, documents: [{ state: 'ready', profile: 'web', html: 'page.html', css: 'page.css', targets: ['left', 'right'] }] }));
        const geometrySession = createGeometrySession({ preferIndependent: true });
        assert.equal((await checkUIManifest(file, { geometrySession })).status, 'verified');
        assert.equal((await checkUIManifest(file, { geometrySession })).status, 'verified');
        assert.equal(geometrySession.stats().projected.hits, 2);
        assert.equal(JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../../../tools/ui-check.mjs', import.meta.url)), '--independent-first', file], { encoding: 'utf8' })).status, 'verified');
        const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
        const run = () => { try {
            execFileSync(process.execPath, [cli, '--contracts', '--independent-first', '--fail-on-unknown', file], { stdio: 'pipe' });
            return 0;
        }
        catch (e) {
            assert.ok(e && typeof e === 'object' && 'status' in e);
            return e.status;
        } };
        assert.equal(run(), 0);
        writeFileSync(join(dir, 'page.css'), css + '#left{width:120%}');
        assert.equal((await checkUIManifest(file, { geometrySession })).status, 'violated');
        assert.equal(run(), 1);
        writeFileSync(join(dir, 'page.css'), css + '#left:hover{width:120%}');
        assert.equal((await checkUIManifest(file, { geometrySession })).status, 'unknown');
        assert.equal(run(), 2);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
