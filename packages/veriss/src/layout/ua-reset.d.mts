export declare function suggestReset({ browsers, target }?: {
    browsers?: string[];
    target?: string;
}): {
    css: string;
    rules: {
        selector: string;
        declarations: string[];
        reason: string[];
    }[];
    notes: string[];
};
