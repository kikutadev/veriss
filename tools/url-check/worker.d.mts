export type ScanResult = {
    sourceUrl: string;
    html: string;
    css: string;
    coverage: 'static' | 'partial';
    notes: string[];
    stylesheets: {
        url: string;
        bytes: number;
    }[];
};
type Fetcher = typeof fetch;
export declare class ScanError extends Error {
    readonly httpStatus: number;
    constructor(message: string, httpStatus?: number);
}
export declare function publicUrl(input: string, base?: string): URL;
export declare function collectPage(rawUrl: string, fetcher?: Fetcher): Promise<ScanResult>;
declare const handler: {
    fetch(request: Request): Promise<Response>;
};
export default handler;
