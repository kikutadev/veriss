// TypeScript source. Run pnpm build:ts to regenerate adjacent ESM and declarations.
// Box edges and finite-region margin/size resolution.
import { q, div, cmp, add } from './linear.mjs';
import { scalar, asAffine, sum, diff, evaluate, affine, partition } from './region.mjs';
import type { Rational } from './linear.mjs';
import type { Affine2, Region } from './region.mjs';
import type { LayoutAffine } from '../layout-contracts.d.ts';
import { px } from './css.mjs';
import { lengthPieces } from './engine-geometry.mjs';
import type { Side, DimensionValue } from './engine-types.mjs';

const zero = q(0);
const SIDES = ['top','right','bottom','left'] as const;
const BLOCK_SIDES = ['top','bottom'] as const;
type GapKey = 'column-gap' | 'row-gap';
type EdgeKey = GapKey | `margin-${Side}` | `padding-${Side}`;
export type EdgeStyle = Record<EdgeKey | `border-${Side}` | 'position' | 'block-size' | 'direction' | 'display' | 'max-block-size' | 'overflow-x' | 'overflow-y', string> & {
  'font-size'?: string; $usedMarginTop?: LayoutAffine; $viewportLengths?: Partial<Record<EdgeKey, LayoutAffine & {source: string}>>; $blockFlow?: boolean;
};
type InlineSizingStyle = Record<'inline-size' | 'min-inline-size' | 'max-inline-size' | 'box-sizing', string> & {'font-size'?: string};
interface MarginBox {label: string; pseudo?: string | boolean; documentRoot?: boolean; children?: readonly unknown[]}
interface MarginEntry { region: Region; children: {box: MarginBox; style: EdgeStyle}[] }
export const maximum = (region: Region, a: Affine2, b: Affine2) => {
    const p = partition(region, diff(a, b), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
export const clamp = (region: Region, value: Affine2) => maximum(region, value, scalar(0));
  // The block-per-inline factor of an aspect-ratio (h / w), or null for auto.
export const ratioOf = (style: { "aspect-ratio"?: string }) => { const m = /(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(String(style['aspect-ratio'] ?? 'auto')); return m ? div(q(m[2]!), q(m[1]!)) : null; };
export const minimumOf = (region: Region, a: Affine2, b: Affine2) => {
    const p = partition(region, diff(b, a), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
export function preferredInlinePieces(style: InlineSizingStyle, parent: Affine2, region: Region, cssInlineEdges: Affine2, autoValue: Affine2) {
    const preferred = (style['inline-size'] === 'auto' ? [{region, value:autoValue}] : lengthPieces(style['inline-size'], parent, region, style))
      .map(piece => ({...piece, value:style['inline-size'] !== 'auto' && style['box-sizing'] === 'content-box' ? sum(piece.value,cssInlineEdges) : piece.value}));
    const minimum = style['min-inline-size'] === 'auto' ? zero : px(style['min-inline-size']);
    const edge = style['box-sizing'] === 'content-box' ? cssInlineEdges : scalar(0);
    const capped = style['max-inline-size'] !== 'none' ? preferred.flatMap(piece => lengthPieces(style['max-inline-size'],parent,piece.region,style).flatMap(cap => minimumOf(cap.region,piece.value,sum(cap.value,edge)))) : preferred;
    return capped.flatMap(c => cmp(minimum,zero)>0 ? maximum(c.region,c.value,sum(scalar(minimum),edge)) : [c]);
  }

export function createEdgeSolver(viewportLength: (value: unknown) => boolean, bounded: <T>(values:T[])=>T[], block: boolean) {
  function fromAffineFact(fact: LayoutAffine) {
    const rat = (value: string | undefined) => { const [n,d='1'] = String(value ?? '0').split('/'); return div(q(n!),q(d)); };
    return { x: rat(fact.coefficient), y: rat(fact.heightCoefficient), b: rat(fact.constant) };
  }
  const hasViewportMargin = (style: EdgeStyle, sides: readonly Side[] = ['top','right','bottom','left']) => sides.some(side => viewportLength(style[`margin-${side}`]));
  function marginValue(style: EdgeStyle, side: Side) {
    const key = `margin-${side}` as const;
    if (side === 'top' && style.$usedMarginTop) return fromAffineFact(style.$usedMarginTop);
    if (viewportLength(style[key])) return asAffine(resolvedViewportLength(style,key,() => { throw new Error('Unresolved responsive margin'); }));
    return scalar(/^\d+(?:\.\d+)?px$/.test(String(style[key])) ? px(style[key]) : zero);
  }
  function resolvedViewportLength(style: EdgeStyle, key: EdgeKey, fallback: () => DimensionValue): DimensionValue {
    const fact = style.$viewportLengths?.[key];
    if (!fact || fact.source !== style[key]) return fallback();
    const result = fromAffineFact(fact);
    return cmp(result.x, zero) || cmp(result.y, zero) ? result : result.b;
  }
  const resolvedGap = (style: EdgeStyle, key: GapKey, parent?: {gap: DimensionValue}) => resolvedViewportLength(style, key, () => style[key] === 'normal' ? parent?.gap ?? zero : px(style[key]));
  const padding = (style: EdgeStyle, side: Side) => resolvedViewportLength(style, `padding-${side}`, () => px(style[`padding-${side}`]));
  const edgeValue = (style: EdgeStyle, side: Side) => sum(asAffine(padding(style, side)), scalar(px(style[`border-${side}`])));
  const hasViewportPadding = (style: EdgeStyle) => SIDES.some(side => viewportLength(style[`padding-${side}`]));
  const isZeroAffine = (value: DimensionValue) => { const a = asAffine(value); return !cmp(a.x, zero) && !cmp(a.y, zero) && !cmp(a.b, zero); };
  // Margin collapsing only needs the zero/positive distinction, not a constant.
  // Re-evaluate within the actual caller region (some callers inspect descendants
  // without carrying the style partition). Do not guess at a changing zero sign.
  function positivePadding(style: EdgeStyle, side: Side, region: Region) {
    const raw = style[`padding-${side}`];
    if (!viewportLength(raw)) return cmp(raw === 'ua' ? zero : px(raw), zero) > 0;
    const pieces = lengthPieces(raw, null, region, style);
    const signs = pieces.flatMap(p => p.region.vertices.map(v => cmp(evaluate(p.value,v),zero) > 0));
    if (signs.every(v=>v)) return true;
    if (signs.every(v=>!v)) return false;
    throw Object.assign(new Error('Margin collapsing with padding that can reach zero is not modeled'),{code:'U_LAYOUT_CSS'});
  }
  const positiveEdge = (style: EdgeStyle, side: Side, region: Region) => cmp(style[`border-${side}`] === 'ua' ? zero : px(style[`border-${side}`]),zero)>0 || positivePadding(style,side,region);
  function responsiveBlockMargins<T extends MarginEntry>(entry: T, style: EdgeStyle, box: MarginBox, parents: readonly {style?: EdgeStyle}[], available: {collapsedTop?: unknown; collapsedBottom?: unknown}) {
    const flow = entry.children.filter(c => c.style.position !== 'absolute');
    if (!flow.some(c=>hasViewportMargin(c.style,['top','bottom']))) return [entry];
    const reject = (why: string): never => { throw Object.assign(new Error(`${box.label}: responsive margin collapse: ${why}`), {code:'U_LAYOUT_CSS',box,region:entry.region}); };
    if (!block || available.collapsedTop || available.collapsedBottom || style['block-size'] !== 'auto' || style.direction !== 'ltr') reject('independent auto-height block flow required');
    // Through-collapse, negative margins and empty boxes need a different
    // model. A nonempty child with its own formatting context or two
    // nonzero edges cannot propagate a grandchild margin across its boundary.
    for(const c of flow){
      const st=c.style, h=String(st['block-size']);
      if(c.box.pseudo || st.position!=='static' || !['block','grid','flex'].includes(st.display) || !/^\d+(?:\.\d+)?px$/.test(h) || cmp(px(h),zero)<=0 || st['max-block-size']!=='none' ||
        BLOCK_SIDES.some(side=>!viewportLength(st[`margin-${side}`])&&!/^(?:0|\d+(?:\.\d+)?px)$/.test(String(st[`margin-${side}`])))) reject('only nonempty explicitly sized siblings with nonnegative margins are modeled');
      if((c.box.children??[]).length && st.display==='block' && !['hidden','auto','scroll'].some(v=>[st['overflow-x'],st['overflow-y']].includes(v)) &&
        (!positiveEdge(st,'top',entry.region)||!positiveEdge(st,'bottom',entry.region))) reject('descendant margins may collapse through an item');
    }
    const parentStyle=parents.at(-1)?.style;
    const formattingRoot=(!parents.length&&box.documentRoot)||(parentStyle&&['grid','flex','inline-grid','inline-flex'].includes(parentStyle.display)&&!parentStyle.$blockFlow)||['hidden','auto','scroll'].includes(String(style['overflow-x']))||['hidden','auto','scroll'].includes(String(style['overflow-y']))||style.position==='absolute';
    if(flow.length&&!formattingRoot&&((!isZeroAffine(marginValue(flow[0]!.style,'top'))&&!positiveEdge(style,'top',entry.region))||(!isZeroAffine(marginValue(flow.at(-1)!.style,'bottom'))&&!positiveEdge(style,'bottom',entry.region)))) reject('margin may collapse through the parent');
    let pieces=[{...entry,children:[...entry.children],$responsiveCollapse:true}];
    for(let k=1;k<flow.length;k++){
      // The preceding row already includes its bottom margin. Add only
      // max(top - bottom, 0) to the next row, splitting at their crossing.
      const index=entry.children.indexOf(flow[k]!);
      const slack=diff(marginValue(flow[k]!.style,'top'),marginValue(flow[k-1]!.style,'bottom'));
      pieces=bounded(pieces.flatMap(p=>clamp(p.region,slack).map(m=>{
        const children=[...p.children];children[index]={...children[index]!,style:{...children[index]!.style,$usedMarginTop:affine(m.value)}};
        return {...p,region:m.region,children};
      })));
    }
    return pieces;
  }
  return {fromAffineFact, hasViewportMargin, marginValue, resolvedViewportLength, resolvedGap, padding, edgeValue, hasViewportPadding, isZeroAffine, positivePadding, positiveEdge, responsiveBlockMargins};
}
