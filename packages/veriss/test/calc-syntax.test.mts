// F89: + and - in a math function need white space on both sides (measured in Chromium, Firefox and WebKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import {calcOperatorProblem} from '../src/layout/calc-syntax.mjs';

test('operators without their spaces are found, with the text as written', () => {
  for (const [value, written] of [['calc(100%-10px)', '100%-10px'], ['calc(100% -10px)', '100% -10px'], ['calc(100%- 10px)', '100%- 10px'], ['calc(100% +10px)', '100% +10px'], ['calc(100%+10px)', '100%+10px'],
    ['min(100%-10px, 50px)', '100%-10px'], ['clamp(10px,100%-10px,500px)', '100%-10px'], ['calc(1px + calc(100%-10px))', '100%-10px'], ['calc(var(--a)-10px)', 'var(--a)-10px']])
    assert.equal(calcOperatorProblem(value), written, value);
});

test('valid math, signs and other functions are not reported', () => {
  for (const value of ['calc(100% - 10px)', 'calc(50%*2)', 'calc(50% *2)', 'calc(200px/2)', 'calc(-10px + 100%)', 'calc((100%) - 10px)', 'calc(100% - -10px)', 'calc(100% - (10px))', 'max(10px,100% - 10px)',
    'calc(var(--a-b) - 1px)', '10px', 'translate(-10px)', 'calc(100% - var(--x, 1px))', 'repeat(2, minmax(0,1fr))', 'calc(-1 * var(--g))', 'translate(calc(-50% + 1px), 0)'])
    assert.equal(calcOperatorProblem(value), null, value);
});
