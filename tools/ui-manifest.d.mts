import { createGeometrySession } from '../packages/adapter-core/src/ui-contracts.mjs';
import type { RelationalProofSession, RelationalProof } from '../packages/veriss/src/layout-contract.mjs';
type GeometrySession = ReturnType<typeof createGeometrySession>;
type FiniteAnalysis = {
    status: string;
    reason?: string;
};
type ManifestReport = RelationalProof & {
    finiteAnalysis?: FiniteAnalysis;
} | {
    status: 'unknown';
    outcome: 'unknown';
    reason?: string;
    operation?: never;
    finiteAnalysis: FiniteAnalysis;
};
export declare function checkUIManifest(file: string, { session, geometrySession }?: {
    session?: RelationalProofSession;
    geometrySession?: GeometrySession;
}): Promise<ManifestReport>;
export {};
