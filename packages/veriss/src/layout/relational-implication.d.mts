import type { EnvironmentProfile } from '../relational-contract.mjs';
import type { LayoutSolverAPI } from '../layout-z3.mjs';
import type { ExpandedPredicate } from './relational-predicate.mjs';
export declare function verifyPredicateImplication(profile: EnvironmentProfile, premises: readonly ExpandedPredicate[], goal: ExpandedPredicate, api: LayoutSolverAPI, options?: {
    timeoutMs?: number;
}): Promise<import("../layout-z3.mjs").LayoutProof>;
