// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Exact rational affine arithmetic. Browser rounding is outside this model.
export interface Rational { readonly n: bigint; readonly d: bigint }
export type RationalInput = Rational | string | number | bigint;
export interface Affine1 { readonly a: Rational; readonly b: Rational }
export interface Interval { readonly min: Rational; readonly max: Rational; readonly minInclusive: boolean; readonly maxInclusive: boolean }
const gcd = (a: bigint, b: bigint) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
const make = (n: bigint, d = 1n): Rational => {
  if (!d) throw new Error('Zero rational denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d); return { n: n / g, d: d / g };
};
export function q(value: RationalInput): Rational {
  if (typeof value === 'object' && value !== null && value.n !== undefined) return value;
  const text = String(value);
  if (!/^-?\d{1,12}(?:\.\d{1,6})?$/.test(text)) throw new Error('Layout numbers require at most twelve integer and six decimal digits');
  const digits = text.split('.')[1]?.length ?? 0;
  return make(BigInt(text.replace('.', '')), 10n ** BigInt(digits));
}
export const add = (x: Rational, y: Rational): Rational => make(x.n * y.d + y.n * x.d, x.d * y.d);
export const sub = (x: Rational, y: Rational): Rational => make(x.n * y.d - y.n * x.d, x.d * y.d);
export const mul = (x: Rational, y: Rational): Rational => make(x.n * y.n, x.d * y.d);
export const div = (x: Rational, y: Rational): Rational => make(x.n * y.d, x.d * y.n);
export const cmp = (x: Rational, y: Rational): -1 | 0 | 1 => { const delta = x.n * y.d - y.n * x.d; return delta < 0n ? -1 : delta > 0n ? 1 : 0; };
export const number = (x: Rational) => Number(x.n) / Number(x.d);
export const exact = (x: Rational) => x.d === 1n ? String(x.n) : `${x.n}/${x.d}`;
export const constant = (value: RationalInput): Affine1 => ({ a: q(0), b: q(value) });
export const plus = (x: Affine1, y: Affine1): Affine1 => ({ a: add(x.a, y.a), b: add(x.b, y.b) });
export const minus = (x: Affine1, y: Affine1): Affine1 => ({ a: sub(x.a, y.a), b: sub(x.b, y.b) });
export const scale = (x: Affine1, factor: Rational): Affine1 => ({ a: mul(x.a, factor), b: mul(x.b, factor) });
export const at = (x: Affine1, width: Rational) => add(mul(x.a, width), x.b);
export const expression = (x: Affine1) => ({ coefficient: exact(x.a), constant: exact(x.b) });
export function intersect(x: Interval, y: Interval): Interval | null {
  const lo = cmp(x.min, y.min), hi = cmp(x.max, y.max);
  const result = {
    min: lo >= 0 ? x.min : y.min, max: hi <= 0 ? x.max : y.max,
    minInclusive: lo === 0 ? x.minInclusive && y.minInclusive : lo > 0 ? x.minInclusive : y.minInclusive,
    maxInclusive: hi === 0 ? x.maxInclusive && y.maxInclusive : hi < 0 ? x.maxInclusive : y.maxInclusive,
  };
  const order = cmp(result.min, result.max);
  return order < 0 || (order === 0 && result.minInclusive && result.maxInclusive) ? result : null;
}
export function contains(range: Interval, point: Rational) {
  const lo = cmp(point, range.min), hi = cmp(point, range.max);
  return (lo > 0 || (lo === 0 && range.minInclusive)) && (hi < 0 || (hi === 0 && range.maxInclusive));
}
export const midpoint = (range: Interval) => div(add(range.min, range.max), q(2));
export const serializeRange = (range: Interval) => ({ min: number(range.min), max: number(range.max), minInclusive: range.minInclusive, maxInclusive: range.maxInclusive, minExact: exact(range.min), maxExact: exact(range.max) });
/** The complete subset of a finite interval where affine slack is strictly negative. */
export function negativeRange(slack: Affine1, range: Interval): Interval | null {
  const slope = cmp(slack.a, q(0));
  if (!slope) return cmp(slack.b, q(0)) < 0 ? range : null;
  const root = div(sub(q(0), slack.b), slack.a);
  if (slope > 0) return intersect(range, { ...range, max: root, maxInclusive: false });
  return intersect(range, { ...range, min: root, minInclusive: false });
}
export function cells(domain: Interval, boundaries: readonly Rational[]): Interval[] {
  const points = [...new Map([domain.min, domain.max, ...boundaries].filter(p => contains(domain, p)).map(p => [exact(p), p])).values()].sort(cmp);
  const result: Interval[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    result.push({ min: point, max: point, minInclusive: true, maxInclusive: true });
    if (i + 1 < points.length) result.push({ min: point, max: points[i + 1]!, minInclusive: false, maxInclusive: false });
  }
  return result;
}
