// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// F115: background shorthands the browser drops (CSS Backgrounds 3 §3.10; measured in Chromium, Firefox and WebKit): a
// color in any layer but the last, an unquoted url() with white space in it, a "/" (the size) with no position before
// it, and a size keyword (cover, contain) without the "/". var() is not judged. isColor says whether a token is a color.
const split = (text: string, at: RegExp): string[] => { const out = []; let cur = '', depth = 0, quote: string | null = null; for (const ch of text) { if (quote) { cur += ch; if (ch === quote) quote = null; continue; } if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; } if (ch === '(') depth++; if (ch === ')') depth--; if (depth === 0 && at.test(ch)) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; };
const position = /^(?:left|right|top|bottom|center|0|[+-]?(?:\d+\.?\d*|\.\d+)(?:px|%|em|rem|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)|calc\(.*\))$/i;
/** Why the background shorthand is invalid, or null (valid, or not judged). */
export function backgroundProblem(value: unknown, isColor: (token: string) => unknown): string | null {
  const text = String(value).trim();
  if (!text || /var\(|env\(|attr\(/i.test(text) || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(text)) return null;
  const unquoted = /url\(\s*([^"')\s][^)]*?\s[^)]*)\)/i.exec(text);
  if (unquoted) return `url(${unquoted[1]}) has white space in an unquoted URL (quote it, or write %20)`;
  const layers = split(text, /,/).map(l => l.trim());
  for (const [i, layer] of layers.entries()) {
    const tokens = split(layer.replace(/\//g, ' / '), /\s/).filter(Boolean);
    if (i < layers.length - 1) { const color = tokens.find(t => isColor(t)); if (color) return `the color ${color} is in layer ${i + 1} of ${layers.length}; only the last layer takes a color`; }
    const slash = tokens.indexOf('/');
    if (slash !== -1 && !(slash > 0 && position.test(tokens[slash - 1]!))) return 'the size after "/" needs a position before the "/" (center / cover)';
    const size = tokens.findIndex(t => /^(?:cover|contain)$/i.test(t));
    if (size !== -1 && (slash === -1 || size < slash)) return `${tokens[size]} is a size, written after a position and "/" (center / ${tokens[size]})`;
  }
  return null;
}
