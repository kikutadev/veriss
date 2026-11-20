export type ViewportFont = (width: number, height: number) => number;
export declare function viewportFont(text: unknown, rootFontSize?: number): ViewportFont | null | undefined;
/** The viewport widths (integer px, [min, max]) at height h where 200% zoom shows the text below twice its size. */
export declare function zoomShortfall(f: ViewportFont, { min, max }: {
    min: number;
    max: number;
}, h: number): [number, number][];
