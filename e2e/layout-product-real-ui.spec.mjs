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
