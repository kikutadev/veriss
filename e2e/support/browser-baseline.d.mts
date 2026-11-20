import type { TestInfo } from '@playwright/test';
type BaselineDifference = {
    kind: 'oracle' | 'baseline';
    category: string;
    note: string;
};
type BaselineEntry = {
    file: string;
    title: string;
    firefox?: BaselineDifference;
    webkit?: BaselineDifference;
};
export declare const browserBaseline: BaselineEntry[];
/** For test.beforeEach: skip or expect a failure where this browser differs from the Chromium baseline. */
export declare function applyBrowserBaseline(testInfo: TestInfo): void;
export {};
