// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Intrinsic contribution and rendered legend measurement.
import { q, add, sub, mul, cmp, div, number } from './linear.mjs';
import type { Rational } from './linear.mjs';
import {scalar,diff,partition} from './region.mjs';
import type { Affine2, Region } from './region.mjs';
import { px } from './css.mjs';
import { expandTracks } from './grid.mjs';
import type { EngineBoxContract } from './input.mjs';
import type { LayoutRange } from '../layout-contracts.d.ts';

const zero = q(0);
import type {SolverBox as IntrinsicBox,SolverStyle as IntrinsicStyle,SolverAncestor as IntrinsicAncestor,ResolveStyle as IntrinsicStyles} from './engine-solver-types.mjs';
interface ValuePiece {region: Region; value: Affine2}
const isBlockProfile = (value: EngineBoxContract['intrinsicBlockSize']): value is Exclude<NonNullable<EngineBoxContract['intrinsicBlockSize']>, number> => Array.isArray(value);
export function createIntrinsicSolver(styles: IntrinsicStyles) {
  // Cells fill their column (and span colspan columns); a caption is a full-width first or last row.
  // A bare Nfr column is minmax(auto, Nfr): its minimum is the largest minimum contribution of its single-span items
  // (Grid §6.6). Where every one is a known constant C the column is rewritten to minmax(Cpx, Nfr) (minmax(0, Nfr)
  // for 0), which the fr sizing (with its freezing loop) handles; otherwise Unknown.
  // probe: instead, the min- and max-content widths (border box) of box itself: { min, max } (a flex item's content).
  function frAutoMinimums(box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe?: false): IntrinsicStyle;
  function frAutoMinimums(box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe: 'min' | true): {min: Rational; max?: Rational};
  function frAutoMinimums(box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[], probe: false | 'min' | true = false): IntrinsicStyle | {min: Rational; max?: Rational} {
    if (!probe && (!['grid', 'inline-grid'].includes(style.display) || style.$blockFlow)) return style;
    const source = String(style['grid-template-columns']);
    // repeat(auto-fill | auto-fit, …) takes no bare fr (invalid there); subgrid has no own tracks.
    if (!probe && (/auto-fill|auto-fit|subgrid/.test(source) || !/fr\b|\bauto\b|min-content|max-content|fit-content/.test(source))) return style;
    const unknown = (why: string): never => { throw Object.assign(new Error(probe ? `${box.label}: its content ${why.replace(/^has /, 'has ')}; its content width is not known (give it a px width or flex-basis)` : `${box.label}: a bare fr column (minmax(auto, fr)) ${why}; its minimum is not known`), { code: probe ? 'U_LAYOUT_FLEX' : 'U_LAYOUT_GRID_FR', box, region }); };
    let tokens; try { tokens = probe ? ['auto'] : expandTracks(source); } catch (error) { if(probe) throw error; return style; }
    const frOf = (token: string) => { const m = token.match(/^(\d+(?:\.\d+)?)fr$/) ?? token.match(/^minmax\(\s*auto\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/); return m ? m[1] : null; };
    const bare = tokens.map(frOf);
    const kindOf = (token: string) => token === 'auto' ? 'auto' : token === 'min-content' ? 'min' : token === 'max-content' ? 'max' : /^fit-content\(\s*\d+(?:\.\d+)?px\s*\)$/.test(token) ? 'fit' : null;
    const kinds = tokens.map(kindOf);
    if (!bare.some(Boolean) && !kinds.some(Boolean)) {if(probe) throw new Error('Unresolved flex minimum');return style;}
    const ancestors = [...parents, { box, style }];
    const single = (target: IntrinsicBox, at: readonly IntrinsicAncestor[], inherited: IntrinsicStyle) => { const list = styles(target, region, at, inherited, false, true); const keys = new Set(list.map(x => JSON.stringify(x.style))); if (keys.size !== 1) unknown(`has an item whose styles change across the viewport range (${target.label})`); return list[0]!.style; };
    const length = (value: string, what: string) => { if (value === 'ua') unknown(`has an item with UA ${what}`); if (['0', '0px'].includes(String(value))) return zero; if (!/^\d+(?:\.\d+)?px$/.test(String(value))) unknown(`has an item whose ${what} is ${value}`); return px(value); };
    const edges = (st: IntrinsicStyle) => (['left', 'right'] as const).map(side => add(length(st[`padding-${side}`], 'padding'), length(st[`border-${side}`], 'border'))).reduce(add, zero);
    const margins = (st: IntrinsicStyle) => (['left', 'right'] as const).map(side => st[`margin-${side}`] === 'auto' ? zero : length(st[`margin-${side}`], 'margin')).reduce(add, zero);
    const borderBox = (st: IntrinsicStyle, value: Rational) => st['box-sizing'] === 'content-box' ? add(value, edges(st)) : value;
    const clampMax = (st: IntrinsicStyle, value: Rational) => { const m = st['max-inline-size']; if (m === 'none') return value; const v = borderBox(st, length(m, 'max-width')); return cmp(value, v) > 0 ? v : value; };
    // (A button is not replaced: its content is laid out like a block's.)
    const replaced = new Set(['img', 'svg', 'iframe', 'video', 'audio', 'canvas', 'input', 'select', 'textarea', 'embed', 'object']);
    // The min-content (or max-content) width (border box) of a box, or Unknown.
    const minContent = (target: IntrinsicBox, st: IntrinsicStyle, at: readonly IntrinsicAncestor[], max = false): Rational => {
      if (replaced.has(target.tag)) unknown(`has a replaced or form element (${target.label}) without a px width`);
      if (target.text || target.inline?.length) {
        const key = max ? 'maxInlineSize' : 'minInlineSize';
        // A measured text contract carries its max-content width as textMetrics.width (or, unwrapped, its one width).
        // (The measured width is rounded up to six decimals, the precision of layout numbers.)
        const up = (v: number | undefined) => v === undefined ? undefined : Math.ceil(Number(v) * 1e6 - 1e-9) / 1e6;
        const value = up(!max ? target.contract?.minInlineSize : target.contract?.maxInlineSize ?? (target.contract?.textMetrics && 'width' in target.contract.textMetrics ? target.contract.textMetrics.width : undefined) ?? (['nowrap', 'one-line'].includes(target.contract?.wrap!) && target.contract?.font ? target.contract.minInlineSize : undefined));
        if (value === undefined) return unknown(`has text without a ${max ? 'max' : 'min'}-content width (${target.label}; give it a ${key} contract)`);
        return add(q(String(value)), edges(st));
      }
      const kids = (target.children ?? []).filter(k => !k.pseudo);
      const inner = [...at, { box: target, style: st }];
      if (!kids.length && st.display !== 'grid') return edges(st);
      if (['block', 'list-item'].includes(st.display)) {
        let widest = zero;
        for (const kid of kids) { const ks = single(kid, inner, st); if (ks.display === 'none' || ['absolute', 'fixed'].includes(ks.position)) continue; const c = intrinsic(kid, ks, inner, max); if (cmp(c, widest) > 0) widest = c; }
        return add(widest, edges(st));
      }
      // A flex row: single-line, the sum of its items' contributions; wrapping, the widest (min-content) or the sum
      // (max-content). Items sized by flex-basis are not modeled.
      if (st.display === 'flex' && ['row', 'row-reverse'].includes(String(st['flex-direction']))) {
        const gap = ['normal', '0', '0px'].includes(String(st['column-gap'])) ? zero : length(st['column-gap'], 'column-gap');
        const items = kids.map(kid => [kid, single(kid, inner, st)] as const).filter(([, ks]) => ks.display !== 'none' && !['absolute', 'fixed'].includes(ks.position));
        if (items.some(([, ks]) => !['auto', 'content'].includes(String(ks['flex-basis'])))) unknown(`has a flex item sized by flex-basis in ${target.label}`);
        const contributions = items.map(([kid, ks]) => intrinsic(kid, ks, inner, max));
        const wraps = st['flex-wrap'] !== 'nowrap';
        const total = contributions.reduce(add, mul(gap, q(String(Math.max(0, contributions.length - 1)))));
        const widest = contributions.reduce((m, c) => cmp(c, m) > 0 ? c : m, zero);
        return add(wraps && !max ? widest : total, edges(st));
      }
      if (st.display === 'grid' && !st.$blockFlow) {
        const own = frAutoMinimums(target, st, region, at);
        const gap = ['normal', '0', '0px'].includes(String(own['column-gap'])) ? zero : length(own['column-gap'], 'column-gap');
        const list = expandTracks(String(own['grid-template-columns']));
        let total = mul(gap, q(String(Math.max(0, list.length - 1))));
        for (const token of list) {
          if (/^\d+(?:\.\d+)?px$/.test(token)) total = add(total, px(token));
          else if (!max && (kids.length === 0 || true)) { const m = token.match(/^minmax\(\s*(?:(\d+(?:\.\d+)?)px|0)\s*,\s*\d+(?:\.\d+)?fr\s*\)$/); if (!m) return unknown(`has a nested grid column ${token} whose min-content width is not modeled`); if (m[1]) total = add(total, px(`${m[1]}px`)); }
          else if (max && !kids.length && /^minmax\(\s*0(?:px)?\s*,/.test(token)) continue;
          else unknown(`has a nested grid column ${token} whose max-content width is not modeled`);
        }
        return add(total, edges(st));
      }
      return unknown(`has an item (${target.label}, display: ${st.display}) whose min-content width is not modeled`);
    };
    // The min-content contribution of a block-level child: its px width or min-content width, clamped, plus margins.
    const intrinsic = (target: IntrinsicBox, st: IntrinsicStyle, at: readonly IntrinsicAncestor[], max = false): Rational => {
      let size;
      if (st['inline-size'] !== 'auto') size = borderBox(st, length(st['inline-size'], 'width')); else size = minContent(target, st, at, max);
      size = clampMax(st, size);
      if (st['min-inline-size'] !== 'auto') { const m = borderBox(st, length(st['min-inline-size'], 'min-width')); if (cmp(m, size) > 0) size = m; }
      return add(size, margins(st));
    };
    // A grid item's minimum contribution (Grid §6.6).
    const minimum = (item: IntrinsicBox, st: IntrinsicStyle): Rational => {
      let size;
      if (st['min-inline-size'] !== 'auto') size = borderBox(st, length(st['min-inline-size'], 'min-width'));
      else if (['hidden', 'auto', 'scroll'].includes(String(st['overflow-x']))) size = zero;
      else if (st['inline-size'] !== 'auto') size = clampMax(st, borderBox(st, length(st['inline-size'], 'width')));
      else size = clampMax(st, minContent(item, st, ancestors));
      if (cmp(size, edges(st)) < 0) size = edges(st);
      return add(size, margins(st));
    };
    // probe 'min': only the min-content width is needed (a percentage flex-basis sets the base; the minimum caps it).
    if (probe === 'min') return { min: clampMax(style, minContent(box, style, parents)) };
    if (probe) return { min: clampMax(style, minContent(box, style, parents)), max: clampMax(style, minContent(box, style, parents, true)) };
    const n = tokens.length, mins = tokens.map(() => zero), minContents = tokens.map(() => zero), maxContents = tokens.map(() => zero);
    let next = 0;
    for (const item of (box.children ?? []).filter(k => !k.pseudo && !k.anonymous)) {
      const st = single(item, ancestors, style);
      if (st.display === 'none' || ['absolute', 'fixed'].includes(st.position)) continue;
      if (st['grid-row'] !== 'auto' || (st['grid-auto-flow'] ?? 'row') !== 'row' && style['grid-auto-flow'] !== 'row') unknown('has an item placed by grid-row');
      let column;
      if (st['grid-column'] === 'auto') { if (style['grid-auto-flow'] !== 'row') unknown('is not auto-placed by rows'); column = next % n; next++; }
      else { const m = String(st['grid-column']).match(/^(\d+)(?:\s*\/\s*span\s+1)?$/); if (!m || Number(m[1]) < 1 || Number(m[1]) > n || next) return unknown(`has an item placed by grid-column: ${st['grid-column']}`); column = Number(m[1]) - 1; }
      if (!bare[column] && !kinds[column]) continue;
      if (bare[column] || ['auto', 'fit'].includes(kinds[column]!)) { const c = minimum(item, st); if (cmp(c, mins[column]!) > 0) mins[column] = c; }
      if (kinds[column] === 'min') { const c = intrinsic(item, st, ancestors); if (cmp(c, minContents[column]!) > 0) minContents[column] = c; }
      if (['max', 'auto', 'fit'].includes(kinds[column]!)) { const c = intrinsic(item, st, ancestors, true); if (cmp(c, maxContents[column]!) > 0) maxContents[column] = c; }
    }
    const stretch = ['normal', 'stretch'].includes(String(style['justify-content'] ?? 'normal'));
    const rewritten = tokens.map((token, i) => {
      if (bare[i]) return cmp(mins[i]!, zero) > 0 ? `minmax(${number(mins[i]!)}px, ${bare[i]}fr)` : `minmax(0, ${bare[i]}fr)`;
      if (kinds[i] === 'min') return `${number(minContents[i]!)}px`;
      if (kinds[i] === 'max') return `${number(maxContents[i]!)}px`;
      if (kinds[i] === 'auto' || kinds[i] === 'fit') {
        let limit = cmp(maxContents[i]!, mins[i]!) > 0 ? maxContents[i]! : mins[i]!;
        if (kinds[i] === 'fit') { const cap = px(token.match(/\(\s*([^)]+?)\s*\)/)![1]!); if (cmp(limit, cap) > 0) limit = cmp(cap, mins[i]!) > 0 ? cap : mins[i]!; }
        return `-isle-content(${number(mins[i]!)},${number(limit)},${kinds[i] === 'auto' && stretch ? 1 : 0})`;
      }
      return token;
    }).join(' ');
    return { ...style, 'grid-template-columns': rewritten };
  }
  return frAutoMinimums;
}

export function intrinsicBlock<Box extends {text: boolean; contract?: EngineBoxContract|undefined}> (box: Box, content: Affine2, region: Region, unknown: (code: string, message: string, line: undefined, box: Box) => unknown, ranges: (region: Region) => {range: LayoutRange}): ValuePiece[] {
    const value = box.contract?.intrinsicBlockSize;
    if (typeof value === 'number') return [{ region, value: scalar(value) }];
    if (isBlockProfile(value)) {
      let states: {region: Region; value: Affine2 | null | "undetermined"}[] = [{ region, value: null }];
      for (const entry of value) states = states.flatMap(state => {
        const p = partition(state.region, diff(content, scalar(entry.atLeastInlineSize)), '>=');
        return [...p.yes.map(region => ({ region, value: entry.blockSize === null ? 'undetermined' as const : scalar(entry.blockSize) })), ...p.no.map(region => ({ ...state, region }))];
      });
      for (const state of states) {
        if (!state.value) unknown('U_LAYOUT_INTRINSIC', 'Intrinsic block profile does not cover the available inline size', undefined, box);
        else if (state.value === 'undetermined') { const r = ranges(state.region).range; unknown('U_LAYOUT_INTRINSIC', `The line count depends on text-spacing-trim (a closing bracket at a line end may be set half-width)${r ? ` for viewport width ${r.minExact}..${r.maxExact}` : ''}`, undefined, box); }
      }
      return states.filter((state): state is ValuePiece => Boolean(state.value && state.value !== 'undetermined'));
    }
    if (box.text) throw new Error('Automatic text height needs an intrinsicBlockSize contract');
    return [{ region, value: scalar(0) }];
  }

  // Rendered legend: display block, static, explicit px inline-size and block-size, no block margins.
export function measureLegend(styles: IntrinsicStyles, box: IntrinsicBox, style: IntrinsicStyle, region: Region, parents: readonly IntrinsicAncestor[]) {
    if (box.tag !== 'fieldset' || style.display === 'contents') return null;
    const legendBox = (box.children ?? []).find(child => child.tag === 'legend');
    if (!legendBox) return null;
    const states = styles(legendBox, region, parents, style, false, false);
    if (states.length !== 1) throw Object.assign(new Error('The legend style varies across viewport regions; the rendered legend needs one size'), { code: 'U_LAYOUT_LEGEND' });
    const ls = states[0]!.style;
    if (ls.display === 'none') return { box: legendBox, hidden: true as const, effectiveTop: px(style['border-top']) };
    if (ls.display !== 'block' || ls.position !== 'static' || ls.float !== 'none' || (['inline-size', 'block-size'] as const).some(key => !/^\d+(?:\.\d+)?px$/.test(ls[key])) || !['0', '0px'].includes(ls['margin-top']) || !['0', '0px'].includes(ls['margin-bottom']) || ls['margin-left'] === 'auto' || ls['margin-right'] === 'auto')
      throw Object.assign(new Error('A rendered legend needs display: block, an explicit px inline-size and block-size and no block or auto margins (its width is otherwise shrink-to-fit)'), { code: 'U_LAYOUT_LEGEND' });
    const vertical = add(add(px(ls['padding-top']), px(ls['padding-bottom'])), add(px(ls['border-top']), px(ls['border-bottom'])));
    const horizontal = add(add(px(ls['padding-left']), px(ls['padding-right'])), add(px(ls['border-left']), px(ls['border-right'])));
    const blockSize = ls['box-sizing'] === 'content-box' ? add(px(ls['block-size']), vertical) : px(ls['block-size']);
    const inlineSize = ls['box-sizing'] === 'content-box' ? add(px(ls['inline-size']), horizontal) : px(ls['inline-size']);
    const top = px(style['border-top']);
    return { box: legendBox, hidden:false as const, style: ls, blockSize, inlineSize, vertical, horizontal, effectiveTop: cmp(blockSize, top) > 0 ? blockSize : top,
      // The legend sits at border-left + padding-left + margin-left; a thicker border is centred on it.
      offset: { inline: add(add(px(style['border-left']), px(style['padding-left'])), px(ls['margin-left'])), block: cmp(top, blockSize) > 0 ? div(sub(top, blockSize), q(2)) : zero } };
  }
