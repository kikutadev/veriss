import type { LayoutDeclaration, SourceSpan, LayoutDiagnostic } from './layout-contracts.d.ts';
export type Attributes = Readonly<Record<string, string | undefined>>;
export type DynamicBoolean = boolean | 'dynamic';
export type ReferenceList = string[] | 'dynamic';
export interface SVGPaint {
    fill?: string;
    stroke?: string;
    shapeFill?: string | undefined;
    shapeStroke?: string | undefined;
    fillSet?: boolean;
    strokeSet?: boolean;
    shapes: number;
}
export interface SVGSize {
    width?: string;
    height?: string;
    viewBox?: {
        width: number;
        height: number;
    } | 'dynamic';
    paint?: SVGPaint | undefined;
}
export interface ImageSize {
    width?: number | 'dynamic';
    height?: number | 'dynamic';
    src?: string;
    srcset?: string;
    media?: string;
    type?: string;
    sizes?: string;
    loading?: string;
}
interface DOMFacts {
    named?: DynamicBoolean | undefined;
    ariaHidden?: DynamicBoolean | undefined;
    focusable?: DynamicBoolean;
    references?: ReferenceList;
    labelledBy?: ReferenceList;
    headers?: ReferenceList;
    tabIndex?: number | undefined;
    equivalent?: string;
    essential?: string;
    alt?: string;
    inputType?: string;
    labelFor?: string;
    placeholder?: boolean;
    placeholderAttr?: boolean;
    role?: string | undefined;
    inputName?: string;
    ariaLabel?: string;
    href?: string | undefined;
    textContent?: string;
    aria?: Record<string, string>;
    nameSource?: string;
    value?: string;
    autocomplete?: string;
    scope?: string;
    controls?: boolean;
    autoplay?: boolean;
    muted?: boolean;
    trackKind?: string;
    accessKey?: string;
    ismap?: boolean;
    colSpan?: number | 'dynamic';
    rowSpan?: number | 'dynamic';
    hiddenAttr?: true | 'dynamic' | 'until-found';
    inert?: true | 'dynamic';
    autofocus?: true | 'dynamic';
    popover?: true | 'dynamic';
    inlineStyle?: string;
    dirAttr?: string;
    target?: string;
    buttonType?: string;
    nativeStates?: Record<string, boolean>;
    disabledAttr?: true | 'dynamic';
    imageSize?: ImageSize;
    svgSize?: SVGSize;
    canvasSize?: {
        width: number | 'dynamic';
        height: number | 'dynamic';
    };
    detailsOpen?: DynamicBoolean;
    dialogOpen?: DynamicBoolean;
}
export interface BoxBoundary {
    kind: 'component' | 'slot' | 'children' | 'html';
    name?: string;
}
export interface BoxTree extends DOMFacts {
    readonly tag: string;
    readonly id?: string | undefined;
    readonly lang?: string;
    readonly classes?: readonly string[];
    readonly children?: readonly BoxTree[];
    readonly runs?: readonly (string | number)[];
    readonly text?: boolean;
    readonly whitespace?: boolean;
    readonly path?: string;
    readonly owner?: string;
    readonly source?: SourceSpan;
    readonly documentRoot?: boolean;
    readonly layoutContracts?: readonly LayoutDeclaration[];
    readonly targets?: readonly string[];
    readonly targetIdentity?: 'stable' | 'unknown';
    readonly boundaries?: readonly BoxBoundary[];
    readonly attributes?: Attributes;
    readonly metaViewport?: string;
    readonly implied?: boolean;
    readonly restructured?: 'implied' | 'unclosed' | 'fostered' | 'nested-form';
    readonly inertAttributes?: readonly string[];
    readonly notAttributes?: readonly string[];
}
export interface NormalizedBox extends DOMFacts {
    tag: string;
    id?: string | undefined;
    lang?: string;
    classes: string[];
    children: NormalizedBox[];
    runs?: (string | number)[];
    text: boolean;
    whitespace?: boolean;
    path: string;
    label: string;
    owner: string;
    source?: SourceSpan;
    documentRoot?: boolean;
    layoutContracts?: readonly LayoutDeclaration[];
    targets?: string[];
    targetIdentity?: 'stable' | 'unknown';
    boundaries?: BoxBoundary[];
    attributes?: Attributes;
    metaViewport?: string;
    implied?: boolean;
    restructured?: BoxTree['restructured'];
    inertAttributes?: string[];
    notAttributes?: string[];
    inline?: NormalizedBox[] | undefined;
    anonymous?: boolean;
    anonymousRuns?: number;
    disabled?: DynamicBoolean;
    inertSubtree?: boolean;
}
export type TreeDiagnostic = Omit<LayoutDiagnostic, 'source'> & {
    source?: SourceSpan | undefined;
};
/**
 * DOM facts for the accessibility rules from an element's attributes
 * ({name: value}; a value of undefined means dynamic). named: a non-empty
 * aria-label, aria-labelledby or title ('dynamic' when only a dynamic value
 * names it); focusable: a link with href, an enabled button, or tabindex >= 0.
 */
export declare function accessibilityFacts(tag: string, attributes: Attributes): DOMFacts;
export declare const phrasingTags: Set<string>;
/** Clone the supplied model: analysis must never attach facts to caller state. */
export declare function normalizeTree(tree: BoxTree, name: string, scripting?: 'enabled'): {
    root: NormalizedBox;
    diagnostics: TreeDiagnostic[];
};
export {};
