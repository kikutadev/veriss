// color/ (ADR-0016 M1): pure color math, usable without the cascade or the layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, over, contrastRatio, backdrop } from '../src/color/index.mjs';
test('parses hex, rgb(), hsl() and names; null for what is not modeled', () => {
    assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColor('rgb(0 0 0 / 50%)'), { r: 0, g: 0, b: 0, a: 0.5 });
    assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor('navy'), { r: 0, g: 0, b: 128, a: 1 });
    assert.equal(parseColor('color-mix(in srgb, red, blue)'), null);
});
test('WCAG contrast ratio and compositing', () => {
    assert.equal(contrastRatio(parseColor('#000'), parseColor('#fff')), 21);
    assert.equal(Math.round(contrastRatio(parseColor('#767676'), parseColor('#fff')) * 100) / 100, 4.54);
    const half = over({ r: 0, g: 0, b: 0, a: 0.5 }, parseColor('#fff'));
    assert.deepEqual([Math.round(half.r), half.a], [128, 1]);
});
test('backdrop: the ancestors\' backgrounds, innermost first, until an opaque one; the UA colors are a parameter', () => {
    const chain = [{ backgroundColor: '#fff', backgroundImage: 'none', opacity: '1', color: '#000' }, { backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1', color: '#333' }];
    const r = backdrop(chain);
    assert.deepEqual([r.fg, r.bg], [parseColor('#333'), parseColor('#fff')]);
    assert.match(backdrop([{ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1', color: '#333' }]).unknown, /opaque background/);
    assert.deepEqual(backdrop([{ backgroundColor: 'transparent', backgroundImage: 'none', opacity: '1', color: '#333' }], { canvas: '#fff', canvastext: '#000' }).bg, parseColor('#fff'));
});
test('F107: the color grammar of rgb() / hsl() and hex, as the browsers read it (soundness fix)', async () => {
    const { colorSyntaxProblem } = await import('../src/color/index.mjs');
    // measured in Chromium, Firefox and WebKit: dropped
    for (const v of ['rgb(0 0 0, .5)', 'rgb(0, 0, 0 / .5)', '#12345', '#12', '#1234567', 'hsl(120, 100, 50)', 'rgb(10%, 20, 30)', 'rgb(255 0 0 0.5)', 'rgb(0 0 0 /)']) {
        assert.ok(colorSyntaxProblem(v), v);
        assert.equal(parseColor(v), null, v);
    }
    // valid
    for (const v of ['rgb(0,0,0)', 'rgba(0,0,0)', 'rgb(0 0 0 / 50%)', 'rgb(0, 0, 0, .5)', '#1234', 'hsl(120 100 50)', 'hsl(120, 100%, 50%)', 'hsl(120deg 100% 50%)', 'rgb(10% 20 30)', 'rgb(none 0 0)', 'red', 'rgb(var(--c))'])
        assert.equal(colorSyntaxProblem(v), null, v);
    // modern hsl numbers are percentages: hsl(120 100 50) is hsl(120 100% 50%), pure green
    assert.deepEqual(parseColor('hsl(120 100 50)'), parseColor('hsl(120, 100%, 50%)'));
    assert.deepEqual(parseColor('hsl(120 100 50)'), { r: 0, g: 255, b: 0, a: 1 });
    assert.deepEqual(parseColor('rgb(10% 20 30)'), { r: 25.5, g: 20, b: 30, a: 1 });
});
