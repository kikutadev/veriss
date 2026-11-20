import { type StateIR, type EnvironmentProfile, type Relation, type Observation, type RelationalProofSession, type RelationalProof } from '@mizchi/veriss/contracts';
import { domGeometry, type GeometryInput } from './ui-contracts.mjs';
import type { Choices } from './noshift.mjs';
type Framework = 'react' | 'vue' | 'svelte';
type BooleanValues = Record<string, boolean>;
type Condition = {
    variable: string;
    negate: boolean;
};
export type FiniteExpression = {
    value: boolean;
    variable?: never;
} | (Condition & {
    value?: never;
});
export interface FiniteHandler {
    variable: string;
    expression: FiniteExpression;
}
export interface FiniteVariant {
    id: string;
    values: BooleanValues;
    html: string;
}
interface FiniteExpansion {
    states: {
        html: string;
        choices: Choices;
    }[];
    unknowns: readonly unknown[];
    assumptions: readonly string[];
    css: string;
}
export interface FiniteDerived {
    status: 'derived';
    framework: Framework;
    scopedCSS: boolean;
    state: StateIR;
    variants: FiniteVariant[];
    css: string;
    assumptions: string[];
    reason?: string;
}
export interface FiniteUnknown {
    status: 'unknown';
    reason: string;
    scopedCSS?: boolean;
}
export type FiniteAnalysis = FiniteDerived | FiniteUnknown;
export interface FiniteUIOptions {
    profiles: readonly EnvironmentProfile[];
    contracts: readonly Relation[];
    targets: readonly string[];
    css?: string;
    geometrySession?: {
        domGeometry: typeof domGeometry;
    };
    proofSession?: Pick<RelationalProofSession, 'verifyUI'>;
    boxes?: GeometryInput['boxes'];
    knownFonts?: GeometryInput['knownFonts'];
    defaultFontSize?: number;
    observations?: readonly Observation[];
}
type UnknownProof = {
    status: 'unknown';
    outcome: 'unknown';
    reason: string;
};
export declare function requireFinite(condition: unknown, message: string): asserts condition;
export declare const finiteName: (n: unknown) => boolean;
export declare const finiteBool: (n: unknown) => n is {
    type: "BooleanLiteral" | "Literal";
    value: boolean;
};
export declare const finiteString: (n: unknown) => n is {
    type: "StringLiteral" | "Literal";
    value: string;
};
export declare const finiteCondition: (n: unknown, vars: ReadonlyMap<string, boolean>) => Condition;
export declare const finiteUpdate: (n: unknown, vars: ReadonlyMap<string, boolean>) => FiniteExpression;
export declare function finiteTag(tag: string, ancestorTags: readonly string[]): void;
export declare function finiteAttribute(name: string, value: unknown): asserts value is string;
export declare const finiteAttempt: <T>(fn: () => T) => T | FiniteUnknown;
export declare function buildFiniteState(expanded: FiniteExpansion, variables: ReadonlyMap<string, boolean>, handlers: ReadonlyMap<string, FiniteHandler>, { framework, scopedCSS }: {
    framework: Framework;
    scopedCSS?: boolean;
}): FiniteDerived;
export declare function verifyFiniteUI(analysis: FiniteAnalysis, { profiles, contracts, targets, css, geometrySession, proofSession, boxes, knownFonts, defaultFontSize, observations }: FiniteUIOptions): RelationalProof | UnknownProof;
export {};
