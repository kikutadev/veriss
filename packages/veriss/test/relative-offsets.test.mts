// Checklist D1: position: relative with px offsets. The box and its contents move by the offset (top over bottom, left
// over right in ltr); nothing else is laid out again. Percent offsets, and inline offsets in rtl, stay Unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const rects = (c: string, dir = 'ltr') => { const r = analyzeHTML(`<html lang="en" dir="${dir}"><body><div class="a"><div class="k"></div></div><div class="b"></div></body></html>`, {name: 'P', css: `*{margin:0}html,body{${g}}.a{display:grid;grid-template-columns:minmax(0,1fr);height:40px;padding:4px}.k{height:10px}.b{height:20px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b|k)$/.test(s.box)).map(s => { assert.ok(s.rect); return [s.box, [s.rect.inlineStart.constant, s.rect.blockStart.constant]]; })); };

test('px offsets move the box and its contents, not its siblings', () => {
  const base = rects('');
  assert.ok(typeof base !== 'string');
  const positions = (css: string, dir = 'ltr') => { const result = rects(css, dir); assert.ok(typeof result !== 'string'); return result; };
  assert.deepEqual(rects('.a{position:relative;top:7px;left:3px}'), {'.a': ['3', '7'], '.k': ['7', '11'], '.b': base['.b']});
  assert.deepEqual(positions('.a{position:relative;bottom:5px;right:2px}')['.a'], ['-2', '-5']);
  assert.deepEqual(positions('.a{position:relative;top:7px;bottom:100px}')['.a'], ['0', '7']); // top wins
  assert.deepEqual(positions('.a{position:relative;left:3px;right:100px}')['.a'], ['3', '0']); // left wins in ltr
  assert.equal(rects('.a{position:relative;top:10%}'), 'unknown');
  assert.deepEqual(positions('.a{position:relative;top:-4px;left:-9px}')['.a'], ['-9', '-4']);
  // rtl: block offsets are modeled, an inline one is not yet (the children are placed mirrored).
  const rtl = positions('.a{position:relative;top:7px}', 'rtl')['.a'];
  assert.ok(rtl);
  assert.deepEqual(rtl[1], '7');
  assert.equal(rects('.a{position:relative;left:3px}', 'rtl'), 'unknown');
});
