import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { GridTrack } from './grid.mjs';
import type { createTrackSolver } from './engine-tracks.mjs';
import type { createEdgeSolver } from './engine-edges.mjs';
import type { SolverBox, SolverStyle } from './engine-solver-types.mjs';
import type { DimensionValue } from './engine-types.mjs';
type SharedColumns = {
    values: Affine2[];
    gap: DimensionValue;
};
type ColumnTrack = (GridTrack & {
    edges?: Rational;
}) | {
    definite: Affine2;
    fixed?: never;
    edges?: never;
};
interface ColumnPlan {
    region: Region;
    columns: ColumnTrack[];
    fitItems?: number;
}
interface JustifiedColumns {
    region: Region;
    values: Affine2[];
    required: Affine2;
    shift: {
        lead: Affine2;
        extra: Affine2;
    } | null;
}
export declare function normalizeGridPercentages(style: SolverStyle, contentInline: Affine2, knownBlock: Affine2 | null): SolverStyle;
export declare function planGridColumns({ box, style, geometryRegion, contentInline, sharedColumns, resolvedGap }: {
    box: SolverBox;
    style: SolverStyle;
    geometryRegion: Region;
    contentInline: Affine2;
    sharedColumns?: SharedColumns | undefined;
    resolvedGap: ReturnType<typeof createEdgeSolver>['resolvedGap'];
}): ColumnPlan[];
export declare function resolveGridColumns({ plan, style, contentInline, sharedColumns, resolvedGap, flex }: {
    plan: ColumnPlan;
    style: SolverStyle;
    contentInline: Affine2;
    sharedColumns?: SharedColumns | undefined;
    resolvedGap: ReturnType<typeof createEdgeSolver>['resolvedGap'];
    flex: ReturnType<typeof createTrackSolver>['flex'];
}): {
    columnGap: DimensionValue;
    justified: JustifiedColumns[];
};
export {};
