import type { Rational } from './linear.mjs';
import type { Affine2, Point, Region } from './region.mjs';
export interface AffineRectangle {
    readonly inlineStart: Affine2;
    readonly inlineSize: Affine2;
    readonly blockStart: Affine2;
    readonly blockSize: Affine2;
}
export interface WorkBudget {
    left: number;
}
export declare function occupancyFailure(region: Region, field: AffineRectangle, overlays: readonly AffineRectangle[], limit: Rational, budget: WorkBudget): Point | null;
