import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportObservation } from '../src/browser-observations.mjs';
import { verifyUI } from '../src/ui-contracts.mjs';
const model = { version: 1, initial: 'dashboard', states: ['dashboard'], transitions: [],
    profiles: [{ id: 'p', viewport: { min: 320, max: 1280, height: { min: 844, max: 844 } } }],
    contracts: [
        { id: 'root', kind: 'predicate', predicate: { op: 'compare', relation: 'le', left: { target: 'scrollExtent', field: 'inlineEnd' }, right: { environment: 'safeRight' } } }
    ] };
const frame = { viewport: 320, height: 844, documentWidth: 334, main: { x: 0, y: 56, width: 334.4, height: 788 }, overflowElements: ['div.list-actions'] };
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
test('invalid measurements are refused, not used as proof samples', () => {
    assert.throws(() => viewportObservation('dashboard', 'p', { ...frame, documentWidth: NaN }), /viewport/i);
});
test('modal keyboard capture reports background focus escape without fabricating a proof action', async () => {
    const { captureModalTabFocus } = await import('../src/browser-observations.mjs');
    const inside = { tag: 'button', inScope: true, offscreen: false, bounds: { x: 10, y: 10, width: 80, height: 30 } };
    const escaped = { ...inside, inScope: false };
    const samples = [inside, escaped, inside];
    let cursor = 0;
    const page = {
        evaluate: async () => cursor === 0 ? { present: true, modal: true, visible: true } : { width: 390, height: 844, step: samples[cursor - 1] },
        locator: () => ({ focus: async () => { throw Error('Should not steal focus'); } }),
        keyboard: { press: async (key) => { assert.equal(key, 'Tab'); cursor++; } }
    };
    const captured = await captureModalTabFocus(page, { steps: 3 });
    assert.equal(captured.passed, false);
    assert.equal(captured.steps.length, 3);
    assert.equal(Object.hasOwn(captured, 'observation'), false);
});
