import type { parseLayoutCSS, CSSRule } from './css.mjs';
import type { EngineOptions } from './input.mjs';
import type { EngineStyle } from './engine-style.mjs';
import type { InlineBox } from './engine-inline.mjs';
import type { Region } from './region.mjs';
import type { LayoutWarning, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type Box = InlineBox & {
    tablePart?: boolean | string;
};
interface Ancestor {
    box: Box;
    style: EngineStyle;
}
export declare function checkSettledStyle({ box, style, region, parents, emit, cover, options, metaViewport, fontFaces, rules, layoutWarnings, ranges }: {
    box: Box;
    style: EngineStyle;
    region: Region;
    parents: readonly Ancestor[];
    emit: boolean;
    cover: boolean;
    options: EngineOptions;
    metaViewport: string | undefined;
    fontFaces: ReturnType<typeof parseLayoutCSS>['fontFaces'];
    rules: readonly CSSRule[];
    layoutWarnings: LayoutWarning[];
    ranges: (region: Region) => {
        range: LayoutRange;
        heightRange?: LayoutRange;
        region?: LayoutRegion;
    };
}): void;
export {};
