import type { Rational } from './linear.mjs';
import type { Affine2 } from './region.mjs';
import type { SharedTracks } from './engine-types.mjs';
export declare const gapSize: (value: string, parent?: {
    gap: Rational;
} | null) => Rational;
export declare const trackArea: (values: readonly Affine2[], gap: Rational | Affine2, start: number, span: number) => Affine2;
/** A child borrows the actual track vector, never the parent's fr definitions. */
export declare function trackSlice<Box>(values: readonly Affine2[], gap: Rational, box: Box, start: number, span: number): SharedTracks<Box>;
/** Insets affect outer tracks; gap differences are centered on shared lines.
 * Keep signed affine lengths here. The engine splits out negative regions as
 * unknown instead of assuming a CSS track-collapse algorithm. */
export declare function inheritTracks(parent: Pick<SharedTracks<unknown>, "gap" | "values">, gap: Rational, before: Rational, after: Rational): Affine2[];
