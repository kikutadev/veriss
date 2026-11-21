// F122: size keywords that only some browsers take (measured in Chromium, Firefox and WebKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeKeywordSplits } from '../src/layout/size-keyword-syntax.mjs';
const split = (decls) => sizeKeywordSplits(decls.map(([prop, value]) => ({ prop, value })));
test('a keyword some browsers drop, without a fallback they take, splits the page', () => {
    assert.deepEqual(split([['width', '50px'], ['width', 'stretch']]), [{ property: 'width', used: { chromium: 'stretch', firefox: '50px', webkit: 'stretch' }, keywords: ['stretch'] }]);
    assert.equal(split([['width', '-moz-available']]).length, 1);
    assert.equal(split([['max-width', '-webkit-fit-content']]).length, 1);
    assert.equal(split([['width', 'intrinsic']]).length, 1);
});
test('a keyword every browser takes, or the prefixed forms listed together, does not', () => {
    for (const decls of [[['width', '-webkit-fill-available']], [['width', 'fit-content']], [['width', '-webkit-fill-available'], ['width', '-moz-available'], ['width', 'stretch']],
        [['width', '-moz-fit-content'], ['width', 'fit-content']], [['width', '-webkit-fit-content'], ['width', '-moz-fit-content']], [['width', '50px']], [['width', 'var(--w)'], ['width', 'stretch']], [['margin', 'stretch']]])
        assert.deepEqual(split(decls), [], JSON.stringify(decls));
});
