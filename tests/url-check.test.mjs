import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { publicUrl, collectPage, ScanError } from '../tools/url-check/worker.mjs';
const page = 'https://example.com/docs/';
function stub(records) {
    return (async (input) => {
        const url = String(input);
        const record = records[url];
        assert.ok(record, 'unexpected fetch: ' + url);
        return new Response(record.body ?? '', { status: record.status ?? 200, headers: {
                'Content-Type': record.type ?? 'text/html', ...(record.location ? { Location: record.location } : {}),
            } });
    });
}
test('public URL validation rejects local/private-targeting syntax and credentials', () => {
    for (const value of [
        'file:///etc/passwd', 'http://localhost', 'http://127.0.0.1', 'http://10.0.0.2/',
        'http://[::1]/', 'http://foo.local', 'https://host.internal',
        'http://example.com:8080', 'https://admin:pass@example.com',
        'ftp://example.com/file', 'https://example.com.evil@127.0.0.1/',
    ])
        assert.throws(() => publicUrl(value), ScanError, value);
    assert.equal(publicUrl('https://example.com/a#x').toString(), 'https://example.com/a');
});
test('static URL harvest follows same-validated redirect and retains CSS order and media', async () => {
    const fetched = stub({
        'https://example.com/start': { status: 302, location: '/docs/' },
        [page]: { body: '<!doctype html><html><head><base href="/assets/"><link rel="stylesheet" href="base.css"><style>.title{color:red}</style></head><body><main class="title"><div class="tile"></div></main></body></html>' },
        'https://example.com/assets/base.css': { body: '.tile{width:40px}', type: 'text/css' },
    });
    const report = await collectPage('https://example.com/start', fetched);
    assert.equal(report.sourceUrl, page);
    assert.equal(report.coverage, 'static');
    assert.match(report.html, /main class="title"/);
    assert.ok(report.css.indexOf('.tile{width:40px}') < report.css.indexOf('.title{color:red}'));
    assert.equal(report.stylesheets.length, 1);
});
test('JavaScript and unfetched imports stay partial, even when CSS was collected', async () => {
    const fetched = stub({
        [page]: { body: '<!doctype html><html><head><style>@import "other.css";.a{width:30px}</style><script type="module" src="/app.js"></script></head><body><main class="a"></main></body></html>' },
    });
    const report = await collectPage(page, fetched);
    assert.equal(report.coverage, 'partial');
    assert.ok(report.notes.some(n => n.includes('JavaScript')));
    assert.ok(report.notes.some(n => n.includes('@import')));
    assert.doesNotMatch(report.html, /<script/);
});
test('redirect to local address is rejected, including from CSS', async () => {
    const fetched = stub({
        [page]: { body: '<link rel="stylesheet" href="/redirect.css"><main>Text</main>' },
        'https://example.com/redirect.css': { status: 302, location: 'http://127.0.0.1/private', type: 'text/css' },
    });
    const report = await collectPage(page, fetched);
    assert.equal(report.coverage, 'partial');
    assert.ok(report.notes.some(n => n.includes('CSSの取得に失敗')));
});
test('API handler validates request and CORS without sharing credentials', async () => {
    const invalid = await handler.fetch(new Request('https://api.example.com/scan?url=' + encodeURIComponent('http://127.0.0.1/admin'), {
        headers: { Origin: 'https://kikutadev.github.io' },
    }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get('access-control-allow-origin'), 'https://kikutadev.github.io');
    const denied = await handler.fetch(new Request('https://api.example.com/scan?url=' + encodeURIComponent('http://127.0.0.1'), {
        headers: { Origin: 'https://other.example' },
    }));
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
test('oversized HTML is an explicit failure, not silently truncated', async () => {
    const fetched = stub({ [page]: { body: '<html><body><main>' + ('X'.repeat(240_001)) + '</main></body></html>' } });
    await assert.rejects(() => collectPage(page, fetched), (err) => err instanceof ScanError && err.httpStatus === 413);
});
