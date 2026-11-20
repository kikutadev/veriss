// F99 / F100: font-family and font values the browser drops (measured in Chromium, Firefox and WebKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyProblem, fontShorthandProblem } from '../src/layout/font-syntax.mjs';
test('unquoted family names that are not identifiers are found', () => {
    for (const [value, bad] of [['Font Awesome 5 Free', 'Font Awesome 5 Free'], ['Foo, 3D Bar, serif', '3D Bar'], ['-2x, serif', '-2x'], ['a.b', 'a.b']])
        assert.equal(familyProblem(value), bad, value);
    for (const value of ['"Font Awesome 5 Free"', 'Foo Bar, serif', 'Foo-3, serif', 'serif', 'Segoe UI, Roboto', "'A', B, sans-serif", 'var(--f)', 'inherit', 'ヒラギノ角ゴ ProN, sans-serif'])
        assert.equal(familyProblem(value), null, value);
});
test('a font shorthand without a size or a family, or with a bad family, is found', () => {
    const cases = [['16px Font Awesome 5 Free', { family: 'Font Awesome 5 Free' }], ['16px -2x, serif', { family: '-2x' }], ['16px a.b', { family: 'a.b' }],
        ['16px', { missing: 'family' }], ['16px/1.5', { missing: 'family' }], ['italic 16px', { missing: 'family' }], ['bold Arial', { missing: 'size' }]];
    for (const [value, problem] of cases)
        assert.deepEqual(fontShorthandProblem(value), problem, value);
    for (const value of ['16px "Font Awesome 5 Free"', '16px Foo-3, serif', '16px serif', 'italic bold 16px/1.5 Georgia, serif', '700 1rem/1.2 system-ui', 'caption', 'inherit', 'var(--font)', 'small-caps 12px serif', 'bold 16px / 1.5 serif', 'large serif'])
        assert.equal(fontShorthandProblem(value), null, value);
});
