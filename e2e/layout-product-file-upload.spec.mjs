// Offline UI file input: no Cloudflare Worker, no external collection endpoint.
import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
let site = '';
test.beforeAll(() => {
    site = mkdtempSync(join(tmpdir(), 'veriss-file-demo-'));
    execFileSync(process.execPath, ['tools/rule-catalog/build-page.mjs', site], { cwd: resolve('.'), timeout: 35000 });
});
test.afterAll(() => { if (site)
    rmSync(site, { force: true, recursive: true }); });
test('HTML and CSS files can be loaded and verified without a remote worker', async ({ page }) => {
    const requests = [];
    await page.route('**/*', route => {
        const u = new URL(route.request().url());
        requests.push(u.origin);
        if (u.origin !== 'https://file-demo.veriss.test')
            return route.abort();
        const filename = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
        try {
            const body = readFileSync(resolve(site, filename));
            return route.fulfill({ body, contentType: filename.endsWith('.js') ? 'text/javascript' : 'text/html' });
        }
        catch {
            return route.abort();
        }
    });
    await page.goto('https://file-demo.veriss.test/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#demo-status')).toContainText('VIOLATED');
    await page.locator('#demo-file-html').setInputFiles(resolve('tests/fixtures/veriss-cli/grid.html'));
    await page.locator('#demo-file-css').setInputFiles(resolve('tests/fixtures/veriss-cli/grid-broken.css'));
    await expect(page.locator('#demo-status')).toContainText('VIOLATED');
    await expect(page.locator('#demo-findings')).toContainText('E_LAYOUT_TRACKS');
    await page.locator('#demo-file-css').setInputFiles(resolve('tests/fixtures/veriss-cli/grid-fixed.css'));
    await expect(page.locator('#demo-status')).toContainText('VERIFIED');
    await expect(page.locator('#demo-files-feedback')).toContainText('ブラウザ内');
    expect(requests).not.toContain('https://veriss-url-source.kikutadev.workers.dev');
});
test('oversize local file is refused without erasing current content', async ({ page }) => {
    await page.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== 'https://file-demo.veriss.test')
            return route.abort();
        const filename = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
        try {
            return route.fulfill({ body: readFileSync(resolve(site, filename)), contentType: filename.endsWith('.js') ? 'text/javascript' : 'text/html' });
        }
        catch {
            return route.abort();
        }
    });
    await page.goto('https://file-demo.veriss.test/');
    const before = await page.locator('#demo-css').inputValue();
    await page.locator('#demo-file-css').setInputFiles({ name: 'huge.css', mimeType: 'text/css', buffer: Buffer.alloc(25001, 'a') });
    await expect(page.locator('#demo-files-feedback')).toContainText('25,000文字');
    expect(await page.locator('#demo-css').inputValue()).toBe(before);
});
test('imported source preview blocks external resources and scripts', async ({ page }) => {
    const external = [];
    await page.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== 'https://file-demo.veriss.test') {
            external.push(u.href);
            return route.abort();
        }
        const filename = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
        try {
            return route.fulfill({ body: readFileSync(resolve(site, filename)), contentType: filename.endsWith('.js') ? 'text/javascript' : 'text/html' });
        }
        catch {
            return route.abort();
        }
    });
    await page.goto('https://file-demo.veriss.test/', { waitUntil: 'domcontentloaded' });
    const html = '<!doctype html><html><head><script>fetch("https://exfiltration.veriss.test/script")</script></head><body><main><img src="https://exfiltration.veriss.test/image"><div class="card"></div></main></body></html>';
    const css = '@import url("https://exfiltration.veriss.test/style.css");main{display:grid;grid-template-columns:1fr}.card{width:20px;height:20px}';
    await page.locator('#demo-file-html').setInputFiles({ name: 'page.html', mimeType: 'text/html', buffer: Buffer.from(html) });
    await page.locator('#demo-file-css').setInputFiles({ name: 'page.css', mimeType: 'text/css', buffer: Buffer.from(css) });
    await expect(page.locator('#demo-files-feedback')).toContainText('ブラウザ内');
    await expect(page.locator('#demo-preview')).toHaveAttribute('srcdoc', /Content-Security-Policy/);
    await page.waitForTimeout(150);
    expect(external.filter(url => url.includes('exfiltration.veriss.test'))).toEqual([]);
});
