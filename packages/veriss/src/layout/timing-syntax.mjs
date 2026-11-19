// F114: transition / animation values the browser drops (CSS Transitions 1 §2, CSS Animations 1 §3; measured in
// Chromium, Firefox and WebKit): a bare number where a time belongs (transition: opacity 300, transition-duration: 300,
// animation-duration: 2), more than two times in one item, an unknown easing word (it reads as a second property name),
// cubic-bezier() without four numbers, none beside anything else, and an empty item. var() is not judged.
const time = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:ms|s)$/i, number = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const easingWords = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end']);
const split = (text, at) => { const out = []; let cur = '', depth = 0; for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth--; if (depth === 0 && at.test(ch)) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; };
function easingProblem(token) {
  const m = /^(cubic-bezier|steps)\((.*)\)$/i.exec(token);
  if (!m) return null;
  const args = m[2].split(',').map(a => a.trim());
  if (m[1].toLowerCase() === 'cubic-bezier') return args.length === 4 && args.every(a => number.test(a)) ? null : `${token} needs four numbers`;
  return /^\d+$/.test(args[0]) && args.length <= 2 ? null : `${token} needs a whole number of steps`;
}
/** Why the value is invalid, or null (valid, or not judged). */
export function timingProblem(property, value) {
  const prop = String(property).toLowerCase(), text = String(value).trim();
  if (!text || /var\(|env\(|attr\(/i.test(text) || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(text)) return null;
  const items = split(text, /,/).map(i => i.trim());
  const timing = /^(?:transition|animation)(?:-[a-z-]+)?$/.test(prop);
  if (!timing) return null;
  if (items.some(i => !i)) return 'an empty item in the comma-separated list';
  if (/^(?:transition|animation)-(?:duration|delay)$/.test(prop)) {
    const bad = items.find(i => !time.test(i) && !(prop === 'animation-duration' && i.toLowerCase() === 'auto'));
    return bad === undefined ? null : number.test(bad) ? `${bad} has no unit (write ${bad}ms or ${bad}s)` : null;
  }
  if (prop !== 'transition' && prop !== 'animation') return null;
  for (const item of items) {
    const tokens = split(item, /\s/).filter(Boolean);
    const times = tokens.filter(t => time.test(t)).length;
    if (times > 2) return `${item} has ${times} times (a duration and a delay at most)`;
    const easingBad = tokens.map(easingProblem).find(Boolean);
    if (easingBad) return easingBad;
    if (prop === 'transition') {
      const bare = tokens.find(t => number.test(t));
      if (bare) return `${bare} has no unit (write ${bare}ms or ${bare}s)`;
      if (tokens.some(t => t.toLowerCase() === 'none') && (items.length > 1 || tokens.length > 1)) return 'none can only be the whole value';
      const names = tokens.filter(t => /^-?[a-z_][\w-]*$/i.test(t) && !easingWords.has(t.toLowerCase()) && !['normal', 'allow-discrete'].includes(t.toLowerCase()));
      if (names.length > 1) return `${names.join(' and ')} are two property names in one item (${names[1]} is not an easing)`;
    }
  }
  return null;
}
