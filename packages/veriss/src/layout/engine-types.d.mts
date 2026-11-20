import type { Affine2 } from './region.mjs';
import type { Rational } from './linear.mjs';
export type Axis = 'inline' | 'block';
export interface Dimensions {
    inline: Affine2;
    block: Affine2;
}
export interface SharedTracks<Box> {
    values: Affine2[];
    gap: Rational;
    box: Box;
    startLine: number;
}
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type DimensionValue = Rational | Affine2;
