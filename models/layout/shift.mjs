// Layout shift between two states on the L1 reference: does any item present in both states change its start position
// (x, y) for some container width in a range? Both states are laid out at the same W in one Z3 query.
//   unsat: no width moves an item (no layout shift, CLS 0 from this change); sat: a counterexample width.
import {spec, namespaced} from './spec.mjs';
import {context, smtNumber} from './solve.mjs';

const idOf = (c, k) => String(c.items[k].id ?? k);

// atLeast: only a move of at least that many px counts (a witness the browsers can show past their 1/64px rounding).
export async function layoutShift(before, after, {min = 320, max = 1920, watch, atLeast = 0} = {}) {
  const a = namespaced(spec(before), 'a'), b = namespaced(spec(after), 'b');
  const index = c => new Map(c.items.map((_, k) => [idOf(c, k), k]));
  const ia = index(before), ib = index(after);
  const ids = (watch ?? [...ia.keys()]).filter(id => ia.has(id) && ib.has(id));
  if (!ids.length) throw new Error('no item is present in both states');
  const apart = (p, q) => atLeast > 0 ? `(or (>= (- ${p} ${q}) ${smtNumber(atLeast)}) (>= (- ${q} ${p}) ${smtNumber(atLeast)}))` : `(not (= ${p} ${q}))`;
  const moved = id => `(or ${apart(a.name(`x_${ia.get(id)}`), b.name(`x_${ib.get(id)}`))} ${apart(a.name(`y_${ia.get(id)}`), b.name(`y_${ib.get(id)}`))})`;
  const ctx = await context(), solver = new ctx.Solver();
  try {
    solver.set('timeout', 20000);
    solver.fromString(['(declare-const W Real)', a.smt, b.smt, ...[...a.facts, ...b.facts].map(f => `(assert ${f})`),
      `(assert (>= W ${smtNumber(min)}))`, `(assert (<= W ${smtNumber(max)}))`, `(assert (or ${ids.map(moved).join(' ')}))`].join('\n'));
    const result = await solver.check();
    if (result === 'unknown') throw new Error(`Z3: ${solver.reasonUnknown()}`);
    if (result === 'unsat') return { shift: false, result };
    const m = solver.model(), real = n => { const v = m.eval(ctx.Real.const(n), true).value(); return Number(v.numerator) / Number(v.denominator); };
    const W = real('W');
    const movedIds = ids.filter(id => ['x', 'y'].some(axis => Math.abs(real(a.name(`${axis}_${ia.get(id)}`)) - real(b.name(`${axis}_${ib.get(id)}`))) > 0));
    return { shift: true, result, width: W, moved: movedIds.map(id => ({ id, before: { x: real(a.name(`x_${ia.get(id)}`)), y: real(a.name(`y_${ia.get(id)}`)) }, after: { x: real(b.name(`x_${ib.get(id)}`)), y: real(b.name(`y_${ib.get(id)}`)) } })) };
  } finally { solver.release(); }
}
