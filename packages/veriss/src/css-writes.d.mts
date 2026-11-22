/** A later longhand can legitimately refine a shorthand in the same rule.
 * Require it to be a strict subset under *every* supported writing direction,
 * so a logical/physical mix is not assumed safe just from horizontal LTR.
 * The CSS parser still has to validate and model both actual values; unsupported
 * declarations make the whole analysis Unknown rather than Verified.
 */
export declare function isCSSWriteRefinement(earlier: string, later: string): boolean;
/** A logical/physical overlap that exists in only some writing modes is
 * not a definite redundant declaration. The style still depends on an
 * environment that must be explicitly modeled before claiming a proof.
 */
export declare function isCSSWriteDirectionalOverlap(earlier: string, later: string): boolean;
/** At most one diagnostic per later declaration; repeated identical properties are CSS fallbacks. */
export interface CSSWriteConflict {
    earlier: number;
    later: number;
    properties: [string, string];
    longhands: string[];
    hint: string;
}
export declare function findCSSWriteConflicts(properties: readonly string[], ignoreOrderedRefinements?: boolean): CSSWriteConflict[];
export declare function cssWriteConflictMessage(conflict: Pick<CSSWriteConflict, "properties" | "longhands">): string;
