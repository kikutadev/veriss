import {test,expect} from '@playwright/test';
import {domGeometry,verifyUI} from '../packages/adapter-core/src/ui-contracts.mjs';

const html='<!doctype html><html lang="en"><head><title>Independent application pane</title></head><body><main id="shell"><kbd>native content</kbd><div class="decor"></div><canvas class="scene" width="300" height="150"></canvas></main></body></html>';
const css='*{box-sizing:border-box;margin:0;padding:0}#shell{position:relative;overflow:hidden;height:100dvh}#shell::after{content:"";position:absolute;inset:0;pointer-events:none}.scene{position:absolute;inset:0;width:100%;height:100%}.decor:has(> .x){clip-path:polygon(0 0,100% 0,0 100%);width:2px}@media (max-height:460px){.scene{height:80%}}div[hidden]{display:none}';
const rational=s=>{const [a,b='1']=String(s??0).split('/');return Number(a)/Number(b)};
const value=(a,w,h)=>rational(a.constant)+rational(a.coefficient)*w+rational(a.heightCoefficient)*h;

test('automatic local evidence matches original browser geometry across both axes',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const targets=['shell','scene'],bindings={scene:'.scene'};
 const args={state:'screen',profile,html,css,targets,bindings};
 const evidence=domGeometry(args);
 expect(evidence.map(e=>e.source)).toEqual(['local-dom','local-dom']);
 expect(evidence.every(e=>e.rows?.length),JSON.stringify(evidence)).toBe(true);
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[{id:'fit',kind:'within-viewport',target:'scene'}]};
 expect(verifyUI({model,evidence}).status).toBe('verified');
 for(const width of [320,651,1000])for(const height of [320,460,461,900]){
   await page.setViewportSize({width,height});
   await page.setContent(html.replace('</head>','<style>'+css+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator(bindings[e.target]??'#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows)for(const [i,k] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())
       expect(actual[i]).toBeCloseTo(value(row.rect[k],width,height),1);
   }
 }
 const bad=domGeometry({...args,css:css+'#shell::after{position:static}'});
 expect(verifyUI({model,evidence:bad}).status).toBe('unknown');
});

test('responsive block centering agrees with actual used width, bounds and margins',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="shell"><kbd>native</kbd></main></body></html>';
 const base='*{box-sizing:border-box;margin:0;padding:0}#shell{height:100px;overflow:hidden;border-inline:2px solid #123456;';
 for(const declaration of [
   'width:min(100%,520px);margin:0 auto',
   'width:clamp(160px,70vw,500px);margin:0 auto;min-width:200px;max-width:460px',
   'width:min(70%,520px);box-sizing:content-box;padding-inline:12px;margin-left:auto;margin-right:8px',
   'width:max(400px,60vw);margin:0 auto',
 ]){
   const style=base+declaration+'}';
   const input=source;
   const [e]=domGeometry({state:'screen',profile,html:input,css:style,targets:['shell']});
   expect(e.rows?.length??0,JSON.stringify(e)).toBeGreaterThan(0);
   for(const width of [320,399,400,519,520,521,657,1000]){
     const height=700;
     await page.setViewportSize({width,height});
     await page.setContent(input.replace('</head>','<style>'+style+'</style></head>'));
     const actual=await page.locator('#shell').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.width]});
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows){
       expect(actual[0],declaration+' @ '+width).toBeCloseTo(value(row.rect.inlineStart,width,height),1);
       expect(actual[1],declaration+' @ '+width).toBeCloseTo(value(row.rect.inlineSize,width,height),1);
     }
   }
 }
});

test('nested overflow projection keeps exact rectangles and exposes failure at short heights',async({page,browserName})=>{
 const profile={id:'web',ua:browserName,viewport:{min:320,max:1000,height:{min:320,max:900}}};
 const source='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="app"><section id="field"><kbd>native</kbd><div id="surface"></div></section></main></body></html>';
 const style='*{box-sizing:border-box;margin:0;padding:0}html,body,#app{width:100%;height:100dvh;overflow:hidden}#field{position:relative;width:100%;height:100%;min-height:400px;overflow:hidden}#surface{position:absolute;inset:0}';
 const evidence=domGeometry({state:'screen',profile,html:source,css:style,targets:['field','surface']});
 const model={version:1,initial:'screen',states:['screen'],transitions:[],profiles:[profile],contracts:[
  {id:'fit',kind:'within-viewport',target:'surface'},
  {id:'contains',kind:'contains',target:'field',other:'surface'}
 ]};
 const proof=verifyUI({model,evidence});
 expect(proof.contracts.map(c=>c.status)).toEqual(['violated','verified']);
 for(const width of [320,844,1000])for(const height of [320,390,399,400,401,900]){
   await page.setViewportSize({width,height});
   await page.setContent(source.replace('</head>','<style>'+style+'</style></head>'));
   for(const e of evidence){
     const actual=await page.locator('#'+e.target).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
     const rows=e.rows.filter(r=>r.constraints.every(c=>c.strict?value(c,width,height)>0:value(c,width,height)>=0));
     expect(rows).not.toHaveLength(0);
     for(const row of rows)for(const [i,k] of ['inlineStart','blockStart','inlineSize','blockSize'].entries())
       expect(actual[i]).toBeCloseTo(value(row.rect[k],width,height),1);
   }
 }
});
