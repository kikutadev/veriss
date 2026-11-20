import type { SelectorBox, SelectorRule } from './selectors.mjs';
export interface SelectorScopeOptions {
    mode: 'scoped' | 'global';
    ancestors?: 'scoped';
    owned?: readonly string[];
    firstLine?: number;
}
export type ScopeWarning = {
    code: 'E_SCOPE_OUTSIDE' | 'E_SCOPE_REACHES';
    severity: 'error';
    selector: string;
    file: string;
    line: number;
    message: string;
    compound?: string;
    boundaries?: string[];
};
export declare function selectorScope(rules: readonly SelectorRule[], boxes: readonly SelectorBox[], scope: SelectorScopeOptions): {
    warnings: ScopeWarning[];
};
