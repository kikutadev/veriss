import type { LayoutBoxContract, LayoutCSSOrigin } from '../layout-contracts.d.ts';
export type ExplanationAxis = 'inline' | 'block';
type Side = 'left' | 'right' | 'top' | 'bottom';
type SizeProperty = 'inline-size' | 'block-size';
type TrackProperty = 'grid-template-columns' | 'grid-template-rows' | 'grid-auto-rows' | 'column-gap' | 'row-gap';
type PlacementProperty = 'grid-column' | 'grid-row';
type ExplanationProperty = 'box-sizing' | SizeProperty | `min-${SizeProperty}` | `padding-${Side}` | `border-${Side}` | TrackProperty | PlacementProperty;
type ContractProperty = 'minInlineSize' | 'minBlockSize';
interface ExplanationBox {
    path: string;
    label: string;
    owner?: string | undefined;
}
interface ContractBox extends ExplanationBox {
    contract: LayoutBoxContract;
    contractSelector?: string | undefined;
}
export interface ExplanationStyle extends Partial<Record<ExplanationProperty, string>> {
    position?: string;
    $sources: Readonly<Partial<Record<ExplanationProperty, LayoutCSSOrigin>>>;
    $dormant?: Readonly<Partial<Record<ExplanationProperty, readonly LayoutCSSOrigin[]>>>;
    $overridden?: Readonly<Partial<Record<ExplanationProperty, readonly LayoutCSSOrigin[]>>>;
}
interface CascadeBase {
    path: string;
    box: string;
    owner: string | undefined;
    property: ExplanationProperty;
    value: string | undefined;
    overridden?: {
        css: LayoutCSSOrigin;
    }[];
    dormant?: {
        css: LayoutCSSOrigin;
    }[];
}
export type ExplanationFact = (CascadeBase & ({
    origin: 'author';
    css: LayoutCSSOrigin;
} | {
    origin: 'default';
})) | {
    kind: 'viewport';
    axis: ExplanationAxis;
    hostInset?: number;
} | {
    kind: 'contract';
    path: string;
    box: string;
    owner: string | undefined;
    property: ContractProperty;
    value: number | undefined;
    selector: string | undefined;
    trusted: true;
    derivedFrom?: string;
};
export interface Explanation {
    version: 1;
    available: {
        facts: readonly ExplanationFact[];
    };
    required: {
        facts: readonly ExplanationFact[];
    };
}
/** Properties that determine a box's own border/content size on one axis. */
export declare const sizeProperties: (axis: ExplanationAxis) => ExplanationProperty[];
export declare const trackProperties: (axis: ExplanationAxis) => [TrackProperty, ...TrackProperty[]];
/** One cascade winner (or the initial/UA value), with dormant conditional writes. */
export declare function fact(box: ExplanationBox, style: ExplanationStyle, property: ExplanationProperty): ExplanationFact;
/**
 * Facts for the size a box offers its content on `axis`, walking ancestors
 * only while the size still depends on the containing block. A definite
 * length ends the path; an auto root depends on the viewport/host.
 */
export declare function sizeChain(chain: readonly {
    box: ExplanationBox;
    style?: ExplanationStyle | undefined;
}[], axis: ExplanationAxis, { hostInset }?: {
    hostInset?: number | undefined;
}): ExplanationFact[];
export declare function contractFact(box: ContractBox, property: ContractProperty): ExplanationFact;
export declare const explanation: (available: readonly ExplanationFact[], required: readonly ExplanationFact[]) => Explanation;
export {};
