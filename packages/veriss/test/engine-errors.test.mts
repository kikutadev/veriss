import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutError} from '../src/layout/engine-errors.mjs';
import {rectangle} from '../src/layout/region.mjs';
import {q} from '../src/layout/linear.mjs';

test('layout error preserves exact diagnostic region and location', () => {
  const region = rectangle({min:q(320),max:q(800)},{min:q(600),max:q(900)});
  const box={label:'.child',path:'0/0',source:{start:10,end:20}};
  const error=Object.assign(new Error('unsupported subgrid'),{code:'U_LAYOUT_SUBGRID',box,region,axis:'inline',css:{file:'layout.css',line:4}});
  const result=layoutError(error);
  assert.equal(result.message,error.message);
  assert.equal(result.code,'U_LAYOUT_SUBGRID');
  assert.equal(result.region,region);
  assert.deepEqual(result.box,box);
  assert.equal(result.axis,'inline');
  assert.equal(result.file,'layout.css');
  assert.equal(result.line,4);
});

test('layout error rejects malformed geometry and non-string metadata', () => {
  const result=layoutError({message:'bad geometry',code:42,box:{label:'.child'},region:{vertices:[{x:{n:1n,d:0n},y:q(0)}],constraints:[]},axis:'z',css:{line:'4'}});
  assert.equal(result.message,'bad geometry');
  assert.equal(result.region,undefined);
  assert.equal(result.code,undefined);
  assert.equal(result.box,undefined);
  assert.equal(result.axis,undefined);
  assert.equal(result.line,undefined);
  assert.equal(layoutError('plain failure').message,'plain failure');
});
