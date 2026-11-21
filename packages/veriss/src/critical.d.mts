import type { LayoutOptions, LayoutScrollbarProfile, LayoutSummary } from './layout-contracts.d.ts';
import type { TextMetrics } from './text.mjs';
/** The usual first-view ranges: smartphones (portrait) and PCs. Scrollbars: overlay on phones; overlay or classic on PCs. */
export interface FirstViewProfile {
    name: string;
    viewport: {
        min: number;
        max: number;
        height: {
            min: number;
            max: number;
        };
    };
    scrollbars?: readonly LayoutScrollbarProfile[];
    viewportUnits?: readonly LayoutScrollbarProfile[];
}
export interface CriticalCSS {
    css: string;
    rest: string;
    kept: number;
    dropped: number;
    profiles: {
        name: string;
        status: LayoutSummary['status'];
        unknown: {
            code: string;
            message: string;
        }[];
    }[];
    texts: {
        marker: string;
        sized: string;
    }[];
    elements: {
        path: string;
        tag: string;
        classes: string[];
        critical: boolean;
        reason?: string;
    }[];
}
export interface CriticalOptions extends Omit<LayoutOptions, 'viewport'> {
    profiles?: readonly FirstViewProfile[];
    textMetrics?: TextMetrics;
    fonts?: Readonly<Record<string, {
        file: string;
    }>>;
}
export declare const firstViewProfiles: readonly FirstViewProfile[];
export declare function extractCriticalCSS(source: string, { css, profiles, name, textMetrics, fonts, ...options }: CriticalOptions): CriticalCSS;
