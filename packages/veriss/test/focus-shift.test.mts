type Report = ReturnType<typeof analyzeHTML>;
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A :focus rule that changes the size moves what follows (W_LAYOUT_FOCUS_SHIFT).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (focus: string) => analyzeHTML('<html lang="en"><body><main class="p"><h1 class="t" aria-label="T"></h1><a class="l" href="/x" aria-label="X"></a><div class="next"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff}.t{height:10px}.l{display:block;height:30px;background:#246;outline:2px solid #000}.next{height:20px}${focus}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true});
const shifts = (report: Report) => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_FOCUS_SHIFT').map(w => [w.box, 'field' in w ? w.field : undefined, 'delta' in w ? w.delta : undefined]);

test('a :focus rule that grows the box moves the next one; outline and color do not', () => {
  assert.deepEqual(shifts(run('.l:focus{height:36px}')), [['.next', 'blockStart', '6']]);
  assert.deepEqual(shifts(run('.l:focus{outline:3px solid #f00}')), []);
  assert.deepEqual(shifts(run('.l:focus{background:#000}')), []);
});
