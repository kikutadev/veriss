import type { Rational } from './linear.mjs';
import type { Affine2, Point, Region } from './region.mjs';
import type { LayoutRectangle, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
interface FontStyle {
    'font-size'?: string;
}
interface ShiftRow {
    path: string;
    rect?: LayoutRectangle | null;
    layoutRect?: LayoutRectangle | null;
    $shown?: {
        region: Region;
    };
}
export declare const unitContext: {
    rootFontSize: Rational | null;
    heightKnown: boolean;
};
export declare function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: Region, style?: FontStyle): {
    region: Region;
    value: Affine2;
}[];
export declare function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: null, style?: FontStyle): {
    region: null;
    value: Affine2;
}[];
export declare function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: Region | null, style?: FontStyle): {
    region: Region | null;
    value: Affine2;
}[];
export declare const layoutRectangle: (row: Pick<ShiftRow, "layoutRect" | "rect">) => LayoutRectangle | null | undefined;
interface RegionRow extends ShiftRow {
    range: LayoutRange;
    heightRange?: LayoutRange;
    region?: LayoutRegion;
}
export declare function matchLayoutRectangles(rows: readonly RegionRow[], untransformed: readonly RegionRow[], complete: boolean): (LayoutRectangle | null)[];
/** First counterexample in the established axis/vertex order, using exact
 * arithmetic. The caller decides how missing geometry is reported. */
export declare function firstStartMove(before: LayoutRectangle, after: LayoutRectangle, shared: Region): {
    field: "inlineStart" | "blockStart";
    v: Point;
    delta: Rational;
} | undefined;
export declare function layoutStartMoves<Row extends ShiftRow>(before: readonly Row[], after: readonly Row[], keep?: (row: Row) => boolean, within?: readonly Region[] | null): {
    undecided: Row;
    moves?: never;
} | {
    undecided?: never;
    moves: {
        row: Row;
        shared: Region;
        field: 'inlineStart' | 'blockStart';
        v: Point;
        delta: Rational;
    }[];
};
export declare function shiftScoreBound<Row extends ShiftRow>(before: readonly Row[], after: readonly Row[], keep: (row: Row) => boolean, p: Point): number | null;
export declare function sweptBound<Row extends ShiftRow>(before: readonly Row[], after: readonly Row[], p: Point): {
    impact: number;
    distance: number;
} | null;
export declare function length(value: string, parent: Affine2 | null | undefined, style?: FontStyle): Affine2;
export {};
