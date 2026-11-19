// F114: transition / animation values the browser drops (measured in Chromium, Firefox and WebKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import {timingProblem} from '../src/layout/timing-syntax.mjs';

test('invalid transition and animation values are found', () => {
  for (const [p, v] of [['transition', 'opacity 300'], ['transition', 'all 0.3 ease'], ['transition', 'opacity .3s ease-in-out 1s 2s'], ['transition', 'opacity .3s,'], ['transition-duration', '300'], ['transition', 'opacity .3s easeInOut'],
    ['animation-duration', '2'], ['animation', 'spin 1s 1s 1s'], ['transition', 'opacity 0.3s cubic-bezier(1,2,3)'], ['transition', 'none, opacity 1s'], ['transition', 'opacity 1s none']])
    assert.ok(timingProblem(p, v), `${p}: ${v}`);
});

test('valid values and var() are not reported', () => {
  for (const [p, v] of [['transition', 'opacity .3s'], ['transition', 'opacity .3s, transform'], ['transition-duration', '.3s'], ['animation', 'spin 1s linear'], ['animation', 'spin 1 linear'], ['transition', 'none'],
    ['transition', 'opacity 200ms ease-in-out 50ms'], ['transition', 'all 1s cubic-bezier(.2, 0, 0, 1)'], ['transition', 'display 1s allow-discrete'], ['transition', 'transform 1s steps(4, end)'], ['animation-duration', 'auto'],
    ['transition', 'opacity var(--t)'], ['animation', 'spin 1s infinite alternate both'], ['transition-delay', '-1s, 0s']])
    assert.equal(timingProblem(p, v), null, `${p}: ${v}`);
});
