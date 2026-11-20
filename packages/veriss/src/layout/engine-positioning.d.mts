import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { createEdgeSolver, EdgeStyle } from './engine-edges.mjs';
import type { Dimensions, Axis, DimensionValue, SharedTracks } from './engine-types.mjs';
import type { LayoutDiagnostic, LayoutRange, LayoutRegion, LayoutSubgrid, SourceSpan } from '../layout-contracts.d.ts';
type OriginStyle = Record<'left' | 'right' | 'top' | 'bottom' | 'position' | 'overflow-x' | 'overflow-y' | 'grid-template-columns' | 'grid-template-rows', string> & {
    transform?: string | undefined;
    'font-size'?: string | undefined;
};
interface OriginAvailable {
    inline: Affine2;
    block?: Affine2 | null;
    origin?: Dimensions | null;
    root?: boolean;
    alignBlock?: Rational;
    alignInline?: Rational;
    containingBlock?: Dimensions & {
        origin?: Dimensions | null;
    };
}
interface OriginAncestor {
    clipped?: boolean;
    subgrid?: boolean;
}
interface GridBox {
    label: string;
    path: string;
    source?: SourceSpan | undefined;
}
type TrackVector = Omit<SharedTracks<GridBox>, 'gap'> & {
    gap: DimensionValue;
};
type InheritedAxis = SharedTracks<GridBox> & {
    insets: [Rational, Rational];
};
type SubgridStyle = EdgeStyle & Record<'grid-template-columns' | 'grid-template-rows' | 'container-type' | 'inline-size' | 'min-inline-size' | 'min-block-size', string>;
interface RangeFacts {
    range: LayoutRange;
    heightRange?: LayoutRange;
    region?: LayoutRegion;
}
export declare const subgridError: (message: string, box: GridBox, region: Region, axis: Axis) => Error & {
    code: string;
    box: GridBox;
    region: Region;
    axis: Axis;
};
interface PositionContext {
    block: boolean;
    preferences: readonly string[];
    rootFontSize: () => Rational | null;
    resolvedGap: ReturnType<typeof createEdgeSolver>['resolvedGap'];
    bounded: <T>(values: T[]) => T[];
    diagnostics: LayoutDiagnostic[];
    ranges: (region: Region) => RangeFacts;
    subgrids: LayoutSubgrid[];
}
export declare const isDescendant: (a: string, b: string) => boolean;
export declare const intersectRegions: (a: Region, b: Region) => boolean;
export declare function createPositionSolver({ block, preferences, rootFontSize, resolvedGap, bounded, diagnostics, ranges, subgrids }: PositionContext): {
    translated: (style: OriginStyle, origin: Dimensions | null, size: {
        inline: Affine2;
        block: Affine2 | null;
    }) => Dimensions | null;
    resolvedOrigin: (style: OriginStyle, available: OriginAvailable, inline: Affine2, blockSize: Affine2 | null, parents: readonly OriginAncestor[]) => Dimensions | null;
    untranslatedOrigin: (style: OriginStyle, available: OriginAvailable, inline: Affine2, blockSize: Affine2 | null, parents: readonly OriginAncestor[]) => Dimensions | null;
    subgridGeometry: (style: SubgridStyle, box: GridBox, available: {
        tracks?: Partial<Record<Axis, TrackVector>>;
    }, region: Region, emit: boolean) => {
        axes: Partial<Record<Axis, InheritedAxis>>;
        regions: Region[];
    };
};
export {};
