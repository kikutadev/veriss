import type { ContractUnknown, AdapterOptions, ComponentExpansion, FiniteAnalysis } from '@mizchi/veriss-adapter-core';
interface ExpandOptions {
    component?: string | undefined;
    maxStates?: number | undefined;
    eachCounts?: number[] | undefined;
    sourceLines?: boolean | undefined;
}
/**
 * Enumerate a React component's DOM states.
 * @param {string} source a module (JSX/TSX) whose default export (or `component`) is a function component
 * @param {{component?: string, maxStates?: number, eachCounts?: number[]}} options
 */
export declare function expandReact(source: string, { component, maxStates, eachCounts, sourceLines }?: ExpandOptions): ComponentExpansion & {
    unknowns: ContractUnknown[];
    assumptions: string[];
};
/**
 * Analyse every state of a React component.
 * @param {string} source the module
 * @param {object} options veriss options plus pageCSS, page, css (an external stylesheet for plain classNames),
 *   component, maxStates, eachCounts
 */
export declare function analyzeReact(source: string, { component, maxStates, eachCounts, sourceLines, css, ...options }?: AdapterOptions & ExpandOptions & {
    css?: string;
}): import("@mizchi/veriss-adapter-core").ComponentAnalysis;
export declare function deriveReactState(source: string): FiniteAnalysis;
export {};
