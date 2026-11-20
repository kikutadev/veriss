import type { Affine2 } from './region.mjs';
import type { Dimensions } from './engine-types.mjs';
/** Fixed coefficients only; no evaluation, variable products or intrinsic sizing. */
export declare function insetLength(text: string, basis: Affine2): Affine2;
export declare function absoluteOrigin(style: Record<'left' | 'right' | 'top' | 'bottom', string>, containing: Dimensions, size: Dimensions): Dimensions;
