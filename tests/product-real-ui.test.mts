// Source provenance and verifier CLI contract for diverse real-world UI input.
// Browser observations are kept in e2e/layout-product-real-ui.spec.mts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const samples=['portfolio-about','duo-game-title','bootstrap-album'];
for(const name of samples){
 test(`offline source hash and status: ${name}`,async()=>{
  const dir=resolve('tests/fixtures/product-real-ui'),stem=resolve(dir,name);
  const [html,css,manifest]=await Promise.all([readFile(stem+'.html'),readFile(stem+'.css'),readFile(stem+'.source.json','utf8')]);
  const info:unknown=JSON.parse(manifest);
  assert.ok(info&&typeof info==='object'&&'htmlSha256' in info&&'cssSha256' in info);
  assert.deepEqual([createHash('sha256').update(html).digest('hex'),createHash('sha256').update(css).digest('hex')],
   [info.htmlSha256,info.cssSha256]);
  const result=spawnSync(process.execPath,['packages/veriss/bin/veriss.mjs','check','--html',stem+'.html','--css',stem+'.css','--min-width','320','--max-width','1280','--json'],{encoding:'utf8',timeout:25000});
  assert.equal(result.error,undefined);
  const report:unknown=JSON.parse(result.stdout);
  assert.ok(report&&typeof report==='object'&&'status' in report&&'counts' in report&&'diagnostics' in report);
  assert.ok(['verified','violated','unknown'].includes(String(report.status)));
  assert.equal(result.status,({verified:0,violated:1,unknown:2} as Record<string,number>)[String(report.status)]);
  assert.ok(Array.isArray(report.diagnostics));
  assert.ok(report.diagnostics.every((d:unknown)=>d!==null&&typeof d==='object'&&'code' in d&&'severity' in d));
 });
}
