import type { Page } from 'playwright';
export declare function captureSnapshot<T>(page: Page, choices: T, { headLayoutIndependent }?: {
    headLayoutIndependent?: boolean | undefined;
}): Promise<{
    html: string;
    choices: T;
}>;
export declare function captureUIObservation(page: Page, { state, profile, targets }: {
    state: string;
    profile: string;
    targets: readonly string[];
}): Promise<{
    width: number;
    height: number;
    rects: {
        [k: string]: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    state: string;
    profile: string;
}>;
