import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=(file:string)=>join(root,'tests','fixtures','veriss-cli',file);
const bin=join(root,'packages','veriss','bin','veriss.mjs');
const run=(argv:string[])=>spawnSync(process.execPath,[bin,...argv],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2_000_000});
const check=(html:string,css:string,other:string[]=[])=>run(['check','--html',fixture(html),'--css',fixture(css),'--json',...other]);

test('CLI: broken fixed tracks report geometric witness and machine-readable violation',()=>{
  const r=check('grid.html','grid-broken.css');
  assert.equal(r.status,1,r.stderr);
  const result=JSON.parse(r.stdout);
  assert.equal(result.status,'violated');
  assert.equal(result.modelStatus,'violated');
  assert.equal(result.proofStatus,'violated');
  assert.ok(result.counts.error>0);
  assert.ok(result.diagnostics.some((d:{code:string;witness?:{viewport:number}})=>d.code==='E_LAYOUT_TRACKS'&&d.witness?.viewport));
  assert.ok(result.proofWitness?.viewport);
});
test('CLI: corrected responsive tracks pass static and independent solver checks',()=>{
  const r=check('grid.html','grid-fixed.css');
  assert.equal(r.status,0,r.stderr);
  const result=JSON.parse(r.stdout);
  assert.equal(result.status,'verified');
  assert.equal(result.proofStatus,'verified');
  assert.deepEqual(result.counts,{error:0,warning:0,unknown:0});
});
test('CLI: unmodeled CSS is Unknown, never success',()=>{
  const r=check('unknown.html','unknown.css');
  assert.equal(r.status,2,r.stderr);
  const result=JSON.parse(r.stdout);
  assert.equal(result.status,'unknown');
  assert.ok(result.counts.unknown>=1);
  assert.ok(result.diagnostics.some((d:{code:string})=>d.code==='U_LAYOUT_SELECTOR'));
});
test('CLI: usage errors and unreadable files use distinct error status',()=>{
  assert.equal(run(['check','--html',fixture('grid.html'),'--css',fixture('grid-fixed.css'),'--min-width','800','--max-width','320']).status,3);
  const r=check('grid.html','does-not-exist.css');
  assert.equal(r.status,3);
  assert.equal(JSON.parse(r.stdout).status,'error');
  assert.equal(run(['--help']).status,0);
});
