import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportObservation, focusObservation } from '../src/browser-observations.mjs';
import { verifyUI } from '../src/ui-contracts.mjs';
const model = { version: 1, initial: 'dashboard', states: ['dashboard'], transitions: [{ from: 'dashboard', event: 'keyboard-focus-visible', to: 'dashboard' }],
    profiles: [{ id: 'p', viewport: { min: 320, max: 1280, height: { min: 844, max: 844 } } }],
    contracts: [
        { id: 'root', kind: 'predicate', predicate: { op: 'compare', relation: 'le', left: { target: 'scrollExtent', field: 'inlineEnd' }, right: { environment: 'safeRight' } } },
        { id: 'keyboard', kind: 'action', event: 'keyboard-focus-visible' }
    ] };
const frame = { viewport: 320, height: 844, documentWidth: 334, main: { x: 0, y: 56, width: 334.4, height: 788 }, overflowElements: ['div.list-actions'] };
const focus = { tag: 'a', inScope: true, offscreen: true, bounds: { x: -240, y: 74, width: 200, height: 36 } };
test('runtime frame records measured document extent and cannot assert static proof', () => {
    const observation = viewportObservation('dashboard', 'p', frame);
    assert.deepEqual(observation.rects?.scrollExtent, { x: 0, y: 0, width: 334, height: 844 });
    assert.deepEqual(observation.rects?.main, frame.main);
    const report = verifyUI({ model, observations: [observation] });
    assert.equal(report.status, 'unknown');
    assert.equal(report.observationStatus, 'failed');
    assert.equal(report.contracts.find(c => c.id === 'root')?.observations[0]?.status, 'failed');
    const repaired = viewportObservation('dashboard', 'p', { ...frame, documentWidth: 320, main: { ...frame.main, width: 320 } });
    const repairedReport = verifyUI({ model, observations: [repaired] });
    assert.equal(repairedReport.status, 'unknown');
    assert.equal(repairedReport.observationStatus, 'sampled');
});
test('keyboard observation reports only offscreen focus within the specified closed scope', () => {
    const key = focusObservation('dashboard', 'p', 390, 844, [focus], 'keyboard-focus-visible');
    assert.equal(key.passed, false);
    const report = verifyUI({ model, observations: [key] });
    assert.equal(report.status, 'unknown');
    assert.equal(report.observationStatus, 'failed');
    const outside = focusObservation('dashboard', 'p', 390, 844, [{ ...focus, inScope: false }], 'keyboard-focus-visible');
    assert.equal(outside.passed, true);
    const insideVisible = focusObservation('dashboard', 'p', 390, 844, [{ ...focus, offscreen: false }], 'keyboard-focus-visible');
    assert.equal(insideVisible.passed, true);
    const observed = verifyUI({ model, observations: [outside, insideVisible] });
    assert.equal(observed.observationStatus, 'sampled');
});
test('invalid measurements are refused, not used as proof samples', () => {
    assert.throws(() => viewportObservation('dashboard', 'p', { ...frame, documentWidth: NaN }), /viewport/i);
    assert.throws(() => focusObservation('dashboard', 'p', 390, 844, [], ''), /event/i);
});
