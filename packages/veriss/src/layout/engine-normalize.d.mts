import type { Region } from './region.mjs';
import type { SolverStyle as EngineStyle, SolverBox as Box, SolverAncestor as Ancestor, SolverAvailable as Space } from './engine-solver-types.mjs';
import type { LayoutWarning, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type Piece = {
    style: EngineStyle;
    region: Region;
};
type Context = {
    box: Box;
    state: Piece;
    available: Space;
    parents: readonly Ancestor[];
    inherited: EngineStyle | undefined;
    emit: boolean;
    layoutWarnings: LayoutWarning[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    styles: (box: Box, region: Region, parents: readonly Ancestor[], inherited: EngineStyle | undefined, emit: boolean, gridItem: boolean) => Piece[];
};
export declare function normalizeLayoutState({ box, state, available, parents, inherited, emit, layoutWarnings, ranges, styles }: Context): {
    box: Box;
    style: EngineStyle;
};
export {};
