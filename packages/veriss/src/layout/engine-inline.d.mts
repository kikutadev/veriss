import type { Affine2, Region } from './region.mjs';
import type { AccessibilityGeometry, PaintFacts } from './accessibility.mjs';
import type { EngineStyle } from './engine-style.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { EngineBoxContract } from './input.mjs';
import type { Dimensions, DimensionValue } from './engine-types.mjs';
import type { LayoutRange, LayoutRegion, LayoutWarning, LayoutGeneratedText } from '../layout-contracts.d.ts';
type Generated = Partial<Record<'before' | 'after', string>>;
export interface InlineBox extends Omit<NormalizedBox, 'children' | 'inline'> {
    children: InlineBox[];
    inline?: InlineBox[];
    pseudo?: string;
    contract?: EngineBoxContract;
    generated?: Generated;
    absolutePseudo?: ('before' | 'after')[];
    contractSelector?: string;
    tableCell?: boolean;
}
interface InlineAncestor {
    box: InlineBox;
    style: EngineStyle;
    names?: readonly string[];
}
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
    styles: (box: InlineBox, region: Region, parents: readonly InlineAncestor[], inherited: EngineStyle | undefined, emit: boolean, gridItem: boolean, state?: ReadonlySet<string>) => {
        style: EngineStyle;
        region: Region;
    }[];
    edgeValue: (style: EngineStyle, side: 'top' | 'bottom') => Affine2;
    generatedTexts: LayoutGeneratedText[];
    layoutWarnings: LayoutWarning[];
    geometry: AccessibilityGeometry[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    paints: (style: EngineStyle) => boolean;
    pseudoWithoutContent: (box: InlineBox, style: EngineStyle) => unknown;
    inlineStateTransforms: (box: InlineBox, style: EngineStyle) => unknown;
    inlineTextAlignment: (box: InlineBox, style: EngineStyle) => unknown;
    inlineAutoMargin: (box: InlineBox, style: EngineStyle) => unknown;
    inlineOverflow: (box: InlineBox, style: EngineStyle) => unknown;
    firstPseudoInert: (box: InlineBox, style: EngineStyle) => unknown;
    decorationNone: (box: InlineBox, style: EngineStyle, parents: readonly InlineAncestor[]) => unknown;
}
export declare function createInlineSolver({ styles, edgeValue, generatedTexts, layoutWarnings, geometry, ranges, paints, pseudoWithoutContent, inlineStateTransforms, inlineTextAlignment, inlineAutoMargin, inlineOverflow, firstPseudoInert, decorationNone }: InlineContext): {
    generatedElsewhere: (box: InlineBox, region: Region, parents: readonly InlineAncestor[], inheritedStyle: EngineStyle) => Generated | null;
    inlineContent: (leaf: InlineBox, leafStyle: EngineStyle, region: Region, parents: readonly InlineAncestor[], chain: PaintFacts[], leafRow?: InlineLeafRow) => void;
    inlineBounds: (child: InlineBox, leaf: InlineBox, leafStyle: EngineStyle, leafRow: InlineLeafRow | undefined, region: Region, childStyle?: Readonly<Record<string, unknown>>) => {
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
