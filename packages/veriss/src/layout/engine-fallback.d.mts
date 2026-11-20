import type { InlineBox, createInlineSolver } from './engine-inline.mjs';
import type { SolverStyle as EngineStyle, SolverAncestor as Ancestor } from './engine-solver-types.mjs';
import type { Region } from './region.mjs';
import type { LayoutDiagnostic, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type InlineContext = Parameters<typeof createInlineSolver>[0];
type StyleContext = Pick<InlineContext, 'styles' | 'pseudoWithoutContent' | 'inlineStateTransforms' | 'inlineTextAlignment' | 'inlineAutoMargin' | 'inlineOverflow' | 'decorationNone' | 'firstPseudoInert'> & {
    root: InlineBox;
    initial: Region;
    cssMistakes: (box: InlineBox, style: EngineStyle, ancestors: readonly Ancestor[], inherited: EngineStyle | undefined, gridItem: boolean, region: Region, state?: ReadonlySet<string>) => void;
};
export declare function checkUnknownStyles({ root, initial, styles, cssMistakes, pseudoWithoutContent, inlineStateTransforms, inlineTextAlignment, inlineAutoMargin, inlineOverflow, decorationNone, firstPseudoInert }: StyleContext): void;
type MarkupDiagnostic = LayoutDiagnostic;
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
