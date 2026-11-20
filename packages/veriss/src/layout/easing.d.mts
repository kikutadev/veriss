export interface EasingExtreme {
    at: number;
    t: number;
    kind: 'max' | 'min';
    low: string;
    high: string;
}
export interface EasingRange {
    min: string;
    max: string;
    extremes: EasingExtreme[];
}
export declare function easingRange(text: unknown): EasingRange | undefined;
export declare const overshoots: (range: EasingRange | null | undefined) => boolean;
export declare function easingAt(text: unknown, u: number): number | undefined;
