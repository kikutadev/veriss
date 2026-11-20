import type { Rational } from './linear.mjs';
import type { Axis } from './engine-types.mjs';
export declare const flexUnknown: (message: string) => Error & {
    code: string;
};
/** @returns {{main: 'inline'|'block', wrap: boolean}} */
export interface FlexContainerStyle {
    'flex-direction': string;
    'flex-wrap': string;
    'justify-content': string;
    'align-content': string;
    'align-items': string;
}
export declare function validateFlexContainer(style: FlexContainerStyle): {
    main: Axis;
    wrap: boolean;
};
/**
 * justify-content as `free → {lead, extra}` multipliers: the first item is
 * offset by lead·free and every gap grows by extra·free. `negative` says how
 * the value behaves when the free space is negative (`start` or unknown).
 */
export declare function distribution(value: string, main: Axis, count?: number): {
    lead: Rational;
    extra: Rational;
    negative: 'start' | 'unknown' | 'same';
};
/** Cross-axis alignment: 'stretch' or the factor of the free cross space before the item. */
export declare function crossAlignment(alignItems: string, alignSelf: string): Rational | 'stretch';
type Side = 'left' | 'right' | 'top' | 'bottom';
/**
 * Main-axis model of one in-flow item.
 * - base: outer flex base size (rational), or 'content' for the measured block content size.
 * - minimum: outer minimum (rational), or 'content' (equal to the base).
 * - automaticBelowBase: the automatic minimum is unknown but at most the base;
 *   the item must then never shrink.
 */
export type FlexItemStyle = Record<'order' | 'flex-grow' | 'flex-shrink' | 'flex-basis' | 'inline-size' | 'block-size' | 'min-inline-size' | 'min-block-size' | 'max-inline-size' | 'max-block-size' | 'box-sizing' | 'overflow-x' | 'overflow-y' | 'container-type' | `margin-${Side}` | `padding-${Side}` | `border-${Side}`, string>;
export interface FlexItemOptions {
    empty?: boolean;
    axis?: Axis;
    contentSizes?: {
        min: Rational;
        max: Rational;
    } | undefined;
}
interface ItemCommon {
    grow: Rational;
    shrink: Rational;
    edges: Rational;
    autoStart: boolean;
    autoEnd: boolean;
    automaticBelowBase: boolean;
}
export type FlexItemModel = ItemCommon & ({
    base: 'content';
    minimum: 'content';
    contentMinimum?: Rational;
    percentBasis?: never;
    linearBasis?: never;
    contentBox?: never;
    maximum?: never;
} | {
    base: Rational;
    minimum: Rational;
    contentMinimum?: never;
    percentBasis?: Rational;
    linearBasis?: string;
    contentBox?: boolean;
    maximum?: Rational;
});
export declare function flexItem(style: FlexItemStyle, { empty, axis, contentSizes }?: FlexItemOptions): FlexItemModel;
export {};
