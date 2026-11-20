import test from 'node:test';
import assert from 'node:assert/strict';
import {createContractIR,createObligationIR,verifyObligationIR,createStateIR,createEnvironmentIR,createEvidenceIR,createLayoutIR} from '../src/layout-contract.mjs';
import {analyzeHTML} from '../src/html.mjs';
const profile={id:'web',viewport:{min:320,max:1000,height:{min:400,max:900}}};
const state=createStateIR({initial:'empty',states:['empty','loaded','dead'],transitions:[{from:'empty',event:'load',to:'loaded'}]});
const environment=createEnvironmentIR([profile]);
const a=(constant,coefficient='0')=>({constant,coefficient});
const row=(width)=>({rect:{inlineStart:a('0'),blockStart:a('0'),inlineSize:a(String(width)),blockSize:a('48')}});
const fact=(state,target,width)=>({state,profile:'web',target,source:'scene',assumptions:['explicit layout model'],rows:[row(width)]});
const ref=(target,field,endpoint)=>({target,field,...(endpoint?{endpoint}:{})});
const cmp=(relation,left,right)=>({op:'compare',relation,left,right});
const evidence=createEvidenceIR([fact('empty','submit',100),fact('loaded','submit',100)]);
const make=contracts=>createContractIR({component:'Checkout',profile:'relational/1',contracts});
const prove=async(contract,ev=evidence)=>verifyObligationIR(createObligationIR(contract,{state,environment,evidence:ev}));
test('relational ContractIR uses explicit state, environment and evidence with composable predicates',async()=>{
 const contract=createContractIR({component:'Checkout',profile:'relational/1',definitions:{usable:{op:'all',items:[cmp('ge',ref('control','inlineSize'),'44'),cmp('le',ref('control','inlineEnd'),{environment:'width'})]}},contracts:[
  {id:'usable',kind:'predicate',predicate:{op:'use',name:'usable',bind:{control:'submit'}}},
  {id:'stable',kind:'predicate',event:'load',predicate:cmp('eq',ref('submit','inlineSize','before'),ref('submit','inlineSize','after'))}
 ]});
 const obligation=createObligationIR(contract,{state,environment,evidence});
 assert.equal(obligation.kind,'obligation');assert.equal(obligation.operation,'relational');
 assert.ok(Object.isFrozen(obligation));assert.deepEqual(JSON.parse(JSON.stringify(obligation)),obligation);
 const p=await verifyObligationIR(obligation);
 assert.equal(p.status,'verified');assert.equal(p.contracts[0].cases.length,2);assert.deepEqual(p.unreachable,['dead']);
 const broken=await prove(contract,createEvidenceIR([fact('empty','submit',100),fact('loaded','submit',30)]));
 assert.equal(broken.status,'violated');assert.equal(broken.contracts[1].cases[0].coverage.status,'verified');
 const missing=await prove(contract,createEvidenceIR([fact('empty','submit',100)]));
 assert.equal(missing.status,'unknown');assert.equal(missing.contracts[1].cases[0].coverage.status,'unknown');
});
test('boolean relations have exact boundaries, no vacuous pass for missing evidence',async()=>{
 const c=make([{id:'either',kind:'predicate',predicate:{op:'any',items:[cmp('lt',ref('submit','inlineSize'),'100'),{op:'not',item:cmp('gt',ref('submit','inlineSize'),'100')}]}}]);
 assert.equal((await prove(c)).status,'verified');
 const empty=await prove(c,createEvidenceIR([]));assert.equal(empty.status,'unknown');
 assert.throws(()=>createContractIR({component:'X',profile:'relational/1',definitions:{x:{op:'use',name:'x',bind:{}}},contracts:[{id:'x',kind:'predicate',predicate:{op:'use',name:'x',bind:{}}}]}),/cycle/i);
});

test('serialized obligations do not permit omitted cases and unknown grammar is rejected',async()=>{
 const c=make([{id:'size',kind:'min-size',target:'submit',width:101,height:44}]);
 const o=JSON.parse(JSON.stringify(createObligationIR(c,{state,environment,evidence})));
 o.cases=[];
 assert.equal((await verifyObligationIR(o)).status,'violated');
 assert.throws(()=>make([{id:'x',kind:'min-size',target:'submit',width:44,height:44,other:'ignored'}]),/Unknown contract field/);
 assert.throws(()=>make([{id:'x',kind:'predicate',predicate:cmp('eq',ref('submit','inlineSize','after'),'100')}]),/Endpoint requires event/);
 assert.throws(()=>createEnvironmentIR([{...profile,pointer:'fine'}]),/Unknown environment field/);
});

test('profile-specific graph and contract applicability are not silently omitted',async()=>{
 const env=createEnvironmentIR([profile,{...profile,id:'desktop'}]);
 const graph=createStateIR({initial:'empty',states:['empty','loaded'],transitions:[{from:'empty',event:'load',to:'loaded',profiles:['web']}]});
 const c=make([{id:'size',kind:'min-size',target:'submit',width:44,height:44,states:['loaded'],profiles:['web']}]);
 const ok=await verifyObligationIR(createObligationIR(c,{state:graph,environment:env,evidence}));
 assert.equal(ok.status,'verified');
 assert.deepEqual(ok.reachability,[{profile:'web',states:['empty','loaded']},{profile:'desktop',states:['empty']}]);
 const both=make([{id:'size',kind:'min-size',target:'submit',width:44,height:44,states:['loaded']}]);
 assert.equal((await verifyObligationIR(createObligationIR(both,{state:graph,environment:env,evidence}))).status,'unknown');
 assert.throws(()=>createObligationIR(make([{id:'size',kind:'min-size',target:'submit',width:44,height:44,profiles:['typo']}]),{state:graph,environment:env,evidence}),/Unknown contract state\/profile/);
});

test('state graph with 64 states has no dummy validation case',()=>{
 const states=Array.from({length:64},(_,i)=>'s'+i);
 assert.equal(createStateIR({initial:states[0],states,transitions:[]}).states.length,64);
 assert.equal(make([{id:'size',kind:'min-size',target:'x',width:44,height:44,states}]).contracts[0].states.length,64);
});

test('observed states outside a profile graph fail the combined outcome',async()=>{
 const env=createEnvironmentIR([profile,{...profile,id:'desktop'}]);
 const graph=createStateIR({initial:'empty',states:['empty','loaded'],transitions:[{from:'empty',event:'load',to:'loaded',profiles:['web']}]});
 const c=make([{id:'size',kind:'min-size',target:'submit',width:44,height:44,profiles:['web']}]);
 const report=await verifyObligationIR(createObligationIR(c,{state:graph,environment:env,evidence}),undefined,{observations:[{state:'loaded',profile:'desktop',width:390,height:600,rects:{}}]});
 assert.equal(report.status,'verified');
 assert.equal(report.outcome,'failed');
 assert.equal(report.observationDiagnostics[0].code,'E_UI_OBSERVED_STATE');
});

test('observations judge required axes independently and preserve exact subpixel failures',async()=>{
 const c=make([{id:'horizontal',kind:'predicate',predicate:cmp('le',ref('submit','inlineEnd'),{environment:'width'})}]);
 const o=createObligationIR(c,{state,environment,evidence});
 const observations=[
   {state:'empty',profile:'web',width:320,height:600,rects:{submit:{x:0,y:12,width:320,height:1154.550048828125}}},
   {state:'loaded',profile:'web',width:320,height:600,rects:{submit:{x:0.0000001,y:0,width:320,height:100}}}
 ];
 const r=await verifyObligationIR(o,undefined,{observations});
 assert.equal(r.status,'verified');
 assert.deepEqual(r.contracts[0].observations.map(o=>o.status),['passed','failed']);
 assert.equal(r.outcome,'failed');
});

test('block-only evidence requires consistent nonnegative complete rows and cannot certify the inline axis',async()=>{
 const vertical=fact('empty','submit',100);
 vertical.axes=['block'];
 vertical.rows=[{rect:{blockStart:a('0'),blockSize:{...a('0'),heightCoefficient:'1'}}}];
 const c=make([
  {id:'block',kind:'predicate',states:['empty'],predicate:cmp('le',ref('submit','blockEnd'),{environment:'safeBottom'})},
  {id:'inline',kind:'predicate',states:['empty'],predicate:cmp('le',ref('submit','inlineEnd'),{environment:'safeRight'})},
  {id:'both',kind:'within-viewport',states:['empty'],target:'submit'}
 ]);
 const check=async e=>(await prove(c,createEvidenceIR([e]))).contracts.map(c=>c.status);
 assert.deepEqual(await check(vertical),['verified','unknown','unknown']);
 const rows=vertical.rows;
 assert.deepEqual(await check({...vertical,rows:[{rect:{blockStart:a('0'),blockSize:a('-1')}}]}),['unknown','unknown','unknown']);
 assert.deepEqual(await check({...vertical,rows:[...rows,{rect:{...rows[0].rect,blockStart:a('1')}}]}),['unknown','unknown','unknown']);
 assert.deepEqual(await check({...vertical,rows:[{...rows[0],constraints:[{...a('-500','1'),strict:false}]}]}),['unknown','unknown','unknown']);
 assert.deepEqual(await check({...vertical,axes:undefined}),['unknown','unknown','unknown']);
});

test('convex transition invariants require both endpoints and an explicit shared progress model',async()=>{
 const {verifyInterpolatedPredicate}=await import('../src/transitions.mjs');
 const predicate={op:'all',items:[cmp('ge',ref('submit','inlineStart'),'0'),cmp('le',ref('submit','inlineEnd'),{environment:'width'})]};
 const input={profile,from:'empty',to:'loaded',evidence:evidence.entries,predicate,interpolation:{kind:'shared-affine',easing:'cubic-bezier(.3,.7,.2,1)',assumptions:['Both coordinates use one bounded progress at a fixed viewport.']}};
 assert.equal(verifyInterpolatedPredicate(input).status,'verified');
 assert.equal(verifyInterpolatedPredicate({...input,evidence:[fact('empty','submit',100)]}).status,'unknown');
 assert.equal(verifyInterpolatedPredicate({...input,evidence:[fact('empty','submit',100),fact('loaded','submit',400)]}).status,'violated');
 assert.equal(verifyInterpolatedPredicate({...input,interpolation:{...input.interpolation,easing:'cubic-bezier(.3,2,.2,1)'}}).status,'unknown');
 assert.equal(verifyInterpolatedPredicate({...input,interpolation:{...input.interpolation,easing:'cubic-bezier(.3,-.0000001,.2,1)'}}).status,'unknown');
 assert.equal(verifyInterpolatedPredicate({...input,interpolation:{...input.interpolation,easing:'steps(0)'}}).status,'unknown');
 assert.equal(verifyInterpolatedPredicate({...input,interpolation:{...input.interpolation,assumptions:[]}}).status,'unknown');
 assert.equal(verifyInterpolatedPredicate({...input,predicate:{op:'any',items:predicate.items}}).status,'unknown');
 assert.equal(verifyInterpolatedPredicate({...input,predicate:cmp('ne',ref('submit','inlineSize'),'150')}).status,'unknown');
});
