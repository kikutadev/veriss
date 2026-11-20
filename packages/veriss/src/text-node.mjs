// Node entry: loads the mizchi/font FFI (MoonBit -> JS, build-time only) and
// font files, then returns `createTextMetrics`. Never part of app runtime.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTextMetrics } from './text.mjs';
export { createTextMetrics, upperBound, layoutAllowance, breakOpportunities, scriptSegments, scriptRuns } from './text.mjs';
// CSS_TEXT_METRICS_JS selects another FFI build.
export const textMetricsPath = process.env.CSS_TEXT_METRICS_JS ?? fileURLToPath(new URL('../text-metrics/_build/js/release/build/font_ffi/font_ffi.js', import.meta.url));
function record(value) {
    return typeof value === 'object' && value !== null;
}
function ffiModule(value) {
    return record(value) && typeof value.load_font === 'function' && typeof value.font_info === 'function' && typeof value.shape === 'function';
}
function invalid(message) {
    throw Object.assign(new Error(message), { code: 'U_LAYOUT_TEXT_METRICS' });
}
function parse(value) {
    if (typeof value !== 'string')
        invalid('Invalid text metrics FFI response');
    const result = JSON.parse(value);
    return result;
}
function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function unknownArray(value) { return Array.isArray(value); }
function isFontInfo(value) {
    if (!record(value) || !finite(value.unitsPerEm) || value.unitsPerEm <= 0 || !unknownArray(value.axes) ||
        !finite(value.ascent) || !finite(value.descent))
        return false;
    if (!value.axes.every((axis) => record(axis) && typeof axis.tag === 'string' &&
        finite(axis.min) && finite(axis.default) && finite(axis.max)))
        return false;
    const os2 = value.os2;
    return os2 === null || (record(os2) && finite(os2.fsSelection) && finite(os2.typoAscender) && finite(os2.typoDescender));
}
function fontInfo(value) {
    if (!isFontInfo(value))
        invalid('Invalid font info');
    return value;
}
export async function loadShaper(path = textMetricsPath) {
    if (!existsSync(path))
        throw new Error(`Text metrics FFI is not built: run "just css-text-build" (${path})`);
    const ffi = await import(path);
    if (!ffiModule(ffi))
        invalid('Invalid text metrics FFI exports');
    return {
        load: data => { const handle = ffi.load_font(data instanceof Uint8Array ? data : new Uint8Array(data)); if (!finite(handle) || !Number.isSafeInteger(handle))
            invalid('Invalid font handle'); return handle; },
        info: handle => fontInfo(parse(ffi.font_info(handle))),
        shape: (handle, text, size, axes, language = 'und', ligatures = true) => parse(ffi.shape(handle, text, size, JSON.stringify(axes ?? {}), language, ligatures)),
    };
}
/** Load font files (or supplied bytes) and attach SHA-256 provenance. */
export async function loadTextMetrics({ fonts, limits }) {
    const shaper = await loadShaper(), entries = {};
    for (const [family, entry] of Object.entries(fonts ?? {})) {
        const data = entry.data ?? new Uint8Array(await readFile(entry.file ?? invalid(`Font ${family} has no file`)));
        entries[family] = { ...entry, data, sha256: createHash('sha256').update(data).digest('hex') };
    }
    return createTextMetrics({ fonts: entries, shaper, ...(limits === undefined ? {} : { limits }) });
}
