import type { Rational, RationalInput } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { FlexItemModel } from './flex.mjs';
import type { GridTrack } from './grid.mjs';
import type { Axis } from './engine-types.mjs';
type DimensionValue = Affine2 | RationalInput;
type EngineTrack = GridTrack | {
    fixed: true;
    content?: never;
    autoTable?: never;
    weight?: never;
    min?: never;
    minCap?: never;
    autoMin?: never;
    auto?: never;
};
interface TrackSolution {
    region: Region;
    values: Affine2[];
    required: Affine2;
}
interface MainMargins {
    autoStart: boolean;
    autoEnd: boolean;
}
type ConstantFlexItem = Extract<FlexItemModel, {
    base: Rational;
}> & {
    marginMain?: Rational;
    marginMainAffine?: Affine2;
};
interface ResolvedFlexItem extends MainMargins {
    base: Affine2;
    minimum: Affine2;
    maximum?: Affine2 | null | undefined;
    grow: Rational;
    shrink: Rational;
    automaticBelowBase: boolean;
    content?: boolean;
    percentItem?: boolean;
    innerShare?: Rational | null;
    innerBase?: Rational;
    baseBelowMinimum?: boolean;
    baseAtLeastMinimum?: boolean;
}
interface FlexLineSolution {
    region: Region;
    values: Affine2[];
    free: Affine2;
    mode: 'grow' | 'shrink';
}
interface LineBreak {
    region: Region;
    start: number;
    lines: number[][];
}
interface LineOffsets {
    region: Region;
    starts: Affine2[] | null;
}
export declare const scaleGap: (gap: DimensionValue, count: number) => Affine2;
export declare const sameSlope: (a: Affine2, b: Affine2) => boolean;
export declare const constantLess: (a: Affine2, b: Affine2) => boolean;
export declare const maximumConstant: (a: Affine2, b: Affine2) => Affine2;
export declare const clamp: (region: Region, value: Affine2) => {
    region: Region;
    value: Affine2;
}[];
export declare function createTrackSolver(bounded: <T>(values: T[]) => T[]): {
    flex: (region: Region, available: Affine2, definitions: readonly EngineTrack[], gap: DimensionValue, bases: readonly Affine2[], stretchAuto: boolean) => TrackSolution[];
    resolveFlexLine: (region: Region, available: Affine2, items: readonly ResolvedFlexItem[], gap: DimensionValue) => FlexLineSolution[];
    constantItem: (item: ConstantFlexItem) => ResolvedFlexItem;
    breakLines: (region: Region, available: Affine2, hypothetical: readonly DimensionValue[], gap: DimensionValue) => LineBreak[];
    mainStarts: (region: Region, values: readonly Affine2[], free: Affine2, flags: readonly MainMargins[], gap: DimensionValue, main: Axis, justify: string) => LineOffsets[];
};
export {};
