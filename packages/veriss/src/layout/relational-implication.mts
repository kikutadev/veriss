// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Prove an implication over *abstract* border rectangles, independently of
// the CSS layout equations. All identifiers are generated, not user strings.
import {q,exact} from './linear.mjs';
import {numeral,and,or} from './smt.mjs';
import {verifyLayoutModel} from '../layout-z3.mjs';
import {obligationModel} from './model.mjs';
import type {EnvironmentProfile,Operand,RectangleField} from '../relational-contract.mjs';
import type {LayoutSolverAPI} from '../layout-z3.mjs';
import type {ExpandedPredicate} from './relational-predicate.mjs';

export async function verifyPredicateImplication(profile:EnvironmentProfile,premises:readonly ExpandedPredicate[],goal:ExpandedPredicate,api:LayoutSolverAPI,options?:{timeoutMs?:number}) {
 const variables=new Map<string,Record<RectangleField,string>>(), declarations:string[]=[];
 const n=(v:number)=>numeral(exact(q(v)));
 const env={width:'width',height:'height',safeLeft:n(profile.safeArea?.left??0),safeTop:n(profile.safeArea?.top??0),
   safeRight:'(- width '+n(profile.safeArea?.right??0)+')',safeBottom:'(- height '+n(profile.safeArea?.bottom??0)+')'};
 function operand(o:Operand):string{
  if(typeof o==='string')return numeral(o);
  if("environment" in o)return env[o.environment];
  if("target" in o){
   if(o.endpoint)throw Error('Transition endpoints are not supported in composition');
   if(!variables.has(o.target)){
    const i=variables.size;
    const r={inlineStart:'rect_'+i+'_0',blockStart:'rect_'+i+'_1',inlineSize:'rect_'+i+'_2',blockSize:'rect_'+i+'_3'};
    declarations.push(...Object.values(r));
    variables.set(o.target,{...r,inlineEnd:'(+ '+r.inlineStart+' '+r.inlineSize+')',blockEnd:'(+ '+r.blockStart+' '+r.blockSize+')'});
   }
   return variables.get(o.target)![o.field];
  }
  if(o.op==='add')return '(+ '+o.items.map(operand).join(' ')+')';
  if(o.op==='scale')return '(* '+numeral(o.factor)+' '+operand(o.item)+')';
  throw Error('Invalid operand');
 }
 function predicate(p:ExpandedPredicate):string{
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
