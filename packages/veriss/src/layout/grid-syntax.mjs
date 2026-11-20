// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// F101: grid-template-columns / -rows values the browser drops (CSS Grid 1 §7.2; measured in Chromium, Firefox and WebKit).
// A repeat(auto-fill | auto-fit, …) holds only fixed-size tracks, comes once, and every other track is then fixed-size
// too; minmax() cannot have a flexible (fr) minimum; a repeat count is a positive integer; fit-content() takes a length.
const length = /^(?:0|(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|vw|vh|vmin|vmax|ch|ex|pt|cm|mm|in|pc|q|lh|rlh|cqi|cqb|cqw|cqh|svw|svh|lvw|lvh|dvw|dvh)|calc\(.*\)|min\(.*\)|max\(.*\)|clamp\(.*\))$/i;
const flex = /^(?:\d+\.?\d*|\.\d+)fr$/i, intrinsic = /^(?:auto|min-content|max-content)$/i;
// Splits a list at top-level white space (or commas), keeping functions whole; line names [a b] are dropped.
const parts = (text, comma = false) => { const out = []; let cur = '', depth = 0; for (const ch of text) {
    if (ch === '(' || ch === '[')
        depth++;
    if (ch === ')' || ch === ']')
        depth--;
    if (depth === 0 && (comma ? ch === ',' : /\s/.test(ch))) {
        if (cur.trim())
            out.push(cur.trim());
        cur = '';
        continue;
    }
    cur += ch;
} if (cur.trim())
    out.push(cur.trim()); return out.filter(p => !/^\[.*\]$/.test(p)); };
class NotJudged extends Error {
}
// Classifies one track: 'fixed', 'flex', 'intrinsic' or a fixed-size minmax ('fixed'), or throws a reason string.
function track(t) {
    if (length.test(t))
        return 'fixed';
    if (/^-/.test(t))
        throw 'a negative size';
    if (flex.test(t))
        return 'flex';
    if (intrinsic.test(t))
        return 'intrinsic';
    let m = /^minmax\((.*)\)$/i.exec(t);
    if (m) {
        const [a, b, ...rest] = parts(m[1], true);
        if (a === undefined || b === undefined || rest.length)
            throw `${t} needs two arguments`;
        if (flex.test(a))
            throw `${t} has a flexible (fr) minimum`;
        const ka = length.test(a) ? 'fixed' : intrinsic.test(a) ? 'intrinsic' : (() => { throw new NotJudged(); })();
        const kb = length.test(b) ? 'fixed' : flex.test(b) ? 'flex' : intrinsic.test(b) ? 'intrinsic' : (() => { throw new NotJudged(); })();
        return ka === 'fixed' || kb === 'fixed' ? 'fixed' : 'other';
    }
    m = /^fit-content\((.*)\)$/i.exec(t);
    if (m) {
        if (!length.test(m[1].trim()))
            throw `${t} needs a length`;
        return 'intrinsic';
    }
    throw new NotJudged();
}
export function gridTrackProblem(value) {
    const text = String(value).trim();
    if (/var\(|env\(|attr\(/i.test(text) || /^(?:none|subgrid|masonry|inherit|initial|unset|revert|revert-layer)\b/i.test(text) || /\[[^\]]*$/.test(text))
        return null;
    try {
        const kinds = [];
        let autoRepeats = 0;
        for (const p of parts(text)) {
            const r = /^repeat\((.*)\)$/i.exec(p);
            if (!r) {
                kinds.push({ kind: track(p), auto: false, text: p });
                continue;
            }
            const [count, ...list] = parts(r[1], true);
            if (list.length !== 1 || count === undefined)
                throw new NotJudged();
            const auto = /^(?:auto-fill|auto-fit)$/i.test(count);
            if (!auto && !(/^\d+$/.test(count) && Number(count) > 0))
                throw `the repeat count ${count} is not a positive whole number`;
            if (auto)
                autoRepeats++;
            for (const t of parts(list[0]))
                kinds.push({ kind: track(t), auto, text: t });
        }
        if (autoRepeats > 1)
            return 'two repeat(auto-fill / auto-fit) in one list';
        if (autoRepeats) {
            const bad = kinds.find(k => k.kind !== 'fixed');
            if (bad)
                return bad.auto ? `${bad.text} in repeat(auto-fill / auto-fit) is not a fixed size (the browser cannot count how many fit)` : `${bad.text} beside repeat(auto-fill / auto-fit) is not a fixed size`;
        }
        return null;
    }
    catch (e) {
        return e instanceof NotJudged ? null : String(e);
    }
}
