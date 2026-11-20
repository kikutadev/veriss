import type { LayoutSummary, LayoutOptions } from '@mizchi/veriss/src/layout-contracts.d.ts';
export type Choice = string | number | boolean | null;
export type Choices = Record<string, Choice>;
export interface AnalysisFailure {
    status: 'unknown';
    diagnostics: LayoutSummary['diagnostics'];
    sizes: LayoutSummary['sizes'];
}
export interface AnalyzedState {
    html: string;
    choices: Choices;
    report: LayoutSummary | AnalysisFailure;
}
export interface Mark {
    path: string;
    on: string[];
    label: string;
}
export interface ContractFinding {
    code: string;
    severity: 'error';
    box: string;
    rule: string;
    states: Choices[];
    message: string;
    path?: string;
    html?: string;
}
export interface ContractUnknown {
    code: string;
    message: string;
}
export declare function noShift(results: AnalyzedState[], { wrap, name, viewport }: {
    wrap: (html: string) => string;
    name: string;
    viewport?: LayoutOptions['viewport'] | undefined;
}): {
    findings: ContractFinding[];
    unknowns: ContractUnknown[];
};
