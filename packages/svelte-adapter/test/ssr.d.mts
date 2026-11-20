export declare function renderSSR(source: string, props: Record<string, unknown>): Promise<{
    html: string;
    css: string;
}>;
export declare const normalize: (html: string) => string;
