// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Closed, serializable predicate grammar. A use expands a named predicate
// with explicit target bindings; it never introduces implementation facts.
import {rational} from './smt.mjs';
import {scalar,width,height,sum,diff,times,partition} from './region.mjs';
import type {Affine2,Region,RegionRelation} from './region.mjs';
import type {AffineRectangle,WorkBudget} from './occupancy.mjs';
import type {Operand,EnvironmentProfile} from '../relational-contract.mjs';

export type Comparison = 'lt'|'le'|'eq'|'ge'|'gt'|'ne';
export type ExpandedPredicate =
 | {op:'compare';relation:Comparison;left:Operand;right:Operand}
 | {op:'all'|'any';items:readonly ExpandedPredicate[]}
 | {op:'not';item:ExpandedPredicate};
type Bindings = Readonly<Record<string,string>>;
type Reference = [endpoint:'before'|'after',target:string];
const fields=['inlineStart','blockStart','inlineSize','blockSize','inlineEnd','blockEnd'] as const;
const environments=['width','height','safeLeft','safeRight','safeTop','safeBottom'] as const;
const relations=['lt','le','eq','ge','gt','ne'] as const;
const endpoints=['before','after'] as const;
const member=<T extends string>(values:readonly T[],value:unknown):value is T=>values.some(v=>v===value);
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=128;
const own=(o:object,k:PropertyKey)=>Object.hasOwn(o,k);
const record=(o:unknown):o is Record<string,unknown>=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const shape=(o:unknown,keys:readonly string[]):o is Record<string,unknown>=>record(o)&&Object.keys(o).every(k=>keys.includes(k));
function need(x:unknown,m:string):asserts x{if(!x)throw new TypeError(m)}
function bound(bindings:Bindings|null,target:string):string {
 return bindings&&own(bindings,target)?bindings[target]!:target;
}
export function expandPredicate(ast:unknown,definitions:Readonly<Record<string,unknown>>={},event?:string):ExpandedPredicate {
 let budget=256;
 const tick=(depth:number)=>need(--budget>=0&&depth<=32,'Predicate expansion limit');
 function operand(o:unknown,bindings:Bindings|null,depth:number):Operand{
  tick(depth);
  if(typeof o==='string'){rational(o);return o}
  if(shape(o,['environment'])&&member(environments,o.environment))return {environment:o.environment};
  if(shape(o,['target','field','endpoint'])&&id(o.target)&&member(fields,o.field)){
   const endpoint=o.endpoint;
   need(!endpoint||member(endpoints,endpoint)&&event,'Endpoint requires event');
   const base={target:bound(bindings,o.target),field:o.field};
   return member(endpoints,endpoint)?{...base,endpoint}:base;
  }
  if(shape(o,['op','items'])&&o.op==='add'&&Array.isArray(o.items)&&o.items.length>0&&o.items.length<=16)return {op:'add',items:o.items.map((v:unknown)=>operand(v,bindings,depth+1))};
  if(shape(o,['op','factor','item'])&&o.op==='scale'){
   rational(o.factor);need(typeof o.factor==='string','Invalid exact layout rational');return {op:'scale',factor:o.factor,item:operand(o.item,bindings,depth+1)}
  }
  throw new TypeError('Invalid predicate operand');
 }
 function predicate(p:unknown,bindings:Bindings|null,stack:readonly string[],depth:number):ExpandedPredicate{
  tick(depth);
  if(shape(p,['op','relation','left','right'])&&p.op==='compare'&&member(relations,p.relation))return {op:'compare',relation:p.relation,left:operand(p.left,bindings,depth+1),right:operand(p.right,bindings,depth+1)};
  if(shape(p,['op','items'])&&(p.op==='all'||p.op==='any')&&Array.isArray(p.items)&&p.items.length>0&&p.items.length<=16)return {op:p.op,items:p.items.map((v:unknown)=>predicate(v,bindings,stack,depth+1))};
  if(shape(p,['op','item'])&&p.op==='not')return {op:'not',item:predicate(p.item,bindings,stack,depth+1)};
  if(shape(p,['op','name','bind'])&&p.op==='use'&&id(p.name)&&own(definitions,p.name)){
   need(!stack.includes(p.name),'Predicate reference cycle');
   need(record(p.bind)&&Object.entries(p.bind).every(([k,v])=>id(k)&&id(v)),'Invalid predicate binding');
   const map=Object.fromEntries(Object.entries(p.bind).map(([k,v])=>{need(id(v),'Invalid predicate binding');return [k,bound(bindings,v)]}));
   // Require every target referenced by the definition to be bound at this use.
   const expanded=predicate(definitions[p.name],null,[...stack,p.name],depth+1);
   function bindOperand(v:Operand):Operand{
    if(typeof v==='string'||'environment' in v)return v;
    if('target' in v){need(own(map,v.target),'Unbound predicate target '+v.target);return {...v,target:map[v.target]!}}
    if(v.op==='add')return {...v,items:v.items.map(bindOperand)};
    return {...v,item:bindOperand(v.item)};
   }
   function bind(v:ExpandedPredicate):ExpandedPredicate{
    if(v.op==='compare')return {...v,left:bindOperand(v.left),right:bindOperand(v.right)};
    if(v.op==='not')return {...v,item:bind(v.item)};
    return {...v,items:v.items.map(bind)};
   }
   return bind(expanded);
  }
  throw new TypeError('Invalid predicate expression');
 }
 return predicate(ast,null,[],0);
}
export function predicateTargets(ast:ExpandedPredicate):Reference[] {
 const map=new Map<string,Reference>();
 function visitOperand(o:Operand):void{
  if(typeof o==='string'||'environment' in o)return;
  if('target' in o){const endpoint=o.endpoint??'before';map.set(JSON.stringify([endpoint,o.target]),[endpoint,o.target]);return}
  if(o.op==='add')o.items.forEach(visitOperand);else visitOperand(o.item);
 }
 function visit(o:ExpandedPredicate):void{
  if(o.op==='compare'){visitOperand(o.left);visitOperand(o.right)}
  else if(o.op==='not')visit(o.item);
  else o.items.forEach(visit);
 }
 visit(ast);return [...map.values()];
}
// Restrict to regions where a Boolean predicate has the requested truth value.
// Every comparison creates a partition; all/any/not operate on exact regions.
export function predicateRegions(ast:ExpandedPredicate,region:Region,rects:ReadonlyMap<string,Partial<AffineRectangle>>,p:EnvironmentProfile,truth:boolean,budget:WorkBudget):Region[] {
 const charge=(n:number)=>{if((budget.left-=n)<0)throw Error('predicate region budget exceeded')};
 const env=p.safeArea??{};
 function value(o:Operand):Affine2{
  if(typeof o==='string')return scalar(rational(o));
  if('environment' in o)return ({width,height,safeLeft:scalar(env.left??0),safeTop:scalar(env.top??0),safeRight:diff(width,scalar(env.right??0)),safeBottom:diff(height,scalar(env.bottom??0))})[o.environment];
  if('target' in o){
   const r=rects.get(JSON.stringify([o.endpoint??'before',o.target]));
   if(!r)throw Error('missing predicate rectangle');
   const field=(k:keyof AffineRectangle):Affine2=>{const v=r[k];if(!v)throw Error('missing predicate rectangle field '+k);return v};
   if(o.field==='inlineEnd')return sum(field('inlineStart'),field('inlineSize'));
   if(o.field==='blockEnd')return sum(field('blockStart'),field('blockSize'));
   return field(o.field);
  }
  if(o.op==='add')return o.items.map(value).reduce(sum);
  if(o.op==='scale')return times(value(o.item),rational(o.factor));
  throw Error('Invalid operand');
 }
 function select(node:ExpandedPredicate,reg:Region,want:boolean):Region[]{
  charge(1);
  if(node.op==='not')return select(node.item,reg,!want);
  if(node.op==='compare'){
   const relation:RegionRelation=({lt:'<',le:'<=',eq:'=',ge:'>=',gt:'>',ne:'='} as const)[node.relation];
   const parts=partition(reg,diff(value(node.left),value(node.right)),relation);
   return (node.relation==='ne'?!want:want)?parts.yes:parts.no;
  }
  const intersection=(node.op==='all')===want;
  if(intersection){
   let regions=[reg];
   for(const child of node.items){regions=regions.flatMap(r=>select(child,r,want));if(regions.length>256)throw Error('predicate region limit exceeded')}
   return regions;
  }
  // A disjunction is sufficient for a witness; a complete region list is
  // needed when this expression is nested inside an intersection.
  const regions=node.items.flatMap(child=>select(child,reg,want));
  if(regions.length>256)throw Error('predicate region limit exceeded');
  return regions;
 }
 return select(ast,region,truth);
}
