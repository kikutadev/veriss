export interface Rational {
    readonly n: bigint;
    readonly d: bigint;
}
export type RationalInput = Rational | string | number | bigint;
export interface Affine1 {
    readonly a: Rational;
    readonly b: Rational;
}
export interface Interval {
    readonly min: Rational;
    readonly max: Rational;
    readonly minInclusive: boolean;
    readonly maxInclusive: boolean;
}
export declare function q(value: RationalInput): Rational;
export declare const add: (x: Rational, y: Rational) => Rational;
export declare const sub: (x: Rational, y: Rational) => Rational;
export declare const mul: (x: Rational, y: Rational) => Rational;
export declare const div: (x: Rational, y: Rational) => Rational;
export declare const cmp: (x: Rational, y: Rational) => -1 | 0 | 1;
export declare const number: (x: Rational) => number;
export declare const exact: (x: Rational) => string;
export declare const constant: (value: RationalInput) => Affine1;
export declare const plus: (x: Affine1, y: Affine1) => Affine1;
export declare const minus: (x: Affine1, y: Affine1) => Affine1;
export declare const scale: (x: Affine1, factor: Rational) => Affine1;
export declare const at: (x: Affine1, width: Rational) => Rational;
export declare const expression: (x: Affine1) => {
    coefficient: string;
    constant: string;
};
export declare function intersect(x: Interval, y: Interval): Interval | null;
export declare function contains(range: Interval, point: Rational): boolean;
export declare const midpoint: (range: Interval) => Rational;
export declare const serializeRange: (range: Interval) => {
    min: number;
    max: number;
    minInclusive: boolean;
    maxInclusive: boolean;
    minExact: string;
    maxExact: string;
};
/** The complete subset of a finite interval where affine slack is strictly negative. */
export declare function negativeRange(slack: Affine1, range: Interval): Interval | null;
export declare function cells(domain: Interval, boundaries: readonly Rational[]): Interval[];
