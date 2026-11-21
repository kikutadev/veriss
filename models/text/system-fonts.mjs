// Which font a generic family resolves to, per OS and browser.
// A platform with a record (models/text/<platform>-widths.json, from tools/text-widths.mjs: Linux here, Windows and macOS
// from the GitHub Actions workflow .github/workflows/text-widths.yml) uses what its browsers resolved. A platform without
// one names the vendors' default fonts: those are approximated by their metric-compatible clones (the safe side: a wider
// allowance), and a font with no clone (Segoe UI, SF Pro, Consolas) is Unknown until recorded.
import {readFileSync, existsSync} from 'node:fs';

const load = platform => { const file = new URL(`./${platform}-widths.json`, import.meta.url); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; };
export const records = {linux: load('linux'), windows: load('windows'), macos: load('macos')};
export const linuxWidths = records.linux;

// The browsers people use on each platform (Playwright's WebKit runs on Windows, but Safari does not).
export const realBrowsers = {linux: ['chromium', 'firefox', 'webkit'], windows: ['chromium', 'firefox'], macos: ['chromium', 'firefox', 'webkit'], ios: ['webkit'], android: ['chromium']};
// The vendors' defaults (what the workflow checks against a record).
export const expectedFonts = {
  linux: {chromium: {'system-ui': 'Inter', 'sans-serif': 'Liberation Sans', serif: 'Liberation Serif', monospace: 'DejaVu Sans Mono'}, firefox: {'system-ui': 'Inter', 'sans-serif': 'Inter', serif: 'DejaVu Serif', monospace: 'DejaVu Sans Mono'}, webkit: {'system-ui': 'Inter', 'sans-serif': 'Inter', serif: 'DejaVu Serif', monospace: 'DejaVu Sans Mono'}},
  windows: Object.fromEntries(['chromium', 'firefox'].map(b => [b, {'system-ui': 'Segoe UI', 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: b === 'firefox' ? 'Courier New' : 'Consolas'}])),
  macos: Object.fromEntries(['chromium', 'firefox', 'webkit'].map(b => [b, {'system-ui': 'SF Pro', 'sans-serif': 'Helvetica', serif: 'Times', monospace: b === 'webkit' ? 'Courier' : 'Menlo'}])),
  ios: {webkit: {'system-ui': 'SF Pro', 'sans-serif': 'Helvetica', serif: 'Times', monospace: 'Courier'}},
  android: {chromium: {'system-ui': 'Roboto', 'sans-serif': 'Roboto', serif: 'Noto Serif', monospace: 'Droid Sans Mono'}},
};
const resolvedIn = r => Object.fromEntries(Object.entries(r.browsers).map(([b, v]) => [b, Object.fromEntries(Object.entries(v.resolved).map(([g, x]) => [g, x.font]))]));
export const systemFonts = Object.fromEntries(Object.entries(expectedFonts).map(([platform, expected]) => {
  const r = records[platform];
  const browsers = Object.fromEntries(realBrowsers[platform].filter(b => (r ? r.browsers[b] : expected[b])).map(b => [b, r ? resolvedIn(r)[b] : expected[b]]));
  return [platform, {measured: !!r, ...(r ? {recorded: r.recorded} : {}), browsers}];
}));
// Metric-compatible clones (the same advance widths by design: Liberation for Arial, Times New Roman and Courier New;
// Carlito for Calibri; Caladea for Cambria), and near ones (Arial for Helvetica, Times New Roman for Times, Courier New for
// Courier: close, not identical) with a wider allowance. Kerning may differ even for exact clones.
export const metricClones = {
  Arial: {font: 'Liberation Sans', exact: true}, 'Times New Roman': {font: 'Liberation Serif', exact: true}, 'Courier New': {font: 'Liberation Mono', exact: true},
  Calibri: {font: 'Carlito', exact: true}, Cambria: {font: 'Caladea', exact: true},
  Helvetica: {font: 'Liberation Sans', exact: false}, Times: {font: 'Liberation Serif', exact: false}, Courier: {font: 'Liberation Mono', exact: false},
};
export const generic = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);
