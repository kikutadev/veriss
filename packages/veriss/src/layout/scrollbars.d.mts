import type { LayoutScrollbarProfile } from '../layout-contracts.d.ts';
export interface ScrollbarStyle {
    'scrollbar-gutter': string;
    'scrollbar-width': string;
    'overflow-x': string;
    'overflow-y': string;
}
export interface ScrollbarFrame {
    readonly inlineSize: number;
    readonly blockSize: number;
}
export declare function scrollbarFrames(style: ScrollbarStyle, profile?: LayoutScrollbarProfile, viewport?: boolean): ScrollbarFrame[];
