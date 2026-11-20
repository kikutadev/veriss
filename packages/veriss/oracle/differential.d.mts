import type { CSSRule, CSSOrigin } from '../src/layout/css.mjs';
import type { BoxTree } from '../src/tree.mjs';
type OracleValue = string | number | string[];
type OracleRow = {
    path: string;
    [key: string]: OracleValue;
};
interface OracleInput {
    css: string;
    tree: BoxTree;
    width: number;
    height: number;
}
export type Oracle = (input: OracleInput, name: string) => OracleRow[];
export type OracleCase = Omit<OracleInput, 'height'> & {
    height?: number;
    name?: string;
};
export type CascadeMutation = ((rules: CSSRule[]) => CSSRule[]) & {
    active?: (rule: CSSRule) => boolean;
};
export type ComparisonStatus = 'same' | 'different' | 'verifier-unsupported';
export interface ComparisonRow {
    path: string;
    property: string;
    status: ComparisonStatus;
    reason?: string;
    verifier?: OracleValue;
    oracle?: OracleValue;
    source?: CSSOrigin;
}
export interface ComparisonResult {
    status: ComparisonStatus;
    reason?: string;
    rows: ComparisonRow[];
}
export declare function decodeOracleRows(value: unknown): OracleRow[];
export declare const oraclePath: string;
export declare function loadOracle(): Promise<Oracle>;
/** Properties both engines model, in the verifier's logical names. */
export declare const comparedProperties: string[];
export declare function normalizeVerifier(property: string, value: unknown): {
    value: OracleValue;
    unsupported?: never;
} | {
    unsupported: string;
    value?: never;
};
export declare function normalizeOracle(property: string, value: OracleValue | undefined): OracleValue;
/**
 * Compare both engines for one concrete viewport. Returns per-property rows.
 * `status`: same | different | verifier-unsupported (CSS rejected, computeStyle
 * threw, or the value is outside the shared vocabulary).
 */
export declare function compareCase(oracle: Oracle, { css, tree, width, height, name }: OracleCase, { mutate }?: {
    mutate?: CascadeMutation;
}): ComparisonResult;
export declare function random(seed: number): {
    next: () => number;
    int: (min: number, max: number) => number;
    pick: <T>(values: readonly T[]) => T;
    chance: (p: number) => boolean;
};
export declare function generateCase(seed: number): OracleCase & {
    seed: number;
};
export {};
