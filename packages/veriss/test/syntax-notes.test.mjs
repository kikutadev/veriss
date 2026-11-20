// ADR-0016 M3: the syntax stage reports notes of one shape; rules/syntax-notes.mjs words them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLayoutCSS } from '../src/layout/css.mjs';
import { syntaxWarnings, syntaxNoteOrder } from '../src/rules/syntax-notes.mjs';
const parse = (css) => parseLayoutCSS([{ css, file: 'a.css' }], () => { });
test('every note the syntax stage reports has a code the catalog words', () => {
    const { notes } = parse('.a{width:calc(100%-1px);height:10 }.b{font:16px}@media (min-width:600){.c{top:0}}@import "x.css";.d{counter-increment:n}');
    assert.deepEqual([...new Set(notes.map(n => n.code))].sort(), ['W_CSS_CALC_OPERATOR_SPACE', 'W_CSS_COUNTER_UNUSED', 'W_CSS_FONT_INVALID', 'W_CSS_IMPORT_IGNORED', 'W_CSS_MEDIA_INVALID_LENGTH', 'W_CSS_UNITLESS_LENGTH']);
    for (const note of notes)
        assert.ok(syntaxNoteOrder.includes(note.code), note.code);
    const warnings = syntaxWarnings(notes);
    assert.equal(warnings.length, notes.length);
    for (const w of warnings)
        assert.ok(w.message && w.severity === 'warning' && w.css?.[0]?.file === 'a.css', w.code);
});
test('warnings come out code by code in the catalog order, and in source order within a code', () => {
    const { notes } = parse('.a{width:1}.b{height:2}.c{width:calc(1px+2px)}');
    assert.deepEqual(syntaxWarnings(notes).map(w => `${w.code} ${w.selector}`), ['W_CSS_UNITLESS_LENGTH .a', 'W_CSS_UNITLESS_LENGTH .b', 'W_CSS_CALC_OPERATOR_SPACE .c']);
    assert.deepEqual(syntaxWarnings(notes, ['W_CSS_CALC_OPERATOR_SPACE']).map(w => w.selector), ['.c']);
});
