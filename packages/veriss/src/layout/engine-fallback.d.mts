import type { InlineBox, createInlineSolver } from './engine-inline.mjs';
import type { EngineStyle } from './engine-style.mjs';
import type { Region } from './region.mjs';
import type { LayoutDiagnostic, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type Ancestor = {
    box: InlineBox;
    style: EngineStyle;
    names?: readonly string[];
};
type InlineContext = Parameters<typeof createInlineSolver>[0];
type StyleContext = Pick<InlineContext, 'styles' | 'pseudoWithoutContent' | 'inlineStateTransforms' | 'inlineTextAlignment' | 'inlineAutoMargin' | 'inlineOverflow' | 'decorationNone' | 'firstPseudoInert'> & {
    root: InlineBox;
    initial: Region;
    cssMistakes: (box: InlineBox, style: EngineStyle, ancestors: readonly Ancestor[], inherited: EngineStyle | undefined, gridItem: boolean, region: Region, state?: ReadonlySet<string>) => void;
};
export declare function checkUnknownStyles({ root, initial, styles, cssMistakes, pseudoWithoutContent, inlineStateTransforms, inlineTextAlignment, inlineAutoMargin, inlineOverflow, decorationNone, firstPseudoInert }: StyleContext): void;
type MarkupDiagnostic = Omit<LayoutDiagnostic, 'severity'> & {
    severity: 'error' | 'warning';
    rule: string;
};
export declare function checkMarkupAccessibility({ root, initial, diagnostics, ranges }: {
    root: InlineBox;
    initial: Region;
    diagnostics: MarkupDiagnostic[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
}): void;
export {};
