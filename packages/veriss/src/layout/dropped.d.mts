export interface DropDetail {
    where?: string;
}
export interface DroppedDeclaration extends DropDetail {
    property: string;
    value: unknown;
    reason: string;
}
export interface DroppedStyle {
    $dropped?: DroppedDeclaration[];
}
export declare function drop(values: DroppedStyle, reason: string, property: string, value: unknown, detail?: DropDetail): void;
/** The dropped declarations of one reason, in the order they were dropped. */
export declare const droppedOf: (style: DroppedStyle | null | undefined, reason: string) => DroppedDeclaration[];
/** The same as [property, value] pairs. */
export declare const droppedPairs: (style: DroppedStyle | null | undefined, reason: string) => [string, unknown][];
/** The value of the first dropped declaration of one reason, or undefined. */
export declare const droppedValue: (style: DroppedStyle | null | undefined, reason: string) => unknown;
