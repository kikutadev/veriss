import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { parseLayoutCSS, CSSRule } from './css.mjs';
import type { createPositionSolver } from './engine-positioning.mjs';
import type { createEdgeSolver, EdgeStyle } from './engine-edges.mjs';
import type { createObligationCollector } from './engine-obligations.mjs';
import type { AnimatedBox } from './engine-state-shifts.mjs';
import type { createInlineSolver, InlineBox } from './engine-inline.mjs';
import type { EngineStyle } from './engine-style.mjs';
import type { EngineOptions } from './input.mjs';
import type { ExplanationStyle } from './explain.mjs';
import type { AccessibilityGeometry, PaintFacts } from './accessibility.mjs';
import type { DimensionValue, Dimensions } from './engine-types.mjs';
import type { LayoutSummary, LayoutWarning, LayoutScrollbarProfile } from '../layout-contracts.d.ts';
type PositionSolver = ReturnType<typeof createPositionSolver>;
type Edges = ReturnType<typeof createEdgeSolver>;
type InlineSolver = ReturnType<typeof createInlineSolver>;
export type FinishStyle = EngineStyle & EdgeStyle & Parameters<PositionSolver['resolvedOrigin']>[0] & ExplanationStyle & {
    'box-sizing': 'border-box' | 'content-box';
    position: 'static' | 'relative' | 'absolute';
};
export interface FinishBox extends InlineBox {
    $starts?: {
        geometry: number;
        sizes: number;
    };
    tableCaption?: boolean;
}
interface FinishAncestor {
    box: FinishBox;
    style: FinishStyle;
    names?: readonly string[];
    clipped?: boolean;
    clipScope?: boolean;
    subgrid?: boolean;
}
interface FinishAvailable {
    inline: Affine2;
    block?: Affine2 | null;
    root?: boolean;
    justifyHandled?: boolean;
    fitInline?: boolean;
    fitBlock?: boolean;
    origin?: Dimensions | null;
    marginEnd?: {
        inline: DimensionValue;
        block: DimensionValue;
    };
    alignBlock?: Rational;
    alignInline?: Rational;
    containingBlock?: Dimensions & {
        path: string;
        origin?: Dimensions | null;
        clips?: {
            x: boolean;
            y: boolean;
        };
    };
}
interface SolvedBox {
    region: Region;
    inline: Affine2;
    block: Affine2 | null;
}
export interface EngineGeometry extends AccessibilityGeometry {
    outsideMarker?: string | undefined;
    fixedTracks?: string | undefined;
    wrapsByWords?: boolean;
    widthFromAttribute?: number;
    vwInline?: string | undefined;
    fullWidthMargins?: string[];
    contentBoxFull?: string[];
    imageRatio?: EngineStyle['$imageRatio'];
    alignsContent?: boolean;
    $mirrored?: Set<string>;
}
export type EngineSize = LayoutSummary['sizes'][number] & {
    $shown?: {
        region: Region;
        origin: Dimensions | null;
        inline: Affine2;
        block: Affine2 | null;
    };
};
type PageScroll = LayoutSummary['pageScroll'];
export declare const focusableBox: (box: InlineBox) => boolean;
interface FinalizerContext extends Pick<PositionSolver, 'translated' | 'resolvedOrigin'>, Pick<Edges, 'padding' | 'edgeValue'>, Pick<ReturnType<typeof createObligationCollector<FinishBox>>, 'obligation' | 'cellGrows' | 'ranges'> {
    options: EngineOptions;
    block: boolean;
    hovered: string | undefined;
    scrollbarProfile: LayoutScrollbarProfile | undefined;
    getPageScroll: () => PageScroll;
    setPageScroll: (v: NonNullable<PageScroll>) => void;
    geometry: EngineGeometry[];
    sizes: EngineSize[];
    layoutWarnings: LayoutWarning[];
    animated: AnimatedBox[];
    styles: (box: FinishBox, region: Region, parents: readonly FinishAncestor[], inherited: FinishStyle | undefined, emit: boolean, gridItem: boolean, state?: ReadonlySet<string>) => {
        region: Region;
        style: FinishStyle;
    }[];
    inlineContent: InlineSolver['inlineContent'];
    ancestorPaint: () => PaintFacts[];
    paints: (style: FinishStyle) => boolean;
    captionBackdrop: (parent: FinishAncestor, next: FinishBox, paint: PaintFacts) => PaintFacts;
    startingRules: ReturnType<typeof parseLayoutCSS>['startingRules'];
    keyframeFrames: ReturnType<typeof parseLayoutCSS>['keyframeFrames'];
    fontFaces: ReturnType<typeof parseLayoutCSS>['fontFaces'];
    rules: readonly CSSRule[];
    cover: boolean;
    metaViewport: string | undefined;
    intrinsic: (box: FinishBox, content: Affine2, region: Region) => {
        region: Region;
        value: Affine2;
    }[];
    unknown: (code: string, message: string, line: undefined, box: FinishBox) => unknown;
}
export declare function createFinalizer({ options, block, hovered, scrollbarProfile, getPageScroll, setPageScroll, geometry, sizes, layoutWarnings, animated, styles, inlineContent, ancestorPaint, paints, captionBackdrop, startingRules, keyframeFrames, fontFaces, rules, cover, metaViewport, intrinsic, unknown, translated, resolvedOrigin, padding, edgeValue, obligation, cellGrows, ranges }: FinalizerContext): (box: FinishBox, style: FinishStyle, region: Region, inline: Affine2, contentInline: Affine2, blockSize: Affine2 | null, contentBlock: Affine2 | null, available: FinishAvailable, parents: readonly FinishAncestor[], emit: boolean) => SolvedBox;
export {};
