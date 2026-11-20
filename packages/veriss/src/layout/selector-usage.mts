import type { Selector, SelectorBox, SelectorRule, SelectorLink, Combinator } from './selectors.mjs';
export interface UsageRow {selector: string; file: string; line: number; matched: number}
export type UsageWarning = Omit<UsageRow, 'matched'> & {code: 'W_CSS_SELECTOR_UNMATCHED' | 'W_CSS_SELECTOR_RELATION'; severity: 'warning'; message: string; link?: {combinator: Combinator; compound: string}};
import { compoundMatches as exactMatches, neighbors } from './selectors.mjs';
// A match that is not known (a dynamic attribute value) counts as a match: such a selector is never reported.
const compoundMatches = (selector: Selector, box: SelectorBox) => { try { return exactMatches(selector, box); } catch { return true; } };

// Selector usage (opt-in, options.selectors): every stylesheet selector against the elements of the analysed tree.
// A selector is judged on the element it styles: user-action states and pseudo-elements are ignored, since the
// question is whether the template has such an element at all. Reports:
//   W_CSS_SELECTOR_UNMATCHED  no element matches the rightmost compound (a near class name is suggested)
//   W_CSS_SELECTOR_RELATION   elements match each compound, but the combinators never hold together
// One tree is one state of the template; an adapter with several states (branches) intersects the warnings.
const distance = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array.from({length: b.length}, () => 0)]);
  const row = (i: number) => { const value = d[i]; if (!value) throw new Error("Missing distance row"); return value; };
  const cell = (i: number, j: number) => { const value = row(i)[j]; if (value === undefined) throw new Error("Missing distance cell"); return value; };
  for (let j = 1; j <= b.length; j++) row(0)[j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    row(i)[j] = Math.min(cell(i - 1, j) + 1, cell(i, j - 1) + 1, cell(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1));
    // A transposition (itme → item) is one edit (Damerau).
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row(i)[j] = Math.min(cell(i, j), cell(i - 2, j - 2) + 1);
  }
  return cell(a.length, b.length);
};
const relationWords: Record<Combinator, [string, string]> = { '>': ['has a parent matching', 'parents'], ' ': ['is inside an element matching', 'ancestors'], '+': ['directly follows an element matching', 'previous siblings'], '~': ['follows an element matching', 'earlier siblings'] };

export function selectorUsage(rules: readonly SelectorRule[], boxes: readonly SelectorBox[]) {
  const elements = boxes.filter(box => !box.anonymous && !box.pseudo);
  const classes = new Set(elements.flatMap(box => box.classes));
  const rows: UsageRow[] = [], warnings: UsageWarning[] = [];
  const seen = new Set();
  for (const rule of rules.filter(rule => !rule.attached)) for (const selector of rule.selectors) {
    const key = `${selector.source}\u0000${rule.file}\u0000${rule.line}`;
    if (seen.has(key)) continue; seen.add(key);
    const subjects = elements.filter(box => compoundMatches(selector, box));
    // Walk the chain outward, keeping the elements still in play at each step.
    let frontier = subjects, broken: (SelectorLink & {i: number; from: SelectorBox[]}) | null = null;
    const chain = selector.chain ?? [];
    for (const [i, {compound, combinator}] of chain.entries()) {
      if (!frontier.length) break;
      const next = [...new Set(frontier.flatMap(box => neighbors(box, combinator).filter(n => compoundMatches(compound, n))))];
      if (!next.length) { broken = { i, compound, combinator, from: frontier }; frontier = []; break; }
      frontier = next;
    }
    const holds = (box: SelectorBox, i: number): boolean => { const link = chain[i]; return !link || neighbors(box, link.combinator).some(n => compoundMatches(link.compound, n) && holds(n, i + 1)); };
    const matched = broken ? 0 : subjects.filter(box => holds(box, 0)).length;
    const row = { selector: selector.source, file: rule.file, line: rule.line, matched };
    rows.push(row);
    if (!subjects.length) {
      const missing = selector.parts.flatMap(part => part.kind === 'class' && !classes.has(part.value) ? [part.value] : []);
      const near = missing.flatMap(name => [...classes].filter(c => c !== name && distance(c, name) <= (name.length <= 5 ? 1 : 2)).map(c => `.${c}`));
      warnings.push({ code: 'W_CSS_SELECTOR_UNMATCHED', severity: 'warning', selector: selector.source, file: rule.file, line: rule.line,
        message: `${selector.source} matches no element of the template${missing.length ? ` (no element has class ${missing.map(m => `.${m}`).join(', ')})` : ''}${near.length ? `; did you mean ${[...new Set(near)].join(' or ')}?` : ''}` });
    } else if (broken) {
      const [verb, noun] = relationWords[broken.combinator];
      const combinator = broken.combinator;
      const actual = [...new Set(broken.from.flatMap(box => neighbors(box, combinator)).map(box => box.label))].slice(0, 6);
      const right = broken.i === 0 ? selector.parts.map(p => p.kind === 'class' ? `.${p.value}` : p.kind === 'id' ? `#${p.value}` : p.kind === 'tag' ? p.value : '').join('') || selector.source : broken.compound.source;
      warnings.push({ code: 'W_CSS_SELECTOR_RELATION', severity: 'warning', selector: selector.source, file: rule.file, line: rule.line, link: { combinator: broken.combinator, compound: broken.compound.source },
        message: `${selector.source}: ${broken.from.length} element(s) match ${broken.i === 0 ? right : `the part right of ${broken.compound.source}`}, but none ${verb} ${broken.compound.source}; ${actual.length ? `their ${noun} are ${actual.join(', ')}` : `they have no ${noun}`}. The selector and the template's structure disagree` });
    }
  }
  return { rows, warnings };
}
