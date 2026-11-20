import type { Affine2, RegionRelation } from './region.mjs';
import type { ParsedCondition } from './conditions.mjs';
export type LoadedSource = string | undefined | {
    candidates: string[];
};
interface QueryAncestor {
    inline?: Affine2 | null;
    block?: Affine2 | null;
    box?: {
        label: string;
        path: string;
    };
    type?: string;
    names?: readonly string[];
}
interface CompiledQuery {
    groups: {
        slack: Affine2;
        relation: RegionRelation;
    }[][];
    target: string | undefined;
    path?: string | undefined;
}
export declare const compare: (value: number, relation: RegionRelation) => boolean;
export declare function createQuerySolver(heightKnown: boolean, ratioValue: number | undefined): {
    loadedSource: (srcset?: string, src?: string) => LoadedSource;
    context: (condition: ParsedCondition, ancestors: readonly QueryAncestor[]) => CompiledQuery;
};
export {};
