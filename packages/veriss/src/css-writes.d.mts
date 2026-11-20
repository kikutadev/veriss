/** At most one diagnostic per later declaration; repeated identical properties are CSS fallbacks. */
export interface CSSWriteConflict {
    earlier: number;
    later: number;
    properties: [string, string];
    longhands: string[];
    hint: string;
}
export declare function findCSSWriteConflicts(properties: readonly string[]): CSSWriteConflict[];
export declare function cssWriteConflictMessage(conflict: Pick<CSSWriteConflict, "properties" | "longhands">): string;
