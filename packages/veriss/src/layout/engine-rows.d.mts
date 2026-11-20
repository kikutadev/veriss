import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { GridTrack, PlacedGridChild } from './grid.mjs';
import type { createGridItemAllocator } from './engine-grid-items.mjs';
import type { createEdgeSolver } from './engine-edges.mjs';
import type { createTrackSolver } from './engine-tracks.mjs';
import type { SolverBox, SolverStyle, SolverChild, ChildState, SolverAncestor, SolveBox } from './engine-solver-types.mjs';
import type { DimensionValue } from './engine-types.mjs';
type PlacedChild = PlacedGridChild<SolverBox, SolverStyle> & Pick<SolverChild, 'inherited'>;
type RowTrack = (GridTrack & {
    edges?: Rational;
    definite?: never;
}) | {
    definite: Affine2;
    auto?: never;
    weight?: never;
    autoMin?: never;
    fixed?: never;
    edges?: never;
};
type RowSolution = {
    region: Region;
    values: Affine2[];
    required: Affine2;
    raised?: Affine2;
};
export declare function measureGridRows({ placed, style, sharedRows, children, knownBlock, blockFlowPercent, ancestors, solve, bounded, resolvedGap, flex, allocator, minBlock }: {
    placed: readonly PlacedChild[];
    style: SolverStyle;
    sharedRows?: {
        values: Affine2[];
        gap: DimensionValue;
    } | undefined;
    children: ChildState;
    knownBlock: Affine2 | null;
    blockFlowPercent: Affine2 | null;
    ancestors: readonly SolverAncestor[];
    solve: SolveBox;
    bounded: <T>(values: T[]) => T[];
    resolvedGap: ReturnType<typeof createEdgeSolver>['resolvedGap'];
    flex: ReturnType<typeof createTrackSolver>['flex'];
    allocator: ReturnType<typeof createGridItemAllocator>;
    minBlock: ((region: Region) => {
        region: Region;
        value: Affine2;
    }[]) | null;
}): {
    rows: RowTrack[];
    rowGap: DimensionValue;
    gaps: Affine2;
    layouts: Generator<RowSolution, any, any>;
};
export {};
