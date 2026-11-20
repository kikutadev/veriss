import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { EngineBoxContract } from './input.mjs';
import type { LayoutRange } from '../layout-contracts.d.ts';
import type { TableStyle } from './engine-table.mjs';
export interface IntrinsicBox {
    tag: string;
    label: string;
    path: string;
    text: boolean;
    children: IntrinsicBox[];
    inline?: readonly IntrinsicBox[];
    pseudo?: string | boolean;
    anonymous?: boolean;
    contract?: EngineBoxContract;
}
export type IntrinsicStyle = TableStyle & {
    'overflow-x': string;
    'justify-content': string;
    $blockFlow?: boolean;
};
export interface IntrinsicAncestor {
    box: IntrinsicBox;
    style: IntrinsicStyle;
}
export type IntrinsicStyles = (box: IntrinsicBox, region: Region, parents: readonly IntrinsicAncestor[], inherited: IntrinsicStyle, emit: boolean, gridItem: boolean) => readonly {
    region: Region;
    style: IntrinsicStyle;
}[];
interface ValuePiece {
    region: Region;
    value: Affine2;
}
export declare function createIntrinsicSolver(styles: IntrinsicStyles): {
    (box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe?: false): IntrinsicStyle;
    (box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe: "min" | true): IntrinsicStyle | {
        min: Rational;
        max?: Rational;
    };
};
export declare function intrinsicBlock<Box extends {
    text: boolean;
    contract?: EngineBoxContract;
}>(box: Box, content: Affine2, region: Region, unknown: (code: string, message: string, line: undefined, box: Box) => unknown, ranges: (region: Region) => {
    range: LayoutRange;
}): ValuePiece[];
export declare function measureLegend(styles: IntrinsicStyles, box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[]): {
    box: IntrinsicBox;
    hidden: boolean;
    effectiveTop: Rational;
    style?: never;
    blockSize?: never;
    inlineSize?: never;
    vertical?: never;
    horizontal?: never;
    offset?: never;
} | {
    box: IntrinsicBox;
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
    hidden?: never;
} | null;
export {};
