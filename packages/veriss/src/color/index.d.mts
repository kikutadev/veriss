interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}
interface Layer {
    opacity: unknown;
    color: unknown;
    backgroundImage: unknown;
    backgroundColor: unknown;
}
interface CanvasColors {
    canvas: string;
    canvastext: string;
}
export declare function colorSyntaxProblem(value: unknown): string | null;
/** {r, g, b (0–255), a (0–1)} or null when the value is not a modeled color. */
export declare function parseColor(input: unknown): Color | null;
export declare const over: (top: Color, bottom: Color) => Color;
export declare const luminance: ({ r, g, b }: Color) => number;
export declare const contrastRatio: (a: Color, b: Color) => number;
export declare const opaqueValue: (value: unknown) => boolean | null;
/**
 * The text color and its backdrop for a text row: ancestors' backgrounds,
 * innermost first, until an opaque one, over the canvas. Returns
 * {fg, bg, layers} or {unknown} with the reason.
 */
export declare function backdrop(chain: readonly Layer[], uaColors?: CanvasColors | null): {
    unknown: string;
    fg?: never;
    bg?: never;
    opaqueAt?: never;
    canvas?: never;
} | {
    fg: Color;
    bg: Color;
    opaqueAt: number;
    canvas: boolean;
    unknown?: never;
} | {
    fg: Color;
    bg: Color;
    opaqueAt: number;
    unknown?: never;
    canvas?: never;
};
export {};
