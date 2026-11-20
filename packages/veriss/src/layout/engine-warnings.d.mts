import type { Rational } from './linear.mjs';
import type { Region, Affine2 } from './region.mjs';
import type { createQuerySolver } from './engine-queries.mjs';
import type { Dimensions, DimensionValue, Side } from './engine-types.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { LayoutDiagnostic, LayoutWarning, LayoutScrollbarProfile, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
import type { EngineOptions } from './input.mjs';
type WarningBox = NormalizedBox & {
    pseudo?: string | boolean;
};
interface WarningSize {
    box: string;
    path: string;
    $shown?: {
        region: Region;
        inline: Affine2;
        block: Affine2 | null;
        origin: Dimensions | null;
    };
}
interface WarningGeometry {
    box: WarningBox;
    path: string;
    region: Region;
    origin: Dimensions | null;
    clipOrigin?: Dimensions | null;
    inline: Affine2 | null;
    block: Affine2 | null;
    content?: {
        left: DimensionValue;
        top: DimensionValue;
    };
    contentBlockSize?: Affine2 | null;
    sticky?: {
        parent: string | null;
    };
    outsideMarker?: string;
    overflow: string;
    overflowValue: string;
    clipAxes?: {
        inline: boolean;
        block: boolean;
    };
    borders?: Partial<Record<Side, Rational>>;
    imageRatio?: {
        width: number;
        height: number;
        basis: 'file' | 'attributes';
        follows: boolean;
    };
    paint?: {
        objectFit?: string;
    };
    fixedTracks?: string;
    wrapsByWords?: boolean;
    widthFromAttribute?: number;
    fullWidthMargins?: string[];
    contentBoxFull?: string[];
    vwInline?: string;
}
export declare function checkLayoutWarnings({ block, options, scrollbarProfile, geometry, sizes, boxes, diagnostics, layoutWarnings, ranges, context, isZeroAffine }: {
    block: boolean;
    options: EngineOptions;
    scrollbarProfile: LayoutScrollbarProfile | undefined;
    geometry: readonly WarningGeometry[];
    sizes: readonly WarningSize[];
    boxes: readonly WarningBox[];
    diagnostics: readonly LayoutDiagnostic[];
    layoutWarnings: LayoutWarning[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    context: ReturnType<typeof createQuerySolver>['context'];
    isZeroAffine: (value: DimensionValue) => boolean;
}): void;
export {};
