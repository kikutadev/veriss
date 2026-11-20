import type { Rational } from './linear.mjs';
import type { LayoutAffine, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type ExactInterval = Pick<LayoutRange, 'minExact' | 'maxExact' | 'minInclusive' | 'maxInclusive'>;
export interface RegionRow {
    readonly range: ExactInterval;
    readonly heightRange?: ExactInterval;
    readonly region?: Pick<LayoutRegion, 'constraints'>;
}
export declare function rational(value: unknown): Rational;
export declare function numeral(value: string): string;
export declare function affine(expr: LayoutAffine): string;
export declare const and: (terms: readonly string[]) => string;
export declare const or: (terms: readonly string[]) => string;
export declare function interval(range: ExactInterval, variable: string): string[];
export declare function region(row: RegionRow): string;
export {};
