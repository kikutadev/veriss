import type { Region } from './region.mjs';
import type { AffineRectangle, WorkBudget } from './occupancy.mjs';
import type { Operand, EnvironmentProfile } from '../relational-contract.mjs';
export type Comparison = 'lt' | 'le' | 'eq' | 'ge' | 'gt' | 'ne';
export type ExpandedPredicate = {
    op: 'compare';
    relation: Comparison;
    left: Operand;
    right: Operand;
} | {
    op: 'all' | 'any';
    items: readonly ExpandedPredicate[];
} | {
    op: 'not';
    item: ExpandedPredicate;
};
type Reference = [endpoint: 'before' | 'after', target: string];
export declare function expandPredicate(ast: unknown, definitions?: Readonly<Record<string, unknown>>, event?: string): ExpandedPredicate;
export declare function predicateTargets(ast: ExpandedPredicate): Reference[];
export declare function predicateRegions(ast: ExpandedPredicate, region: Region, rects: ReadonlyMap<string, Partial<AffineRectangle>>, p: EnvironmentProfile, truth: boolean, budget: WorkBudget): Region[];
export {};
