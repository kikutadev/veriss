// Reproducible state/profile-local proof benchmark. Synthetic exact affine
// evidence: measures contract verification, not parsing/layout extraction.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createContractIR,createStateIR,createEnvironmentIR,createEvidenceIR,createObligationIR,createRelationalProofSession,verifyRelationalObligation} from '../packages/veriss/src/layout-contract.mjs';
const state=createStateIR({initial:'ready',states:['ready'],transitions:[]});
const environment=createEnvironmentIR([{id:'web',viewport:{min:320,max:1280,height:{min:400,max:900}}}]);
const a=(constant,coefficient='0')=>({constant:String(constant),coefficient});
const facts=Array.from({length:32},(_,i)=>({state:'ready',profile:'web',target:'box'+i,source:'external',assumptions:['synthetic piecewise-affine geometry'],rows:Array.from({length:8},(_,j)=>({
  rect:{inlineStart:a(i),blockStart:a(i*64),inlineSize:a(0,'1/4'),blockSize:a(48+i+j)},
  constraints:[{...a(-320-j*120,'1'),strict:false},{...a(320+(j+1)*120,'-1'),strict:j!==7}]
}))}));
const contract=createContractIR({component:'Dashboard',profile:'relational/1',contracts:facts.map(f=>({id:'fit_'+f.target,kind:'min-size',target:f.target,width:44,height:44}))});
const make=f=>createObligationIR(contract,{state,environment,evidence:createEvidenceIR(f)});
const original=make(facts);
const edits=Array.from({length:11},(_,i)=>make(facts.map((f,j)=>j===0?{...f,rows:f.rows.map(r=>({...r,rect:{...r.rect,blockSize:a(80+i)}}))}:f)));
const elapsed=fn=>{const start=performance.now();assert.equal(fn().status,'verified');return performance.now()-start};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const samples={direct:[],cold:[],warm:[],edited:[]};
for(let i=0;i<3;i++)elapsed(()=>verifyRelationalObligation(original));
const s=createRelationalProofSession({maxKeyBytes:16_000_000});
for(let i=0;i<11;i++){
 samples.direct.push(elapsed(()=>verifyRelationalObligation(original)));
 const fresh=createRelationalProofSession({maxKeyBytes:16_000_000});
 samples.cold.push(elapsed(()=>fresh.verify(original)));
}
elapsed(()=>s.verify(original));
for(let i=0;i<11;i++){
 samples.warm.push(elapsed(()=>s.verify(original)));
 samples.edited.push(elapsed(()=>s.verify(edits[i])));
}
console.log(JSON.stringify({node:process.version,arch:process.arch,contracts:32,rowsPerTarget:8,runs:11,medianMs:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,median(v)])),cache:s.stats()},null,2));
