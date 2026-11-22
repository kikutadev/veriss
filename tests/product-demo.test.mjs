import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run } from '../tools/rule-catalog/run.mjs';
import { examples, sides } from '../tools/rule-catalog/examples.mjs';
test('first-screen experience finds an exact counterexample and clears it on repair', () => {
    const fixture = examples.find(x => x.id === 'overflow');
    assert.ok(fixture);
    const [bad, good] = sides(fixture);
    assert.ok(bad && good);
    const broken = run(bad), fixed = run(good);
    assert.equal(broken.status, 'violated');
    const error = broken.findings.find(d => d.code === 'E_LAYOUT_TRACKS');
    assert.ok(error?.witness?.viewport && error?.range);
    assert.ok(error.witness.viewport >= 375 && error.witness.viewport < 512);
    assert.equal(error.range.maxInclusive, false);
    assert.equal(fixed.status, 'verified');
    assert.equal(fixed.findings.filter(x => x.code.startsWith('E_')).length, 0);
});
test('unsupported styling remains Unknown in both the demo and engine', () => {
    const ex = examples.find(x => x.id === 'unknown');
    assert.ok(ex);
    const [bad, good] = sides(ex);
    assert.ok(bad && good);
    assert.equal(run(bad).status, 'unknown');
    assert.ok(run(bad).findings.some(x => x.code.startsWith('U_')));
    assert.equal(run(good).status, 'verified');
});
test('public demo has no HTML/CSS file picker or URL collector', () => {
    const html = readFileSync(new URL('../tools/rule-catalog/page-template.html', import.meta.url), 'utf8');
    const client = readFileSync(new URL('../tools/rule-catalog/demo.mts', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /type=["']file["']|demo-file-html|demo-file-css/);
    assert.doesNotMatch(client, /demo-file-html|demo-file-css|importFile\(/);
    assert.match(html, /id="demo-html"/);
    assert.match(html, /id="demo-css"/);
});
test('the public real-UI evidence distinguishes authenticated browser observations from static proof', () => {
    const html = readFileSync(new URL('../tools/rule-catalog/page-template.html', import.meta.url), 'utf8');
    assert.match(html, /ログイン後の管理画面/);
    assert.match(html, /react-admin-rbac/);
    assert.match(html, /react-admin-demo/);
    assert.match(html, /320px幅.*334px/);
    assert.match(html, /3ブラウザ/);
    assert.match(html, /ブラウザ観測.*静的証明ではない/);
    assert.match(html, /Bootstrap公式サンプル/);
    assert.match(html, /共通observerを組み込み/);
});
