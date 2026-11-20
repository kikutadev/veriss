export interface AnimationExtreme {
    property: string;
    y: number;
    from: string;
    to: string;
    easing: string;
    value: string;
}
export interface AnimationFrame {
    offset: number;
    layout?: string | undefined;
    easing?: string | undefined;
    extreme?: AnimationExtreme;
}
export interface EasedFrameOptions {
    easing?: string | undefined;
    base?: Readonly<Record<string, string | number | undefined>>;
    rem?: number | undefined;
}
type EasedFramesResult<F extends AnimationFrame = AnimationFrame> = {
    frames: (F | AnimationFrame)[];
    unknown?: never;
} | {
    unknown: string;
    frames?: never;
};
export declare function easedFrames<F extends AnimationFrame>(frames: readonly F[], { easing, base, rem }?: EasedFrameOptions): EasedFramesResult<F>;
export {};
