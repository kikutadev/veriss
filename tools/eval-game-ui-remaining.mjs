import { webkit } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyUI } from '../packages/adapter-core/src/ui-contracts.mjs';
const games = {
    'sumi-no-tachi': {
        sheets: { 'style.css': '587e107c13c3ce131de55a186933b8983dcace20aa55e9cea27f5bb7485d6967', 'ink-ui.css': 'a5c4636ff576e95054932d4f435bd5cbf447526f97c172d6b520f1e29ae7d0d2' },
        states: ['title', 'play', 'paused'], events: [['title', 'start', 'play'], ['play', 'pause', 'paused'], ['paused', 'resume', 'play']],
        selectors: { game: '#game', scene: '#view', impact: '#inkImpact', pad: '#pad', actions: '.action-buttons', slash: '#slash', dodge: '#dodge', iai: '#iai', pause: '#pause' },
        points: [[320, 568], [340, 460], [341, 461], [390, 844], [422, 700], [423, 700], [500, 700], [501, 700], [844, 390], [1920, 1080]]
    },
    rpgsim: {
        sheets: { 'assets/progress-DBhEhTru.css': 'c808f46d8e8745e5d6ab2917b6f75978a18e8e0f834d46552b4204e0c8afc570' },
        states: ['planning', 'running', 'paused'], events: [['planning', 'start', 'running'], ['running', 'pause', 'paused'], ['paused', 'resume', 'running']],
        selectors: { shell: '.game-shell', toolbar: '.toolbar', stage: '.story-stage', scene: '.world-canvas', pause: '[data-action=pause]', skip: '[data-action=skip]' },
        points: [[320, 568], [365, 700], [366, 701], [390, 844], [520, 700], [521, 701], [844, 390], [1920, 1080]]
    }
};
const game = process.argv[2];
if (game !== 'sumi-no-tachi' && game !== 'rpgsim')
    throw Error('usage: eval-game-ui-remaining.mjs sumi-no-tachi|rpgsim [dist]');
const cfg = games[game];
const dir = resolve(process.argv[3] ?? '../game/' + game + '/dist');
for (const [file, hash] of Object.entries(cfg.sheets)) {
    if (createHash('sha256').update(readFileSync(resolve(dir, file))).digest('hex') !== hash)
        throw Error('Unreviewed CSS build: ' + file + '; re-establish local model assumptions');
}
const profile = { id: 'webkit-overlay', ua: 'webkit', viewport: { min: 320, max: 1920, height: { min: 320, max: 1080 } }, dpr: 1 };
const aff = (b = 0, w = 0, h = 0) => ({ constant: String(b), coefficient: String(w), heightCoefficient: String(h) });
const rect = (x, y, w, h) => ({ inlineStart: x, blockStart: y, inlineSize: w, blockSize: h });
const row = (rect, constraints = []) => ({ rect, constraints });
const atMost = (n, axis = 'w') => ({ ...aff(n, axis === 'w' ? -1 : 0, axis === 'h' ? -1 : 0), strict: false });
const above = (n, axis = 'w') => ({ ...aff(-n, axis === 'w' ? 1 : 0, axis === 'h' ? 1 : 0), strict: true });
const evidence = [], observations = [];
function add(target, state, rows, assumptions, source = 'local-dom') {
    evidence.push({ target, state, profile: profile.id, source, rows, assumptions });
}
const contracts = [];
const viewportRect = rect(aff(), aff(), aff(0, 1), aff(0, 0, 1));
if (game === 'sumi-no-tachi') {
    const assumption = ['Reviewed CSS build: game is a margin-free viewport-width relative box, height 100dvh equals profile height; view is its first applicable static-position absolute canvas and has width/height 100%; inkImpact is inset:0. No external CSS, scrolling, review mode, or size-altering inline overrides; CSS pixels only.'];
    for (const state of cfg.states)
        for (const t of ['game', 'scene', 'impact'])
            add(t, state, [row(viewportRect)], assumption, t === 'game' ? 'local-dom' : 'scene');
    for (const t of ['scene', 'impact'])
        contracts.push({ id: t + '-in-game', kind: 'contains', target: 'game', other: t });
    contracts.push({ id: 'canvas-stable-on-pause', kind: 'stable', target: 'scene', event: 'pause' });
    // Each cell reflects the original cascade order. The pad width clamp has a
    // fractional boundary 35% * W = 148 at W = 2960/7.
    const ins = [{ c: [atMost(340)], n: 12, group: [137, 128, 82, 56, 56, 5] },
        { c: [above(340), atMost(500)], n: 18, group: [155, 135, 90, 64, 60, 5] },
        { c: [above(500)], n: 18, group: [173, 153, 104, 70, 66, 12] }];
    const table = { pad: [], actions: [], slash: [], dodge: [], iai: [] };
    for (const { c, n, group } of ins) {
        const portrait = [
            { c: [above(460, 'h'), { ...aff('2960/7', -1), strict: false }], p: 'fluid' },
            { c: [above(460, 'h'), { ...aff('-2960/7', 1), strict: true }], p: 'capped' }
        ];
        for (const p of [{ c: [atMost(460, 'h')], p: 'short' }, ...portrait]) {
            const short = p.p === 'short', fluid = p.p === 'fluid', pad = short ? 112 : 148;
            const [gw, gh, sw, dw, iw, ir] = short ? [150, 112, 80, 58, 54, 0] : group;
            const cs = [...c, ...p.c];
            const padSize = fluid ? aff(0, '7/20') : aff(pad);
            table.pad.push(row(rect(aff(n), fluid ? aff(-28, '-7/20', 1) : aff(-28 - pad, 0, 1), padSize, padSize), cs));
            table.actions.push(row(rect(aff(-n - gw, 1), aff(-28 - gh, 0, 1), aff(gw), aff(gh)), cs));
            table.slash.push(row(rect(aff(-n - sw, 1), aff(-28 - sw, 0, 1), aff(sw), aff(sw)), cs));
            table.dodge.push(row(rect(aff(-n - gw, 1), aff(-28 - (short ? 0 : 5) - dw, 0, 1), aff(dw), aff(dw)), cs));
            table.iai.push(row(rect(aff(-n - ir - iw, 1), aff(-28 - gh - (short ? 10 : 0), 0, 1), aff(iw), aff(iw)), cs));
        }
    }
    const controlAssumption = ['Reviewed CSS: play-only controls are an absolute flex row with bottom 28px, left/right 12px at width <=340, otherwise 18px, zero safe-area insets; flex children fit without shrink. Pad square width clamp(112px,35vw,148px), overridden by 112px at height <=460. Action group and squares use the CSS pixel sizes and insets in the inspected stylesheet. Normal idle (not review or forced colors); decorations/pseudo-elements do not affect border rectangles.'];
    for (const [t, rows] of Object.entries(table))
        add(t, 'play', rows, controlAssumption);
    for (const t of ['pad', 'slash', 'dodge', 'iai']) {
        contracts.push({ id: t + '-viewport', kind: 'within-viewport', target: t, states: ['play'] });
        contracts.push({ id: t + '-min44', kind: 'min-size', target: t, states: ['play'], width: 44, height: 44 });
    }
    contracts.push({ id: 'movement-action-separation', kind: 'disjoint', target: 'pad', other: 'actions', states: ['play'] });
    contracts.push({ id: 'slash-iai-rectangles', kind: 'disjoint', target: 'slash', other: 'iai', states: ['play'] });
    contracts.push({ id: 'hud-budget-experiment', kind: 'max-occupancy', target: 'scene', overlays: ['pad', 'slash', 'dodge', 'iai'], max: '1/3', states: ['play'] });
}
else {
    const assumption = ['Reviewed CSS: game-shell border-box width min(100%,520px) with auto horizontal margins, 100dvh equals profile height, 2px inline borders, zero safe-area insets. In initial adventure the toolbar is fixed at 42px when height <=700 otherwise 44px, the direct story-stage flex:1 fills the remaining content area (no other in-flow siblings); world-canvas is block width/height 100%. No external CSS changes these dimensions, no scrollbar gutters.'];
    const sizes = [{ cs: [atMost(520)], x: aff(), w: aff(0, 1), innerX: aff(2), innerW: aff(-4, 1) }, { cs: [above(520)], x: aff(-260, '1/2'), w: aff(520), innerX: aff(-258, '1/2'), innerW: aff(516) }];
    for (const state of cfg.states) {
        add('shell', state, sizes.map(s => row(rect(s.x, aff(), s.w, aff(0, 0, 1)), s.cs)), assumption);
        const rows = sizes.flatMap(s => [42, 44].map(h => ({ s, h, cs: [...s.cs, h === 42 ? atMost(700, 'h') : above(700, 'h')] })));
        add('toolbar', state, rows.map(({ s, h, cs }) => row(rect(s.innerX, aff(), s.innerW, aff(h)), cs)), assumption);
        if (state !== 'planning')
            for (const t of ['stage', 'scene'])
                add(t, state, rows.map(({ s, h, cs }) => row(rect(s.innerX, aff(h), s.innerW, aff(-h, 0, 1)), cs)), assumption, t === 'scene' ? 'scene' : 'local-dom');
    }
    contracts.push({ id: 'shell-viewport', kind: 'within-viewport', target: 'shell' });
    contracts.push({ id: 'toolbar-in-shell', kind: 'contains', target: 'shell', other: 'toolbar' });
    contracts.push({ id: 'canvas-in-stage', kind: 'contains', target: 'stage', other: 'scene', states: ['running', 'paused'] });
    contracts.push({ id: 'toolbar-stage-separate', kind: 'disjoint', target: 'toolbar', other: 'stage', states: ['running', 'paused'] });
    contracts.push({ id: 'canvas-stable-on-pause', kind: 'stable', target: 'scene', event: 'pause' });
    // Buttons are text/UA-size dependent and are intentionally not abstracted.
    contracts.push({ id: 'pause-skip-separate', kind: 'disjoint', target: 'pause', other: 'skip', states: ['running', 'paused'] });
    contracts.push({ id: 'pause-min44-experiment', kind: 'min-size', target: 'pause', width: 44, height: 44, states: ['running', 'paused'] });
}
for (const [, event] of cfg.events)
    contracts.push({ id: event + '-action', kind: 'action', event });
const model = { version: 1, initial: cfg.states[0], states: cfg.states, transitions: cfg.events.map(([from, event, to]) => ({ from, event, to })), profiles: [profile], contracts };
const browser = await webkit.launch({ headless: true, timeout: 10000 });
const issues = [];
try {
    for (const [width, height] of cfg.points) {
        const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block' });
        try {
            const page = await ctx.newPage();
            await page.route('**/*', async (r) => {
                const u = new URL(r.request().url()), f = resolve(dir, '.' + decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
                return u.origin === 'https://game.test' && f.startsWith(dir + '/') && existsSync(f) ? r.fulfill({ path: f }) : r.abort();
            });
            await page.goto('https://game.test/', { waitUntil: 'domcontentloaded', timeout: 10000 });
            const stylesheetOrder = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet], style')].map(n => { if (n instanceof HTMLStyleElement)
                return 'inline'; if (n instanceof HTMLLinkElement)
                return new URL(n.href).pathname.replace(/^\//, ''); throw Error('Unexpected stylesheet element'); }));
            if (JSON.stringify(stylesheetOrder) !== JSON.stringify(Object.keys(cfg.sheets)))
                throw Error('Unreviewed stylesheet order: ' + JSON.stringify(stylesheetOrder));
            const stateWait = async (state) => {
                if (game === 'sumi-no-tachi')
                    await page.locator('#game[data-mode=' + state + ']:not(.booting)').waitFor({ timeout: 25000 });
                else if (state === 'planning')
                    await page.getByRole('button', { name: '冒険に出る', exact: false }).waitFor({ timeout: 10000 });
                else
                    await page.locator('[data-action=pause][aria-label="' + (state === 'paused' ? '再生' : '一時停止') + '"]').waitFor({ timeout: 10000 });
            };
            const capture = async (state) => {
                const rects = await page.evaluate(selectors => Object.fromEntries(Object.entries(selectors).flatMap(([id, sel]) => {
                    const nodes = document.querySelectorAll(sel);
                    const node = nodes[0];
                    if (nodes.length !== 1 || !node || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden')
                        return [];
                    const r = node.getBoundingClientRect();
                    return [[id, { x: Number(r.x.toFixed(6)), y: Number(r.y.toFixed(6)), width: Number(r.width.toFixed(6)), height: Number(r.height.toFixed(6)) }]];
                })), cfg.selectors);
                observations.push({ state, profile: profile.id, width, height, rects });
            };
            await stateWait(cfg.states[0]);
            await capture(cfg.states[0]);
            for (const [state, event, to] of cfg.events) {
                let passed = false;
                try {
                    const selector = game === 'sumi-no-tachi' ? (event === 'pause' ? '#pause' : '#start') : '[data-action=pause]';
                    const el = game === 'rpgsim' && event === 'start' ? page.getByRole('button', { name: '冒険に出る', exact: false }) : page.locator(selector);
                    await el.click({ timeout: 5000 });
                    await stateWait(to);
                    passed = true;
                }
                catch (e) {
                    issues.push({ width, height, event, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
                }
                observations.push({ state, profile: profile.id, width, height, event, ...(passed ? { to } : {}), passed });
                if (!passed)
                    break;
                // One observation per state and viewport; the repeated resume is an action only.
                if (event !== 'resume')
                    await capture(to);
            }
        }
        catch (e) {
            issues.push({ width, height, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
        }
        finally {
            await ctx.close();
        }
    }
}
finally {
    await browser.close();
}
const number = (v) => { const [n, d = '1'] = String(v ?? '0').split('/'); return Number(n) / Number(d); };
const evalAt = (a, o) => number(a.constant) + number(a.coefficient) * o.width + number(a.heightCoefficient) * o.height;
let compared = 0;
const mismatches = [];
for (const o of observations.filter(o => o.rects)) {
    for (const e of evidence.filter(e => e.state === o.state)) {
        const rows = e.rows.filter(r => (r.constraints ?? []).every(c => c.strict ? evalAt(c, o) > 0 : evalAt(c, o) >= 0));
        const actual = o.rects?.[e.target];
        if (!actual || rows.length !== 1) {
            mismatches.push({ state: o.state, width: o.width, height: o.height, target: e.target, reason: !actual ? 'missing measurement' : 'non-unique local region' });
            continue;
        }
        const first = rows[0];
        if (!first)
            throw Error('Expected unique row');
        const r = first.rect;
        const expected = { x: evalAt(r.inlineStart, o), y: evalAt(r.blockStart, o), width: evalAt(r.inlineSize, o), height: evalAt(r.blockSize, o) };
        compared++;
        // WebKit subpixel layout quantizes to 1/64 px. Do not use this tolerance
        // in the mathematical proof itself.
        if (['x', 'y', 'width', 'height'].some(k => Math.abs(actual[k] - expected[k]) > 0.05))
            mismatches.push({ state: o.state, width: o.width, height: o.height, target: e.target, expected, actual });
    }
}
const report = verifyUI({ model, evidence, observations });
console.log(JSON.stringify({ game, hashes: cfg.sheets, compared, mismatches, issues, report }, null, 2));
if (mismatches.length || issues.length)
    process.exitCode = 2;
