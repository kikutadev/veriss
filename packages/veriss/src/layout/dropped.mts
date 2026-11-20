export interface DropDetail { where?: string }
export interface DroppedDeclaration extends DropDetail { property: string; value: unknown; reason: string }
export interface DroppedStyle { $dropped?: DroppedDeclaration[] }
// Declarations the style stage dropped because they do nothing where they are (ADR-0016 M4): one list on the computed
// style, $dropped = [{ property, value, reason, ...detail }]. The style stage decides what to drop (the layout must not
// see it); a rule says why it is inert. reason names the case:
//   float-absolute, clear-item, multicol-item, inline-overflow, inline-container, inline-text, one-line, tab-collapsed,
//   cell-height, aspect-ratio, table-padding (see where css.mjs calls drop()).
export function drop(values: DroppedStyle, reason: string, property: string, value: unknown, detail: DropDetail = {}) { (values.$dropped ??= []).push({ property, value, reason, ...detail }); }
/** The dropped declarations of one reason, in the order they were dropped. */
export const droppedOf = (style: DroppedStyle | null | undefined, reason: string) => (style?.$dropped ?? []).filter(d => d.reason === reason);
/** The same as [property, value] pairs. */
export const droppedPairs = (style: DroppedStyle | null | undefined, reason: string) => droppedOf(style, reason).map((d): [string, unknown] => [d.property, d.value]);
/** The value of the first dropped declaration of one reason, or undefined. */
export const droppedValue = (style: DroppedStyle | null | undefined, reason: string) => droppedOf(style, reason)[0]?.value;
