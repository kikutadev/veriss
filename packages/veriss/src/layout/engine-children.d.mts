import type { EngineBoxContract } from './input.mjs';
import type { Region } from './region.mjs';
import type { SolverBox, SolverStyle, SolverAncestor, ChildState, ResolveStyle } from './engine-solver-types.mjs';
import type { LayoutWarning } from '../layout-contracts.d.ts';
export interface PseudoContract {
    base: string;
    kind: string;
    selector: string;
    contract: EngineBoxContract;
}
export declare function collectLayoutChildren({ region, box, style, ancestors, styles, bounded, emit, rendered, isFlex, pseudoContracts, layoutWarnings, contentsInert, tableRowRadius, aspectInert }: {
    region: Region;
    box: SolverBox;
    style: SolverStyle;
    ancestors: readonly SolverAncestor[];
    styles: ResolveStyle;
    bounded: <T>(values: T[]) => T[];
    emit: boolean;
    rendered?: {
        box: {
            tag: string;
            path: string;
        };
    } | null | undefined;
    isFlex: boolean;
    pseudoContracts: readonly PseudoContract[];
    layoutWarnings: LayoutWarning[];
    contentsInert: (box: SolverBox, style: SolverStyle, region: Region) => unknown;
    tableRowRadius: (box: SolverBox, style: SolverStyle) => unknown;
    aspectInert: (box: SolverBox, style: SolverStyle) => unknown;
}): ChildState[];
