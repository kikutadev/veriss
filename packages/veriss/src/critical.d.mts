import type {LayoutOptions, LayoutScrollbarProfile} from './layout-contracts.d.ts';
/** A viewport range of first views (an inline range and a height range) and the scrollbars of its platforms. */
export interface FirstViewProfile {
  name: string;
  viewport: {min: number; max: number; height: {min: number; max: number}};
  scrollbars?: readonly LayoutScrollbarProfile[];
  /** Scrollbar profiles added when the CSS uses viewport units (vw, vi, vmin, vmax include the scrollbar). */
  viewportUnits?: readonly LayoutScrollbarProfile[];
}
/** Smartphones (320–430 × 568–932, overlay scrollbars) and PCs (1263–1920 × 720–1080: 1280px less a classic scrollbar). */
export const firstViewProfiles: readonly FirstViewProfile[];
export interface CriticalCSS {
  /** The rules the first view needs, in their source order, inside the at-rules that wrap them. */
  css: string;
  /** The other rules (to load after the first view), inside the same at-rules. */
  rest: string;
  kept: number;
  dropped: number;
  profiles: {name: string; status: 'verified' | 'violated' | 'unknown'; unknown: {code: string; message: string}[]}[];
  elements: {path: string; tag: string; classes: string[]; critical: boolean; reason?: string}[];
}
/** The critical CSS of a whole HTML document: what is not proven to stay out of the first view is kept. */
export function extractCriticalCSS(html: string, options: Omit<LayoutOptions, 'viewport'> & {css: string; profiles?: readonly FirstViewProfile[]; name?: string}): CriticalCSS;
