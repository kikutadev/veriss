/** Browser runtime observations for a caller's *existing* authenticated E2E test.
 * No browser launch, login, network fetch, DOM source capture or proof inference.
 * Only viewport measurements and keyboard focus bounds leave the browser page.
 */
import type { Observation } from '@mizchi/veriss/src/relational-contract.mjs';
export interface BrowserRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface BrowserFrame {
    viewport: number;
    height: number;
    documentWidth: number;
    main: BrowserRect | null;
    overflowElements: string[];
}
export interface BrowserFocusStep {
    tag: string;
    inScope: boolean;
    offscreen: boolean;
    bounds: BrowserRect;
}
export interface BrowserObservationPage {
    evaluate<A, R>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
    locator(selector: string): {
        focus(): Promise<void>;
    };
    keyboard: {
        press(key: string): Promise<void>;
    };
}
export declare function viewportObservation(state: string, profile: string, frame: BrowserFrame): Observation;
/** An offscreen focus is a defect only when it occurs inside the caller's
 * declared *closed* scope. An intentionally off-canvas drawer without focus
 * is not a defect. This records a sampled action, never a CSS proof. */
export declare function focusObservation(state: string, profile: string, viewport: number, height: number, steps: readonly BrowserFocusStep[], event?: string): Observation;
export declare function captureViewport(page: BrowserObservationPage, { state, profile, mainSelector }: {
    state: string;
    profile: string;
    mainSelector?: string;
}): Promise<{
    frame: {
        viewport: number;
        height: number;
        documentWidth: number;
        main: BrowserRect | null;
        overflowElements: string[];
    };
    observation: Observation;
}>;
/** Keyboard exploration starts from a caller-selected anchor on an already
 * logged-in page. The caller declares which drawer/panel is CLOSED. */
export declare function captureClosedScopeTabFocus(page: BrowserObservationPage, { state, profile, anchor, closedScope, steps, event }: {
    state: string;
    profile: string;
    anchor: string;
    closedScope: string;
    steps?: number;
    event?: string;
}): Promise<{
    steps: BrowserFocusStep[];
    observation: Observation;
}>;
/** A genuine aria-modal dialog must keep sequential keyboard focus inside.
 * Sampled behavior only: this does not prove every element or browser state.
 * The caller opens the dialog first and retains responsibility for teardown. */
export declare function modalFocusObservation(state: string, profile: string, viewport: number, height: number, steps: readonly BrowserFocusStep[], event?: string): Observation;
export declare function captureModalTabFocus(page: BrowserObservationPage, { state, profile, scope, steps, event }: {
    state: string;
    profile: string;
    scope?: string;
    steps?: number;
    event?: string;
}): Promise<{
    steps: BrowserFocusStep[];
    observation: Observation;
}>;
