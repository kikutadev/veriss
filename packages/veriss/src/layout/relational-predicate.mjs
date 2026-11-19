// Closed, serializable predicate grammar. A use expands a named predicate
// with explicit target bindings; it never introduces implementation facts.
import {rational} from './smt.mjs';
import {q} from './linear.mjs';
import {scalar,width,height,sum,diff,times,partition} from './region.mjs';
const fields=['inlineStart','blockStart','inlineSize','blockSize','inlineEnd','blockEnd'];
const environments=['width','height','safeLeft','safeRight','safeTop','safeBottom'];
const id=x=>typeof x==='string'&&x.length>0&&x.length<=128;
const own=(o,k)=>Object.hasOwn(o,k);
const shape=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
const need=(x,m)=>{if(!x)throw new TypeError(m)};
export function expandPredicate(ast,definitions={},event) {
 let budget=256;
 const tick=depth=>need(--budget>=0&&depth<=32,'Predicate expansion limit');
 function operand(o,bindings,depth){
  tick(depth);
  if(typeof o==='string'){rational(o);return o}
  if(shape(o,['environment'])&&environments.includes(o.environment))return {environment:o.environment};
  if(shape(o,['target','field','endpoint'])&&id(o.target)&&fields.includes(o.field)){
   need(!o.endpoint||['before','after'].includes(o.endpoint)&&event,'Endpoint requires event');
   return {target:bindings&&own(bindings,o.target)?bindings[o.target]:o.target,field:o.field,...(o.endpoint?{endpoint:o.endpoint}:{})};
  }
  if(shape(o,['op','items'])&&o.op==='add'&&Array.isArray(o.items)&&o.items.length>0&&o.items.length<=16)return {op:'add',items:o.items.map(v=>operand(v,bindings,depth+1))};
  if(shape(o,['op','factor','item'])&&o.op==='scale'){rational(o.factor);return {op:'scale',factor:o.factor,item:operand(o.item,bindings,depth+1)}}
  throw new TypeError('Invalid predicate operand');
 }
 function predicate(p,bindings,stack,depth){
  tick(depth);
  if(shape(p,['op','relation','left','right'])&&p.op==='compare'&&['lt','le','eq','ge','gt','ne'].includes(p.relation))return {op:'compare',relation:p.relation,left:operand(p.left,bindings,depth+1),right:operand(p.right,bindings,depth+1)};
  if(shape(p,['op','items'])&&['all','any'].includes(p.op)&&Array.isArray(p.items)&&p.items.length>0&&p.items.length<=16)return {op:p.op,items:p.items.map(v=>predicate(v,bindings,stack,depth+1))};
  if(shape(p,['op','item'])&&p.op==='not')return {op:'not',item:predicate(p.item,bindings,stack,depth+1)};
  if(shape(p,['op','name','bind'])&&p.op==='use'&&id(p.name)&&own(definitions,p.name)){
   need(!stack.includes(p.name),'Predicate reference cycle');
   need(p.bind&&typeof p.bind==='object'&&!Array.isArray(p.bind)&&Object.entries(p.bind).every(([k,v])=>id(k)&&id(v)),'Invalid predicate binding');
   const map=Object.fromEntries(Object.entries(p.bind).map(([k,v])=>[k,bindings&&own(bindings,v)?bindings[v]:v]));
   // Require every target referenced by the definition to be bound at this use.
   const expanded=predicate(definitions[p.name],null,[...stack,p.name],depth+1);
   function bind(v){
    if(typeof v!=='object'||v===null)return v;
    if(Array.isArray(v))return v.map(bind);
    if(own(v,'target')){need(own(map,v.target),'Unbound predicate target '+v.target);return {...v,target:map[v.target]}}
    return Object.fromEntries(Object.entries(v).map(([k,val])=>[k,bind(val)]));
   }
   return bind(expanded);
  }
  throw new TypeError('Invalid predicate expression');
 }
 return predicate(ast,null,[],0);
}
export function predicateTargets(ast) {
 const map=new Map();
 function visit(o){if(!o||typeof o!=='object')return;if(own(o,'target')){const endpoint=o.endpoint??'before';map.set(JSON.stringify([endpoint,o.target]),[endpoint,o.target])}else Object.values(o).forEach(visit)}
 visit(ast);return [...map.values()];
}
// Restrict to regions where a Boolean predicate has the requested truth value.
// Every comparison creates a partition; all/any/not operate on exact regions.
export function predicateRegions(ast,region,rects,p,truth,budget) {
 const charge=n=>{if((budget.left-=n)<0)throw Error('predicate region budget exceeded')};
 const env=p.safeArea??{};
 function value(o){
  if(typeof o==='string')return scalar(rational(o));
  if(own(o,'environment'))return ({width,height,safeLeft:scalar(env.left??0),safeTop:scalar(env.top??0),safeRight:diff(width,scalar(env.right??0)),safeBottom:diff(height,scalar(env.bottom??0))})[o.environment];
  if(own(o,'target')){
   const r=rects.get(JSON.stringify([o.endpoint??'before',o.target]));
   if(!r)throw Error('missing predicate rectangle');
   if(o.field==='inlineEnd')return sum(r.inlineStart,r.inlineSize);
   if(o.field==='blockEnd')return sum(r.blockStart,r.blockSize);
   return r[o.field];
  }
  if(o.op==='add')return o.items.map(value).reduce(sum);
  if(o.op==='scale')return times(value(o.item),rational(o.factor));
  throw Error('Invalid operand');
 }
 function select(node,reg,want){
  charge(1);
  if(node.op==='not')return select(node.item,reg,!want);
  if(node.op==='compare'){
   const relation={lt:'<',le:'<=',eq:'=',ge:'>=',gt:'>',ne:'='}[node.relation];
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
