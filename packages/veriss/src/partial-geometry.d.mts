import type { EnvironmentProfile } from './relational-contract.mjs';
import type { LayoutOptions, LayoutSummary } from './layout-contracts.d.ts';
type Axis = 'inline' | 'block';
export interface GeometryProjection {
    html: string;
    css: string;
    path: string;
    assumptions: string[];
}
/** Produce a reduced full document for a single rectangle, or throw with a
 * dependency reason. The retained selectors still run through veriss's own
 * cascade and layout engine; we do not calculate CSS dimensions here. */
export declare function projectIndependentGeometry(html: string, css: string, target: string, profile: EnvironmentProfile, binding?: string, axis?: boolean | Axis): GeometryProjection;
export declare function analyzeProjectedGeometry(projection: GeometryProjection, options: LayoutOptions): LayoutSummary;
export {};
