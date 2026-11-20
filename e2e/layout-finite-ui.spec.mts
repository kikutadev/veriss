import {required} from './support/required.mjs';
import type {FiniteAnalysis} from '../packages/adapter-core/src/finite-state.mjs';
import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {deriveReactState} from '../packages/react-adapter/src/index.mjs';
import {deriveVueState} from '../packages/vue-adapter/src/index.mjs';
import {deriveSvelteState} from '../packages/svelte-adapter/src/index.mjs';
import {verifyFiniteUI} from '../packages/adapter-core/src/index.mjs';
const adapter=(name:string)=>fileURLToPath(new URL('../packages/'+name+'-adapter/',import.meta.url));
import {build} from 'esbuild';
import {parse,compileScript,compileStyle} from 'vue/compiler-sfc';
import {compile} from 'svelte/compiler';
interface Fixture {name:'react'|'vue'|'svelte';derive:(source:string)=>FiniteAnalysis;source:string;mount:string}
const fixtures:Fixture[]=[
 {name:'react',derive:deriveReactState,source:`import {useState} from 'react';export default function Panel(){const [open,setOpen]=useState(false);return <main><button id="toggle" onClick={()=>setOpen(!open)} aria-label="Toggle"/>{open&&<div id="panel"/>}</main>}`,
  mount:`import Component from 'fixture-component';import {createRoot} from 'react-dom/client';import {createElement} from 'react';createRoot(document.getElementById('app')).render(createElement(Component));`},
 {name:'vue',derive:deriveVueState,source:`<script setup>import {ref} from 'vue';const open=ref(false)</script><template><main><button id="toggle" @click="open = !open" aria-label="Toggle"></button><div v-if="open" id="panel"></div></main></template>`,
  mount:`import Component from 'fixture-component';import {createApp} from 'vue';createApp(Component).mount(document.getElementById('app'));`},
 {name:'svelte',derive:deriveSvelteState,source:`<script>let open=$state(false)</script><main><button id="toggle" onclick={()=>open=!open} aria-label="Toggle"></button>{#if open}<div id="panel"></div>{/if}</main>`,
  mount:`import Component from 'fixture-component';import {mount} from 'svelte';mount(Component,{target:document.getElementById('app')});`},
];
const css='*{box-sizing:border-box;margin:0;padding:0}html,body,#app,main{display:grid;grid-template-columns:minmax(0,1fr)}button{width:100%;height:48px;border:0;appearance:none}#panel{height:80px}';
async function bundle(f:Fixture){
 const dir=adapter(f.name);
 let code=f.source,style='';
 if(f.name==='vue'){
  const descriptor=parse(f.source).descriptor,id='data-v-veriss-finite',scoped=descriptor.styles.some(s=>s.scoped);
  code=compileScript(descriptor,{id,inlineTemplate:true,templateOptions:{scoped}}).content;
  if(scoped)code=code.replace('export default','const Component =')+'\nComponent.__scopeId='+JSON.stringify(id)+';export default Component;';
  style=descriptor.styles.map(s=>compileStyle({source:s.content,filename:'Component.vue',id,scoped:!!s.scoped}).code).join('\n');
 }else if(f.name==='svelte')code=compile(f.source,{generate:'client',filename:'Component.svelte',css:'injected',cssHash:()=> 'svelte-veriss-finite'}).js.code;
 const r=await build({stdin:{contents:f.mount,resolveDir:dir,sourcefile:'entry.mjs'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',conditions:['browser'],define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture',setup(b){
   b.onResolve({filter:/^fixture-component$/},()=>({path:'component',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:code,loader:f.name==='react'?'jsx':'js',resolveDir:dir}));
 }}]});
 return {js:required(r.outputFiles?.[0],'Missing bundle').text,style};
}
for(const f of fixtures)test(f.name+' finite click graph and actual mounted layout agree',async({page,browserName})=>{
 const result=f.derive(f.source);
 expect(result.status).toBe('derived');if(result.status!=='derived')throw Error(result.reason);
 const profile={id:'web',ua:browserName,viewport:{min:320,max:900,height:{min:400,max:900}}};
 const proof=verifyFiniteUI(result,{profiles:[profile],targets:['toggle'],contracts:[{id:'stable',kind:'stable',target:'toggle',event:'click:toggle'}],css});
 expect(proof.status,JSON.stringify(proof)).toBe('verified');
 const {js,style}=await bundle(f);
 for(const [width,height] of [[320,400],[601,650],[900,900]] as const){
  await page.goto('about:blank');await page.setViewportSize({width,height});
  await page.setContent('<!doctype html><html lang="en"><head><style>'+css+style+'</style></head><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:js});
  let state=result.state.initial,initial;
  for(let i=0;i<4;i++){
   const variant=required(result.variants.find(v=>v.id===state),'Missing state variant');
   const toggle=page.locator('#toggle');await expect(toggle).toBeVisible();
   await expect(page.locator('#panel')).toHaveCount(variant.values.open?1:0);
   const rect=required(await toggle.boundingBox(),'Missing toggle rectangle');
   initial??=rect;expect(rect).toEqual(initial);
   expect(rect.height).toBe(48);expect(rect.width).toBe(width);
   await toggle.click();
   state=required(result.state.transitions.find(t=>t.from===state&&t.event==='click:toggle'),'Missing click transition').to;
  }
 }
});

for(const f of fixtures.slice(1))test(f.name+' compiled scoped CSS geometry and cascade agree with the mounted document',async({page,browserName})=>{
 const pageCSS=css.replace('height:48px','height:32px');
 for(const blockSize of [48,30]){
  const component={...f,source:f.source+(f.name==='vue'?'<style scoped>':'<style>')+'button{height:'+blockSize+'px}body{padding:200px}main > div{height:90px}</style>'};
  const result=f.derive(component.source);
  expect(result.status).toBe('derived');if(result.status!=='derived')throw Error(result.reason);expect(result.scopedCSS).toBe(false);
  const profile={id:'web',ua:browserName,viewport:{min:320,max:900,height:{min:400,max:900}}};
  const proof=verifyFiniteUI(result,{profiles:[profile],targets:['toggle'],contracts:[{id:'size',kind:'min-size',target:'toggle',width:44,height:44}],css:pageCSS});
  expect(proof.status,JSON.stringify(proof)).toBe(blockSize===48?'verified':'violated');
  const {js,style}=await bundle(component);
  for(const width of [320,601,900]){
   await page.goto('about:blank');await page.setViewportSize({width,height:600});
   await page.setContent('<!doctype html><html lang="en"><head><style>'+pageCSS+'\n'+style+'</style></head><body><div id="app"></div></body></html>');
   await page.addScriptTag({content:js});
   const toggle=page.locator('#toggle');
   await expect(toggle).toBeVisible();
   await expect(toggle).toHaveCSS('height',blockSize+'px');
   await expect(page.locator('body')).toHaveCSS('padding-left','0px');
   expect(required(await toggle.boundingBox(),'Missing toggle rectangle').width).toBe(width);
   await toggle.click();await expect(page.locator('#panel')).toBeVisible();
   // The page's #panel has ID specificity, higher than the scoped type selector.
   await expect(page.locator('#panel')).toHaveCSS('height','80px');
   expect(required(await toggle.boundingBox(),'Missing toggle rectangle').height).toBe(blockSize);
   const actual=await page.locator('#app').evaluate(el=>[...el.querySelectorAll('*')].map(n=>[n.tagName,n.getAttribute('class'),[...n.attributes].filter(a=>a.name.startsWith('data-v-')).map(a=>a.name)]));
   const expected=await page.evaluate(html=>{const t=document.createElement('template');t.innerHTML=html;return [...t.content.querySelectorAll('*')].map(n=>[n.tagName,n.getAttribute('class'),[...n.attributes].filter(a=>a.name.startsWith('data-v-')).map(a=>a.name)])},required(result.variants[1],'Missing second variant').html);
   expect(actual).toEqual(expected);
  }
 }
});
