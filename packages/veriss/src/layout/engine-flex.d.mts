import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { createTrackSolver } from './engine-tracks.mjs';
import type { createEdgeSolver } from './engine-edges.mjs';
import type { Explanation } from './explain.mjs';
import type { Axis, Dimensions } from './engine-types.mjs';
import type { SolverBox as FlexBox, SolverStyle as FlexStyle, SolverAvailable as FlexAvailable, SolvedBox, SolverChild as FlexChild, SolverAncestor as Ancestor } from './engine-solver-types.mjs';
interface FlexInput {
    box: FlexBox;
    style: FlexStyle;
    region: Region;
    inline: Affine2;
    contentInline: Affine2;
    knownBlock: Affine2 | null;
    blockEdges: Affine2;
    available: FlexAvailable;
    parents: readonly Ancestor[];
    ancestors: readonly Ancestor[];
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
    frAutoMinimums: (box: FlexBox, style: FlexStyle, region: Region, parents: readonly Ancestor[], probe: 'min' | true) => {
        min: Rational;
        max?: Rational;
    };
    scrolls: (style: FlexStyle, axis: 'x' | 'y') => boolean;
    obligation: (available: Affine2, required: Affine2, box: FlexBox, region: Region, code: string, axis: Axis, enabled: boolean, explain: () => Explanation, annotate: () => {
        layout: 'flex';
    }) => void;
    solve: (box: FlexBox, available: FlexAvailable, region: Region, parents: readonly Ancestor[], inherited: FlexStyle, emit: boolean) => SolvedBox[];
    finish: (box: FlexBox, style: FlexStyle, region: Region, inline: Affine2, contentInline: Affine2, blockSize: Affine2 | null, contentBlock: Affine2 | null, available: FlexAvailable, parents: readonly Ancestor[], emit: boolean) => SolvedBox;
}
export declare function createFlexLayout({ block, options, viewportLength, bounded, frAutoMinimums, scrolls, obligation, solve, finish, resolvedGap, hasViewportMargin, hasViewportPadding, resolvedViewportLength, isZeroAffine, constantItem, resolveFlexLine, breakLines, mainStarts }: FlexContext): ({ box, style, region, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit }: FlexInput) => SolvedBox[];
export {};
