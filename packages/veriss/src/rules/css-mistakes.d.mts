type State = ReadonlySet<string> | undefined;
type CssValue = unknown;
import type { SolverBox as RuleBox, SolverStyle as RuleStyle, SolverAncestor as Ancestor } from '../layout/engine-solver-types.mjs';
import type { Selector as RuleSelector } from '../layout/selectors.mjs';
import type { CSSRule as Rule } from '../layout/css.mjs';
import type { LayoutWarning as CssMistakeWarning } from '../layout-contracts.d.ts';
interface RuleLocation {
    file: string;
    line: number;
    selector: string;
    selectors: readonly RuleSelector[];
}
type RangeFacts = {
    range: import('../layout-contracts.d.ts').LayoutRange;
    heightRange?: import('../layout-contracts.d.ts').LayoutRange;
    region?: import('../layout-contracts.d.ts').LayoutRegion;
};
interface TransitionSize {
    box: string;
    path: string;
    properties: string[];
    values: Record<string, string>;
}
interface Dropped {
    property: string;
    value: CssValue;
    reason: string;
    where?: string;
}
interface Report<R> {
    warnings: CssMistakeWarning[];
    unknown: (code: string, message: string, line: number, box: RuleBox, file: string) => unknown;
    diagnostics: readonly {
        code: string;
        path?: string;
        message: string;
    }[];
    ranges: (region: R) => RangeFacts;
}
interface Facts<R> {
    rules: readonly Rule[];
    firstPseudo: readonly RuleLocation[];
    contentRules: readonly (readonly RuleSelector[])[];
    radiusRules: readonly (RuleLocation & {
        zero?: boolean;
    })[];
    keyframeNames: ReadonlySet<string>;
    dependentDeclarations: readonly (RuleLocation & {
        property: string;
        value: CssValue;
    })[];
    userSelectNone: readonly RuleLocation[];
    transitionSizes: TransitionSize[];
    unreadContainers?: readonly {
        file: string;
        line: number;
        selector: string;
    }[];
    styles: (box: RuleBox, region: R, ancestors: readonly Ancestor[], inherited: RuleStyle | undefined, emit: boolean, gridItem: boolean, state?: State) => readonly {
        style: RuleStyle;
    }[];
}
interface Tools {
    PARENT: typeof import('../layout/selectors.mjs').PARENT;
    matches: (selector: RuleSelector, box: RuleBox, state?: State) => boolean;
    droppedOf: (style: RuleStyle, reason: string) => readonly Dropped[];
    droppedPairs: (style: RuleStyle, reason: string) => [string, CssValue][];
    droppedValue: (style: RuleStyle, reason: string) => CssValue;
    transitionsOf: (style: RuleStyle) => readonly {
        property: string;
        duration: string;
    }[];
    animationsOf: (style: RuleStyle) => readonly {
        name: string;
        duration: string;
        fill: string;
        timeline: string;
    }[];
    dependentProperty: Readonly<Record<string, readonly [string, string]>>;
    ignoringSiblings: (tags: ReadonlySet<string>, fn: () => boolean) => boolean;
    directionality: (box: RuleBox) => 'ltr' | 'rtl' | 'unknown';
    langMatches: (box: RuleBox, value: string) => boolean | 'unknown';
    asEditable: (fn: () => boolean) => boolean;
    readWriteKnown: (box: RuleBox) => boolean;
    optionalDivergent: (box: RuleBox) => boolean;
    optionalDivergence: (fn: () => boolean) => boolean;
    requiredCapable: (box: RuleBox) => boolean;
    asFormField: (fn: () => boolean) => boolean;
    placeholderField: (box: RuleBox) => boolean;
    focusable: (box: RuleBox) => boolean;
}
export interface CssMistakeContext<R> {
    report: Report<R>;
    facts: Facts<R>;
    tools: Tools;
}
export declare function createCssMistakes<R>({ report, facts, tools }: CssMistakeContext<R>): {
    firstInert: Set<string>;
    firstPseudoInert: (box: RuleBox, style: RuleStyle) => void;
    stateShadowed: (box: RuleBox, style: RuleStyle, ancestors: readonly Ancestor[], inherited: RuleStyle | undefined, r: R) => void;
    dialogMarginReset: (box: RuleBox, style: Pick<RuleStyle, "$sources">) => void;
    overflowPromoted: (box: RuleBox, style: RuleStyle) => void;
    containerUnitViewport: (box: RuleBox, style: RuleStyle, ancestors: readonly Ancestor[]) => void;
    selectIndent: (box: RuleBox, style: RuleStyle, ancestors: readonly Ancestor[]) => void;
    optionInert: (box: RuleBox, style: RuleStyle, ancestors: readonly Ancestor[]) => void;
    brStyled: (box: RuleBox, style: RuleStyle) => void;
    wrapRestored: (box: RuleBox, style: RuleStyle) => void;
    preserve3dInert: (box: RuleBox, style: RuleStyle, parentStyle?: RuleStyle) => void;
    outOfFlowFlexInert: (box: RuleBox, style: RuleStyle) => void;
    inlineAutoMargin: (box: RuleBox, style: RuleStyle, parentStyle: RuleStyle | undefined) => void;
    alignBrowserDependent: (box: RuleBox, property: string, value: CssValue) => void;
    inlineTextAlignment: (box: RuleBox, style: RuleStyle) => void;
    decorationNone: (box: RuleBox, style: RuleStyle, ancestors: readonly Ancestor[]) => void;
    inlineOverflow: (box: RuleBox, style: RuleStyle) => void;
    inlineStateTransforms: (box: RuleBox, style: RuleStyle) => void;
    pseudoWithoutContent: (pbox: RuleBox, pstyle: RuleStyle) => void;
    cssMistakes: (box: RuleBox, style: RuleStyle, ancestors: readonly Ancestor[], inherited: RuleStyle | undefined, gridItem: boolean, r: R, state: State) => void;
    aspectInert: (box: RuleBox, style: RuleStyle) => void;
    tableRowRadius: (box: RuleBox, style: RuleStyle, state: State) => void;
    contentsInert: (box: RuleBox, style: RuleStyle, region: R) => void;
};
export {};
