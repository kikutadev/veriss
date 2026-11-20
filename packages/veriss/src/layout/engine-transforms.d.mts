import type { Rational } from './linear.mjs';
import type { Affine2 } from './region.mjs';
import type { Dimensions } from './engine-types.mjs';
interface TransformStyle {
    transform?: string;
    position?: string;
    'font-size'?: string;
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
}
interface PaintRect {
    origin: Dimensions | null;
    inline: Affine2 | null;
    block: Affine2 | null;
}
export declare const offset: (origin: Dimensions | null, inline: Affine2, block: Affine2) => Dimensions | null;
export declare const rational: (v: string) => Rational;
export declare const affineOf: (style: TransformStyle) => Rational[] | null;
export declare function linearOf(style: TransformStyle): Rational[] | null;
export declare function mapper(matrix: readonly Rational[], centre: Dimensions): <T extends PaintRect>(rect: T) => T | {
    origin: Dimensions;
    inline: Affine2;
    block: Affine2;
};
export declare function scaled(style: TransformStyle, origin: Dimensions | null, inline: Affine2, blockSize: Affine2 | null): {
    origin: Dimensions | null;
    inline: Affine2;
    block: Affine2 | null;
};
export declare function translated(style: TransformStyle, origin: Dimensions | null, size: {
    inline: Affine2;
    block: Affine2 | null;
}, rootFontSize: Rational | null): Dimensions | null;
export declare function relativelyOffset(style: TransformStyle, origin: Dimensions | null): Dimensions | null;
export {};
