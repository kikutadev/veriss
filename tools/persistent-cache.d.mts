import type { LayoutIR } from '../packages/veriss/src/layout-contract.mjs';
export declare function openLocalVerificationCache(directory: string, { revision }?: {
    revision?: string;
}): Readonly<{
    geometry: Readonly<{
        get: (k: string) => LayoutIR | undefined;
        set: (k: string, v: LayoutIR) => void;
    }>;
    proofs: Readonly<{
        get: (k: string) => number | undefined;
        set: (k: string, v: number) => void;
    }>;
    flush: () => void;
}>;
