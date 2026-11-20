export declare function random(seed: number): () => number;
export declare function generateCase(seed: number, { flex, minmax, margins, block }?: {
    flex?: boolean | undefined;
    minmax?: boolean | undefined;
    margins?: boolean | undefined;
    block?: boolean | undefined;
}): {
    seed: number;
    html: string;
    body: string;
    css: string;
    items: string[];
    containers: string[];
    flexContainers: string[];
};
export declare function viewports(c: {
    css: string;
}, seed: number, { min, max, hmin, hmax }?: {
    min?: number | undefined;
    max?: number | undefined;
    hmin?: number | undefined;
    hmax?: number | undefined;
}): [number, number][];
