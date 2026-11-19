// Prove an implication over *abstract* border rectangles, independently of
// the CSS layout equations. All identifiers are generated, not user strings.
import {q,exact} from './linear.mjs';
import {numeral,and,or} from './smt.mjs';
import {verifyLayoutModel} from '../layout-z3.mjs';
import {obligationModel} from './model.mjs';

export async function verifyPredicateImplication(profile,premises,goal,api,options) {
 const variables=new Map(), declarations=[];
 const n=v=>numeral(exact(q(v)));
 const env={width:'width',height:'height',safeLeft:n(profile.safeArea?.left??0),safeTop:n(profile.safeArea?.top??0),
   safeRight:'(- width '+n(profile.safeArea?.right??0)+')',safeBottom:'(- height '+n(profile.safeArea?.bottom??0)+')'};
 function operand(o){
  if(typeof o==='string')return numeral(o);
  if(o.environment)return env[o.environment];
  if(o.target){
   if(o.endpoint)throw Error('Transition endpoints are not supported in composition');
   if(!variables.has(o.target)){
    const i=variables.size,r=Object.fromEntries(['inlineStart','blockStart','inlineSize','blockSize'].map((k,j)=>[k,'rect_'+i+'_'+j]));
    declarations.push(...Object.values(r));
    r.inlineEnd='(+ '+r.inlineStart+' '+r.inlineSize+')';
    r.blockEnd='(+ '+r.blockStart+' '+r.blockSize+')';variables.set(o.target,r);
   }
   return variables.get(o.target)[o.field];
  }
  if(o.op==='add')return '(+ '+o.items.map(operand).join(' ')+')';
  if(o.op==='scale')return '(* '+numeral(o.factor)+' '+operand(o.item)+')';
  throw Error('Invalid operand');
 }
 function predicate(p){
  if(p.op==='not')return '(not '+predicate(p.item)+')';
  if(p.op==='all'||p.op==='any')return (p.op==='all'?and:or)(p.items.map(predicate));
  if(p.op==='compare'){
   const x=operand(p.left),y=operand(p.right),op={lt:'<',le:'<=',eq:'=',ge:'>=',gt:'>',ne:'distinct'}[p.relation];
   return '('+op+' '+x+' '+y+')';
  }
  throw Error('Invalid predicate');
 }
 const hypotheses=premises.map(predicate),failure='(not '+predicate(goal)+')';
 const v=profile.viewport,h=v.height;
 const domain=and(['(>= width '+n(v.min)+')','(<= width '+n(v.max)+')','(>= height '+n(h.min)+')','(<= height '+n(h.max)+')',
   ...hypotheses,...[...variables.values()].flatMap(r=>['(>= '+r.inlineSize+' 0)','(>= '+r.blockSize+' 0)'])]);
 const model=obligationModel({component:'RelationalImplication',scope:{axis:'both'},complete:true,assumptions:[],diagnostics:[]},domain,[{code:'IMPLICATION',domain:'true',failure}],{variables:declarations});
 // SAT disproves implication, NOT the implementation. Caller must recheck
 // actual geometry or return Unknown. The domain is checked for feasibility.
 return verifyLayoutModel(model,api,options);
}
