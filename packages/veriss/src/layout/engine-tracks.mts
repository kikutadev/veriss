// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Finite-region grid and flex resolution, with the engine's shared work limiter.
import { q, add, sub, mul, cmp, div, exact } from './linear.mjs';
import type { Rational, RationalInput } from './linear.mjs';
import { scalar, asAffine, sum, diff, times, clip, partition } from './region.mjs';
import type { Affine2, Region } from './region.mjs';
import { distribution, flexUnknown } from './flex.mjs';
import type { FlexItemModel } from './flex.mjs';
import type { GridTrack } from './grid.mjs';
import type { Axis } from './engine-types.mjs';

const zero = q(0), one = q(1);
type DimensionValue = Affine2 | RationalInput;
// The fixed sentinel marks already-sized content tracks during recursive fr allocation.
type EngineTrack = GridTrack | {fixed: true; content?: never; autoTable?: never; weight?: never; min?: never; minCap?: never; autoMin?: never; auto?: never};
interface TrackSolution {region: Region; values: Affine2[]; required: Affine2}
interface MainMargins {autoStart: boolean; autoEnd: boolean}
type ConstantFlexItem = Extract<FlexItemModel, {base: Rational}> & {marginMain?: Rational; marginMainAffine?: Affine2};
interface ResolvedFlexItem extends MainMargins {
  base: Affine2; minimum: Affine2; maximum?: Affine2 | null | undefined;
  grow: Rational; shrink: Rational; automaticBelowBase: boolean;
  content?: boolean; percentItem?: boolean; innerShare?: Rational | null;
  // Content-derived items either freeze at base or have zero scaled shrink contribution.
  innerBase?: Rational; baseBelowMinimum?: boolean; baseAtLeastMinimum?: boolean;
}
interface FlexLineSolution {region: Region; values: Affine2[]; free: Affine2; mode: 'grow' | 'shrink'}
interface LineBreak {region: Region; start: number; lines: number[][]}
interface LineOffsets {region: Region; starts: Affine2[] | null}
const total = (values: readonly Affine2[]) => values.reduce(sum, scalar(0));
export const scaleGap = (gap: DimensionValue, count: number) => times(asAffine(gap), q(count));
export const sameSlope = (a: Affine2, b: Affine2) => cmp(a.x,b.x)===0 && cmp(a.y,b.y)===0;
export const constantLess = (a: Affine2, b: Affine2) => sameSlope(a,b) && cmp(a.b,b.b)<0;
export const maximumConstant = (a: Affine2, b: Affine2) => { if (!sameSlope(a,b)) throw flexUnknown('A content-dependent minimum with a different base is outside the subset'); return constantLess(a, b) ? b : a; };
export const clamp = (region: Region, value: Affine2) => {
  const p = partition(region, value, '>=');
  return [...p.yes.map(region => ({region, value})), ...p.no.map(region => ({region, value: scalar(0)}))];
};
export function createTrackSolver(bounded: <T>(values: T[]) => T[]) {

  function flex(region: Region, available: Affine2, definitions: readonly EngineTrack[], gap: DimensionValue, bases: readonly Affine2[], stretchAuto: boolean): TrackSolution[] {
    // Content-sized columns (Grid §12.5–12.7): each starts at its base; the free space (with fr tracks at their
    // minimum) is shared equally among them up to their growth limits (freezing each at its limit); fr tracks then
    // take what is left, or, without fr tracks, auto tracks stretch into it equally.
    if (definitions.some(t => t.content)) {
      if (definitions.some(t => t.autoTable || t.auto)) throw new Error('Content-sized columns with automatic table or auto row tracks are not modeled');
      const content = definitions.map((t, i) => t.content ? i : -1).filter(i => i >= 0);
      const frBase = (t: EngineTrack, i: number) => t.min !== undefined ? scalar(t.min) : t.autoMin ? bases[i]! : scalar(0);
      const fixedTotal = definitions.reduce((acc, t, i) => t.content ? sum(acc, scalar(t.content.base)) : t.weight ? sum(acc, frBase(t, i)) : sum(acc, bases[i]!), asAffine(gap));
      const free0 = diff(available, fixedTotal);
      const out: TrackSolution[] = [];
      const finish = (r: Region, growth: Record<number, Affine2>): void => {
        const values = definitions.map((t, i) => t.content ? sum(scalar(t.content.base), growth[i] ?? scalar(0)) : bases[i]!);
        if (definitions.some(t => t.weight)) {
          // fr tracks share what is left (the content tracks now fixed at their sizes).
          for (const piece of flex(r, available, definitions.map(t => t.content ? { fixed: true } : t), gap, values, false)) out.push({ ...piece, required: fixedTotal });
          return;
        }
        const stretching = content.filter(i => definitions[i]!.content!.stretch);
        if (!stretching.length) { out.push({ region: r, values, required: fixedTotal }); return; }
        const used = sum(asAffine(gap), values.reduce((acc, v) => sum(acc, v), scalar(0)));
        for (const piece of clamp(r, diff(available, used))) out.push({ region: piece.region, values: values.map((v, i) => stretching.includes(i) ? sum(v, times(piece.value, div(one, q(String(stretching.length))))) : v), required: fixedTotal });
      };
      const grow = (r: Region, frozen: Set<number>, depth: number): void => {
        if (depth > content.length + 1) throw new Error('Content-sized column resolution did not converge');
        const active = content.filter(i => !frozen.has(i));
        const room = (i: number) => sub(definitions[i]!.content!.limit, definitions[i]!.content!.base);
        if (!active.length) { finish(r, Object.fromEntries(content.map(i => [i, scalar(room(i))]))); return; }
        const rest = [...frozen].reduce((acc, i) => diff(acc, scalar(room(i))), free0);
        const share = times(rest, div(one, q(String(active.length))));
        const smallest = active.reduce((m, i) => cmp(room(i), m) < 0 ? room(i) : m, room(active[0]!));
        const split = partition(r, diff(share, scalar(smallest)), '>=');
        for (const x of split.yes) grow(x, new Set([...frozen, ...active.filter(i => cmp(room(i), smallest) === 0)]), depth + 1);
        for (const x of split.no) finish(x, Object.fromEntries([...content.map(i => [i, frozen.has(i) ? scalar(room(i)) : share])]));
      };
      // No free space: every track at its base (the tracks overflow, or fit exactly).
      const p = partition(region, free0, '>=');
      for (const r of p.no) finish(r, {});
      for (const r of p.yes) grow(r, new Set(), 0);
      return out;
    }
    // Automatic table columns (CSS 2 / Chromium auto table layout): below the summed minima every column keeps its
    // minimum (the table overflows); between minima and maxima each grows from its minimum by its share of
    // (max − min); above the maxima the width is shared in proportion to the maxima.
    // With px columns (measured): (1) below every minimum all stay at their minimum; (2) the px columns grow from
    // their content minimum toward px in proportion to (px − min); (3) then the auto columns from min toward max in
    // proportion to (max − min); (4) beyond, the auto columns share the rest in proportion to their max.
    if (definitions.some(t => t.autoTable)) {
      if (!definitions.every(t => t.autoTable)) throw new Error('Automatic table columns do not mix with other tracks');
      const mins = definitions.map(t => t.autoTable!.min), tops = definitions.map(t => t.autoTable!.max), fixed = definitions.map(t => Boolean(t.autoTable!.fixed));
      const S = diff(available, asAffine(gap)), total = (list: readonly Rational[]) => list.reduce(add, zero);
      const A = total(mins), B = total(definitions.map((t, i) => fixed[i] ? tops[i]! : mins[i]!)), C = total(tops);
      const autoMax = total(tops.filter((_, i) => !fixed[i])), autoCount = fixed.filter(f => !f).length;
      const out: TrackSolution[] = [], within = (lo: Rational, hi: Rational) => region && clip(clip(region, diff(S, scalar(lo)))!, diff(scalar(hi), S), true);
      const under = clip(region, diff(scalar(A), S), true);
      if (under) out.push({ region: under, values: mins.map(scalar), required: sum(scalar(A), asAffine(gap)) });
      const phase = (lo: Rational, hi: Rational, grows: (i: number) => boolean) => { const spread = sub(hi, lo); if (cmp(spread, zero) <= 0) return; const r = within(lo, hi); if (!r) return;
        out.push({ region: r, values: definitions.map((t, i) => grows(i) ? sum(scalar(mins[i]!), times(diff(S, scalar(lo)), div(sub(tops[i]!, mins[i]!), spread))) : scalar(fixed[i] && lo === B ? tops[i]! : mins[i]!)), required: asAffine(gap) }); };
      phase(A, B, i => fixed[i]!);
      // Phase 3: px columns at px, auto columns grow.
      { const spread = sub(C, B), r = cmp(spread, zero) > 0 ? within(B, C) : null; if (r) out.push({ region: r, values: definitions.map((t, i) => fixed[i] ? scalar(tops[i]!) : sum(scalar(mins[i]!), times(diff(S, scalar(B)), div(sub(tops[i]!, mins[i]!), spread)))), required: asAffine(gap) }); }
      const over = clip(region, diff(S, scalar(C)));
      if (over) out.push({ region: over, values: definitions.map((t, i) => fixed[i] ? scalar(tops[i]!) : sum(scalar(tops[i]!), times(diff(S, scalar(C)), cmp(autoMax, zero) > 0 ? div(tops[i]!, autoMax) : div(one, q(autoCount))))), required: asAffine(gap) });
      return out;
    }
    // minmax(L, fr) tracks (css-grid-1 §12.7.1, find the size of an fr): each flexible track takes its share of the
    // free space unless that is below its minimum L; such tracks are frozen at L and the rest is shared again. Each
    // round is a region split by "share ≥ L". A capped minimum (min(L, 100%)) is the container width below L.
    if (definitions.some(t => t.min !== undefined || t.autoMin)) {
      // (Auto tracks keep their measured base: the fr tracks take all the free space, none is left to stretch them.)
      if (definitions.some(t => t.autoTable) || (definitions.some(t => t.auto) && definitions.some(t => t.min !== undefined))) throw new Error('minmax(px, fr) tracks with auto tracks are not modeled');
      const fixedTotal = sum(definitions.reduce((acc, t, i) => t.weight ? acc : sum(acc, bases[i]!), scalar(0)), asAffine(gap));
      const out: TrackSolution[] = [];
      let pieces = [{ region, mins: definitions.map((t, i) => t.min !== undefined ? scalar(t.min) : t.autoMin ? bases[i]! : t.weight ? scalar(0) : null) }];
      for (const L of [...new Set(definitions.filter(t => t.minCap).map(t => exact(t.min!)))]) pieces = pieces.flatMap(piece => {
        const split = partition(piece.region, diff(available, scalar(q(L))), '>=');
        return [...split.yes.map(r => ({ region: r, mins: piece.mins })), ...split.no.map(r => ({ region: r, mins: piece.mins.map((m, i) => definitions[i]!.minCap && exact(definitions[i]!.min!) === L ? available : m) }))];
      });
      const resolve = (r: Region, mins: readonly (Affine2 | null)[], frozen: Set<number>, depth: number): void => {
        if (depth > definitions.length + 1) throw new Error('Grid fr resolution did not converge');
        const active = definitions.map((t, i) => t.weight && !frozen.has(i) ? i : -1).filter(i => i >= 0);
        const weights = active.map(i => definitions[i]!.weight!).reduce(add, zero), denominator = cmp(weights, one) < 0 ? one : weights;
        const free = diff(diff(available, fixedTotal), [...frozen].reduce((acc, i) => sum(acc, mins[i]!), scalar(0)));
        const share = (i: number) => times(free, div(definitions[i]!.weight!, denominator));
        let cells: {region: Region; violators: number[]}[] = [{ region: r, violators: [] }];
        for (const i of active) cells = cells.flatMap(cell => { const p = partition(cell.region, diff(share(i), mins[i]!), '>='); return [...p.yes.map(x => ({ region: x, violators: cell.violators })), ...p.no.map(x => ({ region: x, violators: [...cell.violators, i] }))]; });
        for (const cell of cells) {
          if (cell.violators.length) { resolve(cell.region, mins, new Set([...frozen, ...cell.violators]), depth + 1); continue; }
          const values = definitions.map((t, i) => !t.weight ? bases[i]! : frozen.has(i) ? mins[i]! : share(i));
          out.push({ region: cell.region, values, required: sum(fixedTotal, definitions.reduce((acc, t, i) => t.weight ? sum(acc, mins[i]!) : acc, scalar(0))) });
        }
      };
      for (const piece of pieces) resolve(piece.region, piece.mins, new Set(), 0);
      return out;
    }
    const overhead = sum(total(bases), asAffine(gap));
    return clamp(region, diff(available, overhead)).map(({ region, value: free }) => {
      const weights = definitions.filter(t => t.weight).map(t => t.weight!).reduce(add, zero);
      const denominator = cmp(weights, one) < 0 ? one : weights;
      const automatic = definitions.filter(t => t.auto).length;
      const allocatedFraction = div(weights, denominator);
      const remaining = times(free, sub(one, allocatedFraction));
      const values = definitions.map((track, index) => track.weight ? times(free, div(track.weight, denominator)) :
        track.auto && stretchAuto ? sum(bases[index]!, times(remaining, div(one, q(automatic)))) : bases[index]!);
      return { region, values, required: overhead };
    });
  }
  // One flex line (css-flexbox-1 §9.7) as a finite case split. Items carry
  // affine outer `base`/`minimum` sizes. The region is split by the sign of
  // the free space (grow or shrink mode) and, every round, by "target ≥
  // minimum" for each unfrozen item; violators freeze at their minimum and the
  // rest is redistributed. Frozen items never thaw, so it ends within
  // items+1 rounds. Returns outer sizes and the remaining free space.
  function resolveFlexLine(region: Region, available: Affine2, items: readonly ResolvedFlexItem[], gap: DimensionValue): FlexLineSolution[] {
    // The hypothetical main size: the base clamped by the maximum, then the minimum (min wins over max).
    const capped = (item: ResolvedFlexItem) => item.maximum && constantLess(item.maximum, item.base) ? item.maximum : item.base;
    // (baseAtLeastMinimum: an affine base already checked to be at least the minimum, a percentage flex-basis.)
    const hypothetical = items.map(item => item.baseBelowMinimum ? item.minimum : (item.minimum === item.base || item.baseAtLeastMinimum) && !item.maximum ? item.base : maximumConstant(capped(item), item.minimum));
    const sumHypothetical = sum(total(hypothetical), asAffine(gap));
    const modes = partition(region, diff(available, sumHypothetical), '>');
    const results: FlexLineSolution[] = [];
    for (const [mode, regions] of ([['grow', modes.yes], ['shrink', modes.no]] as const)) for (const start of regions) {
      // Initially frozen (§9.7 step 2): zero factor; in shrink mode also an item whose base is below its minimum.
      const frozen = new Map<number, Affine2>();
      items.forEach((item, index) => {
        const factor = mode === 'grow' ? item.grow : item.shrink;
        // Content-sized items cannot shrink below their base (= their minimum). With
        // only minimum violations the result does not depend on the freezing order.
        if (cmp(factor, zero) === 0 || (mode === 'shrink' && (item.content || item.baseBelowMinimum || (item.minimum !== item.base && !item.baseAtLeastMinimum && !item.baseBelowMinimum && constantLess(item.base, item.minimum)))) || (mode === 'grow' && item.maximum && constantLess(item.maximum, item.base))) frozen.set(index, hypothetical[index]!);
      });
      let states: {region: Region; frozen: Map<number, Affine2>}[] = [{ region: start, frozen }];
      for (let round = 0; states.length && round <= items.length; round++) {
        const next: typeof states = [];
        for (const state of states) {
          const unfrozen = items.map((_, index) => index).filter(index => !state.frozen.has(index));
          const used = items.map((item, index) => state.frozen.get(index) ?? item.base);
          const free = diff(available, sum(total(used), asAffine(gap)));
          const factors = unfrozen.map(index => mode === 'grow' ? items[index]!.grow : items[index]!.shrink);
          const factorSum = factors.reduce(add, zero);
          // §9.7 step 4b scales by the initial free space when factors sum below 1; only the first round without freezing is modeled.
          const mayFreeze = unfrozen.some(index => !items[index]!.content && (items[index]!.baseBelowMinimum || (!items[index]!.baseAtLeastMinimum && constantLess(items[index]!.base, items[index]!.minimum))));
          const shrinks = mode === 'shrink' && unfrozen.some(index => cmp(items[index]!.shrink, zero) > 0 && (items[index]!.percentItem || cmp(items[index]!.innerBase!, zero) > 0));
          if (unfrozen.length && cmp(factorSum, one) < 0 && (round > 0 || (mode === 'grow' && mayFreeze) || shrinks)) throw flexUnknown('Flex factors summing below 1 with freezing or shrinking are outside the subset');
          let targets: Affine2[];
          if (mode === 'grow') targets = items.map((item, index) => state.frozen.has(index) ? used[index]! : sum(item.base, times(free, div(item.grow, cmp(factorSum, one) < 0 ? one : factorSum))));
          else {
            // Shrinking is proportional to the scaled factor shrink × inner base size.
            if (unfrozen.some(index => items[index]!.automaticBelowBase)) throw flexUnknown('An item whose automatic minimum depends on its content would shrink; set an explicit minimum or flex-shrink: 0');
            // Percentage bases: their inner sizes are affine, so the weights are constant only when every shrinking
            // item's inner size is a share of the same content width (shrink × share); any other mix is Unknown.
            const percent = unfrozen.filter(index => items[index]!.percentItem && cmp(items[index]!.shrink, zero) > 0);
            if (percent.length && unfrozen.some(index => cmp(items[index]!.shrink, zero) > 0 && (!items[index]!.percentItem || items[index]!.innerShare === null))) throw flexUnknown('Shrinking items with percentage bases weigh by inner sizes that are not shares of one width (edges, margins or fixed-size items shrinking with them); not modeled');
            const scaled = unfrozen.map(index => mul(items[index]!.shrink, items[index]!.percentItem ? items[index]!.innerShare ?? zero : items[index]!.innerBase!));
            const scaledSum = scaled.reduce(add, zero);
            targets = items.map((item, index) => {
              if (state.frozen.has(index)) return used[index]!;
              const k = unfrozen.indexOf(index);
              return cmp(scaledSum, zero) === 0 ? item.base : sum(item.base, times(free, div(scaled[k]!, scaledSum)));
            });
          }
          // §9.7 step 4d–e: clamp each target into [min, max]; by the sign of the total violation freeze the min
          // violators (positive), the max violators (negative) or all of them (zero).
          let parts: {region: Region; under: number[]; over: number[]}[] = [{ region: state.region, under: [], over: [] }];
          for (const index of unfrozen) {
            if (items[index]!.minimum !== items[index]!.base) parts = bounded(parts.flatMap(part => {
              const split = partition(part.region, diff(targets[index]!, items[index]!.minimum), '>=');
              return [...split.yes.map(r => ({ ...part, region: r })), ...split.no.map(r => ({ ...part, region: r, under: [...part.under, index] }))];
            }));
            if (items[index]!.maximum) parts = bounded(parts.flatMap(part => {
              if (part.under.includes(index)) return [part];
              const split = partition(part.region, diff(items[index]!.maximum!, targets[index]!), '>=');
              return [...split.yes.map(r => ({ ...part, region: r })), ...split.no.map(r => ({ ...part, region: r, over: [...part.over, index] }))];
            }));
          }
          for (const part of parts) {
            if (!part.under.length && !part.over.length) { results.push({ region: part.region, values: targets, free: diff(available, sum(total(targets), asAffine(gap))), mode }); continue; }
            const clampOf = (index: number) => part.under.includes(index) ? items[index]!.minimum : items[index]!.maximum!;
            if (!part.over.length || !part.under.length) { next.push({ region: part.region, frozen: new Map([...state.frozen, ...[...part.under, ...part.over].map(index => [index, clampOf(index)] as const)]) }); continue; }
            const violation = [...part.under, ...part.over].map(index => diff(clampOf(index), targets[index]!)).reduce((a, b) => sum(a, b));
            const positive = partition(part.region, violation, '>');
            for (const r of positive.yes) next.push({ region: r, frozen: new Map([...state.frozen, ...part.under.map(index => [index, items[index]!.minimum] as const)]) });
            for (const rest of positive.no) {
              const negative = partition(rest, diff(scalar(zero), violation), '>');
              for (const r of negative.yes) next.push({ region: r, frozen: new Map([...state.frozen, ...part.over.map(index => [index, items[index]!.maximum!] as const)]) });
              for (const r of negative.no) next.push({ region: r, frozen: new Map([...state.frozen, ...[...part.under, ...part.over].map(index => [index, clampOf(index)] as const)]) });
            }
          }
        }
        states = bounded(next);
      }
      if (states.length) throw new Error('Flex freezing did not converge');
    }
    return results;
  }
  // ---- flex layout (ADR-0011) ----------------------------------------------
  const constantItem = (item: ConstantFlexItem): ResolvedFlexItem => {
    const outer = (v: Rational) => item.marginMainAffine ? sum(scalar(v),item.marginMainAffine) : scalar(v);
    return { ...item, base: outer(item.base), minimum: outer(item.minimum), maximum: item.maximum !== undefined ? outer(item.maximum) : null, innerBase: sub(sub(item.base, item.edges), item.marginMain ?? zero) };
  };
  // Greedy line breaking by outer hypothetical sizes (constants), split by width thresholds.
  function breakLines(region: Region, available: Affine2, hypothetical: readonly DimensionValue[], gap: DimensionValue): LineBreak[] {
    const n = hypothetical.length, done: LineBreak[] = [];
    let states: LineBreak[] = [{ region, start: 0, lines: [] }];
    while (states.length) {
      const next: LineBreak[] = [];
      for (const state of states) {
        if (state.start >= n) { done.push(state); continue; }
        const pending = [{ region: state.region, end: state.start + 1 }];
        while (pending.length) {
          const p = pending.pop()!;
          const line = [...Array(p.end - state.start).keys()].map(k => state.start + k);
          if (p.end >= n) { next.push({ region: p.region, start: n, lines: [...state.lines, line] }); continue; }
          // Sizes may be affine in the viewport (a percentage flex-basis): the break is then a width threshold too.
          const need = sum(hypothetical.slice(state.start, p.end + 1).map(h => h && typeof h === 'object' && 'b' in h ? h : scalar(h)).reduce(sum, scalar(zero)), scaleGap(gap, p.end - state.start));
          const split = partition(p.region, diff(available, need), '>=');
          for (const r of split.yes) pending.push({ region: r, end: p.end + 1 });
          for (const r of split.no) next.push({ region: r, start: p.end, lines: [...state.lines, line] });
        }
      }
      states = bounded(next);
    }
    return bounded(done);
  }
  // Main-axis start offsets of a line's items: auto margins absorb positive free
  // space, otherwise justify-content distributes it. null = not modeled there.
  function mainStarts(region: Region, values: readonly Affine2[], free: Affine2, flags: readonly MainMargins[], gap: DimensionValue, main: Axis, justify: string): LineOffsets[] {
    const count = values.length, autos = flags.reduce((n, f) => n + Number(f.autoStart) + Number(f.autoEnd), 0);
    const place = (lead: Affine2, extra: Affine2, margin: Affine2) => {
      let position = lead; const starts: Affine2[] = [];
      values.forEach((value, i) => {
        if (flags[i]!.autoStart) position = sum(position, margin);
        starts.push(position);
        position = sum(sum(position, value), sum(asAffine(gap), extra));
        if (flags[i]!.autoEnd) position = sum(position, margin);
      });
      return starts;
    };
    const none = scalar(0), d = distribution(justify, main, count);
    if (!autos && cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0) return [{ region, starts: place(none, none, none) }];
    const split = partition(region, free, '>='), out: LineOffsets[] = [];
    for (const r of split.yes) out.push({ region: r, starts: autos ? place(none, none, times(free, div(one, q(autos)))) : place(times(free, d.lead), times(free, d.extra), none) });
    // Negative free space: auto margins are zero and justify falls back or is not modeled.
    for (const r of split.no) out.push({ region: r, starts: d.negative === 'start' || (autos && d.negative === 'same') ? place(none, none, none) : d.negative === 'same' ? place(times(free, d.lead), none, none) : null });
    return out;
  }
  return {flex, resolveFlexLine, constantItem, breakLines, mainStarts};
}
