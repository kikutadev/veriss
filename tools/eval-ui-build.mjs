// Local build QA. No handwritten rectangles. Supply a JSON model and named
// state paths/actions, targets and sample viewport points. Run with a browser
// supervisor. The proof is conditional on each captured DOM and closed cascade;
// observations at other viewport points never substitute for formal evidence.
import {webkit,chromium,firefox} from 'playwright';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {domGeometry,verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';
import {captureSnapshot} from './capture-snapshots.mjs';
const require=createRequire(new URL('../packages/veriss/package.json',import.meta.url));
const postcss=require('postcss');
const [configFile,buildDir,outputDir]=process.argv.slice(2);
if(!configFile||!buildDir)throw Error('usage: eval-ui-build.mjs config.json build-directory [snapshot-output-directory]');
const config=JSON.parse(readFileSync(configFile,'utf8')),root=realpathSync(buildDir);
const origin='https://ui-build.test';
const fileFor=url=>{
 const u=new URL(url);
 if(u.origin!==origin)throw Error('Off-origin resource');
 let file=realpathSync(resolve(root,'.'+decodeURIComponent(u.pathname)));
 if(statSync(file).isDirectory())file=realpathSync(resolve(file,'index.html'));
 if(!file.startsWith(root+'/')||!statSync(file).isFile())throw Error('Resource outside build');
 return file;
};
const closedCSS=async page=>{
 const sheets=await page.evaluate(()=>{
  if(document.adoptedStyleSheets.length||document.querySelector('body style,body link[rel=stylesheet]'))throw Error('Unsupported stylesheet source');
  return [...document.querySelectorAll('head > link[rel=stylesheet],head > style')].map(n=>{
   if(n.disabled||n.sheet?.disabled||n.media&&n.media!=='all'||!n.sheet)throw Error('Unresolved stylesheet');
   return n.tagName==='STYLE'?{css:n.textContent}:{href:n.href};
  });
 });
 const blocked=[];
 const css=sheets.map(s=>{
  const sheet=postcss.parse(s.css??readFileSync(fileFor(s.href),'utf8'));
  // A simple, unmodified off-origin import cannot load in this offline QA.
  // Leave local imports and imports with layer/supports/media modifiers intact.
  sheet.walkAtRules('import',r=>{
   const m=/^(?:url\(\s*)?(['"])(https?:\/\/[^'"\\]+)\1\s*\)?$/.exec(r.params.trim());
   if(m&&new URL(m[2]).origin!==origin){blocked.push(m[2]);r.remove()}
  });
  return sheet.toString();
 }).join('\n');
 return {css,blocked};
};
const num=x=>{const [n,d='1']=String(x??0).split('/');return Number(n)/Number(d)};
const at=(a,w,h)=>num(a.constant)+num(a.coefficient)*w+num(a.heightCoefficient)*h;
const profiles=config.model.profiles.map(p=>({...p,assumptions:[...(p.assumptions??[]),'Offline local-build QA: off-origin requests blocked, no CSSOM mutations; captured DOM per state is the closed snapshot used throughout the declared range. Samples check but cannot establish that JS remains invariant at every viewport.']}));
const model={...config.model,profiles},evidence=[],observations=[],captures=[],issues=[],comparisons=[];
if(outputDir)mkdirSync(outputDir,{recursive:true});
for(const profile of profiles){
 const engine={webkit,chromium,firefox}[profile.ua??'chromium'];
 if(!engine)throw Error('Unsupported engine');
 if(['top','right','bottom','left'].some(s=>profile.safeArea?.[s]))throw Error('Local build runner observes only zero safe area');
 const browser=await engine.launch({headless:true,timeout:15000});
 try{
  for(const [width,height] of config.points){
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',deviceScaleFactor:profile.dpr??1});
   try{
    const page=await context.newPage();
    await page.route('**/*',async route=>{try{await route.fulfill({path:fileFor(route.request().url())})}catch{await route.abort()}});
    await page.goto(origin+(config.path??'/'),{waitUntil:'domcontentloaded',timeout:15000});
    for(const screen of config.screens){
     try{
      if(screen.click)await page.locator(screen.click).click({timeout:10000});
      if(screen.wait)await page.locator(screen.wait).waitFor({state:'visible',timeout:25000});
      // Wait for finite UI transitions to settle, not perpetual scene animation.
      if(screen.settle)await page.waitForTimeout(screen.settle);
      const selectors=screen.targets;
      const rects=await page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).flatMap(([id,sel])=>{
       const n=document.querySelectorAll(sel);
       if(n.length!==1||!n[0].getClientRects().length)return [];
       const r=n[0].getBoundingClientRect();return [[id,Object.fromEntries(['x','y','width','height'].map(k=>[k,r[k]]))]];
      })),selectors);
      observations.push({state:screen.state,profile:profile.id,width,height,rects});
      if(screen.event)observations.push({state:screen.from,profile:profile.id,width,height,event:screen.event,to:screen.state,passed:true});
      const key=profile.id+'/'+screen.state;
      if(!captures.some(c=>c.key===key)){
       const {html}=await captureSnapshot(page,{state:screen.state},{headLayoutIndependent:true});
       const {css,blocked}=await closedCSS(page);
       const targets=Object.keys(selectors),bindings=Object.fromEntries(Object.entries(selectors).filter(([id,sel])=>sel!=='#'+id));
       const entries=domGeometry({state:screen.state,profile,html,css,targets,bindings});
       evidence.push(...entries);
       captures.push({key,width,height,sha256:createHash('sha256').update(html).update(css).digest('hex'),blocked});
       if(outputDir){
        const stem=key.replace(/[^\w-]/g,'_');
        writeFileSync(resolve(outputDir,stem+'.html'),html);
        writeFileSync(resolve(outputDir,stem+'.css'),css);
       }
      }
     }catch(e){issues.push({state:screen.state,profile:profile.id,width,height,reason:e.message});break}
    }
   }catch(e){issues.push({profile:profile.id,width,height,reason:e.message})}finally{await context.close()}
  }
 }finally{await browser.close()}
}
// An empirical mismatch invalidates the collected evidence for this run.
// Samples remain separately reported, even if every comparison agrees.
const invalid=new Set();
for(const o of observations.filter(o=>o.rects))for(const e of evidence.filter(e=>e.state===o.state&&e.profile===o.profile&&e.rows?.length)){
 const {width,height}=o,actual=o.rects[e.target],rows=e.rows.filter(r=>(r.constraints??[]).every(c=>c.strict?at(c,width,height)>0:at(c,width,height)>=0));
 const ok=!!actual&&rows.length>0&&rows.every(r=>['inlineStart','blockStart','inlineSize','blockSize'].every((k,i)=>Math.abs(at(r.rect[k],width,height)-actual[['x','y','width','height'][i]])<0.5));
 comparisons.push({state:o.state,profile:o.profile,target:e.target,width,height,ok});
 if(!ok)invalid.add(e);
}
const trusted=evidence.map(e=>{if(!invalid.has(e))return e;const {rows,...rest}=e;return {...rest,reason:'Projected geometry disagrees with a browser sample'}});
const report=verifyUI({model,evidence:trusted,observations});
console.log(JSON.stringify({captures,issues,comparisons,evidence:trusted,report},null,2));
process.exitCode=issues.length||invalid.size||report.outcome==='failed'?1:report.outcome==='unknown'?2:0;
