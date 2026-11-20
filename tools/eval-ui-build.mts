// Local build QA. No handwritten rectangles. Supply a JSON model and named
// state paths/actions, targets and sample viewport points. Run with a browser
// supervisor. The proof is conditional on each captured DOM and closed cascade;
// observations at other viewport points never substitute for formal evidence.
import {webkit,chromium,firefox} from 'playwright';
import type {Page} from 'playwright';
import type {GeometryEvidence,Observation} from '../packages/veriss/src/layout-contract.mjs';
import type {LayoutAffine} from '../packages/veriss/src/layout-contracts.d.ts';
import {record,array,string,stringRecord,uiModel} from './ui-input.mjs';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {domGeometry,verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';
import {captureSnapshot} from './capture-snapshots.mjs';
const require=createRequire(new URL('../packages/veriss/package.json',import.meta.url));
// Resolve the existing dependency from its owning package.
const postcss: {parse(css:string):{walkAtRules(name:string,visit:(rule:{params:string;remove():unknown})=>void):unknown;toString():string}}=require('postcss');
const [configFile,buildDir,outputDir]=process.argv.slice(2);
if(!configFile||!buildDir)throw Error('usage: eval-ui-build.mjs config.json build-directory [snapshot-output-directory]');
const raw:unknown=JSON.parse(readFileSync(configFile,'utf8'));
const parsed=record(raw,'build configuration');
const config={
 model:uiModel(parsed.model),
 points:array(parsed.points,'viewport points').map((value):[number,number]=>{
  if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='number'||typeof value[1]!=='number')throw Error('Invalid viewport point');
  return [value[0],value[1]];
 }),
 screens:array(parsed.screens,'screens').map(value=>{
  const s=record(value,'screen');
  if(s.settle!==undefined&&typeof s.settle!=='number')throw Error('Invalid settle duration');
  return {state:string(s.state,'screen state'),targets:stringRecord(s.targets,'targets'),
   click:s.click===undefined?undefined:string(s.click,'click'),wait:s.wait===undefined?undefined:string(s.wait,'wait'),settle:s.settle,
   event:s.event===undefined?undefined:string(s.event,'event'),from:s.event===undefined?undefined:string(s.from,'event source')};
 }),
 path:parsed.path===undefined?undefined:string(parsed.path,'path'),
},root=realpathSync(buildDir);
const origin='https://ui-build.test';
const fileFor=(url:string)=>{
 const u=new URL(url);
 if(u.origin!==origin)throw Error('Off-origin resource');
 let file=realpathSync(resolve(root,'.'+decodeURIComponent(u.pathname)));
 if(statSync(file).isDirectory())file=realpathSync(resolve(file,'index.html'));
 if(!file.startsWith(root+'/')||!statSync(file).isFile())throw Error('Resource outside build');
 return file;
};
const closedCSS=async (page:Page)=>{
 const sheets=await page.evaluate(()=>{
  if(document.adoptedStyleSheets.length||document.querySelector('body style,body link[rel=stylesheet]'))throw Error('Unsupported stylesheet source');
  return [...document.querySelectorAll('head > link[rel=stylesheet],head > style')].map(n=>{
   if(!(n instanceof HTMLStyleElement||n instanceof HTMLLinkElement)||(n instanceof HTMLLinkElement&&n.disabled)||n.sheet?.disabled||n.media&&n.media!=='all'||!n.sheet)throw Error('Unresolved stylesheet');
   return n instanceof HTMLLinkElement?{href:n.href}:{css:n.textContent??''};
  });
 });
 const blocked:string[]=[];
 const css=sheets.map(s=>{
  const sheet=postcss.parse(s.css??readFileSync(fileFor(s.href??''),'utf8'));
  // A simple, unmodified off-origin import cannot load in this offline QA.
  // Leave local imports and imports with layer/supports/media modifiers intact.
  sheet.walkAtRules('import',r=>{
   const m=/^(?:url\(\s*)?(['"])(https?:\/\/[^'"\\]+)\1\s*\)?$/.exec(r.params.trim());
   const url=m?.[2];if(url&&new URL(url).origin!==origin){blocked.push(url);r.remove()}
  });
  return sheet.toString();
 }).join('\n');
 return {css,blocked};
};
const num=(x:string|number|undefined)=>{const [n,d='1']=String(x??0).split('/');return Number(n)/Number(d)};
const at=(a:LayoutAffine,w:number,h:number)=>num(a.constant)+num(a.coefficient)*w+num(a.heightCoefficient)*h;
const profiles=config.model.profiles.map(p=>({...p,assumptions:[...(p.assumptions??[]),'Offline local-build QA: off-origin requests blocked, no CSSOM mutations; captured DOM per state is the closed snapshot used throughout the declared range. Samples check but cannot establish that JS remains invariant at every viewport.']}));
const model={...config.model,profiles},evidence:GeometryEvidence[]=[],observations:Observation[]=[],captures:{key:string;width:number;height:number;sha256:string;blocked:string[]}[]=[],issues:{state?:string;profile:string;width:number;height:number;reason:string}[]=[],comparisons:{state:string;profile:string;target:string;width:number;height:number;ok:boolean}[]=[];
if(outputDir)mkdirSync(outputDir,{recursive:true});
for(const profile of profiles){
 const engine={webkit,chromium,firefox}[profile.ua??'chromium'];
 if(!engine)throw Error('Unsupported engine');
 if((['top','right','bottom','left'] as const).some(s=>profile.safeArea?.[s]))throw Error('Local build runner observes only zero safe area');
 const browser=await engine.launch({headless:true,timeout:15000});
 try{
  for(const [width,height] of config.points){
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',deviceScaleFactor:profile.dpr??1,...(profile.mediaFeatures?.['prefers-reduced-motion']?{reducedMotion:profile.mediaFeatures['prefers-reduced-motion']}: {}),...(profile.mediaFeatures?.pointer==='coarse'?{hasTouch:true}: {})});
   try{
    const page=await context.newPage();
    await page.route('**/*',async route=>{try{await route.fulfill({path:fileFor(route.request().url())})}catch{await route.abort()}});
    await page.goto(origin+(config.path??'/'),{waitUntil:'domcontentloaded',timeout:15000});
    if(profile.mediaFeatures){
     const mediaMatches=await page.evaluate(features=>Object.entries(features).every(([key,value])=>matchMedia('('+key+': '+value+')').matches),profile.mediaFeatures);
     if(!mediaMatches)throw Error('Browser mediaFeatures do not match declared profile');
    }
    for(const screen of config.screens){
     try{
      if(screen.click)await page.locator(screen.click).click({timeout:10000});
      if(screen.wait)await page.locator(screen.wait).waitFor({state:'visible',timeout:25000});
      // Wait for finite UI transitions to settle, not perpetual scene animation.
      if(screen.settle)await page.waitForTimeout(screen.settle);
      const selectors=screen.targets;
      const rects=await page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).flatMap(([id,sel])=>{
       const n=document.querySelectorAll(sel),first=n[0];
       if(n.length!==1||!first||!first.getClientRects().length)return [];
       const r=first.getBoundingClientRect();return [[id,{x:r.x,y:r.y,width:r.width,height:r.height}] as const];
      })),selectors);
      observations.push({state:screen.state,profile:profile.id,width,height,rects});
      if(screen.event&&screen.from!==undefined)observations.push({state:screen.from,profile:profile.id,width,height,event:screen.event,to:screen.state,passed:true});
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
     }catch(e){issues.push({state:screen.state,profile:profile.id,width,height,reason:e instanceof Error?e.message:String(e)});break}
    }
   }catch(e){issues.push({profile:profile.id,width,height,reason:e instanceof Error?e.message:String(e)})}finally{await context.close()}
  }
 }finally{await browser.close()}
}
// An empirical mismatch invalidates the collected evidence for this run.
// Samples remain separately reported, even if every comparison agrees.
const invalid=new Set<GeometryEvidence>();
const axes=[['inlineStart','x'],['blockStart','y'],['inlineSize','width'],['blockSize','height']] as const;
for(const o of observations)if(o.rects)for(const e of evidence){
 if(e.state!==o.state||e.profile!==o.profile||!e.rows?.length)continue;
 const {width,height}=o,actual=o.rects[e.target],rows=e.rows.filter(r=>(r.constraints??[]).every(c=>c.strict?at(c,width,height)>0:at(c,width,height)>=0));
 const ok=!!actual&&rows.length>0&&rows.every(r=>axes.every(([k,axis])=>{
  const value=r.rect[k];return !Object.hasOwn(r.rect,k)||(value!==undefined&&Math.abs(at(value,width,height)-actual[axis])<0.5);
 }));
 comparisons.push({state:o.state,profile:o.profile,target:e.target,width,height,ok});
 if(!ok)invalid.add(e);
}
const trusted=evidence.map(e=>{if(!invalid.has(e))return e;const {rows,...rest}=e;return {...rest,reason:'Projected geometry disagrees with a browser sample'}});
const report=verifyUI({model,evidence:trusted,observations});
console.log(JSON.stringify({captures,issues,comparisons,evidence:trusted,report},null,2));
process.exitCode=issues.length||invalid.size||report.outcome==='failed'?1:report.outcome==='unknown'?2:0;
