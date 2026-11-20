export declare function familyProblem(value: unknown): string | null;
export declare function fontShorthandProblem(value: unknown): {
    missing: "size" | "family";
} | {
    family: string;
} | null;
