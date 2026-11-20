import type { Rational, RationalInput, Interval } from './linear.mjs';
export interface Affine2 {
    readonly x: Rational;
    readonly y: Rational;
    readonly b: Rational;
}
export interface Point {
    readonly x: Rational;
    readonly y: Rational;
}
export interface HalfPlane {
    readonly slack: Affine2;
    readonly strict: boolean;
}
export interface Region {
    readonly vertices: readonly Point[];
    readonly constraints: readonly HalfPlane[];
}
export type RegionRelation = '>=' | '>' | '<=' | '<' | '=';
export declare const scalar: (value: RationalInput) => Affine2;
export declare const asAffine: (value: Affine2 | RationalInput) => Affine2;
export declare const width: {
    x: Rational;
    y: Rational;
    b: Rational;
};
export declare const height: {
    x: Rational;
    y: Rational;
    b: Rational;
};
export declare const sum: (a: Affine2, b: Affine2) => Affine2;
export declare const times: (a: Affine2, k: Rational) => Affine2;
export declare const diff: (a: Affine2, b: Affine2) => Affine2;
export declare const evaluate: (a: Affine2, p: Point) => Rational;
export declare const affine: (a: Affine2) => {
    heightCoefficient?: string;
    coefficient: string;
    constant: string;
};
export declare const sample: (region: Region) => Point;
export declare function rectangle(inline: Pick<Interval, "min" | "max">, block: Pick<Interval, "min" | "max">): Region;
/** Exact clipping of a bounded convex region by slack >= 0 (or > 0). */
export declare function clip(region: Region, slack: Affine2, strict?: boolean): Region | null;
export declare function partition(region: Region, slack: Affine2, relation: RegionRelation): {
    yes: Region[];
    no: Region[];
};
export declare function projection(region: Region, axis: "x" | "y"): {
    min: number;
    max: number;
    minInclusive: boolean;
    maxInclusive: boolean;
    minExact: string;
    maxExact: string;
};
export declare function serialize(region: Region): {
    vertices: {
        width: string;
        height: string;
    }[];
    constraints: ({
        heightCoefficient?: string;
        coefficient: string;
        constant: string;
    } & {
        strict: boolean;
    })[];
};
