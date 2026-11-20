import type { RelationalProof } from '@mizchi/veriss/src/relational-contract.mjs';
import type { Choices, ContractUnknown } from './noshift.mjs';
type Severity = 'error' | 'warning' | 'info';
export interface LintMessage {
    file: string;
    severity: Severity;
    code: string;
    message: string;
    line?: number | undefined;
    tier?: 'spec';
    fix?: string | undefined;
    states?: string;
    browsers?: readonly string[];
}
export interface Finding {
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'unknown';
    states: Choices[];
    box?: string | undefined;
    path?: string | undefined;
    html?: string | undefined;
    rule?: string | undefined;
    layout?: string | undefined;
    css?: unknown;
    selector?: string;
    property?: string;
    resized?: string;
    browsers?: readonly string[] | undefined;
    folded?: number;
}
export interface SelectorWarning {
    code: string;
    selector: string;
    message: string;
    line?: number | undefined;
}
export interface LintResult {
    operation?: never;
    states: readonly {
        choices?: Choices;
        report: {
            status?: string;
            diagnostics: readonly {
                code: string;
                severity: string;
                message: string;
                box?: string | undefined;
            }[];
            sizes?: readonly unknown[];
        };
    }[];
    findings: readonly Finding[];
    unknowns: readonly ContractUnknown[];
    selectors?: {
        warnings: readonly SelectorWarning[];
    };
    browsers?: readonly string[];
    coverage?: {
        assumptions?: readonly string[];
    };
}
export interface LintOptions {
    file?: string;
    source?: string;
    profile?: string;
    page?: boolean;
}
export declare const recommended: Record<string, readonly ['error' | 'warning', string]>;
export declare const specRules: Record<string, string>;
export declare function lint(result: LintResult | RelationalProof, { file, source, profile, page }?: LintOptions): LintMessage[];
/** Text output: file:line  severity  code  message  (states) and the fix. */
export declare const formatText: (messages: readonly LintMessage[]) => string;
export {};
