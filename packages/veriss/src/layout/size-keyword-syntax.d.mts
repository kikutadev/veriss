export declare const browsers: readonly ["chromium", "firefox", "webkit"];
/** For declarations [{ prop, value }] of one rule (in order): [{ property, used: { chromium, firefox, webkit }, keywords }] where browsers end on different kinds of value. */
export declare function sizeKeywordSplits(declarations: readonly {
    prop: string;
    value: string;
}[]): {
    property: string;
    used: Record<(typeof browsers)[number], string | null>;
    keywords: string[];
}[];
