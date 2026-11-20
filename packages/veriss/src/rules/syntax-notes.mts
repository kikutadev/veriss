// The warnings of the syntax stage (ADR-0016 M3): parseLayoutCSS reports what it found as notes of one shape,
// { code, ...data }; this catalog turns each into the warning a user reads. The stage decides what is wrong, the rule
// how to say it. syntaxNoteOrder is the order the warnings are reported in (stable across releases).
interface NoteSource { file: string; line: number }
export interface SyntaxNotePayloads {
  W_CSS_BACKGROUND_INVALID: NoteSource & { problem: string; selector: string; value: string };
  W_CSS_TIMING_INVALID: NoteSource & { problem: string; property: string; selector: string; value: string };
  W_CSS_FONT_FACE_INVALID: NoteSource & { family?: string; ignored?: boolean; problem: string };
  W_CSS_PROPERTY_INVALID: NoteSource & { name: string; problem: string };
  W_CSS_SUPPORTS_INVALID: NoteSource & { params: string; written: string };
  W_CSS_KEYWORD_INVALID: NoteSource & { allowed: string; keyword: string; property: string; selector: string; suggest?: string; value: string };
  W_CSS_COLOR_INVALID: NoteSource & { color: string; problem: string; property: string; selector: string; value: string };
  W_CSS_MARKER_IGNORED: NoteSource & { property: string; selector: string };
  W_CSS_COUNTER_UNUSED: NoteSource & { name: string; property: string; selector: string };
  W_CSS_GRID_TRACKS_INVALID: NoteSource & { problem: string; property: string; selector: string; value: string };
  W_CSS_FONT_INVALID: NoteSource & { family?: string; missing?: string; property: string; selector: string; value: string };
  W_CSS_UNITLESS_LENGTH: NoteSource & { bare: string; property: string; selector: string; value: string };
  W_CSS_CALC_OPERATOR_SPACE: NoteSource & { property: string; selector: string; value: string; written: string };
  W_CSS_IMPORTANT_TYPO: NoteSource & { property: string; selector: string; value: string; word: string };
  W_CSS_MEDIA_AND_SPACE: NoteSource & { params: string; written?: string };
  W_CSS_MEDIA_INVALID_LENGTH: NoteSource & { params: string; value: string };
  W_CSS_MEDIA_VAR: NoteSource & { params: string };
  W_CSS_GRID_AREAS_INVALID: NoteSource & { selector: string; why: string };
  W_CSS_PLACEHOLDER_IGNORED: NoteSource & { property: string; selector: string };
  W_CSS_SELECTION_IGNORED: NoteSource & { property: string; selector: string };
  W_CSS_VISITED_IGNORED: NoteSource & { property: string; selector: string };
  W_CSS_TRANSITION_NO_DURATION: NoteSource & { item: string; selector: string };
  W_CSS_DUPLICATE_DECLARATION: NoteSource & { dead: string; kept: string; property: string; same: boolean; selector: string };
  W_CSS_KEYFRAMES_MISSING: NoteSource & { name: string; selector?: string };
  W_CSS_IMPORT_IGNORED: NoteSource & { nested: boolean; params: string };
  W_CSS_KEYFRAME_IMPORTANT: NoteSource & { name: string; property: string };
  W_CSS_TRANSITION_DISPLAY: NoteSource & { selector: string };
}
export type SyntaxNoteCode = keyof SyntaxNotePayloads;
export type SyntaxNote = { [K in SyntaxNoteCode]: { code: K } & SyntaxNotePayloads[K] }[SyntaxNoteCode];
export interface SyntaxWarning {
  code: SyntaxNoteCode;
  severity: 'warning';
  message: string;
  selector?: string | undefined;
  property?: string | undefined;
  css: { property: string; file: string; line: number; selector?: string }[];
  counter?: string;
  keyframes?: string;
}
type Catalog = { [K in SyntaxNoteCode]: (note: SyntaxNotePayloads[K]) => SyntaxWarning };
const catalog: Catalog = {
  W_CSS_BACKGROUND_INVALID: note => ({ code: 'W_CSS_BACKGROUND_INVALID', severity: 'warning', selector: note.selector, property: 'background', css: [{ property: 'background', file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { background: ${note.value} }: ${note.problem}, so the browser drops the whole declaration (no image and no color from it). Write image position / size repeat color, with the color in the last layer` }),
  W_CSS_TIMING_INVALID: note => ({ code: 'W_CSS_TIMING_INVALID', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.problem}, so the browser drops the whole declaration and there is no ${note.property.startsWith('anim') ? 'animation' : 'transition'} from it. Write it as property duration easing delay (transition: opacity .3s ease-in-out)` }),
  W_CSS_FONT_FACE_INVALID: note => ({ code: 'W_CSS_FONT_FACE_INVALID', severity: 'warning', css: [{ property: '@font-face', file: note.file, line: note.line }],
    message: note.ignored ? `@font-face: ${note.problem}, so the browser ignores the whole rule and the font is never loaded (text uses the next family in its list). Give it a quoted font-family and a src of url() / local() items` : `@font-face ${note.family}: ${note.problem}; the browser drops the descriptor and uses auto. Write font-display: swap (or block, fallback, optional)` }),
  W_CSS_PROPERTY_INVALID: note => ({ code: 'W_CSS_PROPERTY_INVALID', severity: 'warning', property: note.name, css: [{ property: '@property', file: note.file, line: note.line, selector: `@property ${note.name}` }],
    message: `@property ${note.name}: ${note.problem}, so the browser ignores the whole rule and ${note.name} stays an unregistered custom property (it inherits and has no type or initial value). Fix the rule: syntax: '<length>'; inherits: false; initial-value: 0px` }),
  W_CSS_SUPPORTS_INVALID: note => ({ code: 'W_CSS_SUPPORTS_INVALID', severity: 'warning', css: [{ property: '@supports', file: note.file, line: note.line }],
    message: `@supports ${note.params}: "${note.written}" with no space is read as a function, so the condition is invalid and its rules never apply in any browser. Write ${note.params.replace(/(?<![\w:-])(and|or|not)\(/gi, '$1 (')}` }),
  W_CSS_KEYWORD_INVALID: note => ({ code: 'W_CSS_KEYWORD_INVALID', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.property} has no keyword ${note.keyword} (it takes ${note.allowed}), so the browser drops the whole declaration and the earlier ${note.property} stays.${note.suggest ? ` Did you mean ${note.property}: ${note.value.replace(new RegExp(`\\b${note.keyword}\\b`, 'i'), note.suggest)}?` : ''}` }),
  W_CSS_COLOR_INVALID: note => ({ code: 'W_CSS_COLOR_INVALID', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.color} is not a valid color (${note.problem}), so the browser drops the whole declaration and the earlier ${note.property} stays. ${/comma/.test(note.problem) ? 'Write the space form (hsl(0 0% 0%), rgb(0 0 0 / 50%)) or keep every value of the comma form the same kind' : /hex/.test(note.problem) ? 'Write 3, 4, 6 or 8 hex digits' : 'Write rgb(r g b / alpha) or hsl(h s l / alpha)'}` }),
  W_CSS_MARKER_IGNORED: note => ({ code: 'W_CSS_MARKER_IGNORED', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector}: ${note.property} is ignored — ::marker takes only color, content, font and white-space properties (and animations): margins, padding, backgrounds and sizes of the marker do nothing. Style the list item, or use ::before for a marker box of your own` }),
  W_CSS_COUNTER_UNUSED: note => ({ code: 'W_CSS_COUNTER_UNUSED', severity: 'warning', counter: note.name, selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property} }: the counter ${note.name} is never read (no content: counter(${note.name}) or counters(${note.name}, …) in the CSS analysed), so it changes nothing on the page. Show it with ::before { content: counter(${note.name}) }, or remove it` }),
  W_CSS_GRID_TRACKS_INVALID: note => ({ code: 'W_CSS_GRID_TRACKS_INVALID', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.problem}, so the value is invalid and the browser drops the whole declaration.${/auto-fill|auto-fit/.test(note.problem) ? ' For columns that fill the row, write repeat(auto-fill, minmax(200px, 1fr))' : ''}` }),
  W_CSS_FONT_INVALID: note => ({ code: 'W_CSS_FONT_INVALID', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.family ? `the family name ${note.family} is not valid unquoted (a word starts with a digit, or holds a character a name cannot)` : `the font shorthand needs both a size and a family (it has no ${note.missing})`}, so the browser drops the whole declaration. ${note.family ? `Quote it: "${note.family}"` : note.missing === 'family' ? `Add a family (${note.value} sans-serif), or use font-size` : 'Add a size before the family (16px), or use font-weight / font-family'}` }),
  W_CSS_UNITLESS_LENGTH: note => ({ code: 'W_CSS_UNITLESS_LENGTH', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.bare} has no unit, and a length other than 0 needs one, so the browser drops the whole declaration. Write ${note.bare}px (or the unit you meant)` }),
  W_CSS_CALC_OPERATOR_SPACE: note => ({ code: 'W_CSS_CALC_OPERATOR_SPACE', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: in ${note.written} the + or - has no space on one side, so it is read as the sign of a number and the value is invalid: the browser drops the whole declaration. Write ${note.written.replace(/\s*([+-])\s*/, ' $1 ')}` }),
  W_CSS_IMPORTANT_TYPO: note => ({ code: 'W_CSS_IMPORTANT_TYPO', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} { ${note.property}: ${note.value} }: ${note.word} is not !important, so the browser drops the whole declaration. Write !important (or remove it)` }),
  W_CSS_MEDIA_AND_SPACE: note => ({ code: 'W_CSS_MEDIA_AND_SPACE', severity: 'warning', css: [{ property: '@media', file: note.file, line: note.line }],
    message: `@media ${note.params}: "${note.written ?? 'and('}" with no space is read as a function, so the query is invalid and its rules never apply. Write ${note.params.replace(/(?<![\w:-])(and|or|not)\(/gi, '$1 (')}` }),
  W_CSS_MEDIA_INVALID_LENGTH: note => ({ code: 'W_CSS_MEDIA_INVALID_LENGTH', severity: 'warning', css: [{ property: '@media', file: note.file, line: note.line }],
    message: `@media ${note.params}: ${note.value} is not a length (${/\s/.test(note.value) ? 'no space is allowed before the unit' : 'a number other than 0 needs a unit'}), so the query is invalid and its rules never apply. Write ${note.value.replace(/\s+/g, '').replace(/^((?:\d*\.)?\d+)$/, '$1px')}` }),
  W_CSS_MEDIA_VAR: note => ({ code: 'W_CSS_MEDIA_VAR', severity: 'warning', css: [{ property: '@media', file: note.file, line: note.line }],
    message: `@media ${note.params}: var() is not allowed in a media query (custom properties are not substituted there), so the query is invalid and its rules never apply. Write the length itself, or use @custom-media in a build step` }),
  W_CSS_GRID_AREAS_INVALID: note => ({ code: 'W_CSS_GRID_AREAS_INVALID', severity: 'warning', selector: note.selector, property: 'grid-template-areas', css: [{ property: 'grid-template-areas', file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector}: grid-template-areas is invalid (${note.why}), so the browser drops the whole declaration and every grid-area name in it is unknown (items are auto-placed). Make each name one rectangle and give every row the same number of cells` }),
  W_CSS_PLACEHOLDER_IGNORED: note => ({ code: 'W_CSS_PLACEHOLDER_IGNORED', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector}: ${note.property} is ignored — the placeholder is drawn inside the field and ::placeholder does not take a margin, height, display or position. Style the field itself (padding, height) instead` }),
  W_CSS_SELECTION_IGNORED: note => ({ code: 'W_CSS_SELECTION_IGNORED', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector}: ${note.property} is ignored — ::selection paints the selected text (color, background-color, text-decoration, text-shadow) and does not change its size or box. Remove it, or style the element itself` }),
  W_CSS_VISITED_IGNORED: note => ({ code: 'W_CSS_VISITED_IGNORED', severity: 'warning', selector: note.selector, property: note.property, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector}: ${note.property} is ignored — in a :visited rule browsers apply only colors (color, background-color, border and outline colors, …), so that a page cannot read which links were visited. Style the visited state with a color, or move ${note.property} to the link itself` }),
  W_CSS_TRANSITION_NO_DURATION: note => ({ code: 'W_CSS_TRANSITION_NO_DURATION', severity: 'warning', selector: note.selector, property: note.item.split(/\s+/)[0], css: [{ property: 'transition', file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} has transition: ${note.item} with no duration (0s): the change happens at once, as if there were no transition. Give it a time (transition: ${note.item} .2s)` }),
  W_CSS_DUPLICATE_DECLARATION: note => ({ code: 'W_CSS_DUPLICATE_DECLARATION', severity: 'warning', property: note.property, selector: note.selector, css: [{ property: note.property, file: note.file, line: note.line, selector: note.selector }],
    message: note.same ? `${note.selector} declares ${note.property}: ${note.kept} twice: the repeat does nothing. Remove one` : `${note.selector} declares ${note.property} twice: ${note.property}: ${note.dead} never applies (${note.kept} wins). Remove it, or merge the two`}),
  W_CSS_KEYFRAMES_MISSING: note => ({ code: 'W_CSS_KEYFRAMES_MISSING', severity: 'warning', keyframes: note.name, ...(note.selector ? { selector: note.selector } : {}), css: [{ property: 'animation-name', file: note.file, line: note.line, ...(note.selector ? { selector: note.selector } : {}) }],
    message: `${note.selector ?? 'A rule'} runs animation ${note.name}, but no @keyframes ${note.name} exists: the animation does nothing. Check the name (it is case-sensitive) or add the @keyframes rule` }),
  W_CSS_IMPORT_IGNORED: note => ({ code: 'W_CSS_IMPORT_IGNORED', severity: 'warning', css: [{ property: '@import', file: note.file, line: note.line, selector: '@import' }],
    message: `@import ${note.params} is ${note.nested ? 'inside another rule' : 'after other rules'}: @import is only valid before every other rule of the sheet (after @charset and @layer statements), so the browser ignores it and the sheet is never loaded. Move it to the top${note.nested ? ' (with the condition written as @import url(...) <media query>)' : ''}` }),
  W_CSS_KEYFRAME_IMPORTANT: note => ({ code: 'W_CSS_KEYFRAME_IMPORTANT', severity: 'warning', keyframes: note.name, css: [{ property: note.property, file: note.file, line: note.line, selector: `@keyframes ${note.name}` }],
    message: `@keyframes ${note.name}: ${note.property} is marked !important, which makes it invalid in a keyframe: the browser ignores the declaration and the animation never changes ${note.property} there. Remove !important (an animation already overrides every normal declaration)` }),
  W_CSS_TRANSITION_DISPLAY: note => ({ code: 'W_CSS_TRANSITION_DISPLAY', severity: 'warning', selector: note.selector, css: [{ property: 'transition', file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} transitions display, which does not animate without transition-behavior: allow-discrete: the box appears or disappears at once (a fade-out ends cut off). Add transition-behavior: allow-discrete (and @starting-style for the fade in), or transition opacity and visibility instead` }),
};
// Object.keys is safe here: the catalog is a closed literal implementing Catalog.
export const syntaxNoteOrder = Object.keys(catalog) as SyntaxNoteCode[];
/** The warnings for the notes with the given codes, code by code in that order, each code's notes in source order. */
function hasCode<K extends SyntaxNoteCode>(note: SyntaxNote, code: K): note is SyntaxNote & { code: K } & SyntaxNotePayloads[K] {
  return note.code === code;
}
function warningsFor<K extends SyntaxNoteCode>(notes: readonly SyntaxNote[], code: K): SyntaxWarning[] {
  return notes.filter(note => hasCode(note, code)).map(note => catalog[code](note));
}
export function syntaxWarnings(notes: readonly SyntaxNote[], codes: readonly SyntaxNoteCode[] = syntaxNoteOrder): SyntaxWarning[] {
  return codes.flatMap(code => warningsFor(notes, code));
}
