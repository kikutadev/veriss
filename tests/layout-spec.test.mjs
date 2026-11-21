// The L1 coordinate reference (models/layout, docs/adr/0018-coordinate-subset.md): hand-computed boxes, and the engine
// against the reference over the whole width range (for each region the engine reports, Z3 finds no width where the
// engine's affine box differs from the reference). A broken reference must be caught (the comparison is not vacuous).
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';
import {affine, region} from '../packages/veriss/src/layout/smt.mjs';
import {spec, toCSS, toHTML} from '../models/layout/spec.mjs';
import {boxesAt, close, context, toNumber} from '../models/layout/solve.mjs';
import {randomGrid, randomFlex} from '../models/layout/random.mjs';

after(close);
const round = b => [b.x, b.y, b.w, b.h].map(toNumber).map(v => Math.round(v * 1000) / 1000);

test('L1 reference: hand-computed grid and flex boxes', async () => {
  const g = {display: 'grid', columns: [{px: 100}, {fr: 1}, {fr: 2}], rows: [{px: 40}, {px: 30}], columnGap: 10, rowGap: 5,
    items: [{column: [1, 2], row: [1, 2]}, {column: [2, 4], row: [1, 3]}, {column: [3, 4], row: [2, 3], width: 20, justify: 'center'}]};
  // W 430: fr space 430 - 100 - 2 * 10 = 310, 1fr = 310 / 3.
  assert.deepEqual((await boxesAt(spec(g), 430)).map(round), [[0, 0, 100, 40], [110, 0, 320, 75], [316.667, 45, 20, 30]]);
  // A flex factor sum below 1 takes that share of the free space (CSS Grid §12.7.1): 0.5fr of 300 is 150.
  assert.deepEqual((await boxesAt(spec({display: 'grid', columns: [{fr: 0.5}], rows: [{px: 10}], items: [{column: [1, 2], row: [1, 2]}]}), 300)).map(round), [[0, 0, 150, 10]]);
  const f = {display: 'flex', height: 50, gap: 10, justify: 'space-between',
    items: [{basis: 100, grow: 1}, {basis: 50, grow: 2, align: 'center', height: 20}, {basis: 80, shrink: 1, min: 60}]};
  // W 400: free 150 by grow 1 : 2 : 0.
  assert.deepEqual((await boxesAt(spec(f), 400)).map(round), [[0, 0, 150, 50], [160, 15, 150, 20], [320, 0, 80, 50]]);
  // W 200: 50 too much, shrunk by shrink x basis (100 : 50 : 80); the third stays above its min 60.
  assert.deepEqual((await boxesAt(spec(f), 200)).map(round), [[0, 0, 78.261, 50], [88.261, 15, 39.13, 20], [137.391, 0, 62.609, 50]]);
  // W 160: the third would go below 60, so it freezes at 60 and the others share the rest (water level t).
  const [a, b, c] = (await boxesAt(spec(f), 160)).map(round);
  assert.equal(c[2], 60); assert.equal(Math.round((a[2] + b[2] + c[2]) * 1000) / 1000, 140); assert.equal(Math.round(a[2] / b[2] * 1000) / 1000, 2);
  // W 100: 80 to fill; the third stays at 60 and the others share 20 at 2 : 1.
  assert.deepEqual((await boxesAt(spec(f), 100)).map(round).map(r => r[2]), [13.333, 6.667, 60]);
  // W 60: 40 to fill is below the floor (0 + 0 + 60): every item at its floor, overflowing from the start.
  assert.deepEqual((await boxesAt(spec(f), 60)).map(round).map(r => [r[0], r[2]]), [[0, 0], [10, 0], [20, 60]]);
});

test('L1 reference: outside the subset is refused, not approximated', () => {
  for (const c of [{display: 'flex', height: 10, items: [{basis: 10, shrink: 0.5}]}, {display: 'flex', height: 10, items: [{basis: 10, min: 20}]},
    {display: 'grid', columns: [{px: 10}], rows: [{px: 10}], items: [{column: [1, 3], row: [1, 2]}]},
    {display: 'grid', columns: [{px: 10}], rows: [{px: 10}], items: [{column: [1, 2], row: [1, 2], justify: 'center'}]}])
    assert.throws(() => spec(c), /outside L1/, JSON.stringify(c));
});

// The engine's boxes for a configuration: the container is the body's only child, as wide as the viewport.
const viewport = {min: 1, max: 800, height: {min: 600, max: 900}};
const engine = c => analyzeHTML(`<html lang="en"><body>${toHTML(c)}</body></html>`, {name: 'P', viewport,
  css: `*{margin:0;padding:0;border:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${toCSS(c)}`});
// Z3: is there a width in this region where the engine's box k differs from the reference? (positions only where ok_k)
async function differs(s, row, k, smtText = `${s.smt}\n${s.facts.map(f => `(assert ${f})`).join('\n')}`) {
  const ctx = await context(), solver = new ctx.Solver();
  try {
    solver.set('timeout', 20000);
    const r = row.rect;
    solver.fromString(`${smtText}\n(declare-const width Real)\n(declare-const height Real)\n(assert (= W width))\n(assert ${region(row)})
(assert (not (and (= w_${k} ${affine(r.inlineSize)}) (= h_${k} ${affine(r.blockSize)}) (=> ok_${k} (and (= x_${k} ${affine(r.inlineStart)}) (= y_${k} ${affine(r.blockStart)}))))))`);
    const result = await solver.check();
    if (result === 'unknown') throw new Error('Z3 timed out');
    return result === 'sat' ? solver.model().eval(ctx.Real.const('width'), true).toString() : null;
  } finally { solver.release(); }
}
const rowsOf = (report, k) => (report.sizes ?? []).filter(row => row.box === `.i${k}` && row.rect);

for (const [kind, make] of [['grid', randomGrid], ['flex', randomFlex]]) {
  test(`L1 reference = engine over the whole width range (${kind}, 40 random configurations)`, async t => {
    let compared = 0, unknown = 0;
    const misses = [];
    for (let seed = 1; seed <= 40; seed++) {
      const c = make(seed), s = spec(c), report = engine(c);
      if (report.status === 'unknown') { unknown++; continue; }
      for (let k = 0; k < c.items.length; k++) for (const row of rowsOf(report, k)) {
        compared++;
        const w = await differs(s, row, k);
        if (w) misses.push(`seed ${seed} item ${k}: differs at width ${w}\n  ${toCSS(c)}`);
      }
    }
    t.diagnostic(`${compared} engine regions compared with the reference; ${unknown} configurations Unknown in the engine`);
    assert.equal(misses.slice(0, 5).join('\n'), '');
    // The comparison covers most configurations (the rest the engine leaves Unknown, which is sound).
    assert.ok(compared > 40, `compared ${compared} regions, ${unknown} configurations Unknown in the engine`);
  });
}

test('a broken reference is caught by the engine comparison (the comparison is not vacuous)', async () => {
  const c = {display: 'grid', columns: [{px: 50}, {fr: 1}, {fr: 3}], rows: [{px: 20}], items: [{column: [2, 3], row: [1, 2]}]};
  const s = spec(c), report = engine(c), [row] = rowsOf(report, 0);
  assert.ok(row, 'the engine lays the item out');
  assert.equal(await differs(s, row, 0), null);
  // Broken: every fr track takes all the free space (as if the factors summed below 1).
  const broken = s.smt.split('\n').map(line => line.startsWith('(assert (= frUnit ') ? '(assert (= frUnit Fpos))' : line).join('\n');
  assert.notEqual(broken, s.smt);
  assert.notEqual(await differs(s, row, 0, `${broken}\n${s.facts.map(f => `(assert ${f})`).join('\n')}`), null);
});
