// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Table-to-grid lowering: fixed/automatic columns, rowspan and caption geometry.
import { q, add, sub, mul, cmp, div, number } from './linear.mjs';
import type { Rational } from './linear.mjs';
import { scalar, sum, diff, times, evaluate, sample, clip } from './region.mjs';
import type { Affine2, Region } from './region.mjs';
import { px } from './css.mjs';
import { tracks as gridTracks } from './grid.mjs';
import type {SolverBox,SolverStyle,SolverAncestor} from './engine-solver-types.mjs';
import type { EngineBoxContract } from './input.mjs';

const zero = q(0);
type Side = 'left' | 'right' | 'top' | 'bottom';
export type TableStyle=SolverStyle;
type BlockProfile = NonNullable<EngineBoxContract['intrinsicBlockSize']>;
type ProfileEntries = Exclude<BlockProfile, number>;
interface CellArea {column: number; row: number; span: number; down: number}
export interface TableMetadata {
  tableAt?: CellArea; tableArea?: CellArea; tablePart?: boolean; tableCell?: boolean; tableFlow?: boolean;
  tableRowSpan?: number; tableBaselineTop?: boolean; tableBaselineShift?: Rational;
  tableBaselineGroup?: {row: number; style: TableStyle; text?: Rational};
  tableMeasuredSpan?: boolean; tableStackedSpan?: Rational; tableStretch?: boolean;
  stackedProfiles?: {profile: ProfileEntries; edges: Rational; sideEdges: Rational}[];
  tableCaption?: {columns: number; rows: number; side: string; interleaved?: {columns: number; row: number}};
}
interface ColumnRange {min: Rational; max: Rational; fixed?: Rational}
interface Span {cell: TableBox; row: TableBox; r: number; n: number; min: Rational}
type TableBox=SolverBox;
type TableAncestor=SolverAncestor
interface TableStylePiece {region: Region; style: TableStyle}
export interface TableProbe {inner: Affine2; thresholds: Rational[]}
interface TableContext {
  uaEngine?: string | undefined;
  styles: (box: TableBox, region: Region, parents: readonly TableAncestor[], inherited: TableStyle, emit: boolean, gridItem: boolean) => readonly TableStylePiece[];
}
  // Fixed table layout (CSS 2.2 §17.5.2.1) as a grid, measured equal in Chromium: column widths
  // from the first row (px widths share the width in proportion, auto columns take the rest),
  // border-spacing as gaps and as an inset inside the padding, rows as tall as their tallest cell.
export function tableAsGrid({styles, uaEngine}: TableContext, table: TableBox, style: TableStyle, region: Region, parents: readonly TableAncestor[], emit: boolean, available: {inline?: Affine2 | undefined} | undefined, probe?: TableProbe[]): TableStyle {
    const fail = (message: string): never => { throw Object.assign(new Error(message), { code: 'U_LAYOUT_TABLE' }); };
    // Table layout is modeled as Chromium lays tables out (measured); Firefox and WebKit share rowspan heights and
    // automatic column widths differently, and WebKit sizes fixed tables differently (docs/css-baseline.md).
    if (uaEngine && uaEngine !== 'chromium') throw Object.assign(new Error(`${table.label}: table layout is modeled as Chromium lays tables out; ${uaEngine} shares rowspan heights and column widths differently`), { code: 'U_LAYOUT_BROWSER' });
    // Automatic layout equals the fixed one (measured) when content cannot widen a column: every cell
    // is empty or its content's min-content bound fits its px column, no spans or caption, and
    // at most one (empty) auto column, which needs an explicit table width; an auto width is the sum.
    const automatic = style['table-layout'] !== 'fixed';
    // The collapsing border model (CSS 2.2 §17.6.2) without any border is the separated model with no spacing: borders
    // of 0 collapse to 0, border-spacing does not apply, and the table has no padding (measured equal in Chromium).
    // With a border on the table, a row group, a row or a cell, the shared borders are not modeled.
    if (style['border-collapse'] === 'collapse') {
      const zero = (v: unknown) => ['0', '0px', 'none'].includes(String(v));
      const sides = ['top', 'right', 'bottom', 'left'] as const;
      if (!sides.every(side => zero(style[`border-${side}`]))) fail('border-collapse: collapse with a border on the table is not modeled (shared borders)');
      if (!sides.every(side => zero(style[`padding-${side}`]))) fail('border-collapse: collapse with padding on the table is not modeled (the browser ignores it)');
      const parts = (table.children ?? []).flatMap(section => [section, ...(section.children ?? []).flatMap(row => [row, ...(row.children ?? [])])]).filter(part => part.tag !== 'caption');
      for (const part of parts) for (const st of styles(part, region, parents, style, false, false)) if (!sides.every(side => zero(st.style[`border-${side}`]))) fail(`border-collapse: collapse with a border on ${part.label} is not modeled (shared borders)`);
      style = { ...style, 'border-spacing': '0' };
    }
    else if (style['border-collapse'] !== 'separate') fail(`border-collapse: ${style['border-collapse']} is not modeled`);
    if (style['inline-size'] === 'auto' && !automatic) fail('A fixed table needs an explicit inline-size');
    const caption = table.children?.[0]?.tag === 'caption' ? table.children[0]! : null;
    const sections = (table.children ?? []).slice(caption ? 1 : 0);
    if (sections.some(section => !['thead', 'tbody', 'tfoot'].includes(section.tag))) fail('A modeled table holds an optional first caption, then thead, tbody and tfoot (no colgroup)');
    if (sections.findIndex(s => s.tag === 'tfoot') >= 0 && sections.findIndex(s => s.tag === 'tfoot') !== sections.length - 1) fail('tfoot must come last (it renders after the bodies)');
    const rows = sections.flatMap(section => section.children ?? []);
    if (!rows.length || rows.some(row => row.tag !== 'tr' || !(row.children ?? []).length || row.children.some(cell => !['td', 'th'].includes(cell.tag)))) fail('Every row is a tr of td/th cells');
    const spanOf = (cell: TableBox): number => { if (cell.colSpan === 'dynamic' || cell.rowSpan === 'dynamic') return fail('A dynamic colspan/rowspan decides the cells'); return cell.colSpan ?? 1; };
    const columns = rows[0]!.children.map(spanOf).reduce((a, b) => a + b, 0);
    // Occupancy: a rowspan cell takes its columns in the following rows of its row group.
    const taken = new Map<string, boolean>();
    for (const section of sections) {
      const groupRows = section.children ?? [];
      groupRows.forEach((row, r) => {
        let column = 0;
        const busy = (c: number) => taken.get(`${row.path}:${c}`);
        for (const cell of row.children) {
          while (busy(column)) column++;
          const n = spanOf(cell), down = cell.rowSpan === 'dynamic' ? fail('A dynamic colspan/rowspan decides the cells') : cell.rowSpan ?? 1;
          if (r + down > groupRows.length) fail('A rowspan past the end of its row group is not modeled');
          for (let k = 0; k < down; k++) for (let c = column; c < column + n; c++) taken.set(`${groupRows[r + k]!.path}:${c}`, true);
          if (down > 1) cell.tableRowSpan = down;
          cell.tableAt = { column, row: rows.indexOf(row), span: n, down };
          column += n;
        }
      });
    }
    if (rows.some(row => Array.from({ length: columns + 1 }, (_, c) => taken.get(`${row.path}:${c}`)).filter(Boolean).length !== columns)) fail('Every row needs the same number of columns (cells, colspan and rowspan)');
    // A td/th restyled away from table-cell is wrapped in an anonymous cell (its spans no longer apply), and a
    // display: none cell removes its column: neither is the modeled grid.
    for (const row of rows) for (const cell of row.children) for (const cs of styles(cell, region, parents, style, false, false))
      if (cs.style.display !== 'table-cell') fail(`${cell.label} has display: ${cs.style.display}; a modeled table needs its cells as table-cell`);
    // A cell with block-level children lays them out in block flow: with zero margins that is one start-aligned
    // column (a 1-column grid with align-content: start). The cell's vertical-align must not move it: top, or the
    // cell decides its row's height (the row's other cells are empty with an auto height, no rowspan in the table).
    const spanning = rows.some(row => row.children.some(cell => Number(cell.rowSpan ?? 1) > 1));
    for (const [r, row] of rows.entries()) for (const cell of row.children.filter(cell => (cell.children ?? []).length)) {
      const rowStyle = one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row))!, region, parents, style, false, false)), false, false));
      const cs = one(styles(cell, region, parents, rowStyle, false, false));
      if (cell.text) fail(`${cell.label} mixes text and child elements (inline formatting is not modeled)`);
      const alone = !spanning && row.children.every(other => other === cell || (!other.text && !other.contract && !(other.children ?? []).length && one(styles(other, region, parents, rowStyle, false, false))['block-size'] === 'auto'));
      // baseline: a cell without line boxes takes its content bottom as baseline, and the row's baseline cells are
      // bottom-aligned at the row's top (measured; empty cells take no part): the only non-empty one sits at the top.
      const soleBaseline = cs['vertical-align'] === 'baseline' && !spanning && row.children.every(other => other === cell || (!other.text && !other.contract && !(other.children ?? []).length) || one(styles(other, region, parents, rowStyle, false, false))['vertical-align'] !== 'baseline');
      if (soleBaseline) cell.tableBaselineTop = true;
      else if (cs['vertical-align'] === 'baseline' && !spanning) cell.tableBaselineGroup = { row: r, style: cs };
      else if (!['top', 'middle', 'bottom'].includes(cs['vertical-align']) && !(alone && cs['block-size'] === 'auto')) fail(`${cell.label} has vertical-align: ${cs['vertical-align']} with other baseline cells in its row; baseline alignment across cells is not modeled`);
      for (const child of cell.children) for (const c of styles(child, region, parents, cs, false, false)) {
        if (c.style.display === 'none') continue;
        if (!['block', 'grid', 'flex'].includes(c.style.display) || c.style.position !== 'static' || c.style.float !== 'none') fail(`${child.label} in a table cell must be a static block-level box (block flow of inline content is not modeled)`);
      }
      cell.tableFlow = true;
    }
    // Several baseline cells with content: each baseline is padding-top + content height (no line boxes); with px
    // children the heights are constants, and each cell moves down by (largest baseline − its own).
    const contentHeight = (cell: TableBox): Rational => (cell.children ?? []).map(child => {
      const cs = one(styles(child, region, parents, cell.tableBaselineGroup!.style, false, false));
      if (cs.display === 'none') return zero;
      if (!/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) fail(`${child.label}: baseline-aligned cells are modeled when their children have px heights`);
      const edges = (['top', 'bottom'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
      return cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']);
    }).reduce(add, zero);
    // Text cells: the first line's baseline is floor((L − (A + D)) / 2) + A with Chromium's rounded ascent A and
    // descent D (measured); an odd negative leading rounds ambiguously, so it is Unknown.
    for (const row of rows) {
      const rowStyle = one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row))!, region, parents, style, false, false)), false, false));
      for (const cell of row.children.filter(cell => cell.text && !(cell.children ?? []).length && !cell.tableRowSpan)) {
        const cs = one(styles(cell, region, parents, rowStyle, false, false));
        if (cs['vertical-align'] !== 'baseline') continue;
        const metrics = cell.contract?.textMetrics, L = cell.contract?.font?.lineHeight;
        if (spanning || !metrics || !('baseline' in metrics) || !metrics.baseline || !L) return fail(`${cell.label}: a baseline-aligned text cell needs font-derived text metrics (its first baseline)`);
        const leading = L - metrics.baseline.ascent - metrics.baseline.descent;
        if (leading < 0 && leading % 2) fail(`${cell.label}: an odd negative leading rounds the baseline ambiguously`);
        cell.tableBaselineGroup = { row: rows.indexOf(row), style: cs, text: q(String(Math.floor(leading / 2) + metrics.baseline.ascent)) };
      }
    }
    for (const [r, row] of rows.entries()) {
      const group = row.children.filter(cell => cell.tableBaselineGroup);
      if (!group.length) continue;
      const baselines = group.map(cell => add(px(cell.tableBaselineGroup!.style['padding-top']), cell.tableBaselineGroup!.text ? cell.tableBaselineGroup!.text : contentHeight(cell)));
      const top = baselines.reduce((a, b) => cmp(a, b) >= 0 ? a : b);
      group.forEach((cell, i) => {
        cell.tableBaselineShift = sub(top, baselines[i]!);
        // A moved cell with a fixed height could need a taller row (the table grows it, the grid would not): Unknown.
        if (cmp(cell.tableBaselineShift, zero) > 0 && cell.tableBaselineGroup!.style['block-size'] !== 'auto') fail(`${cell.label}: a baseline-shifted cell with a fixed block-size is not modeled`);
      });
    }
    for (const box of [...sections, ...rows]) box.tablePart = true;
    // min/max sizes on a table cell have no defined effect in CSS 2.2 (§17.5.2). Measured in Chromium, Firefox and WebKit:
    // min/max-height do nothing (F43, dropped in css.mjs); min/max-width do nothing in a fixed table, but in an automatic
    // table they bound the column (td { max-width: 20px } narrows a column of wrapping text). A table's min/max height is
    // spread over its rows (measured:
    // .t { min-height: 100px } makes 20px cells 100px). Neither is modeled.
    const sizeBound = (st: TableStyle, keys: readonly string[]) => keys.find(key => st.$sources?.[key] && !['auto', 'none', '0', '0px'].includes(String(st[key])));
    const tableBound = sizeBound(style, ['min-block-size', 'max-block-size']);
    if (tableBound) fail(`${table.label}: ${tableBound} on a table spreads over its rows, which is not modeled; size the cells instead`);
    for (const row of rows) for (const rs of styles(row, region, parents, style, false, false)) for (const cell of row.children) for (const c of styles(cell, rs.region, parents, rs.style, false, false)) {
      const key = sizeBound(c.style, ['min-block-size', 'max-block-size', 'min-inline-size', 'max-inline-size']);
      if (key) fail(`${cell.label}: ${key} on a table cell sizes the column in ways that are not modeled (in an automatic table it bounds the column; in a fixed one it does nothing); give the cell a block-size or inline-size`);
    }
    // A row's or row group's height sets the rows' height (CSS 2.2 §17.5.3; measured: tr { height: 50px } makes 20px cells
    // a 50px row; its width does not change the columns, reported as inert below),
    // and its background paints under the cells; neither is modeled (rows lay out as display: contents).
    for (const part of [...sections, ...rows]) for (const ps of styles(part, region, parents, style, false, false)) {
      const sized = (['block-size', 'min-block-size', 'max-block-size'] as const).find(key => ps.style.$sources?.[key] && !['auto', 'none', '0', '0px'].includes(String(ps.style[key])));
      if (sized) fail(`${part.label}: ${sized} on a table ${rows.includes(part) ? 'row' : 'row group'} sets the rows' height, which is not modeled; size the cells instead`);
      if (ps.style.$sources?.['background-color'] && !['transparent', 'rgba(0, 0, 0, 0)'].includes(String(ps.style['background-color'])) || (ps.style.$sources?.['background-image'] && ps.style['background-image'] !== 'none')) fail(`${part.label}: a table ${rows.includes(part) ? 'row' : 'row group'} background paints under its cells, which is not modeled; set the background on the cells`);
    }
    for (const row of rows) for (const cell of row.children) cell.tableCell = true;
    // Cells stretch to their row: a fixed block-size must be shared by the row's cells (a grid item would not stretch).
    for (const row of rows) {
      const rs = styles(row, region, parents, style, false, false);
      const heights = new Set(row.children.filter(cell => !cell.tableRowSpan).map(cell => rs.flatMap(r => styles(cell, r.region, parents, r.style, false, false)).map(c => c.style['block-size']).join('|')));
      // With rowspan the rows become explicit tracks (the tallest cell) and cells stretch; otherwise a grid item would not.
      if (heights.size > 1 && !rows.some(row => row.children.some(cell => cell.tableRowSpan))) fail('Cells of one row with different block-size values are not modeled (table cells stretch to the row)');
    }
    const [horizontal, vertical] = String(style['border-spacing']).split(/\s+/).map(part => px(part));
    const h = horizontal!, v = vertical ?? h;
    // A rowspan cell is stretched over its rows; it must not size them (Chromium and grid distribute differently).
    for (const row of rows) for (const cell of row.children.filter(cell => cell.tableRowSpan)) {
      const block = new Set(styles(cell, region, parents, style, false, false).map(c => c.style['block-size']));
      const empty = !cell.text && !cell.contract && !(cell.children ?? []).length;
      // An auto-height text cell whose height profile is known at its (constant) width counts as that height.
      const measured = cell.text && !(cell.children ?? []).length && cell.contract?.intrinsicBlockSize !== undefined;
      // Children that are blocks of a px block-size stack: the cell's content height is their sum. A child's own
      // content (text or children) does not change its px height; its overflow is that child's layout to check.
      const stackedHeight = () => {
        // tableAsGrid runs more than once (a probe pass, then the layout): the profiles are recollected each time.
        cell.stackedProfiles = [];
        if (cell.text || cell.contract || !(cell.children ?? []).length) return null;
        // A stack: blocks of a px block-size, measured auto-height text leaves, and auto-height one-column grids
        // (no gaps, implicit rows) that are stacks themselves. `side` is the horizontal edges from the cell inward.
        const stack = (node: TableBox, nodeStyle: TableStyle, ancestors: readonly TableAncestor[], side: Rational): Rational | null => {
          let total = zero;
          for (const child of node.children) {
            if (child.tag === 'table' || child.tableCell) return null;
            const cs = one(styles(child, region, ancestors, nodeStyle, false, false));
            if (cs.display === 'none') continue;
            if (cs.position !== 'static' || (['margin-top', 'margin-bottom'] as const).some(key => !['0', '0px'].includes(cs[key]))) return null;
            const edges = (['top', 'bottom'] as const).map(key => add(px(cs[`padding-${key}`]), px(cs[`border-${key}`]))).reduce(add, zero);
            const sideEdges = add(side, (['left', 'right'] as const).map(key => add(px(cs[`padding-${key}`]), px(cs[`border-${key}`]))).reduce(add, zero));
            if (/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) { total = add(total, cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size'])); continue; }
            if (cs['block-size'] !== 'auto') return null;
            if (child.text && !(child.children ?? []).length && child.contract?.intrinsicBlockSize !== undefined) {
              // A line-count profile depends on the cell's width: measured later, with the column widths.
              if (typeof child.contract.intrinsicBlockSize === 'number') total = add(total, add(q(String(child.contract.intrinsicBlockSize)), edges));
              else cell.stackedProfiles!.push({ profile: child.contract.intrinsicBlockSize, edges, sideEdges });
              continue;
            }
            // A row flex (nowrap, items stretched): as tall as its tallest item, each a px height or a constant
            // measured text leaf.
            const itemHeight = (item: TableBox, itemStyle: TableStyle): Rational | null => {
              const e = (['top', 'bottom'] as const).map(key => add(px(itemStyle[`padding-${key}`]), px(itemStyle[`border-${key}`]))).reduce(add, zero);
              if (/^\d+(?:\.\d+)?px$/.test(itemStyle['block-size']) && !(item.children ?? []).length) return itemStyle['box-sizing'] === 'content-box' ? add(px(itemStyle['block-size']), e) : px(itemStyle['block-size']);
              if (itemStyle['block-size'] === 'auto' && item.text && !(item.children ?? []).length && typeof item.contract?.intrinsicBlockSize === 'number') return add(q(String(item.contract.intrinsicBlockSize)), e);
              return null;
            };
            const items = (child.children ?? []).map(item => ({ item, style: one(styles(item, region, [...ancestors, { box: child, style: cs }], cs, false, false)) })).filter(entry => entry.style.display !== 'none');
            if (cs.display === 'flex' && ['row', 'row-reverse'].includes(cs['flex-direction']) && cs['flex-wrap'] === 'nowrap' && !child.text && !child.contract && items.length) {
              const heights = items.map(({ item, style: itemStyle }) => (['margin-top', 'margin-bottom'] as const).every(key => ['0', '0px'].includes(itemStyle[key])) ? itemHeight(item, itemStyle) : null);
              if (heights.some(h => h === null)) return null;
              total = add(total, add(heights.map(h => h!).reduce((a, b) => cmp(a, b) >= 0 ? a : b), edges));
              continue;
            }
            // A grid with px rows only and every item in its declared cells: the rows and gaps are its height.
            if (cs.display === 'grid' && cs['grid-template-rows'] !== 'none' && !child.text && !child.contract) {
              let rowList, columnCount;
              try { rowList = gridTracks(cs['grid-template-rows']); columnCount = cs['grid-template-columns'] === 'none' ? 1 : gridTracks(cs['grid-template-columns']).length; } catch { return null; }
              if (rowList.some(t => t.fixed === undefined) || items.length > rowList.length * columnCount || items.some(({ style: itemStyle }) => itemStyle['grid-row'] !== 'auto' || itemStyle['grid-column'] !== 'auto')) return null;
              const gap = ['0', 'normal'].includes(cs['row-gap']) ? zero : px(cs['row-gap']);
              total = add(total, add(add(rowList.map(t => t.fixed!).reduce(add, zero), mul(gap, q(rowList.length - 1))), edges));
              continue;
            }
            // One-column grids (implicit auto rows) and column flexes (nowrap, stretched items) of auto height stack their
            // items too, with a px row gap between them: an auto-height column flex has no free space to grow or shrink.
            const pxGap = ['0', '0px', 'normal'].includes(cs['row-gap']) ? zero : /^\d+(?:\.\d+)?px$/.test(cs['row-gap']) ? px(cs['row-gap']) : null;
            const oneColumn = cs.display === 'grid' && ['none', 'minmax(0,1fr)', '1fr', 'auto'].includes(String(cs['grid-template-columns']).replace(/\s+/g, '')) && cs['grid-template-rows'] === 'none' && ['auto', undefined].includes(cs['grid-auto-rows']) && pxGap !== null;
            const columnFlex = cs.display === 'flex' && cs['flex-direction'] === 'column' && cs['flex-wrap'] === 'nowrap' && ['normal', 'stretch'].includes(cs['align-items']) && pxGap !== null;
            if (child.text || child.contract || !(child.children ?? []).length || !(oneColumn || columnFlex)) return null;
            if (columnFlex && (child.children ?? []).some(item => { const st = one(styles(item, region, [...ancestors, { box: child, style: cs }], cs, false, false)); return !['auto', 'normal', 'stretch'].includes(st['align-self']) || st.order !== '0' || st['flex-basis'] !== 'auto'; })) return null;
            const inner = stack(child, cs, [...ancestors, { box: child, style: cs }], sideEdges);
            if (inner === null) return null;
            const shown = (child.children ?? []).filter(item => one(styles(item, region, [...ancestors, { box: child, style: cs }], cs, false, false)).display !== 'none').length;
            total = add(total, add(add(inner, mul(pxGap!, q(Math.max(0, shown - 1)))), edges));
          }
          return total;
        };
        return stack(cell, style, [...parents, { box: cell, style }], zero);
      };
      const stacked = [...block][0] === 'auto' && !empty && !measured ? stackedHeight() : null;
      if (block.size !== 1 || !(([...block][0] === 'auto' && (empty || measured || stacked !== null)) || /^\d+(?:\.\d+)?px$/.test([...block][0]!))) fail('A rowspan cell is modeled when it is empty, measured text or a stack of px-height blocks with block-size: auto, or has a px block-size');
      if ([...block][0] === 'auto' && measured) cell.tableMeasuredSpan = true;
      if (stacked !== null) cell.tableStackedSpan = stacked; else delete cell.stackedProfiles;
    }
    // The first row's cell widths decide the columns.
    function one(list: readonly TableStylePiece[]): TableStyle { if (list.length !== 1) fail('Table styles that vary across viewport regions are not modeled'); return list[0]!.style; }
    const sectionStyle = one(styles(sections[0]!, region, parents, style, false, false)), rowStyle = one(styles(rows[0]!, region, parents, sectionStyle, false, false));
    // A first-row cell spanning n columns gives each (w − (n − 1)·spacing) / n (measured).
    const widths = rows[0]!.children.flatMap((cell): (Rational | null)[] => {
      const cs = one(styles(cell, region, parents, rowStyle, false, false)), n = spanOf(cell);
      if (cs['inline-size'] === 'auto') return new Array<Rational | null>(n).fill(null);
      if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Fixed table column widths must be px or auto');
      const edges = (['left', 'right'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
      const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), edges) : px(cs['inline-size']);
      const each = div(sub(w, mul(h, q(n - 1))), q(n));
      if (cmp(each, zero) <= 0) fail('A spanning cell narrower than its inner spacing is not modeled');
      return new Array<Rational | null>(n).fill(each);
    });
    // Column widths of a px-wide fixed table are constants (as the grid resolves them): px columns share the content
    // width in proportion, or keep their px and auto columns split the rest equally.
    // Column widths as affine functions of the viewport: constants for a px width, or from the containing width for an
    // auto (stretched in a grid area) or 100% border-box table.
    const columnWidths = () => {
      const frame = (['left', 'right'] as const).map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero);
      let outer: Affine2;
      if (!automatic && /^\d+(?:\.\d+)?px$/.test(style['inline-size'])) outer = scalar(style['box-sizing'] === 'content-box' ? add(px(style['inline-size']), frame) : px(style['inline-size']));
      else if (!automatic && style['box-sizing'] === 'border-box' && available?.inline && (style['inline-size'] === '100%' || (style['inline-size'] === 'auto' && parents.at(-1)?.style.display === 'grid'))) outer = available.inline;
      else return fail('A measured rowspan cell needs a fixed table with a px, 100% or grid-stretched width (its width decides its height)');
      const content = diff(outer, scalar(add(frame, mul(h, q(columns + 1)))));
      const fixed = widths.filter((w): w is Rational => w !== null).reduce(add, zero), autos = widths.filter(w => !w).length;
      if (clip(region, diff(scalar(fixed), content), true)) fail('A measured rowspan cell in a table narrower than its px columns is not modeled');
      return widths.every(Boolean) ? widths.map(w => times(content, div(w!, fixed))) : widths.map(w => w ? scalar(w) : times(diff(content, scalar(fixed)), div(q(1), q(autos))));
    };
    function cellInner(cell: TableBox, cs: TableStyle): Affine2 {
      const at = cell.tableAt!, cols = columnWidths().slice(at.column, at.column + at.span).reduce((a, b) => sum(a, b));
      return diff(sum(cols, scalar(mul(h, q(at.span - 1)))), scalar((['left', 'right'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero)));
    }
    // The height of a line-count profile at an inner width (the caller splits the region at the profile's widths).
    function profileHeight(profile: BlockProfile, inner: Affine2): Rational {
      if (typeof profile === 'number') return q(String(profile));
      probe?.push({ inner, thresholds: profile.map(e => q(String(e.atLeastInlineSize))) });
      const width = evaluate(inner, sample(region));
      const entry = profile.filter(e => cmp(q(String(e.atLeastInlineSize)), width) <= 0).at(-1);
      if (!entry || entry.blockSize === null) return fail('The measured rowspan cell has no known height at its width');
      return q(String(entry.blockSize));
    }
    const stackedMin = (cell: TableBox, cs: TableStyle) => (cell.stackedProfiles ?? []).reduce((total, child) => add(total, add(profileHeight(child.profile, diff(cellInner(cell, cs), scalar(child.sideEdges))), child.edges)), cell.tableStackedSpan!);
    function measuredHeight(cell: TableBox, cs: TableStyle, r: number): Rational {
      const at = cell.tableAt!, cols = columnWidths().slice(at.column, at.column + at.span).reduce((a, b) => sum(a, b));
      const inner = diff(sum(cols, scalar(mul(h, q(at.span - 1)))), scalar((['left', 'right'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero)));
      const profile = cell.contract!.intrinsicBlockSize!;
      if (typeof profile === 'number') return q(String(profile));
      // The caller splits the region at the profile's widths, so the entry is the same everywhere in it.
      probe?.push({ inner, thresholds: profile.map(e => q(String(e.atLeastInlineSize))) });
      const width = evaluate(inner, sample(region));
      const entry = profile.filter(e => cmp(q(String(e.atLeastInlineSize)), width) <= 0).at(-1);
      if (!entry || entry.blockSize === null) return fail('The measured rowspan cell has no known height at its width');
      return q(String(entry.blockSize));
    }
    // With a rowspan the rows become explicit tracks: each row's other cells give its px height (border box).
    let rowTracks: Rational[] | null = null;
    let rowTrackTokens: string[] | null = null;
    if (rows.some(row => row.children.some(cell => cell.tableRowSpan))) rowTracks = rows.map(row => {
      const own = row.children.filter(cell => !cell.tableRowSpan);
      if (!own.length) return zero;
      const rowStyle = one(styles(row, region, parents, style, false, false));
      return own.map(cell => {
        const cs = one(styles(cell, region, parents, rowStyle, false, false));
        if (!/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) fail('With rowspan, every row needs cells with a px block-size');
        const edges = (['top', 'bottom'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        return cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']);
      }).reduce((a, b) => cmp(a, b) >= 0 ? a : b);
    });
    // A taller rowspan cell grows its rows in proportion to their heights (all to the last row when they are 0),
    // each share floored to 1/64px and the rest to the last row (measured in Chromium). Spans may not overlap.
    if (rowTracks) {
      // Chromium's RowspanCell order (table_layout_algorithm_types.h, the legacy height-distribution order):
      // same rows → larger min block size first; a span enclosed in another first; else the lower start row.
      // It is not a strict weak order in general, so it is used only where it is consistent on these spans.
      const spans: Span[] = rows.flatMap((row, r) => row.children.filter(cell => cell.tableRowSpan).map(cell => {
        const cs = one(styles(cell, region, parents, one(styles(row, region, parents, style, false, false)), false, false));
        const edges = (['top', 'bottom'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        const min = cs['block-size'] !== 'auto' ? (cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size'])) : cell.tableMeasuredSpan ? add(measuredHeight(cell, cs, r), edges) : cell.tableStackedSpan !== undefined ? add(stackedMin(cell, cs), edges) : zero;
        return { cell, row, r, n: cell.tableRowSpan!, min };
      }));
      const inside = (a: Span, b: Span) => a.r >= b.r && a.r + a.n <= b.r + b.n;
      const before = (a: Span, b: Span) => a.r === b.r && a.n === b.n ? cmp(a.min, b.min) > 0 : inside(a, b) ? true : inside(b, a) ? false : a.r < b.r;
      for (const a of spans) for (const b of spans) for (const c of spans) if (before(a, b) && before(b, c) && !before(a, c)) fail('These rowspan cells have no consistent Chromium distribution order');
      for (const a of spans) for (const b of spans) if (a !== b && before(a, b) && before(b, a)) fail('These rowspan cells have no consistent Chromium distribution order');
      const ordered = [...spans].sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0);
      for (const { cell, row, r, n } of ordered) {
        const cs = one(styles(cell, region, parents, one(styles(row, region, parents, style, false, false)), false, false));
        if (cs['block-size'] === 'auto' && !cell.tableMeasuredSpan && cell.tableStackedSpan === undefined) continue;
        const edges = (['top', 'bottom'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        const target = sub(spans.find(sp => sp.cell === cell)!.min, mul(v, q(n - 1)));
        const spanned = rowTracks.slice(r, r + n), total = spanned.reduce(add, zero);
        if (cmp(target, total) <= 0) continue;
        // Chromium's DistributeExcessBlockSizeToRows for a rowspan (rows here all have fixed heights, so none is
        // unconstrained): (1) rows after the first that start a rowspan share the excess equally; else (2) all rows
        // empty: the last takes it; else (3) the non-empty rows grow in proportion to their heights. Shares are
        // LayoutUnits (1/64px, truncated); the last receiving row takes the remainder.
        const floor64 = (value: Rational) => div(q(String(Math.floor(number(mul(value, q(64))) + 1e-9))), q(64));
        const excess = sub(target, total), grown = [...spanned];
        const starting = spanned.map((_, k) => k).filter(k => k > 0 && spans.some(other => other.r === r + k));
        const nonEmpty = spanned.map((h, k) => k).filter(k => cmp(spanned[k]!, zero) > 0);
        const share = (receivers: readonly number[], weight: (k: number) => Rational) => {
          let given = zero;
          receivers.forEach((k, i) => {
            const part = i === receivers.length - 1 ? sub(excess, given) : floor64(weight(k));
            grown[k] = add(grown[k]!, part); given = add(given, part);
          });
        };
        if (starting.length) share(starting, () => div(excess, q(starting.length)));
        else if (!nonEmpty.length) share([n - 1], () => excess);
        else share(nonEmpty, k => div(mul(spanned[k]!, excess), total));
        rowTracks.splice(r, n, ...grown);
      }
      rowTrackTokens = rowTracks.map(value => `${number(value)}px`);
      // With explicit row tracks every cell stretches to its rows (its own height is in the track).
      for (const row of rows) for (const cell of row.children) cell.tableStretch = true;
    }
    // A caption sits outside the table box (above or below it, as wide as the table): an extra
    // grid row only when no border, padding or spacing separates the rows from the table edge.
    if (caption) {
      caption.tableCaption = { columns, rows: rows.length, side: one(styles(caption, region, parents, style, false, false))['caption-side'] };
    }
    let autoWidth = null, autoMinimum = null, contentTracks = null, contentShrink = null;
    if (automatic) {
      if (caption || rows.some(row => row.children.some(cell => Number(cell.colSpan ?? 1) > 1 || cell.tableRowSpan))) fail('Automatic table layout is modeled without captions, colspan or rowspan');
      const rowStyles = rows.map(row => one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row))!, region, parents, style, false, false)), false, false)));
      // Content-sized columns: no px widths at all, and every non-empty cell a leaf with trusted min- and max-content
      // widths (minInlineSize, maxInlineSize). Each column's range is its cells' widest (plus the cell edges).
      // Px columns may join (Chromium's auto table layout, measured): their range is [content minimum, px].
      // A cell holding only one empty static block of a px width (an icon button, a swatch): its min- and max-content
      // width is that width (plus the block's px margins).
      const sizedChild = (cell: TableBox): Rational | null => {
        if (cell.text || cell.contract || (cell.children ?? []).length !== 1) return null;
        const child = cell.children[0]!;
        if (child.text || child.contract || (child.children ?? []).length || child.inline?.length) return null;
        const sts = styles(child, region, parents, style, false, false);
        const widths = new Set(sts.map(st => st.style.display === 'block' && st.style.position === 'static' && /^\d+(?:\.\d+)?px$/.test(String(st.style['inline-size'])) && (['margin-left', 'margin-right'] as const).every(k => ['0', '0px'].includes(String(st.style[k]))) && (st.style['box-sizing'] === 'border-box' || (['left', 'right'] as const).every(side => ['0', '0px', 'ua'].includes(String(st.style[`padding-${side}`])) && ['0', '0px'].includes(String(st.style[`border-${side}`])))) ? st.style['inline-size'] : null));
        return widths.size === 1 && [...widths][0] ? px([...widths][0]!) : null;
      };
      const leafWith = (cell: TableBox, auto: boolean) => sizedChild(cell) !== null || (!(cell.children ?? []).length && cell.contract?.minInlineSize !== undefined && (!auto || cell.contract?.maxInlineSize !== undefined));
      const emptyCell = (cell: TableBox) => !cell.text && !cell.contract && !(cell.children ?? []).length;
      const contentColumns = widths.some(w => !w) && rows.every(row => row.children.every((cell, c) => emptyCell(cell) || leafWith(cell, !widths[c]!))) && (widths.every(w => !w) || rows.some(row => row.children.some((cell, c) => !widths[c]! && !emptyCell(cell))));
      const ranges: ColumnRange[] | null = contentColumns ? Array.from({ length: columns }, () => ({ min: zero, max: zero })) : null;
      rows.forEach((row, r) => row.children.forEach((cell, c) => {
        const cs = one(styles(cell, region, parents, rowStyles[r]!, false, false));
        if (contentColumns) {
          const cellEdges = (['left', 'right'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          if (cs['inline-size'] !== 'auto') {
            if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Automatic table column widths must be px or auto');
            const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), cellEdges) : px(cs['inline-size']);
            if (!widths[c]! || cmp(w, widths[c]!) !== 0) fail('In automatic table layout every px width of a column must be the first row\'s');
          }
          if (widths[c]!) ranges![c]!.fixed = widths[c]!;
          const sized = sizedChild(cell);
          const lo = add(sized ?? q(String(cell.contract?.minInlineSize ?? 0)), cellEdges), hi = add(sized ?? q(String(cell.contract?.maxInlineSize ?? 0)), cellEdges);
          if (cmp(lo, ranges![c]!.min) > 0) ranges![c]!.min = lo;
          if (cmp(hi, ranges![c]!.max) > 0) ranges![c]!.max = hi;
          return;
        }
        if (cs['inline-size'] !== 'auto') {
          if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Automatic table column widths must be px or auto');
          const edges = (['left', 'right'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), edges) : px(cs['inline-size']);
          if (!widths[c]! || cmp(w, widths[c]!) !== 0) fail('In automatic table layout every px width of a column must be the first row\'s');
        }
        const empty = !cell.text && !cell.contract && !(cell.children ?? []).length;
        if (!empty) {
          if (!widths[c]!) fail('An automatic table column without a px width is sized by its content');
          const edges = (['left', 'right'] as const).map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          if (cell.contract?.minInlineSize === undefined || (cell.children ?? []).length || cmp(q(String(cell.contract.minInlineSize)), sub(widths[c]!, edges)) > 0)
            fail('In automatic table layout a cell needs a min-content bound (minInlineSize) that fits its px column');
        }
      }));
      const autos = widths.filter(w => !w).length;
      if (autos > 1 && !contentColumns) fail('Several auto columns share the extra width by content; not modeled');
      const edges = add(add(add(px(style['padding-left']), px(style['padding-right'])), add(px(style['border-left']), px(style['border-right']))), mul(h, q(columns + 1)));
      // An auto width stretches in a grid area (measured) and shrinks to fit at the root (block flow).
      const parentDisplay = parents.at(-1)?.style.display;
      if (style['inline-size'] === 'auto' && parentDisplay === 'flex') fail('An automatic table with an auto width in a flex container is sized by content');
      if (contentColumns) {
        for (const range of ranges!) { if (cmp(range.max, range.min) < 0) range.max = range.min; if (range.fixed && cmp(range.fixed, range.min) < 0) range.fixed = range.min; }
        if (style['inline-size'] === 'auto' && parentDisplay === 'flex') fail('An automatic table with an auto width in a flex container is sized by content');
        // An auto width outside a grid area shrinks to fit: as wide as the available width, at most its columns'
        // max-content widths plus its edges (a max-inline-size on the equivalent grid).
        if (style['inline-size'] === 'auto' && parentDisplay !== 'grid') contentShrink = add(ranges!.map(range => range.fixed ?? range.max).reduce(add, zero), edges);
        contentTracks = ranges!.map(range => range.fixed ? `-isle-auto-table-fixed(${number(range.min)},${number(range.fixed)})` : `-isle-auto-table(${number(range.min)},${number(range.max)})`).join(' ');
      } else if (style['inline-size'] === 'auto' && parentDisplay === 'grid') autoMinimum = widths.filter((w): w is Rational => w !== null).reduce(add, zero);
      else if (style['inline-size'] === 'auto') {
        if (autos) fail('An automatic table with an auto column needs an explicit inline-size');
        autoWidth = add(widths.map(w => w!).reduce(add, zero), edges);
      } else autoMinimum = widths.filter((w): w is Rational => w !== null).reduce(add, zero);
    }
    const tracks = contentTracks ? contentTracks.split(' ') : widths.every(Boolean) ? widths.map(w => `minmax(0, ${number(w!)}fr)`) : widths.map(w => w ? `${number(w)}px` : 'minmax(0, 1fr)');
    const spacingEdges = { 'padding-left': add(px(style['padding-left']), h), 'padding-right': add(px(style['padding-right']), h), 'padding-top': add(px(style['padding-top']), v), 'padding-bottom': add(px(style['padding-bottom']), v) };
    // A content-box table's width includes the edge spacing (measured): the grid's content width is W − 2·spacing.
    let inlineSize = autoWidth ? `${number(autoWidth)}px` : style['inline-size'];
    if (autoWidth || contentShrink) style = { ...style, 'box-sizing': 'border-box', ...(contentShrink ? { 'max-inline-size': `${number(contentShrink)}px` } : {}) };
    else if (style['box-sizing'] === 'content-box') {
      if (!/^\d+(?:\.\d+)?px$/.test(inlineSize)) fail('A content-box fixed table needs a px inline-size');
      inlineSize = `${number(sub(px(inlineSize), add(h, h)))}px`;
    }
    // A caption with border-spacing: the caption spans the table's full width while the rows are inset, so the
    // spacing becomes explicit gap tracks (h c1 h c2 h; v r1 v r2 v) and every cell an explicit grid area.
    // The table's border and padding surround the rows but not the caption (measured): they join the edge tracks.
    const edge = (side: Side) => add(px(style[`padding-${side}`]), px(style[`border-${side}`]));
    if (caption && (cmp(h, zero) !== 0 || cmp(v, zero) !== 0 || (['left', 'right', 'top', 'bottom'] as const).some(side => cmp(edge(side), zero) !== 0))) {
      const top = caption.tableCaption!.side !== 'bottom', gapH = `${number(h)}px`, gapV = `${number(v)}px`, track = (value: Rational) => `${number(value)}px`;
      const rowList = rowTrackTokens ?? rows.map(() => 'auto');
      const rowTemplate = [track(add(edge('top'), v)), ...rowList.flatMap((t, i) => [t, i === rowList.length - 1 ? track(add(edge('bottom'), v)) : gapV])];
      // The caption is as wide as the table's border box; a content-box width excludes the border and padding.
      let width = style['inline-size'];
      if (style['box-sizing'] === 'content-box') {
        if (!/^\d+(?:\.\d+)?px$/.test(width)) fail('A content-box table with a caption needs a px inline-size');
        width = `${number(add(px(width), add(edge('left'), edge('right'))))}px`;
      }
      const columnTemplate = [track(add(edge('left'), h)), ...tracks.flatMap((t, i) => [t, i === tracks.length - 1 ? track(add(edge('right'), h)) : gapH])];
      const noEdges = Object.fromEntries((['left', 'right', 'top', 'bottom'] as const).flatMap(side => [[`padding-${side}`, '0'], [`border-${side}`, '0']]));
      caption.tableCaption = { ...caption.tableCaption!, interleaved: { columns: 2 * columns + 1, row: top ? 1 : rowTemplate.length + 1 } };
      for (const row of rows) for (const cell of row.children) cell.tableArea = { column: 2 * cell.tableAt!.column + 2, span: 2 * cell.tableAt!.span - 1, row: (top ? 3 : 2) + 2 * cell.tableAt!.row, down: 2 * cell.tableAt!.down - 1 };
      return { ...style, ...noEdges, 'box-sizing': 'border-box', 'inline-size': width, display: 'grid', 'grid-template-columns': columnTemplate.join(' '), 'grid-template-rows': (top ? ['auto', ...rowTemplate] : [...rowTemplate, 'auto']).join(' '),
        'grid-auto-rows': 'auto', 'column-gap': '0px', 'row-gap': '0px', tableColumns: automatic ? null : widths.every(Boolean) ? widths.map(w => w!).reduce(add, zero) : null,
        tableGaps: add(mul(h, q(columns + 1)), add(edge('left'), edge('right'))) };
    }
    const grid = { ...style, 'inline-size': inlineSize, display: 'grid', 'grid-template-columns': tracks.join(' '), 'grid-template-rows': rowTrackTokens ? (caption ? (caption.tableCaption!.side === 'bottom' ? [...rowTrackTokens, 'auto'] : ['auto', ...rowTrackTokens]).join(' ') : rowTrackTokens.join(' ')) : 'none', 'grid-auto-rows': 'auto', 'column-gap': `${number(h)}px`, 'row-gap': `${number(v)}px`,
      ...Object.fromEntries(Object.entries(spacingEdges).map(([key, value]) => [key, `${number(value)}px`])), tableColumns: automatic ? null : widths.every(Boolean) ? widths.map(w => w!).reduce(add, zero) : null, tableGaps: mul(h, q(columns - 1)),
      ...(autoWidth ? { tableShrink: autoWidth } : {}), ...(autoMinimum ? { tableAutoMinimum: autoMinimum } : {}) };
    return grid;
  }

export function tablePlacement(box: TableBox, style: TableStyle): TableStyle {
    if (box.tableCell && !box.tableFlow && style.display === 'table-cell' && box.tableBaselineShift) style = { ...style, 'padding-top': `${number(add(px(style['padding-top']), box.tableBaselineShift))}px`, 'vertical-align': 'top' };
    if (box.tableFlow && style.display === 'table-cell') style = { ...style, display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', ...(box.tableBaselineShift ? { 'padding-top': `${number(add(px(style['padding-top']), box.tableBaselineShift))}px` } : {}), 'align-content': box.tableBaselineTop || box.tableBaselineShift ? 'start' : (style['vertical-align'] === 'middle' ? 'center' : style['vertical-align'] === 'bottom' ? 'end' : undefined) ?? 'start', 'row-gap': '0', 'column-gap': '0', 'grid-auto-flow': 'row', $fromCell: true };
    if (box.tableCell && (style.display === 'table-cell' || style.$fromCell) && box.tableArea) return { ...style, display: style.$fromCell ? style.display : 'block', 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), 'grid-column': `${box.tableArea.column} / span ${box.tableArea.span}`, 'grid-row': `${box.tableArea.row} / span ${box.tableArea.down}` };
    if (box.tableCaption?.interleaved && style.display === 'table-caption') return { ...style, display: 'block', 'grid-column': `1 / span ${box.tableCaption.interleaved.columns}`, 'grid-row': String(box.tableCaption.interleaved.row) };
    if (box.tableCell && style.$fromCell) return { ...style, 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), ...(Number(box.colSpan) > 1 ? { 'grid-column': `span ${box.colSpan}` } : {}), ...(box.tableRowSpan ? { 'grid-row': `span ${box.tableRowSpan}` } : {}) };
    if (box.tableCell && style.display === 'table-cell') return { ...style, display: 'block', 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), ...(Number(box.colSpan) > 1 ? { 'grid-column': `span ${box.colSpan}` } : {}), ...(box.tableRowSpan ? { 'grid-row': `span ${box.tableRowSpan}` } : {}) };
    if (box.tableCaption && style.display === 'table-caption') return { ...style, display: 'block', 'grid-column': `1 / span ${box.tableCaption.columns}`, 'grid-row': String(box.tableCaption.side === 'bottom' ? box.tableCaption.rows + 1 : 1) };
    return style;
  }
