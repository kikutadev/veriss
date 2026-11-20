export interface FontContract {
    family: string;
    size: number;
    lineHeight: number;
    weight?: number;
    style?: 'normal';
    letterSpacing?: number;
    wordSpacing?: number;
}
export interface TextComputedFont {
    'font-family': string;
    'font-size': string;
    'line-height': string;
    'font-weight': string;
    'font-style': string;
    'font-stretch': string;
    'font-variant': string;
    'text-transform': string;
    'letter-spacing': string;
    'word-spacing': string;
}
interface TextLine {
    atLeastInlineSize: number;
    lines: number | null;
}
interface TextLineMetrics {
    kind: 'lines';
    lang?: string;
    overflowWrap: string;
    profile: readonly TextLine[];
}
interface TextLineContract {
    textMetrics: TextLineMetrics;
    font: FontContract;
    intrinsicBlockSize?: number | readonly {
        atLeastInlineSize: number;
        blockSize: number | null;
    }[];
}
interface TextBrowserContract {
    textMetrics?: {
        kind: 'content' | 'domain' | 'lines';
        text?: string;
        inline?: object;
    };
    font?: FontContract;
}
import type { Rational } from './linear.mjs';
export declare const languageTag: RegExp;
export declare const breakingLanguages: Set<string>;
export declare const breaksModeled: (lang: string) => boolean;
export declare function validateFontContract(font: unknown): void;
export declare function validateTextMetrics(metrics: unknown): void;
/**
 * The computed font of `style` must equal the contract. Returns a reason when
 * the derived metrics cannot apply (the caller reports Unknown), else null.
 */
export declare function textFontMismatch(style: TextComputedFont, font: FontContract, defaultFontSize?: number): string | null;
export declare function textBrowserMismatch(engine: string | null | undefined, style: {
    direction?: string;
}, contract: TextBrowserContract): string | null;
/**
 * A line profile was measured for one white-space/overflow-wrap pair and must
 * be the box's block contract (line count × line height). Returns a reason.
 */
export declare function textLinesMismatch(style: {
    'white-space': string;
    'overflow-wrap': string;
    $lang?: string;
}, contract: TextLineContract): string | null;
/**
 * Metrics measured for one content language apply where the element's
 * language (the inherited lang attribute) is that tag, compared without case.
 */
export declare function textLangMismatch(lang: string | undefined, measured: string | undefined): string | null;
/** Line boxes of `lineHeight` that fit `offered` (an exact rational), at most `limit`. */
export declare function fittingLines(lineHeight: number, offered: Rational, limit: number): number;
/** Largest domain length whose bound fits `offered` (an exact rational). */
export declare function fittingLength(metrics: {
    bounds: readonly number[];
}, offered: Rational): number;
export {};
