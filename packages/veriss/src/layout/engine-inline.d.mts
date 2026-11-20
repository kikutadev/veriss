import type { Affine2, Region } from './region.mjs';
import type { AccessibilityGeometry, PaintFacts } from './accessibility.mjs';
import type { Dimensions, DimensionValue } from './engine-types.mjs';
import type { LayoutRange, LayoutRegion, LayoutWarning, LayoutGeneratedText } from '../layout-contracts.d.ts';
type Generated = Partial<Record<'before' | 'after', string>>;
import type { SolverBox, SolverStyle, SolverAncestor } from './engine-solver-types.mjs';
export type InlineBox = SolverBox;
type InlineAncestor = SolverAncestor;
interface InlineLeafRow {
    origin: Dimensions | null;
    block: Affine2 | null;
    content: {
        left: DimensionValue;
        top: DimensionValue;
        inline: Affine2;
    };
}
interface InlineContext {
    styles: (box: InlineBox, region: Region, parents: readonly InlineAncestor[], inherited: SolverStyle | undefined, emit: boolean, gridItem: boolean, state?: ReadonlySet<string>) => {
        style: SolverStyle;
        region: Region;
    }[];
    edgeValue: (style: SolverStyle, side: 'top' | 'bottom') => Affine2;
    generatedTexts: LayoutGeneratedText[];
    layoutWarnings: LayoutWarning[];
    geometry: AccessibilityGeometry[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    paints: (style: SolverStyle) => boolean;
    pseudoWithoutContent: (box: InlineBox, style: SolverStyle) => unknown;
    inlineStateTransforms: (box: InlineBox, style: SolverStyle) => unknown;
    inlineTextAlignment: (box: InlineBox, style: SolverStyle) => unknown;
    inlineAutoMargin: (box: InlineBox, style: SolverStyle, parentStyle?: SolverStyle) => unknown;
    inlineOverflow: (box: InlineBox, style: SolverStyle) => unknown;
    firstPseudoInert: (box: InlineBox, style: SolverStyle) => unknown;
    decorationNone: (box: InlineBox, style: SolverStyle, parents: readonly InlineAncestor[]) => unknown;
}
export declare function createInlineSolver({ styles, edgeValue, generatedTexts, layoutWarnings, geometry, ranges, paints, pseudoWithoutContent, inlineStateTransforms, inlineTextAlignment, inlineAutoMargin, inlineOverflow, firstPseudoInert, decorationNone }: InlineContext): {
    generatedElsewhere: (box: InlineBox, region: Region, parents: readonly InlineAncestor[], inheritedStyle: SolverStyle) => Generated | null;
    inlineContent: (leaf: InlineBox, leafStyle: SolverStyle, region: Region, parents: readonly InlineAncestor[], chain: PaintFacts[], leafRow?: InlineLeafRow) => void;
    inlineBounds: (child: InlineBox, leaf: InlineBox, leafStyle: SolverStyle, leafRow: InlineLeafRow | undefined, region: Region, childStyle?: Readonly<Record<string, unknown>>) => {
        region: Region;
        outer: {
            origin: {
                inline: Affine2;
                block: Affine2;
            };
            inline: Affine2;
            block: Affine2;
        } | null;
        inner: {
            origin: {
                inline: Affine2;
                block: Affine2;
            };
            inline: Affine2;
            block: Affine2;
        } | null;
    }[] | null;
};
export {};
