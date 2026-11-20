// ADR-0002: counterexamples carry the CSS facts that produced both sides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLayout } from '../src/index.mjs';
import { verifyLayoutReport } from '../src/layout-z3-node.mjs';
const four = () => ({ tag: 'main', classes: ['row'], children: Array.from({ length: 4 }, () => ({ tag: 'div', classes: ['cell'] })) });
const base = `* { box-sizing: border-box; }
.row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cell { min-width: 40px; }
.cell.other { min-width: 99px; }
`;
const run = (css, viewport = { min: 100, max: 1200 }, tree = four()) => analyzeLayout(tree, { name: 'Four', css, viewport });
const first = (report, code) => {
    const finding = report.diagnostics.find(d => d.code === code);
    assert.ok(finding);
    return finding;
};
const explanation = (finding) => {
    assert.ok(finding.explanation);
    return finding.explanation;
};
const facts = (side, property) => side.facts.filter((f) => 'property' in f && f.property === property);
const authored = (side, property) => facts(side, property).map(f => { assert.ok('css' in f); return f; });
const strip = (report) => JSON.parse(JSON.stringify(report, (key, value) => key === 'explanation' ? undefined : value));
test('an item-size counterexample names the parent tracks, the gap and the child minimum', () => {
    const report = run(base + '.row { gap: 8px; }\n');
    const finding = first(report, 'E_LAYOUT_ITEM_SIZE');
    assert.equal(finding.path, 'Four/0');
    const { available, required } = explanation(finding);
    assert.deepEqual(authored(required, 'min-inline-size').map(f => [f.path, f.value, f.css.line, f.css.selector]), [['Four/0', '40px', 3, '.cell']]);
    assert.deepEqual(authored(available, 'column-gap').map(f => [f.path, f.value, f.css.line, f.css.specified]), [['Four', '8px', 5, '8px']]);
    assert.deepEqual(authored(available, 'grid-template-columns').map(f => [f.path, f.css.line]), [['Four', 2]]);
    const column = facts(available, 'grid-column')[0];
    assert.ok(column && 'origin' in column);
    assert.equal(column.origin, 'default');
    assert.ok(available.facts.some(f => 'kind' in f && f.kind === 'viewport'), 'auto-sized root depends on the viewport');
    // The unrelated, non-matching `.cell.other` rule is never cited.
    assert.ok(!JSON.stringify(finding.explanation).includes('99px'));
});
test('a media-conditioned winner and a dormant media override are both reported with their conditions', () => {
    const report = run(base + '@media (min-width: 400px) {\n  .row { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n}\n@media (max-width: 300px) {\n  .row { gap: 16px; }\n}\n');
    const finding = first(report, 'E_LAYOUT_ITEM_SIZE');
    assert.ok(finding.range);
    assert.ok(finding.range.max <= 300, JSON.stringify(finding.range));
    const gap = authored(explanation(finding).available, 'column-gap')[0];
    assert.ok(gap);
    assert.equal(gap.value, '16px');
    assert.deepEqual(gap.css.conditions, [{ kind: 'media', params: '(max-width: 300px)', css: { file: '<css>', line: 8 } }]);
    const tracks = authored(explanation(finding).available, 'grid-template-columns')[0];
    assert.ok(tracks?.dormant);
    assert.equal(tracks.css.line, 2);
    assert.deepEqual(tracks.dormant.map(d => { assert.ok(d.css.conditions?.[0]); return [d.css.line, d.css.conditions[0].params]; }), [[6, '(min-width: 400px)']]);
});
test('a track counterexample cites the fixed track sizes against the container content box', () => {
    const report = run('* { box-sizing: border-box; }\n.row { display: grid; grid-template-columns: 100px 100px; padding: 0 10px; width: 150px; }\n', { min: 400, max: 800 }, { tag: 'main', classes: ['row'] });
    const finding = first(report, 'E_LAYOUT_TRACKS');
    assert.deepEqual(facts(explanation(finding).required, 'grid-template-columns').map(f => f.value), ['100px 100px']);
    const available = explanation(finding).available;
    assert.deepEqual(facts(available, 'inline-size').map(f => f.value), ['150px']);
    assert.deepEqual(facts(available, 'padding-left').map(f => f.value), ['10px']);
    // A definite width ends the dependency path: the viewport is irrelevant.
    assert.ok(!available.facts.some(f => 'kind' in f && f.kind === 'viewport'));
});
test('trusted content bounds are labelled as caller assumptions, not CSS', () => {
    const report = analyzeLayout({ tag: 'main', classes: ['row'], children: [{ tag: 'p', classes: ['t'], text: true }] }, { name: 'Text',
        css: '* { box-sizing: border-box; margin: 0; }\n.row { display: grid; grid-template-columns: minmax(0, 1fr); }\n', viewport: { min: 100, max: 400 },
        boxes: { '.t': { minInlineSize: 240 } } });
    const finding = first(report, 'E_LAYOUT_CONTENT');
    assert.deepEqual(explanation(finding).required.facts, [{ kind: 'contract', path: 'Text/0', box: '.t', owner: 'Text', property: 'minInlineSize', value: 240, selector: '.t', trusted: true }]);
});
test('explanations do not change status, ranges, witnesses or the proof', async () => {
    const css = base + '.row { gap: 8px; }\n';
    const report = run(css);
    assert.equal(report.status, 'violated');
    const plain = strip(report);
    assert.ok(plain && typeof plain === 'object' && 'checks' in plain);
    assert.ok(!JSON.stringify(plain).includes('"explanation"'));
    assert.deepEqual(plain.checks, report.checks);
    const proof = await verifyLayoutReport(report);
    assert.equal(proof.status, 'violated');
    const verified = run(base, { min: 160, max: 1200 });
    assert.equal(verified.status, 'verified');
    assert.ok(!verified.diagnostics.length);
});
