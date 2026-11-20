import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import { PARENT } from './selectors.mjs';
import type { LayoutDiagnostic, LayoutExplanation, LayoutRange, LayoutRegion, SourceSpan } from '../layout-contracts.d.ts';
import type { Axis } from './engine-types.mjs';
interface ObligationBox {
    label: string;
    path: string;
    source?: SourceSpan | undefined;
    [PARENT]?: {
        label?: string;
    };
}
interface Ranges {
    range: LayoutRange;
    heightRange?: LayoutRange;
    region?: LayoutRegion;
}
type Annotation = Pick<LayoutDiagnostic, 'text' | 'layout'>;
interface Waiver<Box> {
    box: Box;
    path: string;
    code: string;
    axis: Axis;
    region: Region;
    self: boolean;
}
export declare function createObligationCollector<Box extends ObligationBox>({ block, diagnostics, scrollIntent }: {
    block: boolean;
    diagnostics: LayoutDiagnostic[];
    scrollIntent?: 'css' | undefined;
}): {
    checks: (import("../layout-contracts.d.ts").LayoutScenarioIdentity & {
        hoveredPath?: string;
        box: string;
        path: string;
        code: string;
        axis: "inline" | "block";
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
        available: import("../layout-contracts.d.ts").LayoutAffine;
        required: import("../layout-contracts.d.ts").LayoutAffine;
        enforced: boolean;
    })[];
    waived: Waiver<Box>[];
    ranges: (region: Region) => Ranges;
    cellGrows: (available: Affine2, required: Affine2, box: Box, region: Region) => void;
    scrolls: (style: Readonly<Record<string, unknown>>, axis: "x" | "y") => boolean;
    obligation: (available: Affine2, required: Affine2, box: Box, region: Region, code: string, axis: Axis, enabled?: boolean, explain?: () => LayoutExplanation, annotate?: (offered: Rational) => Annotation) => void;
    flush: () => void;
};
export {};
