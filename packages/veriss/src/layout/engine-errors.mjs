const record = (v) => typeof v === 'object' && v !== null;
const str = (v) => typeof v === 'string' ? v : undefined;
const num = (v) => typeof v === 'number' ? v : undefined;
const rational = (v) => record(v) && typeof v.n === 'bigint' && typeof v.d === 'bigint' && v.d > 0n;
const point = (v) => record(v) && rational(v.x) && rational(v.y);
const affine = (v) => record(v) && rational(v.x) && rational(v.y) && rational(v.b);
const halfPlane = (v) => record(v) && affine(v.slack) && typeof v.strict === 'boolean';
const region = (v) => record(v) && Array.isArray(v.vertices) && v.vertices.length > 0 && v.vertices.every(point) && Array.isArray(v.constraints) && v.constraints.every(halfPlane);
function box(v) {
    if (!record(v) || typeof v.label !== 'string' || typeof v.path !== 'string')
        return undefined;
    const source = v.source;
    return { label: v.label, path: v.path, ...(record(source) && typeof source.start === 'number' && typeof source.end === 'number' ? { source: { start: source.start, end: source.end } } : {}) };
}
export function layoutError(value) {
    const v = record(value) ? value : {}, css = record(v.css) ? v.css : {};
    const axis = v.axis === 'inline' || v.axis === 'block' ? v.axis : undefined;
    return { code: str(v.code), message: str(v.message) ?? String(value), box: box(v.box), region: region(v.region) ? v.region : undefined, axis, line: num(css.line), file: str(css.file), ancestor: str(v.ancestor), ancestorPath: str(v.ancestorPath), property: str(v.property) };
}
