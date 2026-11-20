// F115: background shorthands the browser drops (measured in Chromium, Firefox and WebKit).
import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundProblem} from '../src/layout/background-syntax.mjs';
import {parseColor} from '../src/color/index.mjs';

const isColor = (t: string) => parseColor(t) !== null || /^currentcolor$/i.test(t);

test('invalid background shorthands are found', () => {
  for (const v of ['url(a b.png)', 'url(x.png) / cover center', 'url(x.png) cover', 'red url(x.png), blue', 'url(x.png) contain no-repeat']) assert.ok(backgroundProblem(v, isColor), v);
});

test('valid ones and var() are not reported', () => {
  for (const v of ['url("a b.png")', 'url(a%20b.png)', 'url(x.png) center / cover', 'url(x.png) center/cover no-repeat', 'url(x.png) no-repeat center / 50% auto', 'url(x.png) 10px 20px / 30px', 'url(x.png), red', 'white',
    'linear-gradient(red, blue) center / cover', 'var(--bg)', 'none', 'url(x.png) left top / contain no-repeat #fff', 'red'])
    assert.equal(backgroundProblem(v, isColor), null, v);
});
