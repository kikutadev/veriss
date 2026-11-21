// TextWidth: the widths a string may take across the fonts it may be drawn in (docs/adr/0019-text-width-type.md).
//   { min: [lo, hi], max: [lo, hi], combos: [{platform, browser, font, min, max, source}] }
// min is the min-content (the widest unbreakable segment), max the max-content (the string on one line), in px. Every
// combination of the platforms and browsers asked for resolves the family (a generic one through system-fonts.mjs),
// and each width is the browser's recorded value (E2E, exact) or the MoonBit measurement of the font file widened by
// the allowance (calibrated on the recorded corpus: the largest difference was 0.64% in WebKit, 0.47px in Firefox).
// A combination with no record and no font file makes the whole TextWidth Unknown ({unknown: reason}).
import {systemFonts, generic, linuxWidths} from './system-fonts.mjs';

export const allowance = width => width * 0.01 + 1 / 32;
const words = text => text.split(/\s+/).filter(Boolean);

/**
 * @param text the string (a free string is {free: true}: unbounded)
 * @param font {family: 'sans-serif' | a font name, size, weight}
 * @param env {platforms, browsers, metrics: {[font name]: TextMetrics} (MoonBit, loadTextMetrics), webFonts: [names loaded with @font-face]}
 */
export function textWidth(text, font, {platforms = ['linux'], browsers = ['chromium', 'firefox', 'webkit'], metrics = {}, webFonts = []} = {}) {
  if (typeof text === 'object' && text?.free) return {min: [0, Infinity], max: [0, Infinity], combos: [], free: true};
  const combos = [];
  for (const platform of platforms) for (const browser of browsers) {
    const table = systemFonts[platform];
    if (!table?.browsers[browser]) continue; // that browser does not exist on that platform
    const resolved = generic.has(font.family) ? table.browsers[browser][font.family] : font.family;
    const web = webFonts.includes(font.family);
    if (!web && generic.has(font.family) && !table.measured) return {unknown: `${font.family} on ${platform} ${browser} resolves to ${resolved}, which is not measured here`};
    // A recorded browser width (E2E) of this string in this font: exact (whole strings only; the corpus size).
    const rec = platform === 'linux' && font.size === linuxWidths.size && (font.weight ?? 400) === 400 ? linuxWidths.browsers[browser]?.named[resolved] : null;
    const at = s => linuxWidths.corpus.indexOf(s);
    const recorded = s => rec && at(s) >= 0 ? rec[at(s)] : undefined;
    const m = metrics[resolved];
    const measure = s => { const r = recorded(s); if (r !== undefined) return {lo: r, hi: r, source: 'recorded'}; if (!m) return null;
      const w = m.measureText({font: {family: resolved, size: font.size, lineHeight: font.size * 1.5, weight: font.weight ?? 400}, text: s}).width;
      return {lo: Math.max(0, w - allowance(w)), hi: w + allowance(w), source: 'moonbit'}; };
    const whole = measure(text), segments = words(text).map(measure);
    if (!whole || segments.some(x => !x)) return {unknown: `${resolved} (${platform} ${browser}) has no recorded width for "${text}" and no font file to measure it`};
    combos.push({platform, browser, font: resolved, max: [whole.lo, whole.hi], min: [Math.max(...segments.map(x => x.lo)), Math.max(...segments.map(x => x.hi))], source: [...new Set([whole.source, ...segments.map(x => x.source)])].join('+')});
  }
  if (!combos.length) return {unknown: 'no platform and browser combination to measure'};
  const span = key => [Math.min(...combos.map(c => c[key][0])), Math.max(...combos.map(c => c[key][1]))];
  return {min: span('min'), max: span('max'), combos};
}

/** MoonBit metrics of the fonts recorded in this environment (linux-widths.json), for strings outside the corpus. */
export async function recordedMetrics() {
  const {loadTextMetrics} = await import('../../packages/veriss/src/text-node.mjs');
  const out = {};
  for (const [family, file] of Object.entries(linuxWidths.fonts)) try { out[family] = await loadTextMetrics({fonts: {[family]: {file}}}); } catch { /* not loadable */ }
  return out;
}
