// experiments/style-language: pins how today's veriss reads the proposed syntaxes (ADR-0014, ADR-0015). When a
// proposal is implemented, the expectation here changes with it (see experiments/style-language/README.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import postcss from '../packages/veriss/node_modules/postcss/lib/postcss.js';
import {analyzeHTML} from '../packages/veriss/src/html.mjs';

const dir = fileURLToPath(new URL('../experiments/style-language/', import.meta.url));
const read = name => readFileSync(dir + name, 'utf8');
const analyse = css => analyzeHTML('<html lang="en"><body><div class="card"><p class="title">t</p></div></body></html>',
  {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.card{inline-size:200px}.title{block-size:24px;flex-shrink:0;overflow:hidden}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 600}}, boxes: {'.title': {overflow: 'clip', overflowBlock: 'clip'}}});

test('the README lists every proposal file', () => {
  const readme = read('README.md');
  for (const file of readdirSync(dir).filter(f => f !== 'README.md')) assert.ok(readme.includes(`(${file})`), file);
});

test('A (a checked CSS profile) and B (contract at-rules) are plain CSS that a CSS parser reads', () => {
  for (const file of ['a-checked-profile.css', 'b-contract-at-rules.css']) assert.doesNotThrow(() => postcss.parse(read(file)), file);
  assert.deepEqual(postcss.parse(read('b-contract-at-rules.css')).nodes.filter(n => n.type === 'atrule').map(n => n.name), ['contract', 'assume', 'property']);
});

test('today: A is analysed as it is; B makes the analysis Unknown at @contract (not implemented)', () => {
  assert.equal(analyse(read('a-checked-profile.css')).status, 'verified');
  const b = analyse(read('b-contract-at-rules.css'));
  assert.equal(b.status, 'unknown');
  assert.ok(b.diagnostics.some(d => /Unsupported @contract/.test(d.message)), JSON.stringify(b.diagnostics.map(d => d.message)));
});
