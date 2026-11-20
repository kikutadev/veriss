import type { Region } from './region.mjs';
import type { LayoutDiagnostic, LayoutSummary, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
import type { NormalizedBox } from '../tree.mjs';
import type { CSSRule } from './css.mjs';
import type { AnimationFrame } from './animation-extremes.mjs';
type ShiftBox = NormalizedBox & {
    pseudo?: string | boolean;
};
type ShiftSize = LayoutSummary['sizes'][number] & {
    $shown?: {
        region: Region;
    };
};
type ShiftReport = Pick<LayoutSummary, 'status' | 'diagnostics'> & {
    sizes: readonly ShiftSize[];
};
interface ShiftDiagnostic extends LayoutDiagnostic {
    hovered?: string;
    hoveredPath?: string;
    animated?: string;
    animatedPath?: string;
    animation?: string;
    field?: string;
    delta?: string;
    offset?: number;
    scrollDriven?: boolean;
    scoreBound?: number | {
        window: number;
        perIteration: number;
        iterations: number;
        startJump?: number;
        endJump?: number;
        viewport: {
            width: number;
            height: number;
        };
        assumes: string;
    };
}
interface ShiftInput {
    block: boolean;
    sizes: readonly ShiftSize[];
    diagnostics: ShiftDiagnostic[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
}
export interface AnimatedBox {
    box: ShiftBox;
    region: Region;
    name: string;
    position: string;
    duration: string;
    count: string;
    direction: string;
    easing?: string;
    delay?: string;
    fill?: string;
    scrollDriven?: boolean;
    style: Readonly<Record<string, unknown>>;
}
export declare function checkHoverShifts({ root, rules, block, sizes, diagnostics, ranges, analyze }: ShiftInput & {
    root: ShiftBox;
    rules: readonly CSSRule[];
    analyze: (path: string) => ShiftReport;
}): void;
export declare function checkAnimationShifts({ block, sizes, diagnostics, ranges, animated, keyframeFrames, heightKnown, analyze }: ShiftInput & {
    animated: readonly AnimatedBox[];
    keyframeFrames: ReadonlyMap<string, readonly AnimationFrame[]>;
    heightKnown: boolean;
    analyze: (path: string, css: string) => ShiftReport;
}): void;
export {};
