import type { Region } from './region.mjs';
import type { createEdgeSolver } from './engine-edges.mjs';
import type { SolverBox, SolverStyle, SolverAncestor, ChildState, ResolveStyle } from './engine-solver-types.mjs';
import type { LayoutWarning, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
export declare function prepareBlockChildren({ children, box, style, parents, ancestors, available, emit, warningRegion, layoutWarnings, ranges, styles, positiveEdge, positivePadding, alignBrowserDependent }: {
    children: ChildState;
    box: SolverBox;
    style: SolverStyle;
    parents: readonly SolverAncestor[];
    ancestors: readonly SolverAncestor[];
    available: {
        collapsedTop?: boolean;
        collapsedBottom?: boolean;
    };
    emit: boolean;
    warningRegion: Region;
    layoutWarnings: LayoutWarning[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    styles: ResolveStyle;
    positiveEdge: ReturnType<typeof createEdgeSolver>['positiveEdge'];
    positivePadding: ReturnType<typeof createEdgeSolver>['positivePadding'];
    alignBrowserDependent: (box: SolverBox, property: string, value: string | number | undefined) => void;
}): void;
