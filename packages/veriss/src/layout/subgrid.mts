// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import type { Rational } from './linear.mjs';
import type { Affine2 } from './region.mjs';
import type { SharedTracks } from './engine-types.mjs';
import { q, sub, div, mul } from './linear.mjs';
import { scalar, asAffine, sum, diff, times } from './region.mjs';
import { px } from './css.mjs';

export const gapSize = (value: string, parent?: { gap: Rational } | null): Rational => value === 'normal' ? parent?.gap ?? q(0) : px(value);
export const trackArea = (values: readonly Affine2[], gap: Rational | Affine2, start: number, span: number) =>
  sum(values.slice(start, start + span).reduce(sum, scalar(0)), times(asAffine(gap), q(Math.max(0, span - 1))));

/** A child borrows the actual track vector, never the parent's fr definitions. */
export function trackSlice<Box>(values: readonly Affine2[], gap: Rational, box: Box, start: number, span: number): SharedTracks<Box> {
  return { values: values.slice(start, start + span), gap, box, startLine: start + 1 };
}

/** Insets affect outer tracks; gap differences are centered on shared lines.
 * Keep signed affine lengths here. The engine splits out negative regions as
 * unknown instead of assuming a CSS track-collapse algorithm. */
export function inheritTracks(parent: Pick<SharedTracks<unknown>, "gap" | "values">, gap: Rational, before: Rational, after: Rational) {
  const half = scalar(div(sub(parent.gap, gap), q(2))), last = parent.values.length - 1;
  return parent.values.map((value, index) => {
    const leading = index === 0 ? scalar(before) : half;
    const trailing = index === last ? scalar(after) : half;
    // Internal edges expand when the new gutter is smaller than the parent's.
    return sum(value, sum(index === 0 ? diff(scalar(0), leading) : leading,
      index === last ? diff(scalar(0), trailing) : trailing));
  });
}
