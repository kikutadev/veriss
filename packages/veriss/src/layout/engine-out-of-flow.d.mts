import type { Region } from './region.mjs';
import type { SolverChild, SolverStyle, SolverAncestor, SolveBox } from './engine-solver-types.mjs';
import type { LayoutWarning, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
export declare function solvePositionedChild({ item, r, finalAncestors, style, emit, preferences, layoutWarnings, ranges, solve }: {
    item: SolverChild;
    r: Region;
    finalAncestors: readonly SolverAncestor[];
    style: SolverStyle;
    emit: boolean;
    preferences: readonly string[];
    layoutWarnings: LayoutWarning[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    solve: SolveBox;
}): Region[];
