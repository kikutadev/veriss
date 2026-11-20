import type { Region } from './region.mjs';
import type { ComputedStyle, CSSRule, CSSCondition } from './css.mjs';
import type { ParsedCondition } from './conditions.mjs';
import type { createQuerySolver, LoadedSource } from './engine-queries.mjs';
import type { EngineOptions } from './input.mjs';
import type { ImageSize } from '../tree.mjs';
import type { LayoutSummary, LayoutRange, LayoutRegion, LayoutWarning, LayoutAffine, LayoutTextFontFacts } from '../layout-contracts.d.ts';
import type { SolverBox as StyleBox, SolverStyle, SolverAncestor as StyleAncestor } from './engine-solver-types.mjs';
type Condition = ParsedCondition | CSSCondition;
type QueryFact = {
    condition: Condition;
    target: string | undefined;
    box: string;
    matched: boolean;
    region: Region;
};
type PictureSource = {
    condition: ParsedCondition | null;
    facts: ImageSize;
    src: LoadedSource;
};
type SourceUse = {
    box: StyleBox;
    sources: PictureSource[];
    chosen: Set<number>;
    active: Set<number>;
};
export interface EngineStyle extends ComputedStyle {
    $blockFlow?: boolean;
    $inertMain?: {
        property: string;
        value: string;
    };
    $anonymousGridText?: boolean;
    $inlineLevel?: true;
    $inlineDisplay?: string | undefined;
    $listItem?: true;
    $staticPosition?: true;
    $containerCollapse?: true;
    $lineClamp?: number;
    $embedDefaultHeight?: true;
    $iconPaint?: string | undefined;
    $svgUnsized?: 'fills' | 'default';
    $widthFromAttribute?: number;
    $imageUnreserved?: {
        width: number;
        height: number;
        src: string;
    };
    $imageRatioMismatch?: {
        src: string;
        natural: {
            width: number;
            height: number;
        };
        reserved: string;
    };
    $imageRatio?: {
        width: number;
        height: number;
        basis: 'file' | 'attributes';
        follows: boolean;
    };
    $uaControl?: true;
    $viewportLengths?: Record<string, LayoutAffine & {
        source: string;
    }>;
}
type StylePiece = {
    region: Region;
    style: SolverStyle;
};
interface StyleContext {
    rules: readonly CSSRule[];
    preferences: readonly string[];
    hovered: string | undefined;
    untransformed: boolean;
    options: EngineOptions;
    spend: (count: number) => void;
    bounded: <T>(values: T[]) => T[];
    loadedSource: ReturnType<typeof createQuerySolver>['loadedSource'];
    context: ReturnType<typeof createQuerySolver>['context'];
    textFonts: Map<string, Omit<LayoutTextFontFacts, 'path' | 'varied'> | 'varied'>;
    layoutWarnings: LayoutWarning[];
    sourceUse: Map<string, SourceUse>;
    queryFacts: QueryFact[];
    queries: LayoutSummary['queries'];
    invalidSubstitutions: NonNullable<LayoutSummary['invalidSubstitutions']>;
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
    cssMistakes: (box: StyleBox, style: EngineStyle, ancestors: readonly StyleAncestor[], inherited: SolverStyle | undefined, gridItem: boolean, region: Region, state?: ReadonlySet<string>) => void;
    noteTransform: () => void;
}
export declare function createStyleResolver({ rules, preferences, hovered, untransformed, options, spend, bounded, loadedSource, context, textFonts, layoutWarnings, sourceUse, queryFacts, queries, invalidSubstitutions, ranges, cssMistakes, noteTransform }: StyleContext): (box: StyleBox, region: Region, ancestors: readonly StyleAncestor[], inherited: SolverStyle | undefined, emit: boolean, gridItem?: boolean, state?: ReadonlySet<string>) => StylePiece[];
export {};
