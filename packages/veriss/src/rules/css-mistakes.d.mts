type State = ReadonlySet<string> | undefined;
type CssValue = string | number | undefined;
interface Source {
    file: string;
    line: number;
    selector: string;
    specified?: string;
    layer?: string | undefined;
}
interface Declaration {
    property: string;
    value: CssValue;
    file?: string;
    line?: number;
}
interface RuleLocation {
    file: string;
    line: number;
    selector: string;
    selectors: readonly RuleSelector[];
}
interface Rule extends RuleLocation {
    declarations: readonly Declaration[];
}
type SelectorPart = {
    [K in 'tag' | 'class' | 'id' | 'lang' | 'dir' | 'path']: {
        kind: K;
        value: string;
    };
}['tag' | 'class' | 'id' | 'lang' | 'dir' | 'path'] | {
    kind: 'required' | 'read-write' | 'disabled';
    value: boolean;
} | {
    kind: 'any' | 'not' | 'has' | 'root' | 'link' | 'placeholder-shown' | 'structural' | 'attribute';
};
interface RuleSelector {
    source: string;
    parts: readonly SelectorPart[];
    state?: string | undefined;
    pseudoElement?: string | undefined;
    chain?: readonly unknown[];
}
export interface RuleBox {
    tag: string;
    path: string;
    label: string;
    classes: readonly string[];
    children?: readonly RuleBox[] | undefined;
    inline?: readonly RuleBox[] | undefined;
    anonymous?: boolean;
    pseudo?: string | undefined;
    focusable?: boolean | 'dynamic';
    inputType?: string | undefined;
    canvasSize?: {
        width?: number | string;
        height?: number | string;
    };
    svgSize?: {
        paint?: {
            fillSet?: boolean;
            strokeSet?: boolean;
        };
    };
    nativeStates?: {
        required?: boolean | 'dynamic';
    };
    tabIndex?: number | 'dynamic';
    contentEditable?: boolean | string;
    attributes?: Readonly<Record<string, unknown>>;
    boundaries?: readonly {
        kind: string;
    }[];
    tablePart?: boolean | string;
    text?: boolean | undefined;
    textContent?: string | undefined;
    whitespace?: boolean | undefined;
    value?: string | undefined;
    placeholder?: string | undefined;
    placeholderAttr?: boolean | undefined;
    href?: string | undefined;
    [parent: symbol]: RuleBox | undefined;
}
export interface RuleStyle {
    [property: string]: unknown;
    display: string;
    position: string;
    direction?: string;
    content?: string;
    'max-block-size'?: string;
    'text-align'?: string;
    'text-wrap-style'?: string;
    hyphens?: string;
    'z-index'?: string;
    $sources: Readonly<Record<string, Source>>;
    $overridden?: Readonly<Record<string, readonly Source[] | undefined>>;
    $invalid?: readonly {
        property: string;
        file: string;
        line: number;
        message: string;
    }[];
    $layerShadowed?: readonly {
        property: string;
        value: CssValue;
        winnerValue: CssValue;
        loser: Source;
        winner: Source;
    }[];
    $tableOverflow?: Readonly<Record<string, CssValue>>;
}
interface Ancestor {
    box: RuleBox;
    style: RuleStyle;
}
interface ViewportRange {
    min: number;
    max: number;
    minInclusive: boolean;
    maxInclusive: boolean;
    minExact: string;
    maxExact: string;
}
interface RangeFacts {
    range: ViewportRange;
    heightRange?: ViewportRange;
    region?: {
        vertices: readonly {
            width: string;
            height: string;
        }[];
        constraints: readonly {
            coefficient: string;
            constant: string;
            heightCoefficient?: string;
            strict: boolean;
        }[];
    };
}
interface WarningSource {
    property: string;
    file: string;
    line: number;
    selector?: string;
}
export interface CssMistakeWarning extends Partial<RangeFacts> {
    code: string;
    severity: 'warning';
    message: string;
    box?: string;
    path?: string;
    property?: string | undefined;
    properties?: string[];
    selector?: string;
    state?: string | undefined;
    css?: WarningSource[];
    keyframes?: string;
    loserAt?: string;
    winnerAt?: string;
    winner?: string;
    scroller?: string;
    axes?: string[];
    sides?: string[];
    browsers?: {
        aligns: string[];
        ignores: string[];
    };
}
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
    styles: (box: RuleBox, region: R, ancestors: readonly Ancestor[], inherited: RuleStyle | undefined, emit: boolean, gridItem: boolean, state?: State) => readonly {
        style: RuleStyle;
    }[];
}
interface Tools {
    PARENT: symbol;
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
