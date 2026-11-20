export { simpleSelector } from './simple-selector.mjs';
export type Combinator = ' ' | '>' | '+' | '~';
export type Specificity = [number, number, number];
export type Boundary = {
    kind: string;
    name?: string;
};
export interface SelectorBox {
    tag: string;
    classes: readonly string[];
    [PARENT]?: SelectorBox;
    children?: readonly SelectorBox[];
    inline?: readonly SelectorBox[];
    id?: string;
    path?: string;
    label?: string;
    documentRoot?: boolean;
    anonymous?: boolean;
    pseudo?: string | boolean;
    boundaries?: readonly Boundary[];
    inputType?: string;
    placeholderAttr?: boolean;
    value?: string;
    text?: boolean;
    whitespace?: boolean;
    textContent?: string;
    nativeStates?: Record<string, boolean | string | undefined>;
    contentEditable?: unknown;
    attributes?: Record<string, string | boolean | number | undefined>;
    disabled?: boolean | string;
    lang?: string;
    dirAttr?: string;
    href?: string;
}
type AttributePart = {
    kind: 'attribute';
    name: string;
    operator?: string;
    value?: string;
    insensitive?: boolean;
};
type StructuralPart = {
    kind: 'structural';
    name: string;
    a?: number;
    b?: number;
    of?: Selector[];
};
type HasPart = {
    kind: 'has';
    relative: {
        combinator: Combinator;
        selector: Selector;
    }[];
    choices: Selector[];
};
export type SelectorPart = {
    kind: 'tag' | 'class' | 'id' | 'path' | 'lang' | 'dir';
    value: string;
} | {
    kind: 'disabled' | 'required' | 'read-write';
    value: boolean;
} | {
    kind: 'root' | 'placeholder-shown';
} | {
    kind: 'link';
    name: string;
} | AttributePart | StructuralPart | HasPart | {
    kind: 'not' | 'any';
    choices: Selector[];
};
export interface SelectorLink {
    compound: Selector;
    combinator: Combinator;
}
export interface Selector {
    source: string;
    parts: SelectorPart[];
    specificity: Specificity;
    pseudoElement?: string | undefined;
    state?: string;
    chain?: SelectorLink[];
    combinator?: Combinator | null | undefined;
    scope?: Selector & {
        limit?: Selector;
    };
    scopeMode?: 'self' | 'child' | 'descendant';
}
export interface SelectorRule {
    selectors: Selector[];
    attached?: boolean;
    file: string;
    line: number;
}
export declare const greaterRank: (a: readonly number[], b: readonly number[]) => boolean;
/** The parent element of a box (set by the tree builder; a symbol, so spread copies keep it and JSON skips it). */
export declare const PARENT: unique symbol;
export declare function compileSelector(source: string, depth?: number, complex?: boolean): Selector;
/** `state` is the set of user-action states that hold (e.g. focus): a state selector matches only then. */
/**
 * @scope: the number of generations from box up to the nearest ancestor matching the scope root, or null when none
 * does. Without the whole ancestor chain (a component root whose page is not known) the answer is not known.
 */
export declare function scopeProximity(selector: Selector, box: SelectorBox, state?: ReadonlySet<string>): number | null;
export declare function matches(selector: Selector | string, box: SelectorBox, state?: ReadonlySet<string>): boolean;
/** Runs fn with siblings of these tags left out of :nth-child / :first-child / :last-child / + / ~ (a what-if). */
export declare function ignoringSiblings<T>(tags: ReadonlySet<string>, fn: () => T): T;
/** The elements a combinator reaches from a box: its parent (>), ancestors (descendant), previous sibling (+) or earlier siblings (~). */
export declare function neighbors(box: SelectorBox, combinator: Combinator): SelectorBox[];
export declare const placeholderField: (box: SelectorBox) => boolean;
export declare const placeholderShown: (box: SelectorBox) => boolean;
export declare const requiredCapable: (box: SelectorBox) => boolean;
export declare const optionalDivergent: (box: SelectorBox) => boolean;
export declare function optionalDivergence<T>(fn: () => T): T;
export declare function asFormField<T>(fn: () => T): T;
export declare function readWriteKnown(box: SelectorBox): boolean;
export declare function asEditable<T>(fn: () => T): T;
export declare function readWrite(box: SelectorBox): boolean;
export declare function languageOf(box: SelectorBox): string | undefined;
export declare function langMatches(box: SelectorBox, tag: string): boolean | "unknown";
export declare function directionality(box: SelectorBox): 'ltr' | 'rtl' | 'unknown';
export declare const isLink: (box: SelectorBox) => boolean;
/** The compound (tag, classes, id, :root, :is/:where) alone, ignoring states, pseudo-elements and combinators. */
export declare function compoundMatches(selector: Pick<Selector, 'parts'>, box: SelectorBox): boolean;
/** The value tests of a selector (any compound, :is/:where/:not arguments) on an attribute that is dynamic on this
 * box, where the compound's other parts match it: whether the rule applies is not known. */
export declare function dynamicAttributeTests(selector: Selector, box: SelectorBox): SelectorPart[];
