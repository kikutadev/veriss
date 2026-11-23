import type { LayoutOptions, LayoutBoxContract, LayoutSummary, LayoutTextFont } from '@mizchi/veriss/src/layout-contracts.d.ts';
import type { TextMetrics } from '@mizchi/veriss/text';
import type { EnvironmentProfile, Status } from '@mizchi/veriss/src/relational-contract.mjs';
import type { Finding, SelectorWarning, LintResult } from './lint.mjs';
import type { Choice, Choices, AnalysisFailure, ContractUnknown } from './noshift.mjs';
import type { SnapshotContract } from './snapshot-contracts.mjs';
export type { Choice, Choices, ContractUnknown } from './noshift.mjs';
export type { Finding, LintMessage } from './lint.mjs';
export type { FiniteAnalysis, FiniteDerived, FiniteHandler, FiniteExpression, FiniteUnknown } from './finite-state.mjs';
export type { GeometryInput, GeometrySessionOptions } from './ui-contracts.mjs';
export { captureViewport, captureClosedScopeTabFocus, captureModalTabFocus, captureControlAvailability, controlAvailabilityObservation, viewportObservation, focusObservation, modalFocusObservation } from './browser-observations.mjs';
export type { BrowserFrame, BrowserFocusStep, BrowserObservationPage, ControlAvailability, ControlExpectation, ControlSelector } from './browser-observations.mjs';
export interface Variant {
    html: string;
    choices: Choices;
}
export interface ComponentScope {
    mode: 'scoped' | 'global';
    ancestors?: 'scoped';
    owned?: string[];
    escapes?: {
        selector: string;
        kind: string;
    }[];
}
export interface ComponentExpansion {
    states: Variant[];
    css: string;
    unknowns?: ContractUnknown[];
    assumptions?: string[];
    scope?: ComponentScope;
}
type UA = NonNullable<EnvironmentProfile['ua']>;
type AdapterBox = LayoutBoxContract & {
    placeholderInlineSize?: number;
    maxInlineSize?: number;
};
export interface AdapterOptions extends Partial<Omit<LayoutOptions, 'css' | 'boxes'>> {
    pageCSS?: string;
    page?: (html: string) => string;
    assumeText?: boolean | {
        lineHeight?: number;
    };
    textMetrics?: Pick<TextMetrics, 'resolveBoxes'>;
    fonts?: Record<string, object>;
    textResize?: boolean;
    documentSnapshots?: boolean;
    geometryContracts?: SnapshotContract[];
    uas?: UA[];
    ua?: UA;
    knownFonts?: readonly string[];
    defaultColors?: boolean;
    defaultFontSize?: number;
    boxes?: Record<string, AdapterBox>;
    selectors?: boolean;
    accessibility?: boolean | {
        contrast?: 'AA' | 'AAA';
        targetSize?: number;
        targetLevel?: 'AA' | 'AAA';
        profile?: 'all' | 'core';
    };
    devicePixelRatios?: readonly number[];
    safeArea?: EnvironmentProfile['safeArea'];
    images?: Record<string, {
        width: number;
        height: number;
    }>;
    scrollIntent?: 'css';
}
type FontFacts = LayoutTextFont;
interface SelectorRow {
    selector: string;
    file: string;
    line: number;
    matched: number;
}
type ReportDiagnostic = {
    code: string;
    severity: 'error' | 'warning' | 'unknown';
    message: string;
    box?: string | undefined;
    path?: string | undefined;
    rule?: string;
    css?: unknown;
    layout?: string;
};
interface ReportDetails {
    textFonts?: FontFacts[];
    layoutWarnings?: ReportDiagnostic[];
    accessibility?: {
        warnings: ReportDiagnostic[];
    };
    selectors?: {
        rows: SelectorRow[];
        warnings: SelectorWarning[];
    };
    transitionSizes?: {
        path: string;
        box: string;
        properties: string[];
        values: Record<string, string>;
    }[];
    pageScroll?: {
        fits: boolean;
        overflows: boolean;
        stable: boolean;
    };
}
type AdapterReport = (LayoutSummary | AnalysisFailure) & ReportDetails;
export interface StateResult extends Variant {
    report: AdapterReport;
}
export interface ComponentAnalysis extends LintResult {
    status: Status;
    states: StateResult[];
    unknowns: ContractUnknown[];
    coverage: {
        states: number;
        assumptions: string[];
    };
    findings: Finding[];
    selectors?: {
        rows: SelectorRow[];
        warnings: SelectorWarning[];
    };
    browsers?: UA[];
}
/** Choices of two variants merge unless they take one condition both ways (that combination cannot happen). */
export declare const merge: (a: Choices, b: Choices) => Choices | null;
export declare const choose: (key: string, value: Choice) => Choices;
/**
 * Every combination of the variant lists (concatenating their html), dropping contradictory ones; more than
 * `maxStates` combinations call `onLimit` and keep the first ones (the adapter reports that as Unknown).
 */
export declare function product(lists: readonly (readonly Variant[])[], { maxStates, onLimit }?: {
    maxStates?: number;
    onLimit?: (max: number) => void;
}): Variant[];
/** The condition key of an expression's source text: a leading ! is a negation of the same condition. */
export declare function selectorsOf(css: string): string[];
export declare const scopeEscapes: (css: string, kinds: readonly string[]) => {
    selector: string;
    kind: string;
}[];
export declare const boundary: (kind: string, name?: string | null, contract?: string | null) => string;
export declare function literalUnionProps(members: readonly unknown[] | null | undefined, declared?: (name: string) => boolean): Map<string, (string | number)[]>;
export declare function propsMembers(annotation: unknown, body: readonly unknown[] | undefined): unknown[] | null;
export declare const literalChoicesAgree: (choices: Choices, literalProps: ReadonlyMap<string, readonly (string | number)[]>) => boolean;
export declare function conditionKey(text: unknown): {
    key: string;
    negate: boolean;
};
export declare function analyzeStates(component: ComponentExpansion, allOptions?: AdapterOptions): ComponentAnalysis;
/**
 * Analyse explicit post-JavaScript document states against one complete author stylesheet.
 * The caller, not the adapter, is responsible for state enumeration and stylesheet completeness.
 */
export declare function analyzeSnapshots({ states, css, contracts }: {
    states: Variant[];
    css: string;
    contracts?: SnapshotContract[];
}, options?: AdapterOptions): ComponentAnalysis;
export { lint, formatText, recommended } from './lint.mjs';
export { verifyUI, domGeometry, createGeometrySession } from './ui-contracts.mjs';
export { verifyFiniteUI, requireFinite, finiteName, finiteBool, finiteString, finiteCondition, finiteUpdate, finiteTag, finiteAttribute, finiteAttempt, buildFiniteState } from './finite-state.mjs';
