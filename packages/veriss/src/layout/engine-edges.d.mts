import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { LayoutAffine } from '../layout-contracts.d.ts';
import type { Side, DimensionValue } from './engine-types.mjs';
type GapKey = 'column-gap' | 'row-gap';
type EdgeKey = GapKey | `margin-${Side}` | `padding-${Side}`;
export type EdgeStyle = Record<EdgeKey | `border-${Side}` | 'position' | 'block-size' | 'direction' | 'display' | 'max-block-size' | 'overflow-x' | 'overflow-y', string> & {
    'font-size'?: string;
    $usedMarginTop?: LayoutAffine;
    $viewportLengths?: Partial<Record<EdgeKey, LayoutAffine & {
        source: string;
    }>>;
    $blockFlow?: boolean;
};
type InlineSizingStyle = Record<'inline-size' | 'min-inline-size' | 'max-inline-size' | 'box-sizing', string> & {
    'font-size'?: string;
};
interface MarginBox {
    label: string;
    pseudo?: string | boolean;
    documentRoot?: boolean;
    children?: readonly unknown[];
}
interface MarginEntry {
    region: Region;
    children: {
        box: MarginBox;
        style: EdgeStyle;
    }[];
}
export declare const maximum: (region: Region, a: Affine2, b: Affine2) => {
    region: Region;
    value: Affine2;
}[];
export declare const clamp: (region: Region, value: Affine2) => {
    region: Region;
    value: Affine2;
}[];
export declare const ratioOf: (style: {
    "aspect-ratio"?: string | undefined;
}) => Rational | null;
export declare const minimumOf: (region: Region, a: Affine2, b: Affine2) => {
    region: Region;
    value: Affine2;
}[];
export declare function preferredInlinePieces(style: InlineSizingStyle, parent: Affine2, region: Region, cssInlineEdges: Affine2, autoValue: Affine2): {
    region: Region;
    value: Affine2;
}[];
export declare function createEdgeSolver(viewportLength: (value: unknown) => boolean, bounded: <T>(values: T[]) => T[], block: boolean): {
    fromAffineFact: (fact: LayoutAffine) => {
        x: Rational;
        y: Rational;
        b: Rational;
    };
    hasViewportMargin: (style: EdgeStyle, sides?: readonly Side[]) => boolean;
    marginValue: (style: EdgeStyle, side: Side) => Affine2;
    resolvedViewportLength: (style: EdgeStyle, key: EdgeKey, fallback: () => DimensionValue) => DimensionValue;
    resolvedGap: (style: EdgeStyle, key: GapKey, parent?: {
        gap: DimensionValue;
    }) => DimensionValue;
    padding: (style: EdgeStyle, side: Side) => DimensionValue;
    edgeValue: (style: EdgeStyle, side: Side) => Affine2;
    hasViewportPadding: (style: EdgeStyle) => boolean;
    isZeroAffine: (value: DimensionValue) => boolean;
    positivePadding: (style: EdgeStyle, side: Side, region: Region) => boolean;
    positiveEdge: (style: EdgeStyle, side: Side, region: Region) => boolean;
    responsiveBlockMargins: <T extends MarginEntry>(entry: T, style: EdgeStyle, box: MarginBox, parents: readonly {
        style?: EdgeStyle;
    }[], available: {
        collapsedTop?: unknown;
        collapsedBottom?: unknown;
    }) => T[];
};
export {};
