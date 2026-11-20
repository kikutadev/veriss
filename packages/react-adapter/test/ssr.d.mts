export declare function compileStylex(source: string, filename?: string): {
    code: string;
    css: string;
};
export declare function compileLinaria(source: string, filename?: string): Promise<{
    code: string;
    css: string;
}>;
export declare function render(code: string, props: Record<string, unknown>): Promise<string>;
