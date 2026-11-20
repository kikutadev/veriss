import type { TextLimits, TextMetrics, TextShaper } from './text.mjs';
export type * from './text.mjs';
export { createTextMetrics, upperBound, layoutAllowance, breakOpportunities, scriptSegments, scriptRuns } from './text.mjs';
export declare const textMetricsPath: string;
export declare function loadShaper(path?: string): Promise<TextShaper>;
/** Load font files (or supplied bytes) and attach SHA-256 provenance. */
export declare function loadTextMetrics({ fonts, limits }: {
    fonts: Record<string, {
        file?: string;
        data?: Uint8Array;
        weight?: number;
    }>;
    limits?: TextLimits;
}): Promise<TextMetrics>;
