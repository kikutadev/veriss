/** Font settings a text contract was measured with; the core checks the computed CSS against them. */
export interface TextFont {
    family: string;
    size: number;
    lineHeight: number;
    weight?: number;
    letterSpacing?: number;
}
type OverflowWrap = 'normal' | 'anywhere' | 'break-word';
type Pair = [number, number];
type Edges = [number, number, number, number];
type InlineText = {
    text: string;
    weight?: number;
    edges?: Edges;
    atomic?: never;
    at?: never;
};
type InlineAtomic = {
    atomic: Pair;
    at: number;
    text?: never;
    weight?: never;
    edges?: never;
};
type InlinePiece = string | InlineText | InlineAtomic;
export type TextContract = {
    font: TextFont;
    content: string;
    overflowWrap?: OverflowWrap;
    lang?: string;
    inline?: Record<string, InlinePiece>;
    characters?: never;
    maxLength?: never;
} | {
    font: TextFont;
    characters: string;
    maxLength: number;
    lang?: string;
    content?: never;
    overflowWrap?: never;
    inline?: never;
};
export interface FontInfo {
    unitsPerEm: number;
    axes: {
        tag: string;
        min: number;
        default: number;
        max: number;
    }[];
    ascent?: number;
    descent?: number;
    os2?: {
        fsSelection: number;
        typoAscender: number;
        typoDescender: number;
    } | null;
}
export interface TextShaper {
    load(data: Uint8Array): number;
    info(handle: number): FontInfo;
    shape(handle: number, text: string, size: number, axes: Record<string, number>, language?: string, ligatures?: boolean): unknown;
}
export interface FontEntry {
    data: Uint8Array;
    weight?: number;
    sha256?: string;
    file?: string;
}
export interface TextLimits {
    characters?: number;
    maxLength?: number;
}
interface LineStep {
    atLeastInlineSize: number;
    lines: number | null;
}
interface LineLayout {
    atLeastInlineSize: number;
    below: number;
    breaks: number[];
}
export interface LineProfile {
    text: string;
    width: number;
    minContent: number;
    overflowWrap: OverflowWrap;
    profile: LineStep[];
}
interface DetailedLineProfile extends LineProfile {
    layouts: LineLayout[][];
    floor: number;
    chars: string[];
}
export interface MeasuredText {
    text: string;
    width: number;
    bound: number;
    range?: Pair;
}
export interface TextDomainBounds {
    characters: string;
    maxLength: number;
    perCharacter: number;
    pairAdjustment: number;
    widest: string;
    bounds: number[];
}
interface MeasureInput {
    font: TextFont;
    text: string;
    lang?: string | undefined;
}
interface DomainInput {
    font: TextFont;
    characters: string;
    maxLength: number;
    lang?: string | undefined;
}
interface BreakInput extends MeasureInput {
    overflowWrap?: OverflowWrap;
    spacing?: {
        letter: number;
        word: number;
    } | undefined;
    extra?: number[] | undefined;
    weightAt?: (number | undefined)[] | undefined;
}
interface BoxInput {
    text?: TextContract;
    textRuns?: readonly BoxInput[];
    wrap?: string;
    minInlineSize?: unknown;
    intrinsicBlockSize?: unknown;
    minBlockSize?: unknown;
}
interface GeneratedText {
    selector?: string | null;
    kind: string;
    text: string;
}
interface GeneratedResult {
    generatedText?: GeneratedText[];
}
type TextOptions = {
    boxes?: Record<string, BoxInput>;
};
export interface TextMetrics {
    measureText(input: MeasureInput): MeasuredText;
    domainBounds(input: DomainInput): TextDomainBounds;
    /** Line counts of wrapped fixed text over the content width (UAX #14 subset). */
    breakLines(input: BreakInput): DetailedLineProfile;
    /** Replace text box contracts with derived geometry and font provenance. */
    resolveBoxes<T extends Record<string, object>>(boxes?: T): Record<string, object>;
    resolveOptions<T extends TextOptions>(options: T): T;
    withGeneratedText<T extends TextOptions, R extends GeneratedResult>(analyze: (options: T) => R, options: T): R;
}
export declare const layoutAllowance: {
    unit: number;
    rule: string;
};
export declare const upperBound: (width: number) => number;
export declare function scriptSegments(text: string): string[];
export declare const scriptRuns: (text: string) => number;
export declare const textBound: (text: string, width: number) => number;
/**
 * Break opportunities of collapsed text (indices i, a break before character
 * i), or a U_LAYOUT_TEXT_METRICS error for characters and pairs outside the model.
 */
export declare function breakOpportunities(text: string): number[];
/** Create font-derived metrics using the injected shaper. */
export declare function createTextMetrics({ fonts, shaper, limits }: {
    fonts: Record<string, FontEntry>;
    shaper: TextShaper;
    limits?: TextLimits;
}): TextMetrics;
export {};
