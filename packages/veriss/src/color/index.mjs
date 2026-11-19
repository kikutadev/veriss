// Colors as numbers (CSS Color 4 subset): parsing, compositing, relative luminance and the WCAG contrast ratio, and the
// backdrop of a text from its ancestors' backgrounds. Pure: no CSS cascade, no geometry (ADR-0016, M1).
// --- colors (CSS Color 4 subset) ------------------------------------------
const named = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff',
  magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000', lime: '#00ff00',
  teal: '#008080', navy: '#000080', purple: '#800080', orange: '#ffa500', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3', dimgray: '#696969', dimgrey: '#696969', gainsboro: '#dcdcdc', whitesmoke: '#f5f5f5', darkblue: '#00008b', darkred: '#8b0000',
  darkgreen: '#006400', rebeccapurple: '#663399', brown: '#a52a2a', pink: '#ffc0cb', gold: '#ffd700', indigo: '#4b0082', crimson: '#dc143c',
  // System colors in the light scheme; author Canvas/CanvasText resolve per used color-scheme in the cascade.
  canvas: '#ffffff', canvastext: '#000000',
};
const channel = (value, max) => value.endsWith('%') ? Number(value.slice(0, -1)) / 100 * max : Number(value);
const alphaOf = value => value === undefined ? 1 : value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
function hsl(h, s, l) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
/** {r, g, b (0–255), a (0–1)} or null when the value is not a modeled color. */
export function parseColor(value) {
  value = String(value).trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (named[value]) value = named[value];
  let m = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(value);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    const n = i => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^(rgba?|hsla?)\((.*)\)$/.exec(value);
  if (!m) return null;
  const parts = m[2].includes(',') ? m[2].split(',').map(p => p.trim()) : m[2].replace(/\s*\/\s*/, ' / ').split(/\s+/).filter(p => p !== '/');
  if (parts.length < 3 || parts.length > 4 || parts.some(p => !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg)?$/.test(p))) return null;
  const a = Math.min(1, Math.max(0, alphaOf(parts[3])));
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map(p => Math.min(255, Math.max(0, channel(p, 255))));
    return { r, g, b, a };
  }
  const [r, g, b] = hsl(((parseFloat(parts[0]) % 360) + 360) % 360, channel(parts[1], 1), channel(parts[2], 1));
  return { r, g, b, a };
}
export const over = (top, bottom) => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = key => (top[key] * top.a + bottom[key] * bottom.a * (1 - top.a)) / a;
  return { r: mix('r'), g: mix('g'), b: mix('b'), a };
};
export const luminance = ({ r, g, b }) => {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contrastRatio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

export const opaqueValue = value => { const m = /^(\d+(?:\.\d+)?|\.\d+)(%?)$/.exec(String(value)); return m && (m[2] ? Number(m[1]) / 100 : Number(m[1])) >= 1; };
/**
 * The text color and its backdrop for a text row: ancestors' backgrounds,
 * innermost first, until an opaque one, over the canvas. Returns
 * {fg, bg, layers} or {unknown} with the reason.
 */
// defaultColors (a caller-stated assumption, judgeAccessibility sets it): the UA canvas and its text color under the
// light preference when the page opts into no dark color-scheme: black text on a white canvas (measured in Chromium).
// Under the dark preference Chromium paints that canvas #121212 while canvastext stays black (measured), so it is not
// assumed there; a user's own default colors or forced colors are outside the assumption.
export function backdrop(chain, uaColors = null) {
  const self = chain.at(-1);
  for (const layer of chain) if (!opaqueValue(layer.opacity)) return { unknown: `opacity ${layer.opacity} blends the text with what lies behind it` };
  // ADR-0007: no implicit black-on-white. The UA text and canvas colors depend on the user's color scheme.
  if (String(self.color).toLowerCase() === 'canvastext' && !uaColors) return { unknown: 'the text color is the user-agent default (canvastext); declare color' };
  const fg = String(self.color).toLowerCase() === 'canvastext' ? parseColor(uaColors.canvastext) : parseColor(self.color);
  if (!fg) return { unknown: `color ${self.color} is not a modeled color` };
  const layers = [];
  let bg = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const layer = chain[i];
    if (layer.backgroundImage !== 'none') return { unknown: `background-image ${layer.backgroundImage} lies behind the text` };
    const value = String(layer.backgroundColor).toLowerCase() === 'currentcolor' ? layer.color : layer.backgroundColor;
    const color = parseColor(value);
    if (!color) return { unknown: `background-color ${layer.backgroundColor} is not a modeled color` };
    if (color.a > 0) layers.push({ index: i, color });
    if (color.a >= 1) { bg = color; break; }
  }
  // Every layer translucent: the assumed UA canvas lies under all of them.
  if (!bg && uaColors) { let base = parseColor(uaColors.canvas); for (const layer of [...layers].reverse()) base = over(layer.color, base); return { fg: over(fg, base), bg: base, opaqueAt: -1, canvas: true }; }
  if (!bg) return { unknown: 'no ancestor has an opaque background color; the canvas color depends on the user agent' };
  // Composite translucent layers bottom-up over the opaque one.
  let base = bg;
  for (const layer of layers.slice(0, bg ? -1 : undefined).reverse()) base = over(layer.color, base);
  return { fg: over(fg, base), bg: base, opaqueAt: bg ? layers.at(-1).index : -1 };
}
