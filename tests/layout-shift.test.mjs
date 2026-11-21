// Layout shift on the L1 reference (models/layout/shift.mjs): every broken case of models/layout/shift-cases.mjs has a
// width in 320–1920px where an item present in both states moves (Z3: sat, with the width); every stable case has none
// (unsat). The browsers confirm the witnesses (e2e/layout-shift.spec.mjs).
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {layoutShift} from '../models/layout/shift.mjs';
import {shiftCases} from '../models/layout/shift-cases.mjs';
import {close} from '../models/layout/solve.mjs';

after(close);
test('broken state changes shift the layout; their corrected counterparts are proven stable', async () => {
  assert.ok(shiftCases.filter(c => c.expect === 'shift').length >= 10 && shiftCases.some(c => c.expect === 'stable'));
  for (const c of shiftCases) {
    const r = await layoutShift(c.before, c.after);
    assert.equal(r.shift ? 'shift' : 'stable', c.expect, `${c.name}: ${c.why}`);
    assert.equal(r.result, c.expect === 'shift' ? 'sat' : 'unsat', c.name);
    if (r.shift) { assert.ok(r.width >= 320 && r.width <= 1920, c.name); assert.ok(r.moved.length > 0, c.name); }
  }
});

test('a shift found only at some widths is found there, and the range matters', async () => {
  // Shrinking starts below 430px (200 + 10 + 200 + the 20px growth): a 1px move exists in the narrow range.
  const c = shiftCases.find(x => x.name === 'shrinking-sibling-grows');
  assert.equal((await layoutShift(c.before, c.after, {min: 320, max: 1920, atLeast: 1})).shift, true);
  // A centred group: the change moves the others only while there is room to centre in.
  const centred = shiftCases.find(x => x.name === 'centered-group-grows');
  const r = await layoutShift(centred.before, centred.after, {min: 1000, max: 1000});
  assert.equal(r.shift, true); assert.equal(r.width, 1000);
});

test('watching only the items that must not move', async () => {
  // The badge itself appears (not a shift of an existing item); only "a" (before it) is watched: it does not move.
  const c = shiftCases.find(x => x.name === 'badge-inserted');
  assert.equal((await layoutShift(c.before, c.after, {watch: ['a']})).shift, false);
  assert.equal((await layoutShift(c.before, c.after, {watch: ['b']})).shift, true);
});

// The engine agrees: each case whose change is one item's values is written as a :hover rule, and the engine reports
// E_LAYOUT_HOVER_SHIFT exactly where the reference finds a shift (a differential test of the engine's shift check).
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {toCSS, toHTML} from '../models/layout/spec.mjs';
test('the engine reports a :hover layout shift exactly where the reference finds one', () => {
  const cssOf = {basis: v => `flex-basis:${v}px`, height: v => `height:${v}px`, min: v => `min-width:${v}px`};
  let compared = 0;
  for (const c of shiftCases) {
    const {items: _a, ...restA} = c.before, {items: _b, ...restB} = c.after;
    if (JSON.stringify(restA) !== JSON.stringify(restB) || c.before.items.length !== c.after.items.length) continue;
    const diffs = c.before.items.flatMap((it, k) => Object.keys({...it, ...c.after.items[k]}).filter(f => JSON.stringify(it[f]) !== JSON.stringify(c.after.items[k][f])).map(f => [k, f, c.after.items[k][f]]));
    if (diffs.some(([, f]) => !cssOf[f]) || new Set(diffs.map(d => d[0])).size > 1) continue;
    const hover = diffs.length ? `.i${diffs[0][0]}:hover{${diffs.map(([, f, v]) => cssOf[f](v)).join(';')}}` : '';
    const r = analyzeHTML(`<html lang="en"><body>${toHTML(c.before)}</body></html>`, {name: 'P', viewport: {min: 320, max: 1920, height: {min: 600, max: 900}},
      css: `*{margin:0;padding:0;border:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${toCSS(c.before)}${hover}`});
    assert.notEqual(r.status, 'unknown', c.name);
    assert.equal(r.diagnostics.some(d => d.code === 'E_LAYOUT_HOVER_SHIFT'), c.expect === 'shift', `${c.name}: ${hover}`);
    compared++;
  }
  assert.ok(compared >= 12, `compared ${compared} cases`);
});
