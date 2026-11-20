import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStyle, parseLayoutCSS } from '../src/layout/css.mjs';
import { droppedOf } from '../src/layout/dropped.mjs';
import { normalizeTree } from '../src/tree.mjs';
import { decodeOracleRows, normalizeOracle, normalizeVerifier, generateCase, compareCase } from '../oracle/differential.mjs';
test('CSS oracle rejects malformed, duplicate, and non-finite row values', () => {
    const valid = [{ path: 'Doc', display: 'Block', 'grid-template-columns': ['fixed:40'], 'flex-grow': 1 }];
    assert.deepEqual(decodeOracleRows(valid), valid);
    for (const value of [null, {}, [{}], [{ path: 'Doc', display: null }], [{ path: 'Doc', display: ['block', 3] }], [{ path: 'Doc', 'flex-grow': Infinity }], [valid[0], valid[0]]])
        assert.throws(() => decodeOracleRows(value), /CSS oracle/);
    assert.throws(() => normalizeOracle('display', undefined), /Missing CSS oracle value/);
});
test('CSS oracle normalizes shared values and rejects unsupported track forms', () => {
    assert.deepEqual(normalizeVerifier('grid-template-columns', '40px minmax(0,1fr)'), { value: ['fixed:40', 'fr:0px:1'] });
    assert.deepEqual(normalizeVerifier('flex-grow', '1'), { value: 1 });
    assert.equal(normalizeOracle('flex-wrap', 'NoWrap'), 'nowrap');
    assert.equal(normalizeOracle('display', 'InlineFlex'), 'inline-flex');
    assert.ok(normalizeVerifier('grid-template-columns', 'subgrid').unsupported);
    assert.deepEqual(generateCase(42), generateCase(42));
    // A malformed external oracle is not accepted as an empty agreement.
    assert.throws(() => compareCase(() => [], { css: 'div{display:block}', tree: { tag: 'div' }, width: 320 }), /Missing CSS oracle value/);
});
test('computed CSS comparison does not change the effective layout style', () => {
    const { root } = normalizeTree({ tag: 'main', children: [{ tag: 'span', classes: ['outer'] }] }, 'Doc');
    const box = root.children[0];
    assert.ok(box);
    const diagnostics = [];
    const { rules } = parseLayoutCSS([{ css: '.outer{display:inline;overflow:visible auto}', file: '<css>' }], (_, message) => diagnostics.push(message));
    assert.deepEqual(diagnostics, []);
    const parent = computeStyle(rules, root, () => true);
    const computed = computeStyle(rules, box, () => true, parent, { valuePhase: 'cascade-subset' });
    const effective = computeStyle(rules, box, () => true, parent);
    assert.equal(computed['overflow-x'], 'auto');
    assert.equal(computed['overflow-y'], 'auto');
    assert.equal(effective['overflow-x'], 'visible');
    assert.equal(effective['overflow-y'], 'visible');
    assert.ok(droppedOf(effective, 'inline-overflow').length > 0);
});
