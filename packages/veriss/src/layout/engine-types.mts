// Internal layout geometry shared by the solver modules.
import type { Affine2 } from './region.mjs';
import type { Rational } from './linear.mjs';

export type Axis = 'inline' | 'block';
export interface Dimensions { inline: Affine2; block: Affine2 }
export interface SharedTracks<Box> {
  values: Affine2[];
  gap: Rational;
  box: Box;
  startLine: number;
}
