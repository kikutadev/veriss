// Empirical browser snapshots of three actual UI sources; these points never
// imply universal viewport proof. All external requests are blocked.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const cases = [
    { name: 'portfolio-about', target: '.about-document' },
    { name: 'duo-game-title', target: '#game-shell' },
    { name: 'bootstrap-album', target: '.album .row' },
];
const points = [[320, 600], [390, 844], [768, 768], [1024, 768], [1280, 800]];
for (const sample of cases) {
    test(`real UI offline source: ${sample.name}`, async ({ page, browserName }) => {
        const root = resolve('tests/fixtures/product-real-ui');
        const [html, css] = await Promise.all([readFile(resolve(root, sample.name + '.html'), 'utf8'), readFile(resolve(root, sample.name + '.css'), 'utf8')]);
        const offline = html.replace('</head>', `<style>${css.replaceAll('</style', '<\\/style')}</style></head>`);
        // Fonts and images intentionally cannot reach the network; this is an offline
        // static-DOM comparison, not a claim about the live JS-rendered page.
        await page.route('**/*', route => route.abort());
        const seen = [];
        for (const [width, height] of points) {
            await page.setViewportSize({ width, height });
            await page.setContent(offline, { waitUntil: 'load' });
            const row = await page.evaluate(target => {
                const n = document.querySelector(target), r = n?.getBoundingClientRect();
                const cards = [...document.querySelectorAll('.album .row > .col')].slice(0, 3).map(n => n.getBoundingClientRect());
                return { docWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
                    target: !!r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
                    cards: cards.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width) })),
                    visible: !!r && r.width > 0 && r.height > 0 };
            }, sample.target);
            expect(row.visible, `${sample.name} ${browserName} ${width}px target exists`).toBe(true);
            expect(row.docWidth, `${sample.name} ${browserName} ${width}px horizontal page overflow`).toBeLessThanOrEqual(width);
            if (sample.name === 'duo-game-title') {
                expect(row.target?.width).toBeCloseTo(Math.min(width, 560), 0);
                expect(row.target?.x).toBeCloseTo((width - Math.min(width, 560)) / 2, 0);
            }
            if (sample.name === 'bootstrap-album') {
                expect(row.cards.length).toBe(3);
                if (width < 576)
                    expect(row.cards[0]?.y).toBeLessThan(row.cards[1]?.y ?? 0);
                else if (width >= 768) {
                    expect(row.cards[0]?.y).toEqual(row.cards[1]?.y);
                    expect(row.cards[1]?.y).toEqual(row.cards[2]?.y);
                }
            }
            seen.push({ width, height, ...row });
        }
        console.log('PHASE2_BROWSER ' + JSON.stringify({ source: sample.name, browser: browserName, observations: seen }));
    });
}
// Negative control from an actual game UI: a deliberately injected fixed-width
// regression is visibly clipped at mobile width. It is NOT an existing defect
// of the original game. A static UNKNOWN must not be marketed as passing.
test('real game CSS mutation clips shell, static Unknown does not mean safe', async ({ page, browserName }) => {
    const root = resolve('tests/fixtures/product-real-ui');
    const [html, css] = await Promise.all([
        readFile(resolve(root, 'duo-game-title.html'), 'utf8'),
        readFile(resolve(root, 'duo-game-title.css'), 'utf8')
    ]);
    const width = 390, height = 600;
    await page.setViewportSize({ width, height });
    await page.route('**/*', route => route.abort());
    await page.setContent(html.replace('</head>', `<style>${css}</style></head>`), { waitUntil: 'domcontentloaded' });
    const before = await page.locator('#game-shell').boundingBox();
    expect(before?.width).toBe(width);
    await page.addStyleTag({ content: '#game-shell{width:700px!important;max-width:none!important}' });
    const after = await page.locator('#game-shell').boundingBox();
    expect(after?.width).toBe(700);
    expect(after.x + after.width).toBeGreaterThan(width);
    console.log('PHASE2_MUTATION ' + JSON.stringify({ browser: browserName, width, height, normalWidth: before?.width, mutantWidth: after?.width, kind: 'injected-not-live-defect' }));
});
// Three-engine oracle for the same ordered cascade accepted by the core.
// No browser snapshot is promoted to a universal proof: the static engine
// must independently return a supported rectangle for the entire interval.
test('ordered shorthand refinements agree with browser cascade at three widths', async ({ page, browserName }) => {
    const { analyzeHTML } = await import('../packages/veriss/src/html.mjs');
    const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><main class="x"></main></body></html>';
    const reset = '*{box-sizing:border-box;margin:0;padding:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
    const cases = [
        { css: 'height:60px;border:0;border-top:2px solid black;border-bottom:3px solid black', top: 2, bottom: 3, paddingTop: 0, paddingLeft: 0, marginLeft: 0 },
        { css: 'height:60px;padding:0;padding-top:12px;padding-left:8px', top: 0, bottom: 0, paddingTop: 12, paddingLeft: 8, marginLeft: 0 },
        { css: 'height:60px;margin:0;margin-left:8px', top: 0, bottom: 0, paddingTop: 0, paddingLeft: 0, marginLeft: 8 },
        { css: 'height:60px;border:0;border-top:2px solid black;border-top-width:4px', top: 4, bottom: 0, paddingTop: 0, paddingLeft: 0, marginLeft: 0 },
        { css: 'height:60px;padding:0!important;padding-top:12px', top: 0, bottom: 0, paddingTop: 0, paddingLeft: 0, marginLeft: 0 },
    ];
    for (const sample of cases) {
        const css = reset + '.x{' + sample.css + '}';
        const proof = analyzeHTML(html, { name: 'P', css, viewport: { min: 320, max: 1280, height: { min: 400, max: 900 } } });
        expect(proof.status, `${sample.css}: ${JSON.stringify(proof.diagnostics)}`).toBe('verified');
        const rect = proof.sizes.find(s => s.box === '.x')?.rect;
        expect(rect).toBeTruthy();
        for (const width of [320, 768, 1280]) {
            await page.setViewportSize({ width, height: 700 });
            await page.setContent(html.replace('</head>', `<style>${css}</style></head>`));
            const actual = await page.locator('.x').evaluate(el => {
                const r = el.getBoundingClientRect(), s = getComputedStyle(el);
                return { x: r.x, y: r.y, width: r.width, height: r.height, top: parseFloat(s.borderTopWidth), bottom: parseFloat(s.borderBottomWidth), paddingTop: parseFloat(s.paddingTop), paddingLeft: parseFloat(s.paddingLeft), marginLeft: parseFloat(s.marginLeft) };
            });
            expect(actual.top).toBe(sample.top);
            expect(actual.bottom).toBe(sample.bottom);
            expect(actual.paddingTop).toBe(sample.paddingTop);
            expect(actual.paddingLeft).toBe(sample.paddingLeft);
            expect(actual.marginLeft).toBe(sample.marginLeft);
            for (const [field, model] of [['x', rect.inlineStart], ['y', rect.blockStart], ['width', rect.inlineSize], ['height', rect.blockSize]]) {
                const expected = Number(model.coefficient) * width + Number(model.constant);
                expect(actual[field], `${browserName} ${width}px ${sample.css} ${field}`).toBeCloseTo(expected, 3);
            }
        }
    }
});
// Bootstrap's universal pseudo-element box-sizing reset does not create any
// ::before / ::after content. It should not produce dozens of noise warnings.
test('bootstrap universal pseudo reset is not treated as attempted generated content', async ({ page }) => {
    const { analyzeHTML } = await import('../packages/veriss/src/html.mjs');
    const root = resolve('tests/fixtures/product-real-ui');
    const [html, css] = await Promise.all([readFile(resolve(root, 'bootstrap-album.html'), 'utf8'), readFile(resolve(root, 'bootstrap-album.css'), 'utf8')]);
    const report = analyzeHTML(html, { name: 'Bootstrap', css, viewport: { min: 390, max: 390, height: { min: 844, max: 844 } } });
    expect(report.diagnostics.filter(d => d.code === 'W_CSS_PSEUDO_NO_CONTENT')).toHaveLength(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/*', route => route.abort());
    await page.setContent(html.replace('</head>', `<style>${css}</style></head>`), { waitUntil: 'load' });
    const contents = await page.locator('.album').evaluate(el => [getComputedStyle(el, '::before').content, getComputedStyle(el, '::after').content]);
    expect(contents).toEqual(['none', 'none']);
});
// Pin the third-party CSS loaded by the game's @import; do not silently
// delete the import. This is a fixed snapshot, not a promise about future
// Google Fonts responses or arbitrary network dependencies.
test('pinned game CSS closure proves horizontal fit and detects injected overwidth', async ({ page, browserName }) => {
    const { gunzipSync } = await import('node:zlib');
    const { createHash } = await import('node:crypto');
    const { createRequire } = await import('node:module');
    const { domGeometry, verifyUI } = await import('../packages/adapter-core/src/ui-contracts.mjs');
    const { evaluateAffine } = await import('./support/geometry.mjs');
    const require = createRequire(new URL('../packages/veriss/package.json', import.meta.url));
    const postcss = require('postcss');
    const base = resolve('tests/fixtures/product-real-ui');
    const [html, css, packed, metaText] = await Promise.all([
        readFile(resolve(base, 'duo-game-title.html'), 'utf8'),
        readFile(resolve(base, 'duo-game-title.css'), 'utf8'),
        readFile(resolve(base, 'duo-game-title-fonts.css.gz')),
        readFile(resolve(base, 'duo-game-title-fonts.source.json'), 'utf8')
    ]);
    const meta = JSON.parse(metaText);
    const sha = (b) => createHash('sha256').update(b).digest('hex');
    expect(sha(packed)).toBe(meta.compressedSha256);
    const imported = gunzipSync(packed);
    expect(sha(imported)).toBe(meta.rawSha256);
    const importedRules = postcss.parse(imported.toString('utf8')).nodes.filter(n => n.type !== 'comment');
    expect(importedRules.length).toBeGreaterThan(0);
    expect(importedRules.every(n => n.type === 'atrule' && n.name === 'font-face')).toBe(true);
    const parsed = postcss.parse(css);
    const importNodes = parsed.nodes.filter(n => n.type === 'atrule' && n.name === 'import');
    expect(importNodes).toHaveLength(1);
    expect(importNodes[0].params).toBe(`url('${meta.source}')`);
    importNodes[0].replaceWith(...importedRules);
    const closedCSS = parsed.toString();
    const mutation = '#game-shell{width:700px!important;max-width:none!important}';
    const profile = { id: 'DUO-pinned', ua: browserName, viewport: { min: 320, max: 1280, height: { min: 600, max: 900 } } };
    const baseInput = { state: 'title', profile, html, css: closedCSS, targets: ['game-shell'] };
    const original = domGeometry({ ...baseInput, css })[0];
    expect(original.rows?.length ?? 0, 'unresolved live @import must remain Unknown').toBe(0);
    const good = domGeometry(baseInput)[0], bad = domGeometry({ ...baseInput, css: closedCSS + mutation })[0];
    for (const e of [good, bad]) {
        expect(e.axes, JSON.stringify(e.reason)).toEqual(['inline']);
        expect(e.rows?.length ?? 0, JSON.stringify(e.reason)).toBeGreaterThan(0);
    }
    const model = { version: 1, initial: 'title', states: ['title'], transitions: [], profiles: [profile], contracts: [
            { id: 'horizontal-fit', kind: 'predicate', predicate: { op: 'compare', relation: 'le', left: { target: 'game-shell', field: 'inlineEnd' }, right: { environment: 'safeRight' } } }
        ] };
    expect(verifyUI({ model, evidence: [good] }).status).toBe('verified');
    expect(verifyUI({ model, evidence: [bad] }).status).toBe('violated');
    await page.route('**/*', route => route.abort());
    await page.setContent(html.replace('</head>', `<style>${closedCSS}</style></head>`), { waitUntil: 'domcontentloaded' });
    const assertRows = async (e, width, height) => {
        const actual = await page.locator('#game-shell').evaluate(el => { const r = el.getBoundingClientRect(); return [r.x, r.width]; });
        const rows = (e.rows ?? []).filter(r => (r.constraints ?? []).every(c => c.strict ? evaluateAffine(c, width, height) > 0 : evaluateAffine(c, width, height) >= 0));
        expect(rows.length, `${browserName}: ${width}×${height} no matching proof region`).toBeGreaterThan(0);
        for (const r of rows) {
            expect(actual[0], `${browserName}: ${width}px inline start`).toBeCloseTo(evaluateAffine(r.rect.inlineStart, width, height), 1);
            expect(actual[1], `${browserName}: ${width}px inline size`).toBeCloseTo(evaluateAffine(r.rect.inlineSize, width, height), 1);
        }
        return actual;
    };
    for (const width of [320, 390, 559, 560, 561, 768, 1280])
        for (const height of [600, 900]) {
            await page.setViewportSize({ width, height });
            await assertRows(good, width, height);
        }
    await page.addStyleTag({ content: mutation });
    for (const width of [320, 390, 700, 701, 768, 1280])
        for (const height of [600, 900]) {
            await page.setViewportSize({ width, height });
            const [x = NaN, w = NaN] = await assertRows(bad, width, height);
            expect(w).toBe(700);
            expect(x + w > width, width <= 700 ? `expected a clipped shell at ${width}px` : undefined).toBe(width < 700);
        }
});
