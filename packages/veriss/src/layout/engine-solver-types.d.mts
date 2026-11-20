import type { InlineBox } from './engine-inline.mjs';
import type { EngineStyle } from './engine-style.mjs';
import type { EdgeStyle } from './engine-edges.mjs';
import type { TableBox, TableStyle } from './engine-table.mjs';
import type { Region, Affine2 } from './region.mjs';
import type { Rational } from './linear.mjs';
import type { Axis, DimensionValue, Dimensions } from './engine-types.mjs';
export interface SolverBox extends InlineBox, Omit<TableBox, 'children' | 'inline' | 'contract' | 'tag' | 'label' | 'path' | 'text' | 'colSpan' | 'rowSpan' | 'tableCell'> {
    children: SolverBox[];
    inline?: SolverBox[] | undefined;
    $foldedInline?: boolean;
    $starts?: {
        geometry: number;
        sizes: number;
    };
}
export type SolverStyle = EngineStyle & EdgeStyle & TableStyle & {
    $collapsedTop?: boolean;
    $collapsedBottom?: boolean;
    'container-type': string;
};
export interface SolverAncestor {
    box: SolverBox;
    style: SolverStyle;
    names?: readonly string[];
    type?: string;
    inline?: Affine2 | null;
    block?: Affine2 | null;
    contentOrigin?: Dimensions | null;
    paddingOrigin?: Dimensions | null;
    clips?: {
        box: string;
        x: boolean;
        y: boolean;
    };
    paddingInline?: Affine2;
    paddingBlock?: Affine2 | null;
    positioned?: boolean;
    clipped?: boolean;
    clipScope?: boolean;
    subgrid?: boolean;
}
export interface SolverChild {
    box: SolverBox;
    style: SolverStyle;
    inherited?: SolverStyle | undefined;
}
export interface ChildState {
    region: Region;
    children: SolverChild[];
    contents?: SolverStyle;
    $responsiveCollapse?: boolean;
}
export type ResolveStyle = (box: SolverBox, region: Region, ancestors: readonly SolverAncestor[], inherited: SolverStyle | undefined, emit: boolean, gridItem?: boolean, state?: ReadonlySet<string>) => {
    region: Region;
    style: SolverStyle;
}[];
export interface SolverAvailable {
    inline: Affine2;
    block?: Affine2 | null | undefined;
    origin?: Dimensions | null | undefined;
    root?: boolean;
    gridItem?: boolean;
    blockFlowChild?: boolean;
    definiteBlock?: boolean;
    justifyHandled?: boolean;
    autoMargins?: boolean;
    fitInline?: boolean;
    fitBlock?: boolean;
    collapsedTop?: boolean;
    collapsedBottom?: boolean;
    flexItem?: {
        main: Axis;
    };
    flexBlockMinimum?: boolean;
    scrollbarFrame?: boolean;
    alignInline?: Rational;
    alignBlock?: Rational;
    percentInline?: Affine2;
    percentBlock?: Affine2;
    marginEnd?: {
        inline: DimensionValue;
        block: DimensionValue;
    };
    tracks?: Partial<Record<Axis, {
        values: Affine2[];
        gap: DimensionValue;
        box: SolverBox;
        startLine: number;
    }>>;
    containingBlock?: Dimensions & {
        path: string;
        origin?: Dimensions | null | undefined;
        clips?: {
            box: string;
            x: boolean;
            y: boolean;
        };
    };
    $minNatural?: boolean;
    $minRaised?: boolean;
    $raisedBlock?: Affine2;
    $crossMeasure?: boolean;
}
export interface SolvedBox {
    region: Region;
    inline: Affine2;
    block: Affine2 | null;
}
export type SolveBox = (box: SolverBox, available: SolverAvailable, region: Region, parents?: readonly SolverAncestor[], inherited?: SolverStyle, emit?: boolean) => SolvedBox[];
