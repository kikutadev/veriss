// Which font a generic family resolves to, per OS and browser. The linux rows are measured in this environment
// (tools/text-widths.mjs, recorded in linux-widths.json with the browser versions). The other rows name the vendors'
// default fonts but are not measured here (no font file, no browser of that OS): a TextWidth over them is Unknown until
// their widths are recorded or their files given.
import record from './linux-widths.json' with {type: 'json'};

const measured = Object.fromEntries(Object.entries(record.browsers).map(([browser, b]) => [browser, Object.fromEntries(Object.entries(b.resolved).map(([g, r]) => [g, r.font]))]));
export const systemFonts = {
  linux: {measured: true, recorded: record.recorded, browsers: measured},
  windows: {measured: false, browsers: Object.fromEntries(['chromium', 'firefox'].map(b => [b, {'system-ui': 'Segoe UI', 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: b === 'firefox' ? 'Courier New' : 'Consolas'}]))},
  macos: {measured: false, browsers: Object.fromEntries(['chromium', 'firefox', 'webkit'].map(b => [b, {'system-ui': 'SF Pro', 'sans-serif': 'Helvetica', serif: 'Times', monospace: b === 'webkit' ? 'Courier' : 'Menlo'}]))},
  ios: {measured: false, browsers: {webkit: {'system-ui': 'SF Pro', 'sans-serif': 'Helvetica', serif: 'Times', monospace: 'Courier'}}},
  android: {measured: false, browsers: {chromium: {'system-ui': 'Roboto', 'sans-serif': 'Roboto', serif: 'Noto Serif', monospace: 'Droid Sans Mono'}}},
};
export const generic = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);
export {record as linuxWidths};
