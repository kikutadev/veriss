// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// F109: a keyword the property does not take (position: center, display: flexbox, white-space: no-wrap, …) makes the
// declaration invalid: the browser drops it and the earlier value stays (measured in Chromium, Firefox and WebKit).
// Judged only where the keywords form a closed set and the value is that simple (one keyword; overflow two; a border
// style up to four). Vendor keywords (-webkit-…), var() and the CSS-wide keywords are not judged; vertical-align is left
// out (Firefox takes vertical-align: center).
const alignment = ['normal', 'stretch', 'center', 'start', 'end', 'flex-start', 'flex-end', 'self-start', 'self-end', 'left', 'right', 'baseline', 'space-between', 'space-around', 'space-evenly', 'auto', 'legacy', 'anchor-center'];
const borderStyles = ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'];
const overflow = ['visible', 'hidden', 'clip', 'scroll', 'auto', 'overlay'];
const sets: Record<string, readonly string[]> = {
  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  float: ['left', 'right', 'none', 'inline-start', 'inline-end'],
  clear: ['left', 'right', 'both', 'none', 'inline-start', 'inline-end'],
  'box-sizing': ['content-box', 'border-box'],
  visibility: ['visible', 'hidden', 'collapse'],
  'text-transform': ['none', 'capitalize', 'uppercase', 'lowercase', 'full-width', 'full-size-kana', 'math-auto'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
  'text-align': ['start', 'end', 'left', 'right', 'center', 'justify', 'match-parent', 'justify-all'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces', 'collapse', 'preserve', 'preserve-breaks', 'preserve-spaces', 'wrap'],
  display: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'flow-root', 'none', 'contents', 'table', 'inline-table', 'table-row', 'table-cell', 'table-column', 'table-column-group',
    'table-header-group', 'table-footer-group', 'table-row-group', 'table-caption', 'list-item', 'ruby', 'ruby-text', 'ruby-base', 'ruby-base-container', 'ruby-text-container', 'run-in', 'flow', 'math', 'inline-list-item',
    'masonry', 'inline-masonry', 'grid-lanes', 'inline-grid-lanes'],
  'font-style': ['normal', 'italic', 'oblique'],
  'letter-spacing': ['normal'], 'word-spacing': ['normal'],
  cursor: ['auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress', 'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy', 'move', 'no-drop', 'not-allowed', 'grab', 'grabbing', 'e-resize',
    'n-resize', 'ne-resize', 'nw-resize', 's-resize', 'se-resize', 'sw-resize', 'w-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'col-resize', 'row-resize', 'all-scroll', 'zoom-in', 'zoom-out'],
  'font-weight': ['normal', 'bold', 'bolder', 'lighter'],
};
for (const key of ['align-items', 'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self']) sets[key] = alignment;
for (const key of ['overflow', 'overflow-x', 'overflow-y', 'overflow-inline', 'overflow-block']) sets[key] = overflow;
for (const key of ['border-style', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-block-style', 'border-inline-style', 'border-block-start-style', 'border-block-end-style',
  'border-inline-start-style', 'border-inline-end-style']) sets[key] = borderStyles;
sets['outline-style'] = [...borderStyles, 'auto'];
const most: Record<string, number> = { overflow: 2, 'border-style': 4, 'border-block-style': 2, 'border-inline-style': 2 };
// The usual slips and what they mean.
const suggestions: Record<string, string> = { middle: 'center', 'flex-center': 'center', flexbox: 'flex', 'inline-flexbox': 'inline-flex', 'no-wrap': 'nowrap', col: 'column', 'col-reverse': 'column-reverse', border: 'border-box', content: 'content-box',
  hand: 'pointer', capitalized: 'capitalize', heavy: '900', line: 'solid', italics: 'italic' };
const bySet: Record<string, Record<string,string>> = { overflow: { none: 'hidden' }, visibility: { none: 'hidden' }, 'letter-spacing': { auto: 'normal' }, 'word-spacing': { auto: 'normal' } };
const wide = /^(?:inherit|initial|unset|revert|revert-layer)$/i;

/** { keyword, allowed, suggest? } when the value has a keyword the property does not take, else null. */
export function keywordProblem(property: unknown, value: unknown): {keyword:string;allowed:string;suggest?:string} | null {
  const prop = String(property).toLowerCase(), allowed = sets[prop];
  if (!allowed) return null;
  const text = String(value).trim().toLowerCase();
  if (!text || wide.test(text) || /[(),"']/.test(text)) return null;
  const words = text.split(/\s+/);
  if (words.length > (most[prop] ?? 1)) return null;
  if (prop === 'font-weight' && /^\d+(?:\.\d+)?$/.test(text)) return Number(text) >= 1 && Number(text) <= 1000 ? null : { keyword: text, allowed: 'a number from 1 to 1000, normal, bold, bolder or lighter' };
  // Only identifiers are judged: a number or a length (letter-spacing: 1px) is not a keyword (other code checks those).
  if (words.some(word => !/^-?[a-z][a-z-]*$/.test(word))) return null;
  const bad = words.find(word => !word.startsWith('-') && !allowed.includes(word));
  if (bad === undefined) return null;
  const suggest = bySet[prop]?.[bad] ?? suggestions[bad];
  return { keyword: bad, allowed: allowed.length > 12 ? `one of its ${allowed.length} keywords` : allowed.join(', '), ...(suggest && (allowed.includes(suggest) || /^\d+$/.test(suggest)) ? { suggest } : {}) };
}
