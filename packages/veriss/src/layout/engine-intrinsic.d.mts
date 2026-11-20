import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { EngineBoxContract } from './input.mjs';
import type { LayoutRange } from '../layout-contracts.d.ts';
import type { SolverBox as IntrinsicBox, SolverStyle as IntrinsicStyle, SolverAncestor as IntrinsicAncestor, ResolveStyle as IntrinsicStyles } from './engine-solver-types.mjs';
interface ValuePiece {
    region: Region;
    value: Affine2;
}
export declare function createIntrinsicSolver(styles: IntrinsicStyles): {
    (box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe?: false): IntrinsicStyle;
    (box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe: "min" | true): {
        min: Rational;
        max?: Rational;
    };
};
export declare function intrinsicBlock<Box extends {
    text: boolean;
    contract?: EngineBoxContract | undefined;
}>(box: Box, content: Affine2, region: Region, unknown: (code: string, message: string, line: undefined, box: Box) => unknown, ranges: (region: Region) => {
    range: LayoutRange;
}): ValuePiece[];
export declare function measureLegend(styles: IntrinsicStyles, box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[]): {
    box: IntrinsicBox;
    hidden: true;
    effectiveTop: Rational;
    style?: never;
    blockSize?: never;
    inlineSize?: never;
    vertical?: never;
    horizontal?: never;
    offset?: never;
} | {
    box: IntrinsicBox;
    hidden: false;
    style: IntrinsicStyle;
    blockSize: Rational;
    inlineSize: Rational;
    vertical: Rational;
    horizontal: Rational;
    effectiveTop: Rational;
    offset: {
        inline: Rational;
        block: Rational;
    };
} | null;
export {};
