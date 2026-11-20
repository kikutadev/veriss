import type { ImageSize } from '../tree.mjs';
import type { ParsedCondition } from './conditions.mjs';
import type { Region } from './region.mjs';
import type { LayoutDiagnostic, LayoutWarning } from '../layout-contracts.d.ts';
interface QueryFact {
    condition: ParsedCondition & {
        css?: {
            file: string;
            line: number;
        };
    };
    target: string | undefined;
    box: string;
    matched: boolean;
    region: Region;
}
interface SourceUse {
    box: {
        label: string;
        path: string;
    };
    sources: readonly {
        facts: ImageSize;
    }[];
    chosen: ReadonlySet<number>;
    active: ReadonlySet<number>;
}
export declare function checkQueryCoverage({ diagnostics, layoutWarnings, sourceUse, queryFacts }: {
    diagnostics: readonly LayoutDiagnostic[];
    layoutWarnings: LayoutWarning[];
    sourceUse: ReadonlyMap<string, SourceUse>;
    queryFacts: readonly QueryFact[];
}): void;
export {};
