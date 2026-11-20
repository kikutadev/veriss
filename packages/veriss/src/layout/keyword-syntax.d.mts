/** { keyword, allowed, suggest? } when the value has a keyword the property does not take, else null. */
export declare function keywordProblem(property: unknown, value: unknown): {
    keyword: string;
    allowed: string;
    suggest?: string;
} | null;
