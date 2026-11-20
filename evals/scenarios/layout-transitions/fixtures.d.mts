import type { NoShiftProof } from '../../../packages/veriss/src/transitions.mjs';
export interface TransitionScenario {
    name: string;
    html: string;
    before: string;
    after: string;
    status: NoShiftProof['status'];
    path?: string;
    selector?: string;
}
export declare const scenarios: TransitionScenario[];
