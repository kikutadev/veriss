import type { CatalogInput } from './examples.mjs';
export declare const reset = "*{box-sizing:border-box;margin:0;padding:0}html,body{margin:0}";
export declare function run({ html, css, boxes, vw, accessibility }: Pick<CatalogInput, 'html' | 'css' | 'boxes' | 'accessibility'> & {
    vw?: [number, number];
}): {
    status: "unknown" | "verified" | "violated";
    findings: {
        code: string;
        severity?: string;
        box?: string;
        message?: string;
    }[];
};
