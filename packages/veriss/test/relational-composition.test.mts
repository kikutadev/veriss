import test from 'node:test';
import assert from 'node:assert/strict';
import {init,killThreads} from 'z3-solver';
import {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession,verifyUI} from '../src/layout-contract.mjs';
import type {GeometryEvidence,Relation,RectangleField,RelationalProof,Operand} from '../src/relational-contract.mjs';
const element=<T,>(xs: readonly T[],i: number): T=>{const value=xs[i];assert.ok(value!==undefined);return value;};
const caseAt=(proof: RelationalProof,i=0)=>element(element(proof.contracts,0).cases,i);
const a=(constant: string,coefficient='0')=>({constant,coefficient});
const profile={id:'web',viewport:{min:320,max:1280,height:{min:400,max:900}}};
const state=createStateIR({initial:'ready',states:['ready'],transitions:[]});
const environment=createEnvironmentIR([profile]);
const box=(target: string,w: number,extra: Partial<GeometryEvidence>={}): GeometryEvidence=>({target,state:'ready',profile:'web',source:'external',assumptions:['same independently resolved geometry'],rows:[{rect:{inlineStart:a('0'),blockStart:a('0'),inlineSize:a(String(w)),blockSize:a('48')}}],...extra});
const obligation=(contracts: readonly Relation[],facts: readonly GeometryEvidence[],env=environment)=>createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts}),{state,environment:env,evidence:createEvidenceIR(facts)});
const size=(id: string,target: string,width=44): Extract<Relation,{kind:"min-size"}>=>({id,kind:'min-size',target,width,height:44});
const ref=(target: string,field: RectangleField)=>({target,field});
const sumWidth=(a: string,b: string,limit: number): Extract<Relation,{kind:"predicate"}> & {predicate:{op:"compare";relation:"ge";left: Operand;right: string}}=>({id:'combined',kind:'predicate',predicate:{op:'compare',relation:'ge',left:{op:'add',items:[ref(a,'inlineSize'),ref(b,'inlineSize')]},right:String(limit)}});

test('session memoizes exact case dependencies, not whole documents; mutation and UI sampling cannot poison proofs',()=>{
 const s=createRelationalProofSession();
 const contracts=[size('a','a'),size('b','b')];
 const ob=obligation(contracts,[box('a',48),box('b',50)]);
 const one=s.verify(ob);
 assert.equal(one.status,'verified');assert.equal(s.stats().misses,2);assert.equal(s.stats().hits,0);
 caseAt(one,0).status='violated';
 const two=s.verify(ob);
 assert.equal(two.status,'verified');assert.equal(caseAt(two,0).status,'verified');assert.equal(s.stats().hits,2);
 const edited=obligation(contracts,[box('a',40),box('b',50)]);
 assert.equal(s.verify(edited).status,'violated');assert.equal(s.stats().hits,3);
 assert.equal(s.verify(edited).status,'violated');assert.equal(s.stats().misses,4); // failures never cached
 const sampled=s.verify(ob,{observations:[{state:'ready',profile:'web',width:500,height:600,rects:{a:{x:0,y:0,width:40,height:48},b:{x:0,y:0,width:50,height:48}}}]});
 assert.equal(sampled.status,'verified');assert.equal(sampled.outcome,'failed');
 assert.equal(s.verify(obligation(contracts,[box('a',48),box('b',50)],createEnvironmentIR([{...profile,viewport:{...profile.viewport,max:1000}}]))).status,'verified');
 assert.equal(s.stats().misses,6);
 s.clear();assert.equal(s.stats().entries,0);
});

test('independently proven child predicates compose via exact bound evidence; implication failure is not an implementation failure',async()=>{
 const api=await init();
 try{
  const s=createRelationalProofSession();
  const child=obligation([size('size','control')],[box('control',48)]);
  const parent=(limit: number,facts=[box('left',48),box('right',48)])=>obligation([sumWidth('left','right',limit)],facts);
  const imports=[{obligation:child,contract:'size',bind:{control:'left'}},{obligation:child,contract:'size',bind:{control:'right'}}];
  const p=await s.compose(parent(88),imports,api);
  assert.equal(p.status,'verified');assert.equal(caseAt(p,0).method,'composition');
  const dependencies=caseAt(p,0).dependencies;
  assert.ok(dependencies);assert.equal(dependencies.length,2);
  // The premises imply >=88, not >=95. Direct verification still succeeds at 96.
  const stronger=await s.compose(parent(95),imports,api);
  assert.equal(stronger.status,'verified');assert.notEqual(caseAt(stronger,0).method,'composition');
  const violated=await s.compose(parent(100),imports,api);assert.equal(violated.status,'violated');
  const stale=await s.compose(parent(88,[box('left',40),box('right',40)]),imports,api);
  assert.equal(stale.status,'violated');assert.notEqual(caseAt(stale,0).method,'composition');
  const missing=await s.compose(parent(88,[box('left',48)]),imports,api);
  assert.equal(missing.status,'unknown');
  const different=await s.compose(parent(88,[box('left',48,{assumptions:['different provenance']}),box('right',48)]),imports,api);
  assert.equal(different.status,'verified');assert.notEqual(caseAt(different,0).method,'composition');
  const unproven=obligation([size('size','control',50)],[box('control',48)]);
  const notProved=await s.compose(parent(88),[{...element(imports,0),obligation:unproven},element(imports,1)],api);
  assert.equal(notProved.status,'verified');assert.notEqual(caseAt(notProved,0).method,'composition');
 }finally{await killThreads(api.em)}
});

test('bounded cache, renamed identical geometry proof reuse, and no cached Unknown',()=>{
 const s=createRelationalProofSession({maxEntries:1});
 const one=obligation([size('one','a')],[box('a',48)]);
 assert.equal(s.verify(one).status,'verified');
 assert.equal(s.verify(obligation([size('new','alias')],[box('alias',48)])).status,'verified');
 assert.equal(s.stats().hits,1);
 assert.equal(s.verify(obligation([size('missing','x')],[])).status,'unknown');
 assert.equal(s.stats().entries,1);
 assert.equal(s.verify(obligation([size('changed','a')],[box('a',52)])).status,'verified');
 assert.equal(s.stats().entries,1);assert.equal(s.stats().evictions,1);
});

test('composition distinguishes states, profiles, and strict logical implication',async()=>{
 const api=await init();
 try{
  const s=createRelationalProofSession(),graph=createStateIR({initial:'ready',states:['ready','loaded'],transitions:[{from:'ready',event:'load',to:'loaded'}]});
  const ev=createEvidenceIR([box('a',48),box('b',48),box('a',48,{state:'loaded'}),box('b',40,{state:'loaded'})]);
  const child=(target: string)=>createObligationIR(createContractIR({component:'Control',profile:'relational/1',contracts:[size('size',target)]}),{state:graph,environment,evidence:ev});
  const parent=createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts:[sumWidth('a','b',88)]}),{state:graph,environment,evidence:ev});
  const imports=['a','b'].map(t=>({obligation:child(t),contract:'size',bind:{[t]:t}}));
  const first=await s.compose(parent,imports,api);
  assert.equal(caseAt(first,0).method,'composition');
  assert.equal(caseAt(first,1).status,'verified'); // 48 + 40 exactly meets 88; only one premise applies
  assert.notEqual(caseAt(first,1).method,'composition');
  const before=s.stats().hits;
  assert.equal((await s.compose(parent,imports,api)).status,'verified');
  assert.ok(s.stats().hits>before);
  const strict=createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts:[
    {id:'strict',kind:'predicate',predicate:{...sumWidth('a','b',88).predicate,relation:'gt'}}
  ]}),{state:graph,environment,evidence:ev});
  const result=await s.compose(strict,imports,api);
  assert.equal(result.status,'violated');
  assert.notEqual(caseAt(result,0).method,'composition');
  const wider=obligation([sumWidth('a','b',88)],[box('a',48),box('b',48)],createEnvironmentIR([{...profile,viewport:{...profile.viewport,max:1500}}]));
  const changed=await s.compose(wider,imports,api);
  assert.equal(changed.status,'verified');
  assert.notEqual(caseAt(changed,0).method,'composition');
  await assert.rejects(s.compose(parent,[{...element(imports,0),bind:{}}],api),/target binding/);
 }finally{await killThreads(api.em)}
});

test('affine allocation and origin transfer are checked against current parent geometry',async()=>{
 const api=await init();
 try{
  const s=createRelationalProofSession();
  const cp={id:'child',viewport:{min:160,max:640,height:{min:100,max:600}}};
  const childEnv=createEnvironmentIR([cp]);
  const child=obligation([{id:'fit',kind:'within-viewport',target:'control'}],[box('control',48,{profile:'child',rows:[{rect:{inlineStart:a('0'),blockStart:a('0'),inlineSize:a('0','1'),blockSize:a('48')}}]})],childEnv);
  const parent=(w='1/2',offset='20')=>obligation([{id:'fits',kind:'within-viewport',target:'left'}],[box('left',48,{rows:[{rect:{inlineStart:a(offset),blockStart:a('30'),inlineSize:a('0',w),blockSize:a('48')}}]})]);
  // A half-width child at (20,30), with local height 300, fits the parent.
  // The goal is narrower than the child viewport only after checking its
  // mapped allocation. A pure implication needs explicit allocation bounds.
  const transfer={profile:'child',state:'ready',width:a('0','1/2'),height:a('300'),inlineStart:a('20'),blockStart:a('30')};
  const goal: Relation={id:'child-local',kind:'predicate',predicate:{op:'compare',relation:'le',left:ref('left','inlineEnd'),right:{op:'add',items:['20',{op:'scale',factor:'1/2',item:{environment:'width'}}]}}};
  const p=obligation([goal],parent().implementation.evidence.entries);
  const imports=[{obligation:child,contract:'fit',bind:{control:'left'},transfer}];
  const verified=await s.compose(p,imports,api);
  assert.equal(verified.status,'verified');assert.equal(caseAt(verified,0).method,'composition');
  assert.deepEqual(element(caseAt(verified,0).dependencies ?? [],0).transfer,transfer);
  const changed=obligation([goal],parent('3/4').implementation.evidence.entries);
  assert.equal((await s.compose(changed,imports,api)).status,'violated');
  const outside=await s.compose(p,[{...element(imports,0),transfer:{...transfer,height:a('700')}}],api);
  assert.equal(outside.status,'verified');assert.notEqual(caseAt(outside,0).method,'composition');
  const wrong=await s.compose(p,[{...element(imports,0),transfer:{...transfer,inlineStart:a('25')}}],api);
  assert.notEqual(caseAt(wrong,0).method,'composition');
 }finally{await killThreads(api.em)}
});
