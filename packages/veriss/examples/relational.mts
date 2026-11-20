// Public API example: account/settings form has a 16px gap in either orientation,
// a 44px minimum control size, and stable geometry while saving.
import {analyzeHTML} from '../src/html.mjs';
import {createContractIR,createLayoutIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,layoutGeometry,verifyObligationIR} from '../src/layout-contract.mjs';

const css='*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}section{display:grid;grid-template-columns:minmax(0,1fr);height:100px;align-content:start}#save{width:100%;height:48px}@media(max-width:600px){main{grid-template-columns:minmax(0,1fr)}}';
import type {Operand, Predicate} from '../src/layout-contract.mjs';
import type {RectangleField} from '../src/relational-contract.mjs';

const html=(label: string)=>'<!doctype html><html lang="en"><head><title>Account settings</title></head><body><main><section id="details"></section><section id="actions"><div id="save" role="button" aria-label="'+label+'"></div></section></main></body></html>';
const state=createStateIR({initial:'editing',states:['editing','saving'],transitions:[{from:'editing',event:'submit',to:'saving'}]});
const profile={id:'web',viewport:{min:320,max:1000,height:{min:400,max:900}},scrollbar:{name:'overlay',inlineSize:0,blockSize:0}};
const environment=createEnvironmentIR([profile]);
const ref=(target: string,field: RectangleField): Operand=>({target,field});
const cmp=(relation: Extract<Predicate,{op:'compare'}>['relation'],left: Operand,right: Operand): Predicate=>({op:'compare',relation,left,right});
const contract=createContractIR({component:'AccountSettings',profile:'relational/1',definitions:{
  control:{op:'all',items:[cmp('ge',ref('item','inlineSize'),'44'),cmp('ge',ref('item','blockSize'),'44')]}
},contracts:[
  {id:'control-size',kind:'predicate',predicate:{op:'use',name:'control',bind:{item:'save'}}},
  {id:'responsive-gap',kind:'predicate',predicate:{op:'any',items:(['inline','block'] as const).map(axis=>cmp('le',{op:'add',items:[ref('details',`${axis}End`),'16']},ref('actions',`${axis}Start`)))}},
  {id:'stable-save',kind:'stable',target:'save',event:'submit'}
]});
const evidence=createEvidenceIR(state.states.flatMap(s=>{
  const layout=createLayoutIR(analyzeHTML(html(s==='editing'?'Save':'Saving'),{css,viewport:profile.viewport,scrollbars:[profile.scrollbar]}));
  return layoutGeometry({state:s,profile,layout,targets:['details','actions','save']});
}));
const proof=await verifyObligationIR(createObligationIR(contract,{state,environment,evidence}));
console.log(JSON.stringify(proof,null,2));
process.exitCode=proof.outcome==='verified'?0:proof.outcome==='failed'?1:2;
