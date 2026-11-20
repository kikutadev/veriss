import type { LayoutOptions, LayoutBoxContract } from '../layout-contracts.d.ts';
import type { Interval } from './linear.mjs';
export interface EngineBoxContract extends Omit<LayoutBoxContract, 'wrap' | 'intrinsicBlockSize'> {
    wrap?: 'normal' | 'anywhere' | 'nowrap' | 'one-line';
    intrinsicBlockSize?: number | readonly {
        atLeastInlineSize: number;
        blockSize: number | null;
    }[];
    placeholderInlineSize?: number;
    maxInlineSize?: number;
    textRuns?: readonly EngineBoxContract[];
}
export interface EngineOptions extends Omit<LayoutOptions, 'boxes' | 'mediaFeatures'> {
    boxes?: Readonly<Record<string, EngineBoxContract>>;
    mediaFeatures?: Readonly<Record<string, string>>;
    ua?: 'chromium' | 'firefox' | 'webkit' | ({
        base?: 'chromium' | 'firefox' | 'webkit';
    } & Readonly<Record<string, unknown>>) | null;
    scope?: {
        mode: 'scoped' | 'global';
        owned?: readonly string[];
        firstLine?: number;
        ancestors?: 'scoped';
    };
    knownFonts?: readonly string[];
    reportTextFonts?: boolean;
    defaultFontSize?: number;
    defaultColors?: boolean;
    scrollIntent?: 'css';
    devicePixelRatios?: readonly number[];
    $devicePixelRatio?: number;
    $animationFrame?: {
        path: string;
        css: string;
    };
    $slideVariant?: true;
    safeArea?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    images?: Readonly<Record<string, {
        width: number;
        height: number;
    }>>;
    accessibility?: boolean | {
        contrast?: 'AA' | 'AAA';
        targetSize?: number;
        targetLevel?: 'AA' | 'AAA';
        profile?: 'all' | 'core';
    };
    selectors?: boolean;
}
export declare const boxTags: Set<string>;
export declare const controlTags: Set<string>, replacedTags: Set<string>;
export declare function validateOptions(options: EngineOptions): Interval;
