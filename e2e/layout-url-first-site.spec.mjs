// End-to-end tests for the URL-first product entry, with a deterministic public API fixture.
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const build = fileURLToPath(new URL('../tools/rule-catalog/build-page.mjs', import.meta.url));
let out = '', server, base = '';
test.beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'veriss-url-e2e-'));
    execFileSync(process.execPath, [build, out], { stdio: 'pipe' });
    server = createServer((req, res) => {
        const route = new URL(req.url ?? '/', base || 'http://127.0.0.1').pathname;
        const file = resolve(out, '.' + (route === '/' ? '/index.html' : route));
        if (!file.startsWith(out + sep)) {
            res.writeHead(403).end();
            return;
        }
        try {
            const bytes = readFileSync(file);
            const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html';
            res.writeHead(200, { 'Content-Type': mime });
            res.end(bytes);
        }
        catch {
            res.writeHead(404).end();
        }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string')
        throw Error('server did not open');
    base = 'http://127.0.0.1:' + address.port;
});
test.afterAll(async () => {
    if (server)
        await new Promise(done => server.close(() => done()));
    if (out)
        rmSync(out, { recursive: true, force: true });
});
const html = '<html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main class="grid"><div class="c"></div><div class="c"></div><div class="c"></div></main></body></html>';
const broken = '*{box-sizing:border-box;margin:0;padding:0}.grid{display:grid;grid-template-columns:repeat(3,160px);gap:8px;padding:8px}.c{height:60px}';
const fixed = broken.replace('repeat(3,160px)', 'repeat(3,minmax(0,1fr))');
async function mocked(page, body, status = 200) {
    await page.route('https://veriss-url-source.kikutadev.workers.dev/scan?**', async (route) => {
        await route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    });
}
test('URL first: fetched broken Grid is detected and inline correction clears it', async ({ page }) => {
    await mocked(page, { sourceUrl: 'https://example.com/grid', html, css: broken, coverage: 'static', notes: [], stylesheets: [{ url: 'https://example.com/site.css', bytes: broken.length }] });
    await page.goto(base);
    await expect(page.locator('#demo-status')).toContainText('VIOLATED');
    await page.locator('#site-url').fill('https://example.com/grid');
    await page.locator('#site-scan').click();
    await expect(page.locator('#site-status')).toContainText('取得したHTML/CSSを検査しました', { timeout: 25000 });
    await expect(page.locator('#demo-status')).toContainText('VIOLATED');
    await expect(page.locator('#demo-findings')).toContainText('E_LAYOUT_TRACKS');
    await expect(page.locator('#demo-findings')).not.toContainText('U_SOURCE_COVERAGE');
    expect(await page.locator('#demo-case').inputValue()).toBe('remote');
    await page.locator('#demo-css').fill(fixed);
    await expect(page.locator('#demo-status')).toContainText('未検査');
    await page.locator('#demo-run').click();
    await expect(page.locator('#demo-status')).toContainText('VERIFIED', { timeout: 25000 });
});
test('URL first: JavaScript-uncovered page is never displayed as verified', async ({ page }) => {
    await mocked(page, { sourceUrl: 'https://example.com/app', html, css: fixed, coverage: 'partial',
        notes: ['JavaScriptの実行後に生成されるDOMとCSSは取得していません'], stylesheets: [] });
    await page.goto(base);
    await page.locator('#site-url').fill('https://example.com/app');
    await page.locator('#site-scan').click();
    await expect(page.locator('#site-status')).toContainText('取得したHTML/CSSを検査しました', { timeout: 25000 });
    await expect(page.locator('#demo-status')).toContainText('UNKNOWN');
    await expect(page.locator('#demo-findings')).toContainText('U_SOURCE_COVERAGE');
    await expect(page.locator('#demo-findings')).toContainText('JavaScriptの実行後');
});
test('URL first: HTTP rejection is shown without changing the sample result', async ({ page }) => {
    await mocked(page, { error: '公開されたHTTP(S)のホスト名と標準ポートのみ対応しています' }, 400);
    await page.goto(base);
    await page.locator('#site-url').fill('http://127.0.0.1/');
    await page.locator('#site-scan').click();
    await expect(page.locator('#site-status')).toContainText('標準ポートのみ対応', { timeout: 25000 });
    await expect(page.locator('#demo-status')).toContainText('VIOLATED');
    expect(await page.locator('#demo-case').inputValue()).toBe('overflow');
});
test('URL first: fetched but unsupported oversized tree displays analysis failure, not false success', async ({ page }) => {
    const tooManyChildren = '<html lang="ja"><body><main>' + ('<div></div>'.repeat(2100)) + '</main></body></html>';
    await mocked(page, { sourceUrl: 'https://example.com/large', html: tooManyChildren, css: fixed, coverage: 'static', notes: [], stylesheets: [] });
    await page.goto(base);
    await page.locator('#site-url').fill('https://example.com/large');
    await page.locator('#site-scan').click();
    await expect(page.locator('#site-status')).toContainText('ソースは取得しましたが解析できませんでした', { timeout: 25000 });
    await expect(page.locator('#demo-status')).toContainText('解析できません');
    await expect(page.locator('#demo-findings')).toContainText('HTML box tree limit exceeded');
});
test('URL entry remains usable at a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await expect(page.locator('#site-url')).toBeVisible();
    await expect(page.locator('#site-scan')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
