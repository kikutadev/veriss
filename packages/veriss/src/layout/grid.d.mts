import type { Rational } from './linear.mjs';
/** The track tokens of a track list with integer repeat() expanded (at most 64). */
export declare function expandTracks(value: string): string[];
export type GridTrack = {
    auto: true;
    content?: never;
    autoTable?: never;
    weight?: never;
    fixed?: never;
    autoMin?: never;
    min?: never;
    minCap?: never;
} | {
    content: {
        base: Rational;
        limit: Rational;
        stretch: boolean;
    };
    auto?: never;
    autoTable?: never;
    weight?: never;
    fixed?: never;
    autoMin?: never;
    min?: never;
    minCap?: never;
} | {
    autoTable: {
        min: Rational;
        max: Rational;
        fixed?: boolean;
    };
    auto?: never;
    content?: never;
    weight?: never;
    fixed?: never;
    autoMin?: never;
    min?: never;
    minCap?: never;
} | {
    weight: Rational;
    autoMin?: boolean;
    min?: Rational;
    minCap?: boolean;
    auto?: never;
    content?: never;
    autoTable?: never;
    fixed?: never;
} | {
    fixed: Rational;
    auto?: never;
    content?: never;
    autoTable?: never;
    weight?: never;
    autoMin?: never;
    min?: never;
    minCap?: never;
};
export declare function tracks(value: string, automatic: boolean, tokensOnly: true): string[];
export declare function tracks(value: string, automatic?: boolean, tokensOnly?: false): GridTrack[];
export declare function tracks(value: string, automatic: boolean, tokensOnly: boolean): string[] | GridTrack[];
/** grid-template-areas (rows joined by |, cells by spaces) → Map name → {row, column, rows, columns}; '.' is empty. */
export interface GridArea {
    row: number;
    column: number;
    rows: number;
    columns: number;
    cells: number;
}
export interface GridAreas {
    areas: Map<string, GridArea>;
    rows: number;
    columns: number;
}
export declare function parseAreas(value?: string | null): GridAreas;
interface GridChild<Box, Style> {
    box: Box;
    style: Style;
}
export interface PlacedGridChild<Box, Style> extends GridChild<Box, Style> {
    start: number;
    span: number;
    row: number;
    rowSpan: number;
}
export interface GridPlacementOptions {
    rows?: number | undefined;
    subgridColumns?: boolean;
    areas?: GridAreas | undefined;
    explicitRows?: number | undefined;
    dense?: boolean;
    columnFlow?: boolean;
}
export declare function place<Box, Style extends Record<'grid-column' | 'grid-row', string>>(children: readonly GridChild<Box, Style>[], columns: number, { rows, subgridColumns, areas, explicitRows, dense, columnFlow }?: GridPlacementOptions): PlacedGridChild<Box, Style>[];
export {};
