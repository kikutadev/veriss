import test from 'node:test';
import assert from 'node:assert/strict';
import {createObligationCollector} from '../src/layout/engine-obligations.mjs';
import {q, exact} from '../src/layout/linear.mjs';
import {rectangle, scalar, width, height, clip, diff} from '../src/layout/region.mjs';
import {PARENT} from '../src/layout/selectors.mjs';
import type {LayoutDiagnostic} from '../src/layout-contracts.d.ts';

const box = {label: '.box', path: 'Page/0', source: {start:1,end:4}, [PARENT]: {label: '.parent'}};
const region = (min:number,max:number) => rectangle({min:q(min),max:q(max)},{min:q(100),max:q(300)});

test('capacity obligations keep exact continuous-region witnesses and merge only contiguous 1-D findings', () => {
  const diagnostics:LayoutDiagnostic[]=[];
  const c=createObligationCollector<typeof box>({block:false,diagnostics});
  c.obligation(width, scalar(250), box, region(200,220),'E_LAYOUT_ITEM_SIZE','inline');
  c.obligation(width, scalar(250), box, region(220,300),'E_LAYOUT_ITEM_SIZE','inline');
  c.flush();
  assert.equal(c.checks.length,2);
  assert.equal(diagnostics.length,1);
  const d=diagnostics[0]!;
  assert.equal(d.range?.minExact,'200');
  assert.equal(d.range?.maxExact,'250');
  assert.equal(d.range?.maxInclusive,false);
  assert.equal(d.witness?.required,250);
  assert.ok(d.witness?.available !== undefined && d.witness.required !== undefined && d.witness.available < d.witness.required);
  assert.equal('signature' in d,false);
});

test('a waived overflow is recorded for integrity, not converted into a failure', () => {
  const diagnostics:LayoutDiagnostic[]=[];
  const c=createObligationCollector<typeof box>({block:true,diagnostics,scrollIntent:'css'});
  c.obligation(width,scalar(250),box,region(200,300),'E_LAYOUT_ITEM_SIZE','inline',false);
  assert.equal(c.checks[0]?.enforced,false);
  assert.equal(c.waived[0]?.self,false);
  assert.equal(c.waived[0]?.box,box);
  assert.ok(c.waived[0]?.region.constraints.some(h=>h.strict));
  c.obligation(width,scalar(250),box,region(200,300),'E_LAYOUT_CONTENT','inline',false);
  assert.equal(c.waived[1]?.self,true);
  assert.equal(c.scrolls({'overflow-x':'auto'},'x'),true);
  assert.equal(c.scrolls({'overflow-x':'clip'},'x'),false);
  c.flush();
  assert.equal(diagnostics.length,0);
});

test('table row growth is unknown; an exact fit is not growth', () => {
  const diagnostics:LayoutDiagnostic[]=[];
  const c=createObligationCollector<typeof box>({block:true,diagnostics});
  const r=region(200,300);
  c.cellGrows(height,height,box,r);
  assert.equal(diagnostics.length,0);
  c.cellGrows(height,scalar(200),box,r);
  assert.equal(diagnostics[0]?.code,'U_LAYOUT_TABLE');
  assert.equal(diagnostics[0]?.severity,'unknown');
  assert.equal(diagnostics[0]?.heightRange?.maxExact,'200');
  assert.equal(diagnostics[0]?.heightRange?.maxInclusive,false);
  assert.equal(c.checks.length,0);
});

test('2-D obligations retain correlated regions and clipped-parent context', () => {
  const diagnostics:LayoutDiagnostic[]=[];
  const c=createObligationCollector<typeof box>({block:true,diagnostics});
  const r=region(200,300);
  c.obligation(width,height,box,r,'E_LAYOUT_ABSOLUTE_CLIPPED','inline');
  c.flush();
  const d=diagnostics[0]!;
  assert.ok(d.region?.constraints.length);
  assert.match(d.message,/containing block \.parent/);
  assert.ok(d.witness?.available !== undefined && d.witness.required !== undefined && d.witness.required > d.witness.available);
  const failed=clip(r,diff(height,width),true);
  assert.ok(failed);
  assert.ok(failed.vertices.some(v=>exact(v.x)===exact(v.y)));
});
