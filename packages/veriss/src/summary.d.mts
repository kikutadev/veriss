import type { LayoutProof } from './layout-z3.mjs';
import type { NoShiftProof } from './transitions.mjs';
type Source = {
    start: number;
    end?: number;
};
interface Range {
    min?: number;
    max?: number;
    minExact?: string;
    maxExact?: string;
    minInclusive?: boolean;
    maxInclusive?: boolean;
}
interface CSSLocation {
    file: string;
    line?: number;
    column?: number;
}
interface CSSOrigin extends CSSLocation {
    specified: string;
    conditions?: readonly {
        kind: string;
        name?: string;
        params: string;
        css: CSSLocation;
    }[];
}
interface ExplanationFact {
    kind?: string;
    origin?: string;
    axis?: string;
    hostInset?: number;
    box?: string;
    property?: string;
    value?: string | number | undefined;
    derivedFrom?: string;
    selector?: string | undefined;
    css?: CSSOrigin;
    overridden?: readonly {
        css: CSSOrigin;
    }[];
    dormant?: readonly {
        css: CSSOrigin;
    }[];
}
interface Explanation {
    version?: number;
    available: {
        facts: readonly ExplanationFact[];
    };
    required: {
        facts: readonly ExplanationFact[];
    };
}
interface SummaryRow {
    code: string;
    message?: string;
    source?: Source | number | undefined;
    start?: number;
    css?: CSSLocation;
    path?: string | undefined;
    box?: string | undefined;
    range?: Range;
    heightRange?: Range;
    checkedContract?: string;
    hint?: string;
    text?: {
        lines?: number;
        fitsLines?: number;
        fitsUpTo?: number;
        maxLength?: number;
        widest?: string;
    };
    explanation?: Explanation;
    related?: readonly {
        message: string;
        css: CSSLocation;
    }[];
}
interface SummaryDeclaration {
    status: string;
    contract: {
        component: string;
    };
    instance?: {
        path: string;
    };
    proof: LayoutProof;
    coverage?: LayoutProof;
}
interface SummaryShiftCheck extends NoShiftProof {
    component: string;
    path: string;
    source?: Source | undefined;
    targets: readonly {
        source?: Source;
        selector?: string;
        nodeId?: string;
    }[];
    identities?: readonly {
        target: string;
        keys: readonly {
            value: unknown;
        }[];
    }[];
}
interface SummaryReport {
    component?: string;
    status?: string;
    scope?: {
        viewport?: Range & {
            height?: Range | null;
        };
    };
    declarations?: readonly SummaryDeclaration[];
    diagnostics?: readonly SummaryRow[];
    integrity?: {
        warnings?: readonly SummaryRow[];
    };
    accessibility?: {
        warnings?: readonly SummaryRow[];
    };
    noshift?: {
        status: string;
        comparisons: {
            checked: number;
            planned: number;
        };
        diagnostics: readonly SummaryRow[];
        checks: readonly SummaryShiftCheck[];
    };
    assumptions?: readonly string[];
}
/** ADR-0002: one line per side, citing only authored CSS, caller contracts and the viewport. */
export declare function explanationLines(explanation: Explanation | undefined, limit?: number): string[];
export declare function formatLayoutSummary(report: SummaryReport, { file, source }: {
    file: string;
    source: string;
}): string;
export {};
