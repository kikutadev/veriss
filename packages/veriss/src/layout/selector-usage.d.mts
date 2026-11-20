import type { SelectorBox, SelectorRule, Combinator } from './selectors.mjs';
export interface UsageRow {
    selector: string;
    file: string;
    line: number;
    matched: number;
}
export type UsageWarning = Omit<UsageRow, 'matched'> & {
    code: 'W_CSS_SELECTOR_UNMATCHED' | 'W_CSS_SELECTOR_RELATION';
    severity: 'warning';
    message: string;
    link?: {
        combinator: Combinator;
        compound: string;
    };
};
export declare function selectorUsage(rules: readonly SelectorRule[], boxes: readonly SelectorBox[]): {
    rows: UsageRow[];
    warnings: UsageWarning[];
};
