// F109: a keyword the property does not take drops the declaration (measured in Chromium, Firefox and WebKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { keywordProblem } from '../src/layout/keyword-syntax.mjs';
test('keywords the property does not take are found, with a suggestion for the usual slips', () => {
    for (const [prop, value, suggest] of [['display', 'flexbox', 'flex'], ['display', 'inline-flexbox', 'inline-flex'], ['position', 'center'], ['text-align', 'middle', 'center'], ['align-items', 'middle', 'center'],
        ['align-items', 'flex-center', 'center'], ['justify-content', 'middle', 'center'], ['float', 'center'], ['overflow', 'none', 'hidden'], ['white-space', 'no-wrap', 'nowrap'], ['letter-spacing', 'auto', 'normal'],
        ['word-spacing', 'auto', 'normal'], ['box-sizing', 'border', 'border-box'], ['cursor', 'hand', 'pointer'], ['text-transform', 'capitalized', 'capitalize'], ['font-weight', 'heavy', '900'], ['visibility', 'none', 'hidden'],
        ['flex-direction', 'col', 'column'], ['align-self', 'middle', 'center'], ['border-style', 'line', 'solid']]) {
        const p = keywordProblem(prop, value);
        assert.ok(p, `${prop}: ${value}`);
        if (suggest)
            assert.equal(p.suggest, suggest, `${prop}: ${value}`);
    }
});
test('valid values, vendor keywords, var() and what is not judged are not reported', () => {
    for (const [prop, value] of [['justify-content', 'space-evenly'], ['align-items', 'baseline'], ['overflow', 'auto'], ['overflow', 'hidden auto'], ['position', '-webkit-sticky'], ['display', '-webkit-box'], ['display', 'inline flex'],
        ['display', 'flow-root'], ['text-align', '-webkit-center'], ['white-space', 'break-spaces'], ['white-space', 'collapse'], ['align-items', 'first baseline'], ['align-items', 'safe center'], ['border-style', 'solid dashed'],
        ['font-weight', '650'], ['cursor', 'url(x.png), pointer'], ['display', 'var(--d)'], ['position', 'inherit'], ['vertical-align', 'center'], ['color', 'middle'], ['letter-spacing', '1px'], ['word-spacing', '-0.5em'], ['letter-spacing', '10%']])
        assert.equal(keywordProblem(prop, value), null, `${prop}: ${value}`);
});
