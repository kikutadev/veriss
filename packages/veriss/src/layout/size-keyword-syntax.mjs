// F122: size keywords that only some browsers take (measured in Chromium, Firefox 157 and WebKit). A browser drops a
// declaration with a keyword it does not know, so in one rule each browser uses the last value it takes. When those
// differ in kind between browsers (stretch in Chromium and Safari, but the 50px before it in Firefox), the page
// differs by browser. The usual fix lists the prefixed forms before the standard one.
const takes = {
  stretch: ['chromium', 'webkit'], '-webkit-fill-available': ['chromium', 'firefox', 'webkit'], '-moz-available': ['firefox'],
  'fit-content': ['chromium', 'firefox', 'webkit'], '-webkit-fit-content': ['chromium', 'webkit'], '-moz-fit-content': ['firefox'], intrinsic: ['webkit'],
};
const kind = { stretch: 'stretch', '-webkit-fill-available': 'stretch', '-moz-available': 'stretch', 'fit-content': 'fit-content', '-webkit-fit-content': 'fit-content', '-moz-fit-content': 'fit-content', intrinsic: 'fit-content' };
const sized = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size))$/;
export const browsers = ['chromium', 'firefox', 'webkit'];

/** For declarations [{ prop, value }] of one rule (in order): [{ property, used: { chromium, firefox, webkit }, keywords }] where browsers end on different kinds of value. */
export function sizeKeywordSplits(declarations) {
  const out = [], byProperty = new Map();
  for (const { prop, value } of declarations) {
    const p = String(prop).toLowerCase();
    if (!sized.test(p)) continue;
    (byProperty.has(p) ? byProperty.get(p) : byProperty.set(p, []).get(p)).push(String(value).trim().toLowerCase());
  }
  for (const [property, values] of byProperty) {
    if (!values.some(v => Object.hasOwn(takes, v)) || values.some(v => /var\(|env\(/.test(v))) continue;
    const used = Object.fromEntries(browsers.map(b => [b, values.findLast(v => !Object.hasOwn(takes, v) || takes[v].includes(b)) ?? null]));
    const kindOf = v => v === null ? 'none' : kind[v] ?? v;
    if (new Set(browsers.map(b => kindOf(used[b]))).size > 1) out.push({ property, used, keywords: values.filter(v => Object.hasOwn(takes, v)) });
  }
  return out;
}
