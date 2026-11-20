import { type LayoutIR, type EnvironmentProfile, type GeometryEvidence } from '@mizchi/veriss/contracts';
import type { LayoutOptions } from '@mizchi/veriss/src/layout-contracts.d.ts';
type LocalGeometry = NonNullable<Parameters<typeof layoutGeometry>[0]['local']>;
export interface GeometryInput {
    state: string;
    profile: EnvironmentProfile;
    html: string;
    css: string;
    targets: readonly string[];
    local?: LocalGeometry;
    boxes?: LayoutOptions['boxes'];
    knownFonts?: readonly string[];
    defaultFontSize?: number;
    partial?: boolean;
    bindings?: Readonly<Record<string, string>>;
}
export interface GeometrySessionOptions {
    maxEntries?: number;
    maxBytes?: number;
    preferIndependent?: boolean;
    /** Storage must be verifier-owned, authenticated and version-bound. */
    trustedStorage?: {
        get(key: string): LayoutIR | undefined;
        set(key: string, layout: LayoutIR): void;
    };
}
import { layoutGeometry, verifyUI } from '@mizchi/veriss/src/relational-contract.mjs';
export { verifyUI };
export declare function domGeometry(input: GeometryInput): GeometryEvidence[];
export declare function createGeometrySession({ maxEntries, maxBytes, preferIndependent, trustedStorage }?: GeometrySessionOptions): Readonly<{
    domGeometry: (input: GeometryInput) => GeometryEvidence[];
    stats: () => {
        entries: number;
        bytes: number;
        evictions: number;
        full: {
            hits: number;
            misses: number;
            bypassed: number;
        };
        projected: {
            hits: number;
            misses: number;
            bypassed: number;
        };
    };
    clear: () => void;
}>;
