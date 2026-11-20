import type { Rational } from './linear.mjs';
import type { RegionRelation } from './region.mjs';
/** User preference media features, their values and the default each check assumes (the first). */
export declare const preferenceValues: Readonly<Record<string, readonly string[]>>;
export declare const mediaFeatureValues: Readonly<Record<string, readonly string[]>>;
export declare const validMediaFeatures: (v: unknown) => v is Record<string, string> | undefined;
export declare const mediaFeatureEntries: (v: Readonly<Record<string, string>> | undefined) => [string, string][];
export type ConditionAtom = {
    feature: string;
    relation: RegionRelation;
    value: Rational;
    orientation?: string;
    fixed?: never;
    preference?: never;
} | {
    feature: string;
    fixed: boolean;
    relation?: never;
    value?: never;
    orientation?: never;
    preference?: never;
} | {
    feature: string;
    preference: string;
    relation?: never;
    value?: never;
    orientation?: never;
    fixed?: never;
};
export interface ParsedCondition {
    kind: 'media' | 'container';
    name: string | undefined;
    groups: ConditionAtom[][];
    listed: number;
    params: string;
}
export declare function parseCondition(params: string, kind: 'media' | 'container', mediaFeatures?: Readonly<Record<string, string>>): ParsedCondition;
