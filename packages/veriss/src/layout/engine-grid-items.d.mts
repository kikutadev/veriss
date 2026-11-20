import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { createEdgeSolver } from './engine-edges.mjs';
import type { SolverBox, SolverStyle, SolverChild } from './engine-solver-types.mjs';
import type { DimensionValue, Side } from './engine-types.mjs';
import type { PlacedGridChild } from './grid.mjs';
type PlacedChild = PlacedGridChild<SolverBox, SolverStyle> & Pick<SolverChild, 'inherited'>;
interface InlineOffset {
    region: Region;
    offset: Affine2;
    inline?: Affine2;
    justified?: boolean;
}
export declare function createGridItemAllocator({ cs, columnGap, box, style, placed, block, bounded, marginValue, hasViewportMargin, isZeroAffine, edgeValue }: {
    cs: {
        values: Affine2[];
    };
    columnGap: DimensionValue;
    box: SolverBox;
    style: SolverStyle;
    placed: readonly PlacedChild[];
    block: boolean;
    bounded: <T>(values: T[]) => T[];
} & Pick<ReturnType<typeof createEdgeSolver>, 'marginValue' | 'hasViewportMargin' | 'isZeroAffine' | 'edgeValue'>): {
    areaInline: (item: PlacedChild) => Affine2;
    marginOf: (item: PlacedChild, side: Side) => Affine2;
    marginInline: (item: PlacedChild) => Affine2;
    marginBlock: (item: PlacedChild) => Affine2;
    itemInline: (item: PlacedChild) => Affine2;
    autoMargins: (item: PlacedChild) => boolean;
    autoOffsets: (item: PlacedChild, region: Region) => InlineOffset[];
    childColumns: (item: PlacedChild) => Omit<import("./engine-types.mjs").SharedTracks<SolverBox>, "gap"> & {
        gap: DimensionValue;
    };
    gridAlign: (item: PlacedChild) => {
        definiteBlock?: never;
        alignBlock?: never;
    } | {
        definiteBlock: boolean;
        alignBlock?: never;
    } | {
        alignBlock: Rational;
        definiteBlock?: never;
    };
    justified: (item: PlacedChild, region: Region) => InlineOffset[] | null;
};
export {};
