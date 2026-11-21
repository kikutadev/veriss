// The coordinate subset L1 (docs/adr/0018-coordinate-subset.md) as SMT-LIB2 (QF_LRA): an independent reference for the
// border boxes of Grid and Flex (row, nowrap) items, written from the CSS specifications and not from the engine.
//
// A configuration (JSON) is turned into definitions over one variable W, the container's content-box inline size:
//   x_k, y_k, w_k, h_k   the border box of item k (origin: the container's content box)
//   ok_k                 true where item k's position is inside L1 (an alignment that would overflow is not)
// Each is a declared constant fixed by an equality (assert (= x_k …)), so a model gives every value at a W. `facts` are
// further assertions (the shrink level t). Outside L1 the generator throws (the caller treats it as Unknown).

const num = v => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
  if (v < 0) return `(- ${num(-v)})`;
  // A finite decimal as an exact rational.
  const [i, f = ''] = String(v).includes('e') ? [v.toFixed(20).replace(/0+$/, '')] : String(v).split('.');
  return f ? `(/ ${i}${f} 1${'0'.repeat(f.length)})` : `${i}.0`;
};
// Whether a sum of finite decimals is at least 1, exactly (the choice between two formulas must not round).
const decimals = v => (String(v).split('.')[1] ?? '').length;
export const sumAtLeastOne = values => {
  const d = Math.max(0, ...values.map(decimals)), scale = 10n ** BigInt(d);
  const scaled = v => { const [i, f = ''] = String(v).split('.'); return BigInt(i) * scale + BigInt((f + '0'.repeat(d)).slice(0, d) || '0'); };
  return values.reduce((a, v) => a + scaled(v), 0n) >= scale;
};
const sum = terms => terms.length === 0 ? '0.0' : terms.length === 1 ? terms[0] : `(+ ${terms.join(' ')})`;
const max = (a, b) => `(ite (>= ${a} ${b}) ${a} ${b})`;
const times = (k, v) => `(* ${num(k)} ${num(v)})`;
// All arithmetic on the inputs is done in SMT (exact rationals); JavaScript only chooses the formula.
const outOfSubset = message => { throw Object.assign(new Error(`outside L1: ${message}`), { code: 'OUTSIDE_L1' }); };
const px = (v, what) => { if (typeof v !== 'number' || v < 0) outOfSubset(`${what} must be a px length`); return v; };

// Grid. config: { columns: [{px}|{fr}], rows: [{px}], columnGap, rowGap,
//   items: [{ column: [a, b], row: [a, b], width: 'auto'|px, height: 'auto'|px, justify, align }] }
export function gridSpec(c) {
  const lines = [];
  const def = (name, body) => lines.push(`(declare-const ${name} Real)`, `(assert (= ${name} ${body}))`);
  const defB = (name, body) => lines.push(`(declare-const ${name} Bool)`, `(assert (= ${name} ${body}))`);
  const cols = c.columns, rows = c.rows, cg = px(c.columnGap ?? 0, 'column-gap'), rg = px(c.rowGap ?? 0, 'row-gap');
  if (!cols?.length || !rows?.length) outOfSubset('explicit columns and rows');
  for (const t of cols) if (!(('px' in t && t.px >= 0) || ('fr' in t && t.fr > 0))) outOfSubset('a column is <px> or minmax(0, <n>fr)');
  for (const t of rows) if (!('px' in t && t.px >= 0)) outOfSubset('a row is <px>');
  const frs = cols.filter(t => 'fr' in t).map(t => t.fr), frAtLeastOne = sumAtLeastOne(frs);
  def('F', `(- W ${sum(cols.filter(t => 'px' in t).map(t => num(t.px)))} ${times(cols.length - 1, cg)})`);
  def('Fpos', max('F', '0.0'));
  // CSS Grid §12.7.1: with a flex factor sum below 1 the tracks take that share of the free space, not all of it.
  def('frUnit', frAtLeastOne ? `(/ Fpos ${sum(cols.filter(t => 'fr' in t).map(t => num(t.fr)))})` : 'Fpos');
  cols.forEach((t, i) => def(`col_${i}`, 'px' in t ? num(t.px) : `(* ${num(t.fr)} frUnit)`));
  cols.forEach((_, i) => def(`colStart_${i}`, i === 0 ? '0.0' : `(+ colStart_${i - 1} col_${i - 1} ${num(cg)})`));
  rows.forEach((t, i) => def(`row_${i}`, num(t.px)));
  rows.forEach((_, i) => def(`rowStart_${i}`, i === 0 ? '0.0' : `(+ rowStart_${i - 1} row_${i - 1} ${num(rg)})`));
  const align = (start, area, size, how, axis) => {
    if (how === 'stretch' || how === 'start' || how === undefined) return start;
    if (how === 'center') return `(+ ${start} (/ (- ${area} ${size}) 2.0))`;
    if (how === 'end') return `(+ ${start} (- ${area} ${size}))`;
    return outOfSubset(`${axis}-self: ${how}`);
  };
  c.items.forEach((it, k) => {
    const [ca, cb] = it.column, [ra, rb] = it.row;
    if (!(Number.isInteger(ca) && Number.isInteger(cb) && ca >= 1 && cb > ca && cb <= cols.length + 1)) outOfSubset(`item ${k}: grid-column ${ca} / ${cb} inside the explicit columns`);
    if (!(Number.isInteger(ra) && Number.isInteger(rb) && ra >= 1 && rb > ra && rb <= rows.length + 1)) outOfSubset(`item ${k}: grid-row ${ra} / ${rb} inside the explicit rows`);
    def(`areaX_${k}`, `colStart_${ca - 1}`);
    def(`areaW_${k}`, `(- (+ colStart_${cb - 2} col_${cb - 2}) colStart_${ca - 1})`);
    def(`areaY_${k}`, `rowStart_${ra - 1}`);
    def(`areaH_${k}`, `(- (+ rowStart_${rb - 2} row_${rb - 2}) rowStart_${ra - 1})`);
    const areaY = `areaY_${k}`, areaH = `areaH_${k}`;
    const autoW = it.width === undefined || it.width === 'auto', autoH = it.height === undefined || it.height === 'auto';
    const jstretch = (it.justify ?? 'stretch') === 'stretch', astretch = (it.align ?? 'stretch') === 'stretch';
    def(`w_${k}`, autoW && jstretch ? `areaW_${k}` : autoW ? outOfSubset(`item ${k}: width auto with justify-self ${it.justify} sizes to content`) : num(px(it.width, 'width')));
    def(`h_${k}`, autoH && astretch ? areaH : autoH ? outOfSubset(`item ${k}: height auto with align-self ${it.align} sizes to content`) : num(px(it.height, 'height')));
    def(`x_${k}`, align(`areaX_${k}`, `areaW_${k}`, `w_${k}`, autoW ? 'stretch' : it.justify, 'justify'));
    def(`y_${k}`, align(areaY, areaH, `h_${k}`, autoH ? 'stretch' : it.align, 'align'));
    // center / end of an item larger than its area: the overflow alignment is not measured yet (outside L1).
    const fits = (how, size, area) => ['center', 'end'].includes(how) ? `(<= ${size} ${area})` : 'true';
    defB(`ok_${k}`, `(and ${fits(autoW ? 'stretch' : it.justify, `w_${k}`, `areaW_${k}`)} ${fits(autoH ? 'stretch' : it.align, `h_${k}`, areaH)})`);
  });
  return { kind: 'grid', count: c.items.length, smt: ['(declare-const W Real)', ...lines].join('\n'), facts: [] };
}

// Flex, row, nowrap. config: { height, gap, justify, alignItems,
//   items: [{ basis, grow, shrink, min, height: 'auto'|px, align }] }
export function flexSpec(c) {
  const lines = [], facts = [];
  const def = (name, body) => lines.push(`(declare-const ${name} Real)`, `(assert (= ${name} ${body}))`);
  const defB = (name, body) => lines.push(`(declare-const ${name} Bool)`, `(assert (= ${name} ${body}))`);
  const n = c.items.length, H = px(c.height, 'container height'), gap = px(c.gap ?? 0, 'gap');
  if (!n) outOfSubset('at least one item');
  c.items.forEach((it, k) => {
    px(it.basis, `item ${k} flex-basis`);
    if (!((it.grow ?? 0) >= 0)) outOfSubset(`item ${k}: flex-grow >= 0`);
    const s = it.shrink ?? 1; if (!(s === 0 || s >= 1)) outOfSubset(`item ${k}: flex-shrink is 0 or at least 1`);
    if ((it.min ?? 0) > it.basis) outOfSubset(`item ${k}: min-width <= flex-basis`);
  });
  const g = c.items.map(it => it.grow ?? 0), b = c.items.map(it => it.basis), m = c.items.map(it => it.min ?? 0);
  const shrinks = c.items.map(it => it.shrink ?? 1), grows = g.filter(v => v > 0), gAtLeastOne = sumAtLeastOne(grows);
  const sc = c.items.map((it, k) => shrinks[k] > 0 && it.basis > 0); // shrinkable (scaled factor shrink x basis > 0)
  def('T', `(- W ${times(n - 1, gap)})`);
  def('free', `(- T ${sum(b.map(num))})`);
  // Growing (free >= 0): no max, so no freezing (CSS Flexbox §9.7; a factor sum below 1 takes that share).
  c.items.forEach((_, k) => def(`grow_${k}`, !grows.length || g[k] === 0 ? num(b[k]) : `(+ ${num(b[k])} (* free ${gAtLeastOne ? `(/ ${num(g[k])} ${sum(g.filter(v => v > 0).map(num))})` : num(g[k])}))`));
  // Shrinking (free < 0): one level t for all, each item clamped at its min (the result of §9.7's freezing loop when
  // only min-width clamps): size_k = max(min_k, basis_k - scaled_k * t), sum = T; all at their floor when that is not reachable.
  lines.push('(declare-const t Real)');
  c.items.forEach((_, k) => def(`shrink_${k}`, sc[k] ? max(num(m[k]), `(- ${num(b[k])} (* ${times(shrinks[k], b[k])} t))`) : num(b[k])));
  const floor = sum(c.items.map((_, k) => num(sc[k] ? m[k] : b[k])));
  // Every rational is exact in SMT (no float division here: 20 / 60 as a double is not 1/3).
  const tMax = c.items.reduce((acc, _, k) => sc[k] ? max(acc, `(/ (- ${num(b[k])} ${num(m[k])}) ${times(shrinks[k], b[k])})`) : acc, '0.0');
  facts.push(`(>= t 0.0)`, `(=> (>= free 0.0) (= t 0.0))`,
    `(=> (< free 0.0) (ite (> ${floor} T) (= t ${tMax}) (= ${sum(c.items.map((_, k) => `shrink_${k}`))} T)))`);
  c.items.forEach((_, k) => def(`w_${k}`, `(ite (>= free 0.0) grow_${k} shrink_${k})`));
  def('L', `(- T ${sum(c.items.map((_, k) => `w_${k}`))})`);
  const j = c.justify ?? 'flex-start';
  const lead = { 'flex-start': '0.0', start: '0.0', normal: '0.0', 'flex-end': 'L', end: 'L', center: '(/ L 2.0)', 'space-between': '0.0',
    'space-around': `(/ L ${num(2 * n)})`, 'space-evenly': `(/ L ${num(n + 1)})` }[j];
  const between = { 'space-between': n > 1 ? `(/ L ${num(n - 1)})` : '0.0', 'space-around': `(/ L ${num(n)})`, 'space-evenly': `(/ L ${num(n + 1)})` }[j] ?? '0.0';
  if (lead === undefined) outOfSubset(`justify-content: ${j}`);
  // A negative leftover: only the values that fall back to the start are in L1 (space-between falls back to flex-start).
  defB('mainOk', ['flex-start', 'start', 'normal', 'space-between'].includes(j) ? 'true' : '(>= L 0.0)');
  c.items.forEach((_, k) => def(`x_${k}`, k === 0
    ? `(ite (< L 0.0) 0.0 ${lead})`
    : `(+ x_${k - 1} w_${k - 1} ${num(gap)} (ite (< L 0.0) 0.0 ${between}))`));
  c.items.forEach((it, k) => {
    const how = it.align ?? c.alignItems ?? 'stretch', autoH = it.height === undefined || it.height === 'auto';
    if (!['stretch', 'flex-start', 'start', 'center', 'flex-end', 'end'].includes(how)) outOfSubset(`align-self: ${how}`);
    if (autoH && how !== 'stretch') outOfSubset(`item ${k}: height auto with align-self ${how} sizes to content`);
    const h = autoH ? H : px(it.height, `item ${k} height`);
    def(`h_${k}`, num(h));
    const y = how === 'center' ? (H - h) / 2 : ['flex-end', 'end'].includes(how) ? H - h : 0;
    def(`y_${k}`, num(y));
    defB(`ok_${k}`, `(and mainOk ${['center', 'flex-end', 'end'].includes(how) && h > H ? 'false' : 'true'})`);
  });
  return { kind: 'flex', count: n, smt: ['(declare-const W Real)', ...lines].join('\n'), facts };
}

export const spec = c => c.display === 'grid' ? gridSpec(c) : flexSpec(c);

// The CSS a configuration means (for the browsers and the engine). Items carry the classes i0, i1, …
export function toCSS(c) {
  const len = v => `${v}px`;
  if (c.display === 'grid') {
    const css = [`.c{display:grid;grid-template-columns:${c.columns.map(t => 'px' in t ? len(t.px) : `minmax(0,${t.fr}fr)`).join(' ')};grid-template-rows:${c.rows.map(t => len(t.px)).join(' ')};column-gap:${len(c.columnGap ?? 0)};row-gap:${len(c.rowGap ?? 0)}}`];
    c.items.forEach((it, k) => css.push(`.i${k}{grid-column:${it.column[0]}/${it.column[1]};grid-row:${it.row[0]}/${it.row[1]};justify-self:${it.justify ?? 'stretch'};align-self:${it.align ?? 'stretch'}${it.width !== undefined && it.width !== 'auto' ? `;width:${len(it.width)}` : ''}${it.height !== undefined && it.height !== 'auto' ? `;height:${len(it.height)}` : ''}}`));
    return css.join('');
  }
  const css = [`.c{display:flex;flex-direction:row;flex-wrap:nowrap;height:${len(c.height)};column-gap:${len(c.gap ?? 0)};justify-content:${c.justify ?? 'flex-start'};align-items:${c.alignItems ?? 'stretch'}}`];
  c.items.forEach((it, k) => css.push(`.i${k}{flex:${it.grow ?? 0} ${it.shrink ?? 1} ${len(it.basis)};min-width:${len(it.min ?? 0)}${it.align ? `;align-self:${it.align}` : ''}${it.height !== undefined && it.height !== 'auto' ? `;height:${len(it.height)}` : ''}}`));
  return css.join('');
}
export const toHTML = c => `<div class="c">${c.items.map((_, k) => `<div class="i${k}"></div>`).join('')}</div>`;
