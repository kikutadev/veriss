export interface CatalogSide {
    html?: string;
    css?: string;
    caption: string;
}
export interface CatalogExample {
    id: string;
    html: string;
    css: string;
    boxes?: Record<string, {
        minInlineSize: number;
        intrinsicBlockSize: number;
    }>;
    okBoxes?: Record<string, {
        minInlineSize: number;
        intrinsicBlockSize: number;
    }>;
    shot: number;
    mark: string;
    focus?: string;
    hover?: string;
    accessibility?: boolean;
    ng: CatalogSide;
    ok: CatalogSide;
}
export interface CatalogInput extends CatalogExample {
    side: 'ng' | 'ok';
    extra: string;
    caption: string;
}
export declare const examples: CatalogExample[];
export declare const sides: (ex: CatalogExample) => CatalogInput[];
