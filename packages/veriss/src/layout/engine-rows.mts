// Grid row tracks: intrinsic contributions and exact fr resolution.
import {q,cmp,add,div} from './linear.mjs';
import type {Rational} from './linear.mjs';
import {scalar,sum,times} from './region.mjs';
import type {Affine2,Region} from './region.mjs';
import {px} from './css.mjs';
import {tracks} from './grid.mjs';
import type {GridTrack,PlacedGridChild} from './grid.mjs';
import {trackArea} from './subgrid.mjs';
import {maximum} from './engine-edges.mjs';
import {scaleGap} from './engine-tracks.mjs';
import {subgridError} from './engine-positioning.mjs';
import type {createGridItemAllocator} from './engine-grid-items.mjs';
import type {createEdgeSolver} from './engine-edges.mjs';
import type {createTrackSolver} from './engine-tracks.mjs';
import type {SolverBox,SolverStyle,SolverChild,ChildState,SolverAncestor,SolveBox} from './engine-solver-types.mjs';
import type {DimensionValue} from './engine-types.mjs';
type PlacedChild=PlacedGridChild<SolverBox,SolverStyle> & Pick<SolverChild,'inherited'>;
type RowTrack=(GridTrack & {edges?:Rational;definite?:never}) | {definite:Affine2;auto?:never;weight?:never;autoMin?:never;fixed?:never;edges?:never};
type RowSolution={region:Region;values:Affine2[];required:Affine2;raised?:Affine2};
const zero=q(0),one=q(1);
const total=(values:readonly Affine2[])=>values.reduce(sum,scalar(0));
const requireLength=(v:Rational|null)=>{if(!v)throw new Error('Unresolved grid edge');return v;};
const requireBlock=(v:Affine2|null)=>{if(!v)throw new Error('Unresolved intrinsic row height');return v;};
export function measureGridRows({placed,style,sharedRows,children,knownBlock,blockFlowPercent,ancestors,solve,bounded,resolvedGap,flex,allocator,minBlock}:{
  placed:readonly PlacedChild[];style:SolverStyle;sharedRows?:{values:Affine2[];gap:DimensionValue}|undefined;children:ChildState;knownBlock:Affine2|null;
  blockFlowPercent:Affine2|null;ancestors:readonly SolverAncestor[];solve:SolveBox;
  bounded:<T>(values:T[])=>T[];resolvedGap:ReturnType<typeof createEdgeSolver>['resolvedGap'];flex:ReturnType<typeof createTrackSolver>['flex'];
  allocator:ReturnType<typeof createGridItemAllocator>;minBlock:((region:Region)=>{region:Region;value:Affine2}[])|null;
}) {
  const {areaInline,itemInline,autoMargins,marginBlock,childColumns,justified:justifyItem}=allocator;
  const rowCount = placed.length ? Math.max(...placed.map(item => item.row + item.rowSpan)) : 0;
  const rows:RowTrack[] = sharedRows ? sharedRows.values.map(value => ({ definite: value })) : style['grid-template-rows'] === 'none' ? [] : tracks(style['grid-template-rows'], true);
  const explicitRowCount = rows.length;
  const implicit = sharedRows ? [] : tracks(String(style['grid-auto-rows']),true);
  while(rows.length<rowCount){const track=implicit[(rows.length-explicitRowCount)%implicit.length];if(!track)throw new Error("Unresolved implicit grid row");rows.push(track);}
  if (rows.length > 2048) throw new Error('Grid row limit exceeded');
  const rowGap = resolvedGap(style, 'row-gap', sharedRows), gaps = scaleGap(rowGap, Math.max(0, rows.length - 1));
  for (const item of placed) if (rows.slice(item.row, item.row + item.rowSpan).some(row => row.auto || (!knownBlock && row.weight)) &&
    (item.rowSpan > 1 || item.style['grid-template-rows'] === 'subgrid')) {
    throw subgridError('Intrinsic row contributions across subgrids or row spans are not modeled; use independently sized parent rows', item.box, children.region, 'block');
  }
  let measurements = [{ region: children.region, bases: rows.map(row => row.definite ?? scalar(row.fixed ?? row.edges ?? zero)) }];
  for (const item of placed.filter(item => rows[item.row]!.auto || rows[item.row]!.autoMin || (!knownBlock && rows[item.row]!.weight))) {
    // In a bare fr row an item's minimum contribution is its min-height when set, or its edges for a
    // scroll container (Grid §6.6); otherwise its measured height.
    if (rows[item.row]!.autoMin) {
      if ((item.rowSpan ?? 1) > 1) throw Object.assign(new Error(`${item.box.label} spans several rows, one of them a bare fr row; that is not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box });
      const st = item.style, pxOf = (v:unknown) => ['0', '0px'].includes(String(v)) ? zero : /^\d+(?:\.\d+)?px$/.test(String(v)) ? px(String(v)) : null;
      const edgesOf = ['top', 'bottom'].map(side => [pxOf(st[`padding-${side}`]), pxOf(st[`border-${side}`])]).flat();
      let lower:Rational|null=null;
      if (st['min-block-size'] !== 'auto') { const m = pxOf(st['min-block-size']); if (m === null || edgesOf.includes(null)) throw Object.assign(new Error(`${item.box.label}: min-height ${st['min-block-size']} in a bare fr row is not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box }); lower = st['box-sizing'] === 'content-box' ? edgesOf.reduce<Rational>((a,b)=>add(a,requireLength(b)),m) : m; }
      else if (['hidden', 'auto', 'scroll'].includes(String(st['overflow-y']))) { if (edgesOf.includes(null)) throw Object.assign(new Error(`${item.box.label}: UA edges in a bare fr row are not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box }); lower = edgesOf.reduce<Rational>((a,b)=>add(a,requireLength(b)),zero); }
      if (lower !== null) { const edgesTotal = edgesOf.includes(null) ? zero : edgesOf.reduce<Rational>((a,b)=>add(a,requireLength(b)),zero); if (cmp(lower, edgesTotal) < 0) lower = edgesTotal; measurements = bounded(measurements.flatMap(m => maximum(m.region, m.bases[item.row]!, sum(scalar(lower!), marginBlock(item))).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) })))); continue; }
    }
    measurements = bounded(measurements.flatMap(m => (justifyItem(item, m.region) ?? [{region:m.region,inline:undefined}]).flatMap(jr => solve(item.box, { inline: jr.inline ?? itemInline(item), ...(jr.inline ? { justifyHandled: true } : {}), percentInline: areaInline(item), tracks: { inline: childColumns(item) }, gridItem: true, ...(style.$blockFlow && blockFlowPercent ? { percentBlock: blockFlowPercent } : {}), ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item) }, jr.region, ancestors, item.inherited ?? style, false).flatMap(measured => maximum(measured.region, m.bases[item.row]!, sum(requireBlock(measured.block),marginBlock(item))).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) }))))));
  }
  function* layoutsForMeasurements():Generator<RowSolution> {
    for (const m of measurements) {
      let fractions = [{ region: m.region, value: scalar(0) }];
      if (!knownBlock) for (let i = 0; i < rows.length; i++) if (rows[i]!.weight) {
        const divisor = cmp(rows[i]!.weight!,one)>0?rows[i]!.weight!:one;
        fractions = fractions.flatMap(f => maximum(f.region, f.value, times(m.bases[i]!, div(one, divisor))));
      }
      const layouts = sharedRows ? [{ region: m.region, values: sharedRows.values, required: trackArea(sharedRows.values, rowGap, 0, rows.length) }] : knownBlock ? flex(m.region,knownBlock,rows.map(row=>{if("definite" in row)throw new Error("Unexpected shared row");return row;}),gaps,m.bases,!['start','center','end'].includes(String(style['align-content']))) : fractions.map(f => {
        const values = rows.map((row, i) => row.weight ? times(f.value, row.weight) : m.bases[i]!);
        return { region: f.region, values, required: sum(total(values), gaps) };
      });
      // A block-flow container raised by min-block-size: its rows stay at the top (align-content: start).
      yield* layouts.flatMap(rs => minBlock && !knownBlock && style.$blockFlow ? minBlock(rs.region).flatMap(m => maximum(m.region, rs.required, m.value).map(x => ({ ...rs, region: x.region, raised: x.value }))) : [rs]);
    }

  }
  return {rows,rowGap,gaps,layouts:layoutsForMeasurements()};
}
