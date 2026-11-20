import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { SolverBox, SolverStyle, SolverAncestor } from './engine-solver-types.mjs';
import type { EngineBoxContract } from './input.mjs';
export type TableStyle = SolverStyle;
type BlockProfile = NonNullable<EngineBoxContract['intrinsicBlockSize']>;
type ProfileEntries = Exclude<BlockProfile, number>;
interface CellArea {
    column: number;
    row: number;
    span: number;
    down: number;
}
export interface TableMetadata {
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
type TableBox = SolverBox;
type TableAncestor = SolverAncestor;
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
