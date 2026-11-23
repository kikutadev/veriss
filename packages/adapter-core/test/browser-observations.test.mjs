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
test('a modal keyboard contract fails for background focus, not for a contained cycle', async () => {
    const { modalFocusObservation, captureModalTabFocus } = await import('../src/browser-observations.mjs');
    const inside = { ...focus, inScope: true, offscreen: false };
    const escaped = { ...inside, inScope: false };
    assert.equal(modalFocusObservation('dialog-open', 'p', 390, 844, [inside, inside]).passed, true);
    assert.equal(modalFocusObservation('dialog-open', 'p', 390, 844, [inside, escaped]).passed, false);
    assert.equal(modalFocusObservation('dialog-open', 'p', 390, 844, [{ ...inside, offscreen: true }]).passed, false);
    assert.throws(() => modalFocusObservation('dialog-open', 'p', 390, 844, [{ ...escaped, tag: 'body' }]), /Indeterminate document focus/);
    assert.equal(modalFocusObservation('dialog-open', 'p', 390, 844, [{ ...escaped, tag: 'body' }, escaped]).passed, false);
    const events = [];
    let cursor = 0;
    const page = {
        evaluate: async (fn, arg) => {
            events.push({ fn: String(fn).slice(0, 70), arg });
            if (events.length === 1)
                return { present: true, modal: true, visible: true };
            return { width: 390, height: 844, step: cursor++ === 1 ? escaped : inside };
        },
        locator: () => ({ focus: async () => { throw Error('Should not steal the modal focus'); } }),
        keyboard: { press: async (key) => { assert.equal(key, 'Tab'); } }
    };
    const captured = await captureModalTabFocus(page, { state: 'dialog-open', profile: 'p', scope: '[role=dialog]', steps: 3 });
    assert.equal(captured.observation.passed, false);
    assert.equal(captured.steps.length, 3);
});
test('role expectations classify all disabled and at least one enabled, with missing/ambiguous controls inconclusive', async () => {
    const { controlAvailabilityObservation } = await import('../src/browser-observations.mjs');
    const controls = [{ id: 'edit', matched: 8, enabled: 0, blocked: 8, uncertain: 0 }, { id: 'status', matched: 8, enabled: 7, blocked: 1, uncertain: 0 }];
    const viewer = controlAvailabilityObservation('viewer-users', 'p', 390, 844, [controls[0]], { edit: 'all-blocked' });
    assert.equal(viewer.passed, true);
    const admin = controlAvailabilityObservation('admin-users', 'p', 390, 844, controls, { edit: 'some-enabled', status: 'some-enabled' });
    assert.equal(admin.passed, false, 'all-disabled edit must fail admin expectation');
    const adminOk = controlAvailabilityObservation('admin-users', 'p', 390, 844, [{ ...controls[0], enabled: 8, blocked: 0 }, controls[1]], { edit: 'some-enabled', status: 'some-enabled' });
    assert.equal(adminOk.passed, true);
    assert.equal(controlAvailabilityObservation('admin-users', 'p', 390, 844, [{ ...controls[0], enabled: 8, blocked: 0 }], { edit: 'all-enabled' }).passed, true);
    assert.equal(controlAvailabilityObservation('admin-users', 'p', 390, 844, [{ ...controls[0], enabled: 7, blocked: 1 }], { edit: 'all-enabled' }).passed, false);
    const leaked = controlAvailabilityObservation('viewer-users', 'p', 390, 844, [{ ...controls[0], enabled: 1, blocked: 7 }], { edit: 'all-blocked' });
    assert.equal(leaked.passed, false);
    assert.throws(() => controlAvailabilityObservation('viewer-users', 'p', 390, 844, [{ ...controls[0], matched: 0, blocked: 0 }], { edit: 'all-blocked' }), /inconclusive/i);
    assert.throws(() => controlAvailabilityObservation('viewer-users', 'p', 390, 844, [{ ...controls[0], enabled: 0, blocked: 7, uncertain: 1 }], { edit: 'all-blocked' }), /inconclusive/i);
    assert.throws(() => controlAvailabilityObservation('viewer-users', 'p', 390, 844, [{ ...controls[0], matched: 8, enabled: 0, blocked: 9 }], { edit: 'all-blocked' }), /Invalid/i);
});
