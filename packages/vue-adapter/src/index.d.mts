import type { Choices, ContractUnknown, ComponentScope, AdapterOptions, FiniteAnalysis } from '@mizchi/veriss-adapter-core';
interface ExpandOptions {
    maxStates?: number | undefined;
    eachCounts?: number[] | undefined;
    sourceLines?: boolean | undefined;
    finiteScopeAttr?: string | undefined;
}
export declare const unscopeVueCSS: (css: string) => string;
export declare function expandVue(source: string, { maxStates, eachCounts, sourceLines, finiteScopeAttr }?: ExpandOptions): {
    states: {
        html: string;
        choices: Choices;
    }[];
    css: string;
    unknowns: ContractUnknown[];
    assumptions: string[];
    scope: ComponentScope;
};
/** Analyse every template state of a Vue SFC (options: veriss options, pageCSS, page, maxStates, eachCounts). */
export declare function analyzeVue(source: string, { maxStates, eachCounts, sourceLines, ...options }?: AdapterOptions & ExpandOptions): import("@mizchi/veriss-adapter-core").ComponentAnalysis;
export declare function deriveVueState(source: string): FiniteAnalysis;
export {};
