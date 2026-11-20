import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { EngineBoxContract } from './input.mjs';
type Side = 'left' | 'right' | 'top' | 'bottom';
type TableStyleKey = 'display' | 'position' | 'float' | 'table-layout' | 'border-collapse' | 'border-spacing' | 'inline-size' | 'block-size' | 'min-inline-size' | 'max-inline-size' | 'min-block-size' | 'max-block-size' | 'box-sizing' | 'vertical-align' | 'caption-side' | 'background-color' | 'background-image' | 'grid-template-columns' | 'grid-template-rows' | 'grid-row' | 'grid-column' | 'row-gap' | 'column-gap' | 'flex-direction' | 'flex-wrap' | 'flex-basis' | 'align-items' | 'align-self' | 'order' | `padding-${Side}` | `border-${Side}` | `margin-${Side}`;
export type TableStyle = Record<TableStyleKey, string> & {
    $sources?: Readonly<Record<string, unknown>>;
    'grid-auto-rows'?: string;
    'grid-auto-flow'?: string;
    'align-content'?: string;
    $fromCell?: boolean;
    tableColumns?: Rational | null;
    tableGaps?: Rational;
    tableShrink?: Rational;
    tableAutoMinimum?: Rational;
};
type BlockProfile = NonNullable<EngineBoxContract['intrinsicBlockSize']>;
type ProfileEntries = Exclude<BlockProfile, number>;
type TableContract = Omit<EngineBoxContract, 'textMetrics'> & {
    textMetrics?: NonNullable<EngineBoxContract['textMetrics']> & {
        baseline?: {
            ascent: number;
            descent: number;
        };
    };
};
interface CellArea {
    column: number;
    row: number;
    span: number;
    down: number;
}
export interface TableBox {
    tag: string;
    label: string;
    path: string;
    text: boolean;
    children: TableBox[];
    inline?: readonly TableBox[] | undefined;
    colSpan?: number | 'dynamic';
    rowSpan?: number | 'dynamic';
    contract?: TableContract | undefined;
    tableAt?: CellArea;
    tableArea?: CellArea;
    tablePart?: boolean;
    tableCell?: boolean;
    tableFlow?: boolean;
    tableRowSpan?: number;
    tableBaselineTop?: boolean;
    tableBaselineShift?: Rational;
    tableBaselineGroup?: {
        row: number;
        style: TableStyle;
        text?: Rational;
    };
    tableMeasuredSpan?: boolean;
    tableStackedSpan?: Rational;
    tableStretch?: boolean;
    stackedProfiles?: {
        profile: ProfileEntries;
        edges: Rational;
        sideEdges: Rational;
    }[];
    tableCaption?: {
        columns: number;
        rows: number;
        side: string;
        interleaved?: {
            columns: number;
            row: number;
        };
    };
}
interface TableAncestor {
    box: TableBox;
    style: TableStyle;
}
interface TableStylePiece {
    region: Region;
    style: TableStyle;
}
export interface TableProbe {
    inner: Affine2;
    thresholds: Rational[];
}
interface TableContext {
    uaEngine?: string | undefined;
    styles: (box: TableBox, region: Region, parents: readonly TableAncestor[], inherited: TableStyle, emit: boolean, gridItem: boolean) => readonly TableStylePiece[];
}
export declare function tableAsGrid({ styles, uaEngine }: TableContext, table: TableBox, style: TableStyle, region: Region, parents: readonly TableAncestor[], emit: boolean, available: {
    inline?: Affine2 | undefined;
} | undefined, probe?: TableProbe[]): TableStyle;
export declare function tablePlacement(box: TableBox, style: TableStyle): TableStyle;
export {};
