// Extend the portfolio's already reviewed, hash-bound island projection.
// This is an explicit local boundary proof, NOT automatic cascade slicing.
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {chromium,firefox,webkit} from 'playwright';
import {analyzeHTML} from '../../../packages/veriss/src/html.mjs';
import {createLayoutIR,layoutGeometry} from '../../../packages/veriss/src/layout-contract.mjs';
import {verifyInterpolatedPredicate} from '../../../packages/veriss/src/transitions.mjs';

const [snapshotDir,buildDir,mode]=process.argv.slice(2);
assert(mode===undefined||mode==='--home-only','Unknown audit option');
if(!snapshotDir||!buildDir)throw Error('usage: eval-island-transition.mjs reviewed-snapshot-directory build-directory [--home-only]');
const read=name=>readFileSync(resolve(snapshotDir,name),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const reviewed=JSON.parse(read('island-proof.json'));
const hashes={home:'7cd873a8262d06e449c78bceef01a92af528cc123a07b65db4fcf6bd139424ad',about:'48aaaad5a6dcfdfa1feae9f45c719c9df65d971d3216f09e01cff8757648490b',projects:'feece3c0b778ba5a7761f1036d3c4ffd3320ba2f4128c4a7d13bbf20fd323399',articles:'bf523238dc7281be6bfd65c367df0737998ddfe8f2d2c5e3d22d706c66d5d6f7'};
const pages=Object.keys(hashes);
for(const name of pages){
 const result=reviewed.results.find(r=>r.path===(name==='home'?'/':'/'+name+'/'));
 assert.equal(sha(JSON.stringify([read(name+'.html'),JSON.parse(read(name+'.css.json'))])),hashes[name]);
 assert.equal(result.inputHash,hashes[name]);
 assert.equal(sha(result.projectedCSS),'9d30a04838d63d89a591bebd8dc6776f27e9142a2950d0685b85c2656066a5f8');
}
const css=reviewed.results[0].projectedCSS+'\n.mobile-island{display:block}#panel{display:block;height:0;width:auto}';
const assumptions=['For the reviewed, hash-bound DOM/CSS: the fixed island is viewport-anchored and centered by a -50% horizontal translation; its border is constant and no horizontal padding is applied. The column-reverse nowrap flex panel has auto inline size, stretch alignment and no inline margins, so its inline border rectangle equals the outer content box. The synthetic block child expresses only this boundary relation; its height and vertical position are not evidence.',
 'At a fixed viewport, the collapsed and expanded used widths bound the intermediate width. The min() operands are componentwise ordered, the width easing does not overshoot, and the horizontal translation and border are constant. Thus panel and outer inline positions/sizes share an affine progress. Home rules may disable width interpolation (endpoint jumps still lie within the envelope). No viewport resizing, unrelated mutation, or other animation is covered. This implementation correspondence is reviewed, not automatically proved.'];
const fit={op:'all',items:['outer','panel'].flatMap(target=>[
 {op:'compare',relation:'ge',left:{target,field:'inlineStart'},right:{environment:'safeLeft'}},
 {op:'compare',relation:'le',left:{target,field:'inlineEnd'},right:{environment:'safeRight'}}
])};
const viewport={min:320,max:1920,height:{min:320,max:1080}},proofs=[],samples=[],actions=[];
const root=realpathSync(buildDir),origin='https://island-audit.test';
const fileFor=url=>{
 const u=new URL(url);if(u.origin!==origin)throw Error('off origin');
 let file=realpathSync(resolve(root,'.'+decodeURIComponent(u.pathname)));
 if(statSync(file).isDirectory())file=realpathSync(resolve(file,'index.html'));
 if(!file.startsWith(root+'/')||!statSync(file).isFile())throw Error('outside build');
 return file;
};
const sample=()=>{const outer=document.querySelector('[data-mobile-island]'),panel=document.querySelector('[data-island-panel]');const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,width:r.width,right:r.right}};return {outer:rect(outer),panel:rect(panel),expanded:outer.dataset.expanded,visible:getComputedStyle(outer).visibility==='visible',viewport:document.documentElement.clientWidth}};
const num=s=>{const [n,d='1']=String(s??0).split('/');return Number(n)/Number(d)};
const at=(a,w,h)=>num(a.constant)+num(a.coefficient)*w+num(a.heightCoefficient)*h;
function endpoint(e,w,h){
 const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?at(c,w,h)>0:at(c,w,h)>=0));
 assert(rows.length);const r=rows[0].rect,x=at(r.inlineStart,w,h),width=at(r.inlineSize,w,h);return {x,width,right:x+width};
}
for(const [ua,engine] of Object.entries({chromium,firefox,webkit})){
 const profile={id:ua,ua,viewport};
 const evidence=['collapsed','expanded'].flatMap(state=>{
  const html='<!doctype html><html lang="ja"><head><title>QA</title></head><body><div id="outer" class="mobile-island" data-expanded="'+(state==='expanded')+'"><nav id="panel"></nav></div></body></html>';
  const report=analyzeHTML(html,{css,viewport,ua,scripting:'enabled',integrity:true,scrollbars:[{name:'overlay',inlineSize:0,blockSize:0}]});
  return layoutGeometry({state,profile,layout:createLayoutIR(report),targets:['outer','panel'],local:{assumptions}}).map(e=>{
   assert(e.rows?.length,JSON.stringify(e));return {...e,axes:['inline'],rows:e.rows.map(r=>({...r,rect:{inlineStart:r.rect.inlineStart,inlineSize:r.rect.inlineSize}}))};
  });
 });
 const proof=verifyInterpolatedPredicate({profile,from:'collapsed',to:'expanded',evidence,predicate:fit,interpolation:{kind:'shared-affine',easing:'cubic-bezier(.3,.7,.2,1)',assumptions}});
 assert.equal(proof.status,'verified');proofs.push({ua,proof});
 const browser=await engine.launch({headless:true,timeout:15000});
 try{
  // Real local build and real event listeners, with normal (not reduced) motion.
  // A direct Works hash is an actual supported route into the visible HOME
  // island; this does not claim to exercise the full hero handoff.
  for(const path of mode==='--home-only'?['/#selected-work']:['/about.html','/projects.html','/articles.html']){
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference',deviceScaleFactor:1,serviceWorkers:'block'});
   try{
    const page=await context.newPage();
    await page.route('**/*',async route=>{try{await route.fulfill({path:fileFor(route.request().url())})}catch{await route.abort()}});
    await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:15000});
    const toggle=page.locator('[data-island-toggle]');await toggle.waitFor({state:'visible'});
    for(const width of mode==='--home-only'?[320,390,1024,1025,1920]:[320,365,366,367,1024,1025,1920]){
     const height=844;await page.setViewportSize({width,height});
     if(mode==='--home-only'){await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:15000});await toggle.waitFor({state:'visible'});}
     await page.waitForTimeout(650);
     for(const expanded of [true,false]){
      const before=await page.evaluate(sample);
      assert.equal(before.expanded,String(!expanded));
      // Record DOMRects each rAF beginning before the actual user action.
      await page.evaluate(()=>{window.__auditFrames=[];window.__auditRun=true;const tick=()=>{if(!window.__auditRun)return;const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,width:r.width,right:r.right}};window.__auditFrames.push({outer:rect(document.querySelector('[data-mobile-island]')),panel:rect(document.querySelector('[data-island-panel]'))});requestAnimationFrame(tick)};requestAnimationFrame(tick)});
      if(expanded)await toggle.click();else await toggle.press('Escape');
      await page.waitForFunction(v=>document.querySelector('[data-mobile-island]').dataset.expanded===String(v),expanded);
      await page.waitForTimeout(680);
      const frames=await page.evaluate(()=>{window.__auditRun=false;return window.__auditFrames});
      const after=await page.evaluate(sample);
      assert(after.visible);assert.equal(after.viewport,width);assert(frames.length>1);
      const expected=Object.fromEntries(['outer','panel'].map(t=>[t,['collapsed','expanded'].map(s=>endpoint(evidence.find(e=>e.state===s&&e.target===t),width,height))]));
      for(const [actual,index] of [[before,expanded?0:1],[after,expanded?1:0]])for(const t of ['outer','panel'])for(const k of ['x','width','right'])assert(Math.abs(actual[t][k]-expected[t][index][k])<0.1,JSON.stringify({ua,path,width,t,k,actual,expected}));
      const failures=frames.filter(f=>['outer','panel'].some(t=>f[t].x<-.1||f[t].right>width+.1||['x','width','right'].some(k=>f[t][k]<Math.min(...expected[t].map(r=>r[k]))-.1||f[t][k]>Math.max(...expected[t].map(r=>r[k]))+.1)));
      samples.push({ua,path,width,height,expanded,frames:frames.length,failures:failures.length});
      actions.push({ua,path,width,expanded,passed:after.expanded===String(expanded)});
      assert.equal(failures.length,0,JSON.stringify({ua,path,width,expanded,failures:failures.slice(0,3)}));
     }
    }
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
console.log(JSON.stringify({proofs,samples,actions,summary:{profiles:proofs.length,actions:actions.length,frames:samples.reduce((n,s)=>n+s.frames,0),failures:samples.reduce((n,s)=>n+s.failures,0)}},null,2));
