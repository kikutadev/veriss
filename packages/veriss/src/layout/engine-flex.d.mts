import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { FlexItemStyle, FlexContainerStyle } from './flex.mjs';
import type { createTrackSolver } from './engine-tracks.mjs';
import type { createEdgeSolver, EdgeStyle } from './engine-edges.mjs';
import type { Explanation, ExplanationStyle } from './explain.mjs';
import type { Axis, DimensionValue, Dimensions } from './engine-types.mjs';
interface FlexBox {
    label: string;
    path: string;
    owner?: string;
    text: boolean;
    children: readonly unknown[];
    contract?: {
        overflow?: string;
        overflowBlock?: string;
    };
}
type FlexStyle = EdgeStyle & FlexItemStyle & FlexContainerStyle & ExplanationStyle & {
    'align-self': string;
    'font-size'?: string;
};
interface FlexAvailable {
    inline?: Affine2 | undefined;
    block?: Affine2 | undefined;
    origin?: Dimensions | null | undefined;
    marginEnd?: {
        inline: DimensionValue;
        block: DimensionValue;
    };
    percentBlock?: Affine2;
    fitInline?: boolean;
    fitBlock?: boolean;
    flexItem?: {
        main: Axis;
    };
    flexBlockMinimum?: boolean;
    definiteBlock?: boolean;
    alignBlock?: Rational;
    alignInline?: Rational;
    $crossMeasure?: boolean;
    $minNatural?: boolean;
}
interface SolvedBox {
    region: Region;
    inline: Affine2;
    block: Affine2 | null;
}
interface FlexChild {
    box: FlexBox;
    style: FlexStyle;
    inherited?: FlexStyle | undefined;
}
interface Ancestor {
    box: FlexBox;
    style?: FlexStyle | undefined;
}
interface FlexInput {
    box: FlexBox;
    style: FlexStyle;
    region: Region;
    inline: Affine2;
    contentInline: Affine2;
    knownBlock: Affine2 | null;
    blockEdges: Affine2;
    available: FlexAvailable;
    parents: Ancestor[];
    ancestors: Ancestor[];
    contentOrigin: Dimensions | null;
    collect: (region: Region) => {
        region: Region;
        children: FlexChild[];
    }[];
    emit: boolean;
}
interface FlexContext extends Pick<ReturnType<typeof createEdgeSolver>, 'resolvedGap' | 'hasViewportMargin' | 'hasViewportPadding' | 'resolvedViewportLength' | 'isZeroAffine'>, Pick<ReturnType<typeof createTrackSolver>, 'constantItem' | 'resolveFlexLine' | 'breakLines' | 'mainStarts'> {
    block: boolean;
    options: {
        hostInset?: number | undefined;
    };
    viewportLength: (value: unknown) => boolean;
    bounded: <T>(values: T[]) => T[];
    frAutoMinimums: (box: FlexBox, style: FlexStyle, region: Region, parents: Ancestor[], probe: 'min' | true) => {
        min: Rational;
        max?: Rational;
    };
    scrolls: (style: FlexStyle, axis: 'x' | 'y') => boolean;
    obligation: (available: Affine2, required: Affine2, box: FlexBox, region: Region, code: string, axis: Axis, enabled: boolean, explain: () => Explanation, annotate: () => {
        layout: string;
    }) => void;
    solve: (box: FlexBox, available: FlexAvailable, region: Region, parents: Ancestor[], inherited: FlexStyle, emit: boolean) => SolvedBox[];
    finish: (box: FlexBox, style: FlexStyle, region: Region, inline: Affine2, contentInline: Affine2, blockSize: Affine2 | null, contentBlock: Affine2 | null, available: FlexAvailable, parents: Ancestor[], emit: boolean) => SolvedBox;
}
export declare function createFlexLayout({ block, options, viewportLength, bounded, frAutoMinimums, scrolls, obligation, solve, finish, resolvedGap, hasViewportMargin, hasViewportPadding, resolvedViewportLength, isZeroAffine, constantItem, resolveFlexLine, breakLines, mainStarts }: FlexContext): ({ box, style, region, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit }: FlexInput) => SolvedBox[];
export {};
