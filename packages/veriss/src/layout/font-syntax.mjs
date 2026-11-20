// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// F99 / F100: font-family and font values the browser drops (measured in Chromium, Firefox and WebKit).
// An unquoted family name is a run of identifiers: a word that starts with a digit (or - and a digit), or holds a
// character an identifier cannot (. / ! and the like), makes the whole declaration invalid, even in one item of the list.
const ident = /^-?(?:[a-z_\u0080-￿]|\\.)(?:[\w\u0080-￿-]|\\.)*$/i;
const generic = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong)$/i;
const wide = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const split = (text) => { const out = []; let cur = '', quote = null, depth = 0; for (const ch of text) {
    if (quote) {
        cur += ch;
        if (ch === quote)
            quote = null;
        continue;
    }
    if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
        continue;
    }
    if (ch === '(')
        depth++;
    if (ch === ')')
        depth--;
    if (ch === ',' && !depth) {
        out.push(cur.trim());
        cur = '';
        continue;
    }
    cur += ch;
} out.push(cur.trim()); return out; };
// The first family that is not a valid name, as written, or null.
export function familyProblem(value) {
    const text = String(value).trim();
    if (!text || wide.test(text) || /\(/.test(text))
        return null; // var() and the like: not judged
    for (const item of split(text)) {
        if (!item)
            return '(an empty name)';
        if (/^(["']).*\1$/s.test(item))
            continue;
        if (/["']/.test(item))
            return item;
        if (generic.test(item))
            continue;
        if (!item.split(/\s+/).every(word => ident.test(word)))
            return item;
    }
    return null;
}
const sizeKeyword = /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)$/i;
const sizeToken = /^(?:(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|pt|pc|in|cm|mm|q|ex|ch|vw|vh|vmin|vmax|lh|rlh|cap|ic)|0)$/i;
const prefix = /^(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded)$/i;
const system = /^(?:caption|icon|menu|message-box|small-caption|status-bar)$/i;
// Why a font shorthand is invalid ('size', 'family' or the bad family as written), or null when it is fine or not judged.
export function fontShorthandProblem(value) {
    const text = String(value).trim();
    if (!text || wide.test(text) || system.test(text) || /\(/.test(text))
        return null;
    const words = text.replace(/\s*\/\s*/g, '/').split(/\s+/);
    let i = 0;
    while (i < words.length && prefix.test(words[i]))
        i++;
    const size = words[i]?.split('/')[0];
    if (size === undefined || !(sizeToken.test(size) || sizeKeyword.test(size))) {
        // no size where one must be: only judged when every word before is a known prefix and what follows looks like a family
        return i < words.length && (prefix.test(words[i]) || /^[a-z"']/i.test(words[i])) ? { missing: 'size' } : null;
    }
    const family = text.slice(text.indexOf(size) + size.length).replace(/^\s*\/\s*\S+/, '').trim();
    if (!family)
        return { missing: 'family' };
    const bad = familyProblem(family);
    return bad ? { family: bad } : null;
}
