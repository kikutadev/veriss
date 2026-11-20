import type { Choices, ContractUnknown, AdapterOptions, FiniteAnalysis } from '@mizchi/veriss-adapter-core';
interface ExpandOptions {
    maxStates?: number | undefined;
    eachCounts?: number[] | undefined;
    sourceLines?: boolean | undefined;
    finiteScopeClasses?: ReadonlyMap<number, string> | undefined;
    ignoreValidatedEvents?: boolean | undefined;
}
/**
 * Enumerate the component's trees.
 * @returns {{ states: { html: string, choices: Record<string, unknown> }[], css: string, unknowns: { code: string, message: string }[], assumptions: string[] }}
 */
export declare function expandSvelte(source: string, { maxStates, eachCounts, sourceLines, finiteScopeClasses, ignoreValidatedEvents }?: ExpandOptions): {
    states: {
        html: string;
        choices: Choices;
    }[];
    css: string;
    unknowns: ContractUnknown[];
    assumptions: string[];
};
export declare const unscopeCSS: (css: string) => string;
/**
 * Analyse every template state of a Svelte component.
 * @param {string} source the .svelte file
 * @param {object} options veriss options (viewport, boxes, accessibility, selectors, …) plus:
 *   pageCSS — CSS for the page around the component (html, body); page(html) — the document around it;
 *   maxStates, eachCounts — the enumeration bounds.
 */
export declare function analyzeSvelte(source: string, { maxStates, eachCounts, sourceLines, ...options }?: AdapterOptions & ExpandOptions): import("@mizchi/veriss-adapter-core").ComponentAnalysis;
export declare function deriveSvelteState(source: string): FiniteAnalysis;
export {};
