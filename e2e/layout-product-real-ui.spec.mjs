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
