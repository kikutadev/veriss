import type { EnvironmentProfile } from '../relational-contract.mjs';
export interface WidthTransitionSourceInput {
    html: string;
    css: string;
    profile: EnvironmentProfile;
    target: string;
    stateAttribute: string;
    from: string;
    to: string;
}
export interface WidthBranch {
    context: string;
    before: string;
    after: string;
}
export interface DerivedWidthTransition {
    kind: 'fixed-width-transition';
    before: string;
    after: string;
    targets: string[];
    easing: string;
    groups: WidthBranch[];
    css: string;
}
export declare function deriveWidthTransition({ html, css, profile, target, stateAttribute, from, to }: WidthTransitionSourceInput): DerivedWidthTransition;
