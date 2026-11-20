// Exact capacity checks and their diagnostic witnesses. No DOM/style traversal.
import {exact, number} from './linear.mjs';
import type {Rational} from './linear.mjs';
import {affine, clip, diff, evaluate, projection, sample, serialize} from './region.mjs';
import type {Affine2, Region} from './region.mjs';
import {PARENT} from './selectors.mjs';
import type {LayoutDiagnostic, LayoutExplanation, LayoutRange, LayoutRegion, LayoutSummary, SourceSpan} from '../layout-contracts.d.ts';
import type {Axis} from './engine-types.mjs';

interface ObligationBox {
  label: string;
  path: string;
  source?: SourceSpan | undefined;
  [PARENT]?: {label?: string};
}
interface Ranges {range:LayoutRange; heightRange?:LayoutRange; region?:LayoutRegion}
type Finding = LayoutDiagnostic & {signature:string;range:LayoutRange};
type Annotation = Pick<LayoutDiagnostic,'text'|'layout'>;
interface Waiver<Box> {box:Box;path:string;code:string;axis:Axis;region:Region;self:boolean}

export function createObligationCollector<Box extends ObligationBox>({block, diagnostics, scrollIntent}:{
  block:boolean;diagnostics:LayoutDiagnostic[];scrollIntent?:'css'|undefined;
}) {
  const findings:Finding[]=[];
  const checks:LayoutSummary['checks']=[];
  const waived:Waiver<Box>[]=[];
  const ranges=(region:Region):Ranges=>({range:projection(region,'x'), ...(block ? {heightRange:projection(region,'y'),region:serialize(region)} : {})});
  // A cell's content can grow its row rather than overflow. Do not certify its size.
  function cellGrows(available:Affine2,required:Affine2,box:Box,region:Region):void {
    const failed=clip(region,diff(required,available),true);
    if(failed)diagnostics.push({code:'U_LAYOUT_TABLE',severity:'unknown',message:`${box.label}: the content is taller than the cell here; a table row grows with its content`,box:box.label,path:box.path,source:box.source,axis:'block',...ranges(failed)});
  }
  // Hidden or clip still does not waive the obligation.
  const scrolls=(style:Readonly<Record<string,unknown>>,axis:'x'|'y')=>scrollIntent==='css'&&['auto','scroll'].includes(String(style[`overflow-${axis}`]));
  function obligation(available:Affine2, required:Affine2, box:Box, region:Region, code:string, axis:Axis, enabled=true, explain?:()=>LayoutExplanation, annotate?:(offered:Rational)=>Annotation):void {
    checks.push({box:box.label,path:box.path,code,axis,...ranges(region),available:affine(available),required:affine(required),enforced:enabled});
    const failed=clip(region,diff(required,available),true);
    if(!enabled){
      if(failed)waived.push({box,path:box.path,code,axis,region:failed,self:code!=='E_LAYOUT_ITEM_SIZE'});
      return;
    }
    if(!failed)return;
    const p=sample(failed),need=evaluate(required,p),offered=evaluate(available,p);
    findings.push({code,severity:'error',box:box.label,path:box.path,source:box.source,axis,
      message:code==='E_LAYOUT_ABSOLUTE_CLIPPED' ? `${box.label} reaches past its containing block ${box[PARENT]?.label ?? ''}, which hides its overflow: it needs ${exact(need)}px but only ${exact(offered)}px is visible on the ${axis} axis at viewport ${exact(p.x)}px${block ? ` × ${exact(p.y)}px` : ''}, so the rest is cut off`
        : `${box.label} requires ${exact(need)}px but receives ${exact(offered)}px on ${axis} axis at viewport ${exact(p.x)}px${block ? ` × ${exact(p.y)}px` : ''}`,
      ...ranges(failed),signature:JSON.stringify([box.path,code,axis,affine(available),affine(required)]),
      witness:{viewport:number(p.x),viewportExact:exact(p.x),...(block?{viewportHeight:number(p.y),viewportHeightExact:exact(p.y)}:{}),available:number(offered),required:number(need)},
      ...(explain?{explanation:explain()}:{}),...(annotate?annotate(offered):{}),
    });
  }

  // Preserve compact one-dimensional diagnostics; 2-D regions retain correlated constraints.
  function flush():void {
    findings.sort((a,b)=>a.signature.localeCompare(b.signature)||a.range.min-b.range.min);
    const merged:Finding[]=[];
    for(const finding of findings){
      const previous=merged.at(-1);
      if(!block&&previous?.signature===finding.signature&&previous.range.maxExact===finding.range.minExact&&(previous.range.maxInclusive||finding.range.minInclusive)){
        previous.range={...previous.range,max:finding.range.max,maxExact:finding.range.maxExact,maxInclusive:finding.range.maxInclusive};
      }else merged.push({...finding});
    }
    diagnostics.push(...merged.map(({signature,...finding})=>finding));
    findings.length=0;
  }
  return {checks,waived,ranges,cellGrows,scrolls,obligation,flush};
}
