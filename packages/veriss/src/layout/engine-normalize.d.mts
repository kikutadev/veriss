import type { Affine2, Region } from './region.mjs';
import type { EngineStyle } from './engine-style.mjs';
import type { InlineBox } from './engine-inline.mjs';
import type { LayoutWarning, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type Box = InlineBox & {
    $foldedInline?: boolean;
};
type Ancestor = {
    box: Box;
    style: EngineStyle;
    names?: readonly string[];
};
type Space = {
    root?: boolean;
    percentBlock?: Affine2 | null;
    inline: Affine2;
    block?: Affine2 | null;
    flexItem?: {
        main: 'inline' | 'block';
    };
};
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
