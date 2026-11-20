// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Private numerical geometry used only by layout/engine.
import { q, add, sub, mul, cmp, div, number } from './linear.mjs';
import type { Rational } from './linear.mjs';
import { scalar, width, height, sum, diff, times, evaluate, partition } from './region.mjs';
import type { Affine2, Point, Region } from './region.mjs';
import type { LayoutAffine, LayoutRectangle } from '../layout-contracts.d.ts';
import { px } from './css.mjs';
import { intersect } from './integrity.mjs';

const zero = q(0), one = q(1);
interface FontStyle { 'font-size'?: string }
interface ShiftRow {
  path: string;
  rect?: LayoutRectangle | null;
  layoutRect?: LayoutRectangle | null;
  $shown?: { region: Region };
}
// Lengths as affine functions of the viewport (W, H): px, % of the containing size, vw, vh, vmin, vmax, rem (the
// html root's px font-size), em (the element's px font-size), and calc() with + − × ÷ and min()/max()/clamp().
// vmin/vmax and min()/max() split the region where their arguments cross; each piece is {region, value}.
export const unitContext: { rootFontSize: Rational | null; heightKnown: boolean } = { rootFontSize: null, heightKnown: false };
interface LengthPiece { region: Region | null; value: Affine2; number: boolean }
type PieceValue = Omit<LengthPiece, 'region'>;
export function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: Region, style?: FontStyle): {region: Region; value: Affine2}[];
export function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: null, style?: FontStyle): {region: null; value: Affine2}[];
export function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: Region | null, style?: FontStyle): {region: Region | null; value: Affine2}[];
export function lengthPieces(value: unknown, parent: Affine2 | null | undefined, region: Region | null, style?: FontStyle): {region: Region | null; value: Affine2}[] {
  const text = String(value).trim().toLowerCase();
  let i = 0;
  const fail = (): never => { throw new Error(`Unsupported CSS length: ${value}`); };
  const space = () => { while (/\s/.test(text[i] ?? '')) i++; };
  // A value is a list of pieces; `number` marks a unitless factor.
  const constant = (v: Affine2, number = false): LengthPiece[] => [{ region, value: v, number }];
  // A piece's region is the base region or a sub-region of it; meeting the base keeps the other side as it is.
  const meet = (a: Region, b: Region): Region | null => a === region ? b : b === region ? a : a === b ? a : intersect(a, b);
  const combine = <T extends object>(a: LengthPiece[], b: LengthPiece[], f: (x: LengthPiece, y: LengthPiece) => T): (T & { region: Region | null })[] => a.flatMap(x => b.flatMap(y => { const r = x.region && y.region ? meet(x.region, y.region) : x.region ?? y.region; return r || (x.region === null && y.region === null) ? [{ region: r ?? null, ...f(x, y) }] : []; }));
  const pick = (list: LengthPiece[][], larger: boolean): LengthPiece[] => list.reduce((acc, next) => combine(acc, next, (x, y): {both: [Affine2, Affine2]; number: boolean} => ({ both: [x.value, y.value], number: x.number && y.number })).flatMap((entry): LengthPiece[] => {
    const [a, b] = entry.both;
    if (!entry.region) { const d = diff(a, b); if (cmp(d.x, zero) || cmp(d.y, zero)) fail(); return [{ region: null, value: (cmp(d.b, zero) >= 0) === larger ? a : b, number: entry.number }]; }
    const p = partition(entry.region, diff(a, b), '>=');
    return [...p.yes.map(r => ({ region: r, value: larger ? a : b, number: entry.number })), ...p.no.map(r => ({ region: r, value: larger ? b : a, number: entry.number }))];
  }));
  const unit = (n: string, u: string): LengthPiece[] => {
    const k = div(q(n), q(100));
    if (u === '') return constant(scalar(q(n)), true);
    if (u === 'px') return constant(scalar(q(n)));
    if (u === '%') { if (!parent) return fail(); return constant(times(parent, k)); }
    if (u === 'vw') return constant(times(width, k));
    if (['vh', 'vmin', 'vmax'].includes(u) && !unitContext.heightKnown) throw new Error(`${value}: viewport-height units need a viewport height range`);
    if (u === 'vh') return constant(times(height, k));
    if (u === 'vmin' || u === 'vmax') return pick([constant(times(width, k)), constant(times(height, k))], u === 'vmax');
    if (u === 'rem') { if (!unitContext.rootFontSize) throw new Error(`${value}: rem needs the html root with a px font-size in the analysed tree`); return constant(scalar(mul(q(n), unitContext.rootFontSize))); }
    if (u === 'em') { if (!style?.['font-size'] || !/^\d+(?:\.\d{1,6})?px$/.test(style['font-size'])) throw new Error(`${value}: em needs a px font-size`); return constant(scalar(mul(q(n), px(style['font-size'])))); }
    return fail();
  };
  const primary = (): LengthPiece[] => {
    space();
    const fn = /^(calc|min|max|clamp)\(/.exec(text.slice(i));
    if (fn) {
      i += fn[0].length; const args = [sumExpr()]; space();
      while (text[i] === ',') { i++; args.push(sumExpr()); space(); }
      if (text[i++] !== ')') fail();
      if (fn[1] === 'calc') { if (args.length !== 1) fail(); return args[0]!; }
      if (fn[1] === 'clamp') { if (args.length !== 3) fail(); return pick([args[0]!, pick([args[1]!, args[2]!], false)], true); }
      return pick(args, fn[1] === 'max');
    }
    if (text[i] === '(') { i++; const v = sumExpr(); space(); if (text[i++] !== ')') fail(); return v; }
    // s/l/d viewport units (small, large, dynamic) equal the v units in the static viewport the options declare
    // (browser UI that resizes the viewport, such as a mobile toolbar, is not modeled).
    const m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%|[sld]?(?:vw|vh|vmin|vmax)|rem|em)?/.exec(text.slice(i));
    if (!m) return fail();
    i += m[0].length;
    return unit(m[1]!.replace(/^\+/, '').replace(/^(-?)\./, '$10.'), (m[2] ?? '').replace(/^[sld](?=v)/, ''));
  };
  const product = (): LengthPiece[] => {
    let left = primary();
    for (;;) {
      space(); const op = text[i];
      if (op !== '*' && op !== '/') return left;
      i++; const right = primary();
      left = combine(left, right, (x, y): PieceValue => {
        if (op === '/') { if (!y.number || cmp(y.value.b, zero) === 0) fail(); return { value: times(x.value, div(one, y.value.b)), number: x.number }; }
        if (x.number) return { value: times(y.value, x.value.b), number: y.number };
        if (y.number) return { value: times(x.value, y.value.b), number: false };
        return fail();
      });
    }
  };
  const sumExpr = (): LengthPiece[] => {
    let left = product();
    for (;;) {
      space(); const op = text[i];
      if (op !== '+' && op !== '-') return left;
      i++; const right = product();
      left = combine(left, right, (x, y): PieceValue => { if (x.number !== y.number) fail(); return { value: op === '+' ? sum(x.value, y.value) : diff(x.value, y.value), number: x.number }; });
    }
  };
  const out = sumExpr(); space();
  if (i !== text.length || out.some(piece => piece.number && text !== '0')) fail();
  // A size is never negative: the top-level result clamps at 0 (CSS Values 4 §10.12), splitting where it crosses 0.
  return out.flatMap((piece): {region: Region | null; value: Affine2}[] => {
    if (!piece.region) return [{ region: null, value: cmp(piece.value.b, zero) < 0 && !cmp(piece.value.x, zero) && !cmp(piece.value.y, zero) ? scalar(zero) : piece.value }];
    const p = partition(piece.region, piece.value, '>=');
    return [...p.yes.map(r => ({ region: r, value: piece.value })), ...p.no.map(r => ({ region: r, value: scalar(zero) }))];
  });
}
// Where a box's layout start differs between two layouts of the same page: rows of the same path are compared on
// the intersection of their condition regions (and `within`), at its vertices (an affine difference vanishes on a
// convex region exactly when it vanishes there). Returns the first change per path, or null when a compared row has
// no layout rectangle.
export function layoutStartMoves<Row extends ShiftRow>(before: readonly Row[], after: readonly Row[], keep: (row: Row) => boolean = () => true, within: readonly Region[] | null = null):
  { undecided: Row; moves?: never } | { undecided?: never; moves: { row: Row; shared: Region; field: 'inlineStart' | 'blockStart'; v: Point; delta: Rational }[] } {
  const rect = (row: ShiftRow) => row.layoutRect !== undefined ? row.layoutRect : row.rect;
  const r = (v: string | undefined) => { const [n, d = '1'] = String(v ?? '0').split('/'); return div(q(n!), q(d)); };
  const at = (a: LayoutAffine, w: Rational, h: Rational) => add(add(r(a.constant), mul(r(a.coefficient), w)), mul(r(a.heightCoefficient), h));
  const rows = before.filter(keep), others = after.filter(keep);
  const undecided = [...rows, ...others].find(row => !rect(row) || !row.$shown?.region);
  if (undecided) return { undecided };
  const moves: { row: Row; shared: Region; field: "inlineStart" | "blockStart"; v: Point; delta: Rational }[] = [];
  for (const row of rows) for (const other of others.filter(o => o.path === row.path)) {
    if (moves.some(m => m.row.path === row.path)) break;
    for (const limit of within ?? [null]) {
      const both: Region | null = intersect(row.$shown!.region, other.$shown!.region), shared: Region | null = both && (limit ? intersect(both, limit) : both);
      if (!shared) continue;
      const change = (['inlineStart', 'blockStart'] as const).flatMap(field => shared.vertices.map(v => ({ field, v, delta: sub(at(rect(other)![field], v.x, v.y), at(rect(row)![field], v.x, v.y)) })).filter(c => cmp(c.delta, zero) !== 0).slice(0, 1))[0];
      if (change) { moves.push({ row, shared, ...change }); break; }
    }
  }
  return { moves };
}
// An upper bound of the Layout Instability score of one change (a frame), at viewport point p = {x: W, y: H}:
// impact fraction (the union of every moved box's before and after layout rectangles, inside the viewport, over the
// viewport area) × distance fraction (the largest horizontal or vertical move over max(W, H)). Every moved layout box
// is counted, a superset of the boxes Chromium counts (those it paints), so both factors only grow: the result bounds
// the browser's score of that frame from above (initial scroll position).
export function shiftScoreBound<Row extends ShiftRow>(before: readonly Row[], after: readonly Row[], keep: (row: Row) => boolean, p: Point): number | null {
  const rect = (row: ShiftRow) => row.layoutRect !== undefined ? row.layoutRect : row.rect;
  const r = (v: string | undefined) => { const [n, d = '1'] = String(v ?? '0').split('/'); return Number(n) / Number(d); };
  const W = number(p.x), H = number(p.y);
  if (!(W > 0 && H > 0)) return null;
  const at = (a: LayoutAffine) => r(a.constant) + r(a.coefficient) * W + r(a.heightCoefficient) * H;
  const inside = (row: ShiftRow) => row.$shown?.region && row.$shown.region.constraints.every(c => cmp(evaluate(c.slack, p), zero) >= 0);
  const box = (row: ShiftRow) => { const b = rect(row); return b && { x: at(b.inlineStart), y: at(b.blockStart), w: at(b.inlineSize), h: at(b.blockSize) }; };
  const pieces: [number, number, number, number][] = []; let distance = 0;
  for (const row of before.filter(row => keep(row) && inside(row))) {
    const other = after.find(o => o.path === row.path && keep(o) && inside(o));
    if (!other) continue;
    const a = box(row), b = box(other);
    if (!a || !b) return null;
    const move = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    if (move === 0) continue;
    distance = Math.max(distance, move);
    for (const c of [a, b]) { const x0 = Math.max(0, c.x), y0 = Math.max(0, c.y), x1 = Math.min(W, c.x + c.w), y1 = Math.min(H, c.y + c.h); if (x1 > x0 && y1 > y0) pieces.push([x0, y0, x1, y1]); }
  }
  if (!pieces.length) return 0;
  // Union area by coordinate compression (few rectangles).
  const xs = [...new Set(pieces.flatMap(q => [q[0], q[2]]))].sort((m, n) => m - n), ys = [...new Set(pieces.flatMap(q => [q[1], q[3]]))].sort((m, n) => m - n);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) if (pieces.some(q => q[0] <= xs[i]! && q[2] >= xs[i + 1]! && q[1] <= ys[j]! && q[3] >= ys[j + 1]!)) area += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
  return (area / (W * H)) * (distance / Math.max(W, H));
}
// A bound of the Layout Instability score summed over the frames of one continuous change from layout `before` to
// layout `after`, assuming every box moves monotonically between them (premise recorded with the result): each frame's
// unstable area lies in the hull of a moved box's two rectangles, and the frames' largest moves add up to at most the
// sum of every moved box's whole move. Returns {impact, distance} fractions, or null without layout rectangles.
export function sweptBound<Row extends ShiftRow>(before: readonly Row[], after: readonly Row[], p: Point): {impact: number; distance: number} | null {
  const rect = (row: ShiftRow) => row.layoutRect !== undefined ? row.layoutRect : row.rect;
  const r = (v: string | undefined) => { const [n, d = '1'] = String(v ?? '0').split('/'); return Number(n) / Number(d); };
  const W = number(p.x), H = number(p.y);
  if (!(W > 0 && H > 0)) return null;
  const at = (a: LayoutAffine) => r(a.constant) + r(a.coefficient) * W + r(a.heightCoefficient) * H;
  const inside = (row: ShiftRow) => row.$shown?.region && row.$shown.region.constraints.every(c => cmp(evaluate(c.slack, p), zero) >= 0);
  const box = (row: ShiftRow) => { const b = rect(row); return b && { x: at(b.inlineStart), y: at(b.blockStart), w: at(b.inlineSize), h: at(b.blockSize) }; };
  const pieces: [number, number, number, number][] = []; let moves = 0;
  for (const row of before.filter(inside)) {
    const other = after.find(o => o.path === row.path && inside(o));
    if (!other) continue;
    const a = box(row), b = box(other);
    if (!a || !b) return null;
    const move = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    if (move === 0) continue;
    moves += move;
    const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y)), x1 = Math.min(W, Math.max(a.x + a.w, b.x + b.w)), y1 = Math.min(H, Math.max(a.y + a.h, b.y + b.h));
    if (x1 > x0 && y1 > y0) pieces.push([x0, y0, x1, y1]);
  }
  const xs = [...new Set(pieces.flatMap(q => [q[0], q[2]]))].sort((m, n) => m - n), ys = [...new Set(pieces.flatMap(q => [q[1], q[3]]))].sort((m, n) => m - n);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) if (pieces.some(q => q[0] <= xs[i]! && q[2] >= xs[i + 1]! && q[1] <= ys[j]! && q[3] >= ys[j + 1]!)) area += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
  return { impact: area / (W * H), distance: moves / Math.max(W, H) };
}
export function length(value: string, parent: Affine2 | null | undefined, style?: FontStyle): Affine2 {
  if (/^\d+(?:\.\d+)?%$/.test(value) && !parent) throw new Error('Percentage block size needs a definite containing size; intrinsic percentage cycles are not modeled');
  const pieces = lengthPieces(value, parent, null, style);
  return pieces[0]!.value;
}
