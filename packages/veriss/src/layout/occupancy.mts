// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Exact union of axis-aligned rectangles clipped to the playfield. Split by
// affine edge ordering, then maximize a rational quadratic in each cell.
import {q,add,sub,mul,div,cmp} from './linear.mjs';
import {diff,sum,partition,sample,evaluate} from './region.mjs';
import type { Rational } from './linear.mjs';
import type { Affine2, Point, Region } from './region.mjs';
export interface AffineRectangle { readonly inlineStart: Affine2; readonly inlineSize: Affine2; readonly blockStart: Affine2; readonly blockSize: Affine2 }
export interface WorkBudget { left: number }
type Quadratic = readonly [Rational, Rational, Rational, Rational, Rational, Rational];
type Axis = 'inline' | 'block';
const z=q(0),two=q(2), neg=(x: Rational)=>sub(z,x);
const plus=(a: Quadratic,b: Quadratic): Quadratic=>[add(a[0],b[0]),add(a[1],b[1]),add(a[2],b[2]),add(a[3],b[3]),add(a[4],b[4]),add(a[5],b[5])];
const product=(a: Affine2,b: Affine2): Quadratic=>[mul(a.x,b.x),add(mul(a.x,b.y),mul(a.y,b.x)),mul(a.y,b.y),add(mul(a.x,b.b),mul(a.b,b.x)),add(mul(a.y,b.b),mul(a.b,b.y)),mul(a.b,b.b)];
const scale=([a,b,c,d,e,f]: Quadratic,k: Rational): Quadratic=>[mul(a,k),mul(b,k),mul(c,k),mul(d,k),mul(e,k),mul(f,k)];
const value=([a,b,c,d,e,f]: Quadratic,{x,y}: Point)=>[mul(a,mul(x,x)),mul(b,mul(x,y)),mul(c,mul(y,y)),mul(d,x),mul(e,y),f].reduce(add,z);
const mix=(a: Point,b: Point,t: Rational): Point=>({x:add(a.x,mul(sub(b.x,a.x),t)),y:add(a.y,mul(sub(b.y,a.y),t))});
function maximumWitness(region: Region,p: Quadratic): Point | null {
  const [a,b,c,d,e]=p,candidates=[...region.vertices],center=sample(region);
  for(let i=0;i<region.vertices.length;i++){
    const start=region.vertices[i]!,end=region.vertices[(i+1)%region.vertices.length]!,x=sub(end.x,start.x),y=sub(end.y,start.y);
    const A=[mul(a,mul(x,x)),mul(b,mul(x,y)),mul(c,mul(y,y))].reduce(add,z);
    const B=add(mul(x,add(add(mul(two,mul(a,start.x)),mul(b,start.y)),d)),mul(y,add(add(mul(two,mul(c,start.y)),mul(b,start.x)),e)));
    if(cmp(A,z)<0){const t=div(neg(B),mul(two,A));if(cmp(t,z)>0&&cmp(t,q(1))<0)candidates.push(mix(start,end,t))}
  }
  const det=sub(mul(q(4),mul(a,c)),mul(b,b));
  if(cmp(det,z)!==0){
    const t={x:div(sub(mul(b,e),mul(two,mul(c,d))),det),y:div(sub(mul(b,d),mul(two,mul(a,e))),det)};
    // Test polygon membership, including the original rectangular domain.
    const cross=(u: Point,v: Point,p: Point)=>sub(mul(sub(v.x,u.x),sub(p.y,u.y)),mul(sub(v.y,u.y),sub(p.x,u.x)));
    const signs=region.vertices.map((v,i)=>cmp(cross(v,region.vertices[(i+1)%region.vertices.length]!,t),z));
    if(region.vertices.length>=3&&(signs.every(v=>v>=0)||signs.every(v=>v<=0))&&signs.some(v=>v!==0))candidates.push(t);
  }
  const feasible=(p: Point)=>region.constraints.every(c=>cmp(evaluate(c.slack,p),z)>=(c.strict?1:0));
  for(const point of candidates)if(cmp(value(p,point),z)>0){
    if(feasible(point))return point;
    // A positive boundary maximum implies a positive interior point by continuity.
    for(let i=1;i<=128;i++){const v=mix(point,center,{n:1n,d:2n**BigInt(i)});if(feasible(v)&&cmp(value(p,v),z)>0)return v}
    throw Error('occupancy witness precision budget exceeded');
  }
  return null;
}
const edges=(r: AffineRectangle,k: Axis): [Affine2, Affine2]=>[r[`${k}Start`],sum(r[`${k}Start`],r[`${k}Size`])];
export function occupancyFailure(region: Region,field: AffineRectangle,overlays: readonly AffineRectangle[],limit: Rational,budget: WorkBudget): Point | null {
  // Empty playfields are undefined rather than vacuous successes.
  for(const k of ['inlineSize','blockSize'] as const)if(partition(region,field[k],'=').yes.length)throw Error('zero area playfield');
  const all=[field,...overlays],x=all.flatMap(r=>edges(r,'inline')),y=all.flatMap(r=>edges(r,'block'));
  let cells=[region];
  for(const ary of [x,y])for(let i=0;i<ary.length;i++)for(let j=i+1;j<ary.length;j++){
    const d=diff(ary[i]!,ary[j]!);
    if([d.x,d.y,d.b].every(v=>cmp(v,z)===0))continue;
    if((budget.left-=cells.length)<0)throw Error('occupancy partition budget exceeded');
    cells=cells.flatMap(r=>{const p=partition(r,d,'>=');return [...p.yes,...p.no]});
    if(cells.length>256)throw Error('occupancy region limit exceeded');
  }
  for(const cell of cells) {
    const center=sample(cell),at=(a: Affine2)=>evaluate(a,center);
    const ordered=(ary: readonly Affine2[])=>ary.map((a,i)=>({a,i})).sort((u,v)=>cmp(at(u.a),at(v.a))||u.i-v.i);
    const xx=ordered(x),yy=ordered(y);
    const inside=(lo: Affine2,hi: Affine2,rs: readonly [Affine2,Affine2])=>cmp(at(lo),at(rs[0]))>=0&&cmp(at(hi),at(rs[1]))<=0;
    let p=scale(product(field.inlineSize,field.blockSize),neg(limit));
    for(let i=0;i<xx.length-1;i++)for(let j=0;j<yy.length-1;j++){
      if(--budget.left<0)throw Error('occupancy cell budget exceeded');
      const a=xx[i]!.a,b=xx[i+1]!.a,c=yy[j]!.a,d=yy[j+1]!.a;
      if(cmp(at(a),at(b))>=0||cmp(at(c),at(d))>=0)continue;
      if(!inside(a,b,edges(field,'inline'))||!inside(c,d,edges(field,'block')))continue;
      if(overlays.some(r=>inside(a,b,edges(r,'inline'))&&inside(c,d,edges(r,'block'))))p=plus(p,product(diff(b,a),diff(d,c)));
    }
    const witness=maximumWitness(cell,p);if(witness)return witness;
  }
  return null;
}
