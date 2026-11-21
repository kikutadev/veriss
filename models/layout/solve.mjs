// Evaluates the L1 reference (spec.mjs) with Z3: the border boxes at one container width, and whether a formula over
// W can be false in a range (a counterexample search). z3-solver comes from packages/veriss (the engine's dependency).
import {createRequire} from 'node:module';
const require = createRequire(new URL('../../packages/veriss/package.json', import.meta.url));
let api, shared;
export async function z3() { api ??= await require('z3-solver').init(); return api; }
// One context for every query (creating a context per query is the slow part).
export async function context() { shared ??= new (await z3()).Context('l1'); return shared; }
export async function close() { if (api) { await require('z3-solver').killThreads(api.em); api = undefined; shared = undefined; } }
export const toNumber = ({ n, d }) => Number(n) / Number(d);
export const smtNumber = v => { const r = typeof v === 'object' ? v : null; if (r) return `(/ ${r.n} ${r.d})`; const [i, f = ''] = String(v).split('.'); return f ? `(/ ${i}${f} 1${'0'.repeat(f.length)})` : `${i}.0`; };
const full = s => `${s.smt}\n${s.facts.map(f => `(assert ${f})`).join('\n')}`;

/** The boxes [{x, y, w, h, ok}] at container width W, each coordinate an exact rational {n, d}. */
export async function boxesAt(s, W) {
  const ctx = await context(), solver = new ctx.Solver();
  try {
    solver.fromString(`${full(s)}\n(assert (= W ${smtNumber(W)}))`);
    const r = await solver.check();
    if (r !== 'sat') throw new Error(`the L1 reference has no solution at W = ${W} (${r})`);
    const model = solver.model();
    const real = name => { const v = model.eval(ctx.Real.const(name), true).value(); return { n: v.numerator, d: v.denominator }; };
    const bool = name => String(model.eval(ctx.Bool.const(name), true)) === 'true';
    return Array.from({ length: s.count }, (_, k) => ({ x: real(`x_${k}`), y: real(`y_${k}`), w: real(`w_${k}`), h: real(`h_${k}`), ok: bool(`ok_${k}`) }));
  } finally { solver.release(); }
}

/** Searches W in [min, max] where `claim` (an SMT Bool over the spec's names) is false. Returns null (no counterexample) or W. */
export async function counterexample(s, claim, { min, max, extra = '' }) {
  const ctx = await context(), solver = new ctx.Solver();
  try {
    solver.set('timeout', 20000);
    solver.fromString(`${full(s)}\n${extra}\n(assert (>= W ${smtNumber(min)}))\n(assert (<= W ${smtNumber(max)}))\n(assert (not ${claim}))`);
    const r = await solver.check();
    if (r === 'unsat') return null;
    if (r !== 'sat') throw new Error(`Z3: ${r}`);
    const v = solver.model().eval(ctx.Real.const('W'), true).value();
    return { n: v.numerator, d: v.denominator };
  } finally { solver.release(); }
}
