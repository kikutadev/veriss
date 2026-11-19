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
