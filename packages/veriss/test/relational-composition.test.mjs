import test from 'node:test';
import assert from 'node:assert/strict';
import {init,killThreads} from 'z3-solver';
import {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession,verifyUI} from '../src/layout-contract.mjs';
const a=(constant,coefficient='0')=>({constant,coefficient});
const profile={id:'web',viewport:{min:320,max:1280,height:{min:400,max:900}}};
const state=createStateIR({initial:'ready',states:['ready'],transitions:[]});
const environment=createEnvironmentIR([profile]);
const box=(target,w,extra={})=>({target,state:'ready',profile:'web',source:'external',assumptions:['same independently resolved geometry'],rows:[{rect:{inlineStart:a('0'),blockStart:a('0'),inlineSize:a(String(w)),blockSize:a('48')}}],...extra});
const obligation=(contracts,facts,env=environment)=>createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts}),{state,environment:env,evidence:createEvidenceIR(facts)});
const size=(id,target,width=44)=>({id,kind:'min-size',target,width,height:44});
const ref=(target,field)=>({target,field});
const sumWidth=(a,b,limit)=>({id:'combined',kind:'predicate',predicate:{op:'compare',relation:'ge',left:{op:'add',items:[ref(a,'inlineSize'),ref(b,'inlineSize')]},right:String(limit)}});

test('session memoizes exact case dependencies, not whole documents; mutation and UI sampling cannot poison proofs',()=>{
 const s=createRelationalProofSession();
 const contracts=[size('a','a'),size('b','b')];
 const ob=obligation(contracts,[box('a',48),box('b',50)]);
 const one=s.verify(ob);
 assert.equal(one.status,'verified');assert.equal(s.stats().misses,2);assert.equal(s.stats().hits,0);
 one.contracts[0].cases[0].status='violated';
 const two=s.verify(ob);
 assert.equal(two.status,'verified');assert.equal(two.contracts[0].cases[0].status,'verified');assert.equal(s.stats().hits,2);
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
  const parent=(limit,facts=[box('left',48),box('right',48)])=>obligation([sumWidth('left','right',limit)],facts);
  const imports=[{obligation:child,contract:'size',bind:{control:'left'}},{obligation:child,contract:'size',bind:{control:'right'}}];
  const p=await s.compose(parent(88),imports,api);
  assert.equal(p.status,'verified');assert.equal(p.contracts[0].cases[0].method,'composition');
  assert.equal(p.contracts[0].cases[0].dependencies.length,2);
  // The premises imply >=88, not >=95. Direct verification still succeeds at 96.
  const stronger=await s.compose(parent(95),imports,api);
  assert.equal(stronger.status,'verified');assert.notEqual(stronger.contracts[0].cases[0].method,'composition');
  const violated=await s.compose(parent(100),imports,api);assert.equal(violated.status,'violated');
  const stale=await s.compose(parent(88,[box('left',40),box('right',40)]),imports,api);
  assert.equal(stale.status,'violated');assert.notEqual(stale.contracts[0].cases[0].method,'composition');
  const missing=await s.compose(parent(88,[box('left',48)]),imports,api);
  assert.equal(missing.status,'unknown');
  const different=await s.compose(parent(88,[box('left',48,{assumptions:['different provenance']}),box('right',48)]),imports,api);
  assert.equal(different.status,'verified');assert.notEqual(different.contracts[0].cases[0].method,'composition');
  const unproven=obligation([size('size','control',50)],[box('control',48)]);
  const notProved=await s.compose(parent(88),[{...imports[0],obligation:unproven},imports[1]],api);
  assert.equal(notProved.status,'verified');assert.notEqual(notProved.contracts[0].cases[0].method,'composition');
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
  const child=target=>createObligationIR(createContractIR({component:'Control',profile:'relational/1',contracts:[size('size',target)]}),{state:graph,environment,evidence:ev});
  const parent=createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts:[sumWidth('a','b',88)]}),{state:graph,environment,evidence:ev});
  const imports=['a','b'].map(t=>({obligation:child(t),contract:'size',bind:{[t]:t}}));
  const first=await s.compose(parent,imports,api);
  assert.equal(first.contracts[0].cases[0].method,'composition');
  assert.equal(first.contracts[0].cases[1].status,'verified'); // 48 + 40 exactly meets 88; only one premise applies
  assert.notEqual(first.contracts[0].cases[1].method,'composition');
  const before=s.stats().hits;
  assert.equal((await s.compose(parent,imports,api)).status,'verified');
  assert.ok(s.stats().hits>before);
  const strict=createObligationIR(createContractIR({component:'Panel',profile:'relational/1',contracts:[
    {id:'strict',kind:'predicate',predicate:{...sumWidth('a','b',88).predicate,relation:'gt'}}
  ]}),{state:graph,environment,evidence:ev});
  const result=await s.compose(strict,imports,api);
  assert.equal(result.status,'violated');
  assert.notEqual(result.contracts[0].cases[0].method,'composition');
  const wider=obligation([sumWidth('a','b',88)],[box('a',48),box('b',48)],createEnvironmentIR([{...profile,viewport:{...profile.viewport,max:1500}}]));
  const changed=await s.compose(wider,imports,api);
  assert.equal(changed.status,'verified');
  assert.notEqual(changed.contracts[0].cases[0].method,'composition');
  await assert.rejects(s.compose(parent,[{...imports[0],bind:{}}],api),/target binding/);
 }finally{await killThreads(api.em)}
});
