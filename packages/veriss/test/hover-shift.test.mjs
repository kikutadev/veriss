import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHTML } from '../src/html.mjs';
// :hover rules that change layout: each hovered layout is compared with the base one; a moved start position is a
// layout shift (Chromium counts it, hadRecentInput false).
const viewport = { min: 320, max: 960, height: { min: 240, max: 720 } };
const html = '<main class="page"><div class="card"><div class="inner"></div></div><div class="below"></div></main>';
const base = '*{box-sizing:border-box}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:8px;row-gap:8px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:100px;padding:10px}.inner{height:20px}.below{height:40px}';
const run = (css, options = {}) => analyzeHTML(html, { name: 'Page', viewport, css: base + css, ...options });
const shifts = (report) => report.diagnostics.filter(d => d.code === 'E_LAYOUT_HOVER_SHIFT');
test(':hover that changes layout reports the boxes it moves', () => {
    const [taller] = shifts(run('.card:hover{height:120px}'));
    assert.ok(taller);
    assert.deepEqual([taller.box, 'hovered' in taller ? taller.hovered : undefined, 'field' in taller ? taller.field : undefined, 'delta' in taller ? taller.delta : undefined], ['.below', '.card', 'blockStart', '20']);
    const padded = shifts(run('.card:hover{padding:14px}'));
    assert.deepEqual(padded.map(d => [d.box, 'field' in d ? d.field : undefined, 'delta' in d ? d.delta : undefined]), [['.inner', 'inlineStart', '4']]);
    // A size change that moves no start position is not a shift: the last box grows, or narrows from its start.
    for (const css of ['.below:hover{height:60px}', '.below:hover{width:50%}', '.card:hover{background:#eee}'])
        assert.equal(run(css).status, 'verified', css);
    // A transform on hover moves only the painted box (integrity/accessibility model it).
    assert.equal(run('.card:hover{transform:translateY(-4px)}', { integrity: true }).status, 'verified');
});
test('a hovered layout that only moves in part of the viewport range is found there', () => {
    // The card grows only from 600px: the shift is reported in that region.
    const [wide] = shifts(run('@media (min-width: 600px){.card:hover{height:110px}}'));
    assert.ok(wide);
    assert.equal(wide.box, '.below');
    assert.ok(wide.range.min >= 600, JSON.stringify(wide.range));
    assert.equal(run('@media (min-width: 2000px){.card:hover{height:110px}}').status, 'verified');
});
test('a hover shift carries an upper bound of its Layout Instability score', () => {
    const at = { min: 800, max: 800, height: { min: 600, max: 600 } };
    const [taller] = analyzeHTML(html, { name: 'Page', viewport: at, css: base + '.card:hover{height:120px}' }).diagnostics.filter(d => d.code === 'E_LAYOUT_HOVER_SHIFT');
    // .below (784 × 40 at y 116) moves 20px down: impact 784 × 60 / (800 × 600), distance 20 / 800 (Chromium: 0.00245).
    assert.ok(taller && 'scoreBound' in taller && typeof taller.scoreBound === 'number');
    assert.ok(Math.abs(taller.scoreBound - (784 * 60 / 480000) * (20 / 800)) < 1e-12, String(taller.scoreBound));
    // Without a viewport height there is no viewport area: no bound.
    assert.equal(shifts(analyzeHTML(html, { name: 'Page', viewport: { min: 320, max: 960 }, css: base + '.card:hover{height:120px}' })).map(d => 'scoreBound' in d ? d.scoreBound : undefined)[0], undefined);
});
test('hovered custom properties transitively affect inherited layout, including fallback references', () => {
    const css = '.card{--base:100px;--unused:initial;height:var(--h);--h:var(--unused,var(--base))}.card:hover{--base:120px}';
    const report = run(css);
    assert.equal(shifts(report).find(d => d.box === '.below')?.delta, '20', JSON.stringify(report.diagnostics));
});
test('a hovered size overflow without any moved start is not verified', () => {
    const report = run('.below{--w:100px;width:var(--w)}.below:hover{--w:2000px}');
    assert.notEqual(report.status, 'verified');
    assert.ok(report.diagnostics.some(d => d.hovered === '.below' || d.code === 'U_LAYOUT_STATE_VARIABLE'));
});
test('unmodeled state variables and nested state arguments do not silently pass layout', () => {
    for (const css of [
        '.card{height:var(--h,100px)}.card:focus-within{--h:180px}',
        '.card{height:var(--h,100px)}@media(prefers-reduced-motion:reduce){.card{--h:180px}}',
        '.card{height:var(--h,100px)}:is(.card:hover){--h:180px}',
        ':where(.card:hover){height:180px}',
        '.card{height:var(--h,100px)}@keyframes grow{to{--h:180px}}.card{animation:grow 1s}'
    ])
        assert.equal(run(css).status, 'unknown', css);
});
test('color-only and unused state custom properties do not taint static geometry', () => {
    for (const css of [
        '.card{--ink:#111;color:var(--ink)}.card:hover{--ink:#eee}',
        '.card:hover{--unused:400px}',
        '.card{--ink:#111;color:var(--alias);--alias:var(--ink)}@media(prefers-color-scheme:dark){.card{--ink:#eee}}'
    ])
        assert.equal(run(css).status, 'verified', css);
});
test('hover state size findings reach Z3, including direct width declarations', async () => {
    const { verifyLayoutReport } = await import('../src/layout-z3-node.mjs');
    for (const css of ['.below{--w:100px;width:var(--w)}.below:hover{--w:2000px}', '.below:hover{width:2000px}']) {
        const report = run(css);
        assert.equal(report.status, 'violated', JSON.stringify(report.diagnostics));
        const proof = await verifyLayoutReport(report);
        assert.equal(proof.status, 'violated');
        assert.ok(proof.witness);
        assert.equal(proof.witness.hoveredPath, 'Page/1');
    }
});
test('hover variable fit follows the inherited cascade including inline and reset sheets', () => {
    const source = '<main class="page"><div class="card"><div class="inner" style="height:var(--h)"></div></div><div class="below"></div></main>';
    const report = analyzeHTML(source, { name: 'Page', viewport, css: base + '.card{--h:20px}', reset: [{ css: '.card:hover{--h:2000px}' }] });
    assert.notEqual(report.status, 'verified', JSON.stringify(report.diagnostics));
    assert.ok(report.diagnostics.some(d => d.hovered === '.card' || d.code === 'U_LAYOUT_STATE_VARIABLE'));
    const safe = run('.below{--w:100px;width:var(--w)}.below:hover{--w:120px}');
    assert.equal(safe.status, 'verified', JSON.stringify(safe.diagnostics));
    assert.ok(safe.checks.some(c => c.hoveredPath === 'Page/1'));
});
test('states affecting geometry indirectly through animation consumer or unsupported selector remain Unknown', () => {
    for (const css of [
        '.card{--h:100px}.card:hover{--h:180px}@keyframes move{to{height:var(--h)}}.card{animation:move 1s}',
        '.card{--x:0px;transform:translateX(var(--x))}.card:hover{--x:100px}',
        'main:hover .card{--h:180px}.card{height:var(--h,100px)}'
    ])
        assert.equal(run(css).status, 'unknown', css);
});
test('state dependency limits and omitted inline geometry cannot turn into verification', () => {
    const source = '<main class="page">' + Array.from({ length: 65 }, () => '<div class="item"></div>').join('') + '</main>';
    const r = analyzeHTML(source, { viewport, css: '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.item{--w:100px;height:10px;width:var(--w)}.item:hover{--w:120px}' });
    assert.equal(r.status, 'unknown');
    assert.ok(r.diagnostics.some(d => d.code === 'U_LAYOUT_HOVER_SHIFT' && d.message.includes('64')));
    const inline = analyzeHTML('<main class="page"><div class="card">x<span style="padding-left:var(--g)">y</span></div></main>', { viewport, css: base + '.card{--g:0px}.card:hover{--g:100px}' });
    assert.equal(inline.status, 'unknown');
    assert.ok(inline.diagnostics.some(d => d.code === 'U_LAYOUT_STATE_VARIABLE'), JSON.stringify(inline.diagnostics));
});
test('fixed media profile still resolves variable-dependent geometry', () => {
    const css = '.card{--h:100px;height:var(--h)}@media(prefers-reduced-motion:reduce){.card{--h:120px}}';
    assert.equal(run(css).status, 'unknown');
    for (const value of ['no-preference', 'reduce']) {
        const r = run(css, { mediaFeatures: { 'prefers-reduced-motion': value } });
        assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
        assert.equal(r.sizes.find(s => s.box === '.card').rect.blockSize.constant, value === 'reduce' ? '120' : '100');
    }
});
test('each hovered target starts from an independent tree with the same trusted contracts', () => {
    const source = '<main><div class="entry"></div><div class="entry"></div><div class="entry"></div></main>';
    const css = '*{box-sizing:border-box;margin:0}main{display:grid;grid-template-columns:minmax(0,1fr)}.entry{--h:100px;height:var(--h)}.entry:hover{--h:140px}';
    const report = analyzeHTML(source, { viewport, css, boxes: { '.entry': { minInlineSize: 40, minBlockSize: 20 } } });
    assert.equal(report.status, 'violated', JSON.stringify(report.diagnostics));
    assert.equal(new Set(report.checks.flatMap(c => c.hoveredPath ? [c.hoveredPath] : [])).size, 3);
});
