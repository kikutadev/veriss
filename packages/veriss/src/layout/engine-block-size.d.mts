import type { Affine2, Region } from './region.mjs';
import type { SolverBox, SolverStyle, SolverAncestor, SolverAvailable } from './engine-solver-types.mjs';
import type { createObligationCollector } from './engine-obligations.mjs';
import type { Axis } from './engine-types.mjs';
import type { LayoutExplanation, LayoutRange, LayoutRegion, LayoutWarning } from '../layout-contracts.d.ts';
interface SizePiece {
    region: Region;
    value: Affine2 | null;
}
type MinBlock = ((region: Region) => {
    region: Region;
    value: Affine2;
}[]) | null;
type Obligation = ReturnType<typeof createObligationCollector<SolverBox>>['obligation'];
export declare function resolveBlockSizes({ box, style, block, available, parents, inline, contentInline, cssBlockEdges, blockEdges, content, emit, obligation, edgeExplanation }: {
    box: SolverBox;
    style: SolverStyle;
    block: boolean;
    available: SolverAvailable;
    parents: readonly SolverAncestor[];
    inline: Affine2;
    contentInline: Affine2;
    cssBlockEdges: Affine2;
    blockEdges: Affine2;
    content: {
        region: Region;
    };
    emit: boolean;
    obligation: Obligation;
    edgeExplanation: (axis: Axis) => () => LayoutExplanation;
}): {
    maxBlock: Affine2 | null;
    minBlock: MinBlock;
    blockStates: SizePiece[];
};
export declare function leafHeights({ box, style, block, geometryRegion, knownBlock, contentInline, maxBlock, blockEdges, minBlock, intrinsic, layoutWarnings, ranges, obligation, emit }: {
    box: SolverBox;
    style: SolverStyle;
    block: boolean;
    geometryRegion: Region;
    knownBlock: Affine2 | null;
    contentInline: Affine2;
    maxBlock: Affine2 | null;
    blockEdges: Affine2;
    minBlock: MinBlock;
    intrinsic: (box: SolverBox, content: Affine2, region: Region) => SizePiece[];
    layoutWarnings: LayoutWarning[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    obligation: Obligation;
    emit: boolean;
}): SizePiece[];
export {};
