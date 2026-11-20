// The CLI summary of a layout report (src/summary.mjs, moved from isle's lib/layout-summary.mjs). The report itself is
// unchanged; the summary is presentation only. (The CLI examples that print it are tested in isle.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLayoutSummary, explanationLines } from '../src/summary.mjs';
test('explanation text is bounded and treats CSS strings as plain text', () => {
    const css = { file: 'a.css', line: 1, selector: '.x', specified: '<img onerror=x>' };
    const facts = Array.from({ length: 9 }, (_, i) => ({ path: 'P', box: '.x', property: `p${i}`, value: '1px', origin: 'author', css }));
    const lines = explanationLines({ version: 1, available: { facts }, required: { facts: [] } }, 4);
    assert.equal(lines.length, 1);
    assert.ok(lines[0]);
    assert.match(lines[0], /… 5 more$/);
    assert.ok(lines[0].includes('<img onerror=x>'));
    assert.deepEqual(explanationLines(undefined), []);
    assert.match(formatLayoutSummary({ status: 'verified', diagnostics: [] }, { file: 'f', source: '' }), /verified/);
});
