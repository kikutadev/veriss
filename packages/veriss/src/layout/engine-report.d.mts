import type { Region } from './region.mjs';
import type { Affine2 } from './region.mjs';
import type { CSSRule } from './css.mjs';
import type { EngineOptions } from './input.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { Dimensions } from './engine-types.mjs';
import type { LayoutSummary, LayoutRange, LayoutRegion, LayoutTextFontFacts } from '../layout-contracts.d.ts';
type BoundRect = {
    origin: Dimensions;
    inline: Affine2;
    block: Affine2;
};
type BoundRow = {
    box: {
        label: string;
    };
    path: string;
    bounds?: readonly {
        region: Region;
        outer: BoundRect | null;
        inner: BoundRect | null;
    }[] | undefined;
};
import type { EngineSize } from './engine-finish.mjs';
export type EngineReport = Omit<LayoutSummary, 'sizes'> & {
    sizes: EngineSize[];
};
type ReportData = Pick<EngineReport, 'diagnostics' | 'policies' | 'checks' | 'sizes' | 'queries' | 'subgrids'>;
type A11y = NonNullable<LayoutSummary['accessibility']>;
type Integrity = NonNullable<LayoutSummary['integrity']>;
interface ReportInput extends ReportData {
    component: string;
    block: boolean;
    options: EngineOptions;
    initial: Region;
    rules: readonly CSSRule[];
    styleSources: readonly {
        kind?: 'reset' | 'app';
        file: string;
    }[];
    boxes: readonly NormalizedBox[];
    geometry: readonly BoundRow[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    scrollbars: NonNullable<LayoutSummary['scrollbars']>;
    invalidSubstitutions: NonNullable<LayoutSummary['invalidSubstitutions']>;
    layoutWarnings: NonNullable<LayoutSummary['layoutWarnings']>;
    pageScroll: LayoutSummary['pageScroll'];
    transitionSizes: NonNullable<LayoutSummary['transitionSizes']>;
    textFonts: ReadonlyMap<string, Omit<LayoutTextFontFacts, 'path' | 'varied'> | 'varied'>;
    untransformed: boolean;
    hovered: string | undefined;
    generatedTexts: NonNullable<LayoutSummary['generatedText']>;
    accessibilityWarnings: A11y['warnings'];
    accessibilityExempted: A11y['exempted'];
    accessibilityNotes: A11y['notes'];
    integrityWarnings: Integrity['warnings'];
    integrityExempted: Integrity['exempted'];
}
export declare function buildLayoutReport({ component, block, options, initial, rules, styleSources, boxes, geometry, ranges, diagnostics, policies, checks, sizes, queries, subgrids, scrollbars, invalidSubstitutions, layoutWarnings, pageScroll, transitionSizes, textFonts, untransformed, hovered, generatedTexts, accessibilityWarnings, accessibilityExempted, accessibilityNotes, integrityWarnings, integrityExempted }: ReportInput): EngineReport;
export {};
