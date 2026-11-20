import test from 'node:test';
import assert from 'node:assert/strict';
import {firstStartMove, layoutRectangle, layoutStartMoves, matchLayoutRectangles} from '../src/layout/engine-geometry.mjs';
import {q, exact} from '../src/layout/linear.mjs';
import {rectangle, projection, serialize} from '../src/layout/region.mjs';
import type {LayoutAffine, LayoutRectangle} from '../src/layout-contracts.d.ts';
const a=(constant:string,coefficient='0',heightCoefficient?:string):LayoutAffine=>({constant,coefficient,...(heightCoefficient!==undefined?{heightCoefficient}:{})});
const rect=(x:LayoutAffine,y:LayoutAffine):LayoutRectangle=>({inlineStart:x,blockStart:y,inlineSize:a('24'),blockSize:a('24')});
const region=rectangle({min:q(320),max:q(960)},{min:q(240),max:q(720)});
const box={path:'Page/0',range:projection(region,'x'),heightRange:projection(region,'y'),region:serialize(region),rect:rect(a('0'),a('0')),$shown:{region}};
test('the exact first changed start is independent of the floating-point CLS score',()=>{
  const moved=firstStartMove(box.rect,rect(a('1/3'),a('12')),region);
  assert.ok(moved);
  assert.equal(moved.field,'inlineStart');
  assert.equal(exact(moved.delta),'1/3');
  assert.equal(firstStartMove(box.rect,rect(a('0'),a('0')),region),undefined);
  const atOtherWidth=firstStartMove(box.rect,rect(a('-320','1'),a('0')),region);
  assert.ok(atOtherWidth);
  assert.equal(exact(atOtherWidth.v.x),'960');
});
test('an explicitly unresolved unpainted rectangle never falls back to painted geometry',()=>{
  const unresolved={...box,layoutRect:null};
  assert.equal(layoutRectangle(unresolved),null);
  assert.equal(layoutStartMoves([box],[unresolved]).undecided,unresolved);
});
test('untransformed rows must have unique matching path and region; missing rows stay null',()=>{
  const shifted={...box,rect:rect(a('10'),a('0'))};
  const rows=[shifted,{...shifted,path:'Page/1'}];
  const match=matchLayoutRectangles(rows,[box],true);
  assert.deepEqual(match,[box.rect,null]);
  assert.deepEqual(matchLayoutRectangles(rows,[box,box],true),[null,null]);
  assert.deepEqual(matchLayoutRectangles(rows,[box],false),[null,null]);
});
