import type { Rational } from './linear.mjs';
import type { UAProfile } from './ua-profile.mjs';
import type { PropertyRegistration, VariableExpression, VariableEnvironment } from './variables.mjs';
import type { Selector, SelectorBox } from './selectors.mjs';
import type { ParsedCondition } from './conditions.mjs';
import type { MediaFeatures } from '../layout-contracts.d.ts';
import type { SyntaxNote } from '../rules/syntax-notes.mjs';
import type { DroppedStyle } from './dropped.mjs';
type Pair<T> = [T, T];
type CSSValueMap = Record<string, string | undefined>;
type SafeArea = Readonly<Record<string, number>>;
export { matches, simpleSelector } from './selectors.mjs';
export declare function setRootFontSize(size: Rational | null): void;
export declare function setUAProfile(profile: UAProfile | null): void;
export declare function setRegisteredProperties(registry: ReadonlyMap<string, PropertyRegistration> | null | undefined): void;
export declare const registeredValueProblem: (name: string, text: unknown) => string | null;
export declare function setSafeArea(area: SafeArea | "unknown" | null): void;
export declare const viewportLength: (text: unknown) => boolean;
export declare function px(text: string): Rational;
export declare const noPseudoHost: (box: Pick<SelectorBox, "tag" | "inputType">) => boolean;
export declare const containsFixed: (style: Pick<ComputedStyle, "transform" | "backdrop-filter" | "will-change"> | null | undefined) => boolean;
export declare const dependentProperty: Record<string, Pair<string>>;
export declare const paintProperties: string[];
export declare const textProperties: string[];
/** Marker for longhands set by the `font` shorthand, which is not modeled. */
export declare const fontShorthand = "font-shorthand";
export interface CSSLocation {
    file: string;
    line: number;
}
export interface CSSCondition extends ParsedCondition {
    css: CSSLocation;
}
export interface CSSPreference {
    feature: string;
    value: string;
}
export interface PendingDeclaration {
    property: string;
    expression: VariableExpression;
}
interface DeclarationBase extends CSSLocation {
    property: string;
    value: string | undefined;
    important: 0 | 1;
    flip?: string;
    specified?: string;
}
export type CSSDeclaration = DeclarationBase & ({
    expression: VariableExpression;
    pending?: never;
} | {
    pending: PendingDeclaration;
    expression?: never;
} | {
    pending?: never;
    expression?: never;
});
export interface CSSRule extends CSSLocation {
    selectors: Selector[];
    declarations: CSSDeclaration[];
    contexts: CSSCondition[];
    layer: number | null;
    layerName?: string;
    attached?: boolean;
    preferences?: CSSPreference[];
    stateGeometry?: boolean;
    stateLayout?: boolean;
    hoverLayout?: boolean;
}
interface CSSRuleReference extends CSSLocation {
    selectors: Selector[];
    selector: string;
}
interface DependentDeclaration extends CSSRuleReference {
    contexts: CSSCondition[];
    property: string;
    value: string;
}
interface MarkerSizing extends CSSLocation {
    selectors: Selector[];
    property: string;
}
interface RadiusRule extends CSSRuleReference {
    zero?: true;
}
interface Keyframe {
    offset: number;
    props: CSSValueMap;
    layout?: string;
    easing?: string;
}
interface FontFace extends CSSLocation {
    family: string;
    display: string;
    local: boolean;
    embedded: boolean;
    overrides: string[];
}
interface StartingRule extends CSSLocation {
    selectors: Selector[];
    declarations: {
        property: string;
        value: string;
        important: boolean;
    }[];
    order: number;
    contexts: CSSCondition[];
}
export interface CSSSheet {
    css: string;
    file: string;
}
export type CSSDiagnostic = (code: string, message: string, line?: number, filename?: string, detail?: unknown) => void;
interface CSSParseOptions {
    scripting?: 'enabled';
    mediaFeatures?: MediaFeatures;
}
export declare function parseLayoutCSS(sheets: readonly CSSSheet[], diagnostic: CSSDiagnostic, { scripting, mediaFeatures }?: CSSParseOptions): {
    rules: CSSRule[];
    layers: string[];
    notes: SyntaxNote[];
    keyframes: Set<string>;
    dependentDeclarations: DependentDeclaration[];
    markerSizing: MarkerSizing[];
    firstPseudo: CSSRuleReference[];
    radiusRules: RadiusRule[];
    contentRules: Selector[][];
    userSelectNone: CSSRuleReference[];
    keyframeFrames: Map<string, Keyframe[]>;
    fontFaces: FontFace[];
    registered: Map<string, PropertyRegistration>;
    defaultNamespace: CSSLocation[];
    startingRules: StartingRule[];
};
declare const textInitial: {
    'font-family': string;
    'font-size': string;
    'line-height': string;
    'font-weight': string;
    'font-style': string;
    'font-stretch': string;
    'font-variant': string;
    'text-transform': string;
    'letter-spacing': string;
    'word-spacing': string;
    'text-align': string;
};
export interface CSSBox extends SelectorBox {
    controls?: boolean;
    focusable?: boolean | 'dynamic';
    hiddenAttr?: boolean | 'until-found' | 'dynamic';
    popover?: boolean | 'dynamic';
    dialogOpen?: boolean | 'dynamic';
}
type PendingCSSDeclaration = DeclarationBase & {
    pending: PendingDeclaration;
    expression?: never;
};
type CascadeValue = string | PendingCSSDeclaration | undefined;
interface OriginCondition {
    kind: CSSCondition['kind'];
    name?: string;
    params: string;
    css: CSSLocation;
}
export interface CSSOrigin extends CSSLocation {
    selector: string;
    layer?: string | undefined;
    specified: string | undefined;
    conditions?: OriginCondition[];
    logical?: true;
}
type SourceMap = Record<string, CSSOrigin | undefined>;
type OriginLists = Record<string, CSSOrigin[]>;
interface LayerShadow {
    property: string;
    loser: CSSOrigin;
    winner: CSSOrigin;
    value: CascadeValue;
    winnerValue: CascadeValue;
}
interface InvalidDeclaration extends CSSLocation {
    property: string;
    code: string;
    message: string;
    longhands: string[];
}
interface ComputedMetadata extends DroppedStyle {
    $uaBorder?: true;
    $lang?: string;
    $scheme?: string;
    $fixed?: true;
    $sticky?: boolean;
    $stacks?: true;
    $contentsRemoved?: true;
    $sources?: SourceMap;
    $layerShadowed?: LayerShadow[];
    $dormant?: OriginLists;
    $overridden?: OriginLists;
    $invalid?: InvalidDeclaration[];
    $variables?: VariableEnvironment;
    $hiddenInputDisplay?: string | undefined;
    $pseudoNotRendered?: string | undefined;
    $tableOverflow?: CSSValueMap;
}
type KnownComputedProperties = Partial<Record<keyof ReturnType<typeof defaultStyle> | keyof typeof textInitial | `scroll-${'margin' | 'padding'}-${'top' | 'right' | 'bottom' | 'left'}` | 'content' | 'clear' | 'column-count' | 'column-width' | 'list-style-image', string | undefined>>;
export interface ComputedStyle extends ComputedMetadata, KnownComputedProperties {
    $sources: SourceMap;
    $invalid: InvalidDeclaration[];
    [key: string]: unknown;
}
export interface InheritedStyle {
    [key: string]: unknown;
    $variables?: VariableEnvironment;
    $lang?: string;
    $blockFlow?: boolean;
    display?: string | undefined;
}
interface StyleOptions {
    spend?: ((n?: number) => void) | undefined;
    state?: ReadonlySet<string> | undefined;
    rtl?: boolean;
}
declare function defaultStyle(box: CSSBox, inherited: InheritedStyle): {
    'color-scheme': string;
    cursor: string;
    'list-style-type': string;
    'animation-name': string;
    'animation-duration': string;
    'animation-iteration-count': string;
    'animation-play-state': string;
    'animation-direction': string;
    'animation-timing-function': string;
    'animation-delay': string;
    'animation-fill-mode': string;
    'animation-timeline': string;
    'transition-property': string;
    'transition-duration': string;
    'transition-timing-function': string;
    'transition-delay': string;
    'table-layout': string;
    'border-collapse': string;
    'border-spacing': string;
    'caption-side': string;
    'empty-cells': string;
    'vertical-align': string;
    fill: string;
    stroke: string;
    'list-style-position': string;
    'caret-color': string;
    color: string;
    'text-decoration-line': string;
    visibility: string;
    'pointer-events': string;
    opacity: string;
    'flex-direction': string;
    'flex-wrap': string;
    'flex-grow': string;
    'flex-shrink': string;
    'flex-basis': string;
    'justify-content': string;
    order: string;
    'overflow-x': string;
    'overflow-y': string;
    'white-space': string;
    'scrollbar-gutter': string;
    'scrollbar-width': string;
    appearance: string;
    'overflow-wrap': string;
    float: string;
    position: string;
    left: string;
    right: string;
    top: string;
    bottom: string;
    'writing-mode': string;
    direction: string;
    display: string;
    'aspect-ratio': string;
    'box-sizing': string;
    'inline-size': string;
    'min-inline-size': string;
    'max-inline-size': string;
    'padding-left': string;
    'padding-right': string;
    'border-left': string;
    'border-right': string;
    'padding-top': string;
    'padding-bottom': string;
    'border-top': string;
    'border-bottom': string;
    'border-top-color': string;
    'border-right-color': string;
    'border-bottom-color': string;
    'border-left-color': string;
    'margin-left': string;
    'margin-right': string;
    'margin-top': string;
    'margin-bottom': string;
    'block-size': string;
    'min-block-size': string;
    'max-block-size': string;
    'grid-template-columns': string;
    'grid-template-rows': string;
    'grid-auto-rows': string;
    'grid-auto-flow': string;
    'row-gap': string;
    'container-type': string;
    'container-name': string;
    'align-items': string;
    'align-self': string;
    'align-content': string;
    'column-gap': string;
    'column-span': string;
    'grid-template-areas': string;
    'grid-column': string;
    'grid-row': string;
    'background-color': string;
    'background-image': string;
    'outline-style': string;
    'outline-width': string;
    'outline-color': string;
    'outline-offset': string;
    'box-shadow': string;
    hyphens: string;
    'object-fit': string;
    'object-position': string;
    'scroll-behavior': string;
    'overscroll-behavior-x': string;
    'overscroll-behavior-y': string;
    'scroll-snap-type': string;
    'scroll-snap-align': string;
    resize: string;
    'text-wrap-mode': string;
    'text-wrap-style': string;
    'text-overflow': string;
    'line-clamp': string;
    'box-orient': string;
    'touch-action': string;
    'z-index': string;
    'content-visibility': string;
    'contain-intrinsic-block-size': string;
    isolation: string;
    transform: string;
    'transform-origin': string;
    translate: string;
    rotate: string;
    scale: string;
    'backdrop-filter': string;
    'will-change': string;
    'justify-self': string;
    'justify-items': string;
    clip: string;
    'clip-path': string;
};
export declare function computeStyle(rules: readonly CSSRule[], box: CSSBox, active: (rule: CSSRule) => boolean, inherited?: InheritedStyle, { spend, state, rtl }?: StyleOptions): ComputedStyle;
