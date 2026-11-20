import type { LayoutAffine } from '../../packages/veriss/src/layout-contracts.js';
import type { Choice } from '../../packages/adapter-core/src/index.mjs';
export declare function rationalNumber(value: string | undefined): number;
export declare function evaluateAffine(value: LayoutAffine, width: number, height: number): number;
export declare function repeatedItems(value: Choice | undefined): number[];
