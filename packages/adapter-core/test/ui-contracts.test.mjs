import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyUI, domGeometry} from '../src/ui-contracts.mjs';

const profiles=[{id:'mobile',viewport:{min:320,max:800,height:{min:400,max:900}},safeArea:{top:20}}];
const model={version:1,initial:'play',states:['play','pause','unused'],transitions:[{from:'play',event:'pause',to:'pause'},{from:'pause',event:'resume',to:'play'}],profiles,contracts:[
  {id:'safe',kind:'within-viewport',target:'attack',states:['play']},
  {id:'move',kind:'stable',target:'attack',event:'pause'},
  {id:'space',kind:'max-occupancy',target:'field',overlays:['attack','extra'],max:'1/4',states:['play']},
  {id:'missing',kind:'min-size',target:'missing',width:44,height:44},
  {id:'action',kind:'action',event:'pause'}
]};
const affine=(constant='0',coefficient='0',heightCoefficient='0')=>({constant,coefficient,heightCoefficient});
const rect=(x,y,w,h)=>({inlineStart:x,blockStart:y,inlineSize:w,blockSize:h});
const fixed=(x,y,w,h)=>rect(...[x,y,w,h].map(n=>affine(String(n))));
const scene=(state,target,rect)=>({state,profile:'mobile',target,source:'scene',assumptions:['game projection supplies CSS px'],rows:[{rect}]});
const evidence=[scene('play','attack',fixed(0,20,80,80)),scene('pause','attack',fixed(0,20,80,80)),scene('play','extra',fixed(20,20,80,80)),scene('play','field',rect(affine(),affine(),affine('0','1'),affine('0','0','1')))];
test('game model covers reachable graph and reports proof independently of observations',()=>{
  const r=verifyUI({model,evidence,observations:[{state:'play',profile:'mobile',width:390,height:844,event:'pause',to:'pause',passed:true}]});
  const by=Object.fromEntries(r.contracts.map(c=>[c.id,c]));
  assert.deepEqual(r.reachable,['play','pause']);
  assert.equal(by.safe.status,'verified');
  assert.equal(by.move.status,'verified');
  assert.equal(by.space.status,'verified');
  assert.equal(by.missing.status,'unknown');
  assert.equal(by.action.status,'unknown');
  assert.equal(by.action.observations[0].status,'passed');
  assert.equal(r.status,'unknown');
  const moved=verifyUI({model,evidence:[...evidence.filter(e=>!(e.state==='pause'&&e.target==='attack')),scene('pause','attack',fixed(1,20,80,80))]});
  assert.equal(moved.contracts.find(c=>c.id==='move').status,'violated');
});
test('occupancy union is clipped to the field and does not double count',()=>{
  const m={...model,contracts:[{id:'union',kind:'max-occupancy',target:'field',overlays:['attack','extra'],max:'1/2',states:['play']}]};
  const e=[scene('play','field',fixed(0,0,100,100)),scene('play','attack',fixed(-20,0,70,100)),scene('play','extra',fixed(0,0,50,100))];
  assert.equal(verifyUI({model:m,evidence:e}).status,'verified');
  assert.equal(verifyUI({model:{...m,contracts:[{...m.contracts[0],max:'49/100'}]},evidence:e}).status,'violated');
});
test('incomplete and contradictory geometry do not verify; local proof is explicit',()=>{
 const m={...model,contracts:[{id:'size',kind:'min-size',target:'attack',width:44,height:44,states:['play']}]};
 const a=scene('play','attack',fixed(0,20,80,80));
 assert.equal(verifyUI({model:m,evidence:[{...a,rows:[{rect:a.rows[0].rect,constraints:[{...affine('-500','1'),strict:false}]}]}]}).status,'unknown');
 assert.equal(verifyUI({model:m,evidence:[{...a,rows:[...a.rows,{rect:fixed(0,20,81,80)}]}]}).status,'unknown');
 const d=domGeometry({state:'play',profile:profiles[0],html:'<!doctype html><html lang="en"><head><title>x</title></head><body><div id="attack"></div></body></html>',css:'*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}#attack{width:80px;height:80px}',targets:['attack'],local:{assumptions:['independent fixed HUD root aligned to viewport']}});
 assert.equal(d[0].source,'local-dom');
 assert.equal(verifyUI({model:m,evidence:d}).status,'verified');
});

test('geometry observations are independent and failed samples cannot hide behind a proof',()=>{
  const m={...model,contracts:[{id:'safe',kind:'within-viewport',target:'attack',states:['play']}]};
  const observations=[{state:'play',profile:'mobile',width:390,height:844,rects:{attack:{x:0,y:0,width:80,height:80}}}];
  const r=verifyUI({model:m,evidence,observations});
  assert.equal(r.status,'verified');
  assert.equal(r.observationStatus,'failed');
  assert.equal(r.contracts[0].observations[0].status,'failed');
  const sampled=verifyUI({model:m,observations:[{...observations[0],rects:{attack:{x:0,y:20,width:80,height:80}}}]});
  assert.equal(sampled.status,'unknown');
  assert.equal(sampled.observationStatus,'sampled');
});

test('occupancy catches interior maximum and strict piecewise boundaries',()=>{
  // width varies 320..800; at 560, product (w-320)*(800-w) reaches 57600,
  // while both ends are zero. Field is 400x400; intersection stays inside it.
  const m={...model,contracts:[{id:'occ',kind:'max-occupancy',target:'field',overlays:['attack'],max:'1/4',states:['play']}]};
  const e=[scene('play','field',fixed(0,0,500,500)),scene('play','attack',rect(affine(),affine(),affine('-320','1'),affine('800','-1')))];
  assert.equal(verifyUI({model:m,evidence:e}).status,'verified');
  const failed=verifyUI({model:{...m,contracts:[{...m.contracts[0],max:'1/5'}]},evidence:e});
  assert.equal(failed.status,'violated');
  assert.equal(failed.contracts[0].cases[0].witness.width,'560');
  const a=scene('play','attack',fixed(0,20,80,80));
  const split={...a,rows:[{rect:a.rows[0].rect,constraints:[{...affine('-500','1'),strict:false}]},{rect:a.rows[0].rect,constraints:[{...affine('500','-1'),strict:true}]}]};
  const size={...model,contracts:[{id:'size',kind:'min-size',target:'attack',width:44,height:44,states:['play']}]};
  assert.equal(verifyUI({model:size,evidence:[split]}).status,'verified');
  split.rows[0].constraints[0].strict=true;
  assert.equal(verifyUI({model:size,evidence:[split]}).status,'unknown');
});

test('DOM evidence is bound to the profile and local origin is explicit',()=>{
  const profile=profiles[0];
  const d=domGeometry({state:'play',profile,html:'<!doctype html><html lang="en"><head><title>x</title></head><body><div id="attack"></div></body></html>',css:'*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}#attack{width:80px;height:80px}',targets:['attack'],local:{assumptions:['independent root is translated down 20px'],origin:{inlineStart:affine(),blockStart:affine('20')}}});
  const m={...model,contracts:[{id:'safe',kind:'within-viewport',target:'attack',states:['play']}]};
  assert.equal(verifyUI({model:m,evidence:d}).status,'verified');
  assert.throws(()=>verifyUI({model:{...m,profiles:[{...profile,safeArea:{top:21}}]},evidence:d}),/profile mismatch/);
});

test('game model CLI distinguishes proof, observation failure and missing geometry',async()=>{
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {execFileSync}=await import('node:child_process');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  const dir=mkdtempSync(join(tmpdir(),'veriss-game-ui-'));
  try{
    const file=join(dir,'model.json'),cli=fileURLToPath(new URL('../../../tools/ui-check.mjs',import.meta.url));
    const m={...model,contracts:[{id:'safe',kind:'within-viewport',target:'attack',states:['play']}]};
    const run=input=>{
      writeFileSync(file,JSON.stringify(input));
      try{return {exit:0,report:JSON.parse(execFileSync('node',[cli,file],{encoding:'utf8',stdio:'pipe'}))}}catch(e){return {exit:e.status,report:JSON.parse(e.stdout)}}
    };
    assert.equal(run({model:m,evidence}).exit,0);
    assert.equal(run({model:m}).exit,2);
    assert.equal(run({model:m,evidence,observations:[{state:'play',profile:'mobile',width:390,height:844,rects:{attack:{x:0,y:0,width:80,height:80}}}]}).exit,1);
  }finally{rmSync(dir,{recursive:true,force:true})}
});

test('relational manifest lint uses the same proof and strict Unknown exit semantics',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {execFileSync}=await import('node:child_process');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const dir=mkdtempSync(join(tmpdir(),'veriss-ui-'));
 try{
  const file=join(dir,'ui.json'),cli=fileURLToPath(new URL('../../../tools/css-lint.mjs',import.meta.url));
  const m={...model,contracts:[{id:'safe',kind:'within-viewport',target:'attack',states:['play']}]};
  const run=input=>{
    writeFileSync(file,JSON.stringify(input));
    try{return {exit:0,rows:JSON.parse(execFileSync('node',[cli,'--contracts','--fail-on-unknown','--format','json',file],{encoding:'utf8',stdio:'pipe'}))}}catch(e){return {exit:e.status,rows:JSON.parse(e.stdout)}}
  };
  assert.equal(run({model:m,evidence}).exit,0);
  const missing=run({model:m});assert.equal(missing.exit,2);assert.ok(missing.rows.some(r=>r.code==='U_UI_CONTRACT'));
  const failed=run({model:m,evidence,observations:[{state:'play',profile:'mobile',width:390,height:844,rects:{attack:{x:0,y:0,width:80,height:80}}}]});
  assert.equal(failed.exit,1);assert.ok(failed.rows.some(r=>r.code==='E_UI_OBSERVATION'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
