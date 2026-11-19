// Exact union of axis-aligned rectangles clipped to the playfield. Split by
// affine edge ordering, then maximize a rational quadratic in each cell.
import {q,add,sub,mul,div,cmp} from '@mizchi/veriss/src/layout/linear.mjs';
import {diff,sum,partition,sample,evaluate} from '@mizchi/veriss/src/layout/region.mjs';
const z=q(0),two=q(2), neg=x=>sub(z,x);
const plus=(a,b)=>a.map((v,i)=>add(v,b[i]));
const product=(a,b)=>[mul(a.x,b.x),add(mul(a.x,b.y),mul(a.y,b.x)),mul(a.y,b.y),add(mul(a.x,b.b),mul(a.b,b.x)),add(mul(a.y,b.b),mul(a.b,b.y)),mul(a.b,b.b)];
const scale=(p,k)=>p.map(v=>mul(v,k));
const value=([a,b,c,d,e,f],{x,y})=>[mul(a,mul(x,x)),mul(b,mul(x,y)),mul(c,mul(y,y)),mul(d,x),mul(e,y),f].reduce(add,z);
const mix=(a,b,t)=>({x:add(a.x,mul(sub(b.x,a.x),t)),y:add(a.y,mul(sub(b.y,a.y),t))});
function maximumWitness(region,p) {
  const [a,b,c,d,e]=p,candidates=[...region.vertices],center=sample(region);
  for(let i=0;i<region.vertices.length;i++){
    const start=region.vertices[i],end=region.vertices[(i+1)%region.vertices.length],x=sub(end.x,start.x),y=sub(end.y,start.y);
    const A=[mul(a,mul(x,x)),mul(b,mul(x,y)),mul(c,mul(y,y))].reduce(add,z);
    const B=add(mul(x,add(add(mul(two,mul(a,start.x)),mul(b,start.y)),d)),mul(y,add(add(mul(two,mul(c,start.y)),mul(b,start.x)),e)));
    if(cmp(A,z)<0){const t=div(neg(B),mul(two,A));if(cmp(t,z)>0&&cmp(t,q(1))<0)candidates.push(mix(start,end,t))}
  }
  const det=sub(mul(q(4),mul(a,c)),mul(b,b));
  if(cmp(det,z)!==0){
    const t={x:div(sub(mul(b,e),mul(two,mul(c,d))),det),y:div(sub(mul(b,d),mul(two,mul(a,e))),det)};
    // Test polygon membership, including the original rectangular domain.
    const cross=(u,v,p)=>sub(mul(sub(v.x,u.x),sub(p.y,u.y)),mul(sub(v.y,u.y),sub(p.x,u.x)));
    const signs=region.vertices.map((v,i)=>cmp(cross(v,region.vertices[(i+1)%region.vertices.length],t),z));
    if(region.vertices.length>=3&&(signs.every(v=>v>=0)||signs.every(v=>v<=0))&&signs.some(v=>v!==0))candidates.push(t);
  }
  const feasible=p=>region.constraints.every(c=>cmp(evaluate(c.slack,p),z)>=(c.strict?1:0));
  for(const point of candidates)if(cmp(value(p,point),z)>0){
    if(feasible(point))return point;
    // A positive boundary maximum implies a positive interior point by continuity.
    for(let i=1;i<=128;i++){const v=mix(point,center,{n:1n,d:2n**BigInt(i)});if(feasible(v)&&cmp(value(p,v),z)>0)return v}
    throw Error('occupancy witness precision budget exceeded');
  }
  return null;
}
const edges=(r,k)=>[r[k+'Start'],sum(r[k+'Start'],r[k+'Size'])];
export function occupancyFailure(region,field,overlays,limit,budget) {
  // Empty playfields are undefined rather than vacuous successes.
  for(const k of ['inlineSize','blockSize'])if(partition(region,field[k],'=').yes.length)throw Error('zero area playfield');
  const all=[field,...overlays],x=all.flatMap(r=>edges(r,'inline')),y=all.flatMap(r=>edges(r,'block'));
  let cells=[region];
  for(const ary of [x,y])for(let i=0;i<ary.length;i++)for(let j=i+1;j<ary.length;j++){
    const d=diff(ary[i],ary[j]);
    if([d.x,d.y,d.b].every(v=>cmp(v,z)===0))continue;
    if((budget.left-=cells.length)<0)throw Error('occupancy partition budget exceeded');
    cells=cells.flatMap(r=>{const p=partition(r,d,'>=');return [...p.yes,...p.no]});
    if(cells.length>256)throw Error('occupancy region limit exceeded');
  }
  for(const cell of cells) {
    const center=sample(cell),at=a=>evaluate(a,center);
    const ordered=ary=>ary.map((a,i)=>({a,i})).sort((u,v)=>cmp(at(u.a),at(v.a))||u.i-v.i);
    const xx=ordered(x),yy=ordered(y);
    const inside=(lo,hi,rs)=>cmp(at(lo),at(rs[0]))>=0&&cmp(at(hi),at(rs[1]))<=0;
    let p=scale(product(field.inlineSize,field.blockSize),neg(limit));
    for(let i=0;i<xx.length-1;i++)for(let j=0;j<yy.length-1;j++){
      if(--budget.left<0)throw Error('occupancy cell budget exceeded');
      const a=xx[i].a,b=xx[i+1].a,c=yy[j].a,d=yy[j+1].a;
      if(cmp(at(a),at(b))>=0||cmp(at(c),at(d))>=0)continue;
      if(!inside(a,b,edges(field,'inline'))||!inside(c,d,edges(field,'block')))continue;
      if(overlays.some(r=>inside(a,b,edges(r,'inline'))&&inside(c,d,edges(r,'block'))))p=plus(p,product(diff(b,a),diff(d,c)));
    }
    const witness=maximumWitness(cell,p);if(witness)return witness;
  }
  return null;
}
