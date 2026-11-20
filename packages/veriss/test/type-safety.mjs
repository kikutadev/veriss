// Compile-only regression cases. The function is never called.
import { add, q, constant } from '../src/layout/linear.mjs';
import { scalar, width, rectangle, partition } from '../src/layout/region.mjs';
import { occupancyFailure } from '../src/layout/occupancy.mjs';
import { predicateRegions } from '../src/layout/relational-predicate.mjs';
export function checkTypeBoundaries() {
    // @ts-expect-error a floating point number is not an exact rational
    add(q(1), 2);
    // @ts-expect-error a 1D affine expression is not a 2D affine expression
    partition(rectangle({ min: q(0), max: q(1) }, { min: q(0), max: q(1) }), constant(0), '>=');
    const r = rectangle({ min: q(0), max: q(1) }, { min: q(0), max: q(1) });
    // @ts-expect-error occupancy requires both axes, including block size
    occupancyFailure(r, { inlineStart: scalar(0), inlineSize: width, blockStart: scalar(0) }, [], q(1), { left: 100 });
    // @ts-expect-error named use must be expanded before region proof
    const unresolved = { op: 'use', name: 'x', bind: {} };
    // @ts-expect-error an unsupported comparison must not enter the evaluator
    predicateRegions({ op: 'compare', relation: 'approximately', left: '1', right: '1' }, r, new Map(), { id: 'p', viewport: { min: 0, max: 1, height: { min: 0, max: 1 } } }, true, { left: 100 });
    return unresolved;
}
