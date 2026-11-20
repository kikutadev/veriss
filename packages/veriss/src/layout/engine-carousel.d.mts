import type { NormalizedBox } from '../tree.mjs';
import type { LayoutDiagnostic, LayoutSummary, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
import type { Region } from './region.mjs';
type VariantReport = Pick<LayoutSummary, 'status' | 'diagnostics' | 'sizes'>;
export declare const hasCarousel: (box: NormalizedBox) => boolean;
export declare function checkCarouselShifts({ root, pristine, block, diagnostics, ranges, analyze }: {
    root: NormalizedBox;
    pristine: NormalizedBox;
    block: boolean;
    diagnostics: LayoutDiagnostic[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    analyze: (root: NormalizedBox) => VariantReport;
}): void;
export {};
