// F101: grid track lists the browser drops (measured in Chromium, Firefox and WebKit, 23 values).
import test from 'node:test';
import assert from 'node:assert/strict';
import {gridTrackProblem} from '../src/layout/grid-syntax.mjs';

test('invalid track lists are found', () => {
  for (const v of ['repeat(auto-fill,1fr)', 'repeat(auto-fill,auto)', 'repeat(auto-fill,minmax(auto,1fr))', 'repeat(auto-fill,min-content)', 'repeat(auto-fill,100px) repeat(auto-fill,50px)', 'repeat(auto-fill,100px) 1fr',
    'repeat(auto-fill,100px 1fr)', 'minmax(1fr,100px) 1fr', 'minmax(1fr,1fr)', 'repeat(0,1fr)', 'repeat(2.5,1fr)', '1fr -10px', 'fit-content(1fr)', 'repeat(auto-fill,fit-content(100px))'])
    assert.ok(gridTrackProblem(v), v);
});

test('valid ones, and ones not judged (var(), subgrid), are not', () => {
  for (const v of ['repeat(auto-fit,minmax(100px,1fr))', 'repeat(auto-fill,minmax(min-content,100px))', 'repeat(auto-fill,minmax(auto,100px))', 'minmax(100px,1fr)', 'repeat(3,1fr)', 'fit-content(100px)', '100px [a] 1fr',
    'repeat(auto-fill,calc(50px + 10%))', 'repeat(auto-fill, 10%)', 'var(--cols)', 'none', 'subgrid', '[full-start] minmax(1rem,1fr) [content-start] minmax(0,60rem) [content-end] minmax(1rem,1fr) [full-end]',
    'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', 'repeat(2, [a] 1fr [b])', '1fr 2fr', 'auto 1fr auto'])
    assert.equal(gridTrackProblem(v), null, v);
});
