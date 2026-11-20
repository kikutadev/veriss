import type { LayoutOptions } from '@mizchi/veriss/src/layout-contracts.d.ts';
import type { EnvironmentProfile } from '@mizchi/veriss/contracts';
import type { AnalyzedState, Choices, ContractFinding, ContractUnknown } from './noshift.mjs';
export type SnapshotContract = ({
    kind: 'within-viewport';
    target: string;
    other?: never;
} | {
    kind: 'contains' | 'disjoint';
    target: string;
    other: string;
}) & {
    when?: Choices;
};
export interface SnapshotOptions {
    name: string;
    viewport?: LayoutOptions['viewport'];
    contracts?: SnapshotContract[];
    scrollbars?: LayoutOptions['scrollbars'];
    devicePixelRatios?: readonly number[];
    safeArea?: EnvironmentProfile['safeArea'];
    hostInset?: number;
    hostBlockInset?: number;
    ua?: EnvironmentProfile['ua'];
}
export declare function snapshotContracts(results: AnalyzedState[], { name, viewport, contracts, scrollbars, devicePixelRatios, safeArea, hostInset, hostBlockInset, ua }: SnapshotOptions): {
    findings: ContractFinding[];
    unknowns: ContractUnknown[];
};
