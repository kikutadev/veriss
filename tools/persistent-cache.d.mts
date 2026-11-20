export declare function openLocalVerificationCache(directory: string, { revision }?: {
    revision?: string;
}): Readonly<{
    geometry: Readonly<{
        get: (k: string) => unknown;
        set: (k: string, v: unknown) => void;
    }>;
    proofs: Readonly<{
        get: (k: string) => number | undefined;
        set: (k: string, v: number) => void;
    }>;
    flush: () => void;
}>;
