import type { EngineStyle } from './engine-style.mjs';
import type { EngineOptions, EngineBoxContract } from './input.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { Region, Affine2 } from './region.mjs';
import type { Rational } from './linear.mjs';
import type { Axis } from './engine-types.mjs';
import type { LayoutSummary, LayoutWarning, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type ValidationBox = NormalizedBox & {
    pseudo?: string | boolean;
    contract?: EngineBoxContract | undefined;
};
interface ValidationAllocation {
    inline?: Affine2;
    block?: Affine2 | null | undefined;
    gridItem?: boolean;
    blockFlowChild?: boolean;
    flexItem?: {
        main: Axis;
    };
    autoMargins?: boolean | {
        inline?: boolean;
    };
    flexBlockMinimum?: boolean;
    alignBlock?: Rational;
    root?: boolean;
    $crossMeasure?: boolean;
    $minNatural?: boolean;
    $minRaised?: boolean;
}
export declare const visuallyHiddenStyle: (style: EngineStyle) => boolean;
export declare function createStyleValidator({ block, options, rootTag, uaEngine, layoutWarnings, policies, issue, ranges }: {
    block: boolean;
    options: EngineOptions;
    rootTag: string;
    uaEngine: () => string | null | undefined;
    layoutWarnings: LayoutWarning[];
    policies: LayoutSummary['policies'];
    issue: (code: string, message: string, box: ValidationBox, region: Region, axis?: Axis) => void;
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
}): (style: EngineStyle, box: ValidationBox, region: Region, emit: boolean, available?: ValidationAllocation, parentStyle?: EngineStyle | null) => boolean;
export {};
