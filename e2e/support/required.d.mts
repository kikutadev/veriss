export declare function required<T>(value: T | null | undefined, message: string): T;
export declare function layoutWarnings(report: object): {
    code: string;
    box?: string;
}[];
