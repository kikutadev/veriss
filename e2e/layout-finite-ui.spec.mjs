import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {deriveReactState} from '../packages/react-adapter/src/index.mjs';
import {deriveVueState} from '../packages/vue-adapter/src/index.mjs';
import {deriveSvelteState} from '../packages/svelte-adapter/src/index.mjs';
import {verifyFiniteUI} from '../packages/adapter-core/src/index.mjs';
const adapter=name=>fileURLToPath(new URL('../packages/'+name+'-adapter/',import.meta.url));
const req=name=>createRequire(adapter(name)+'/package.json');
const {build}=req('react')('esbuild');
const {parse,compileScript}=req('vue')('vue/compiler-sfc');
const {compile}=req('svelte')('svelte/compiler');
const fixtures=[
 {name:'react',derive:deriveReactState,source:`import {useState} from 'react';export default function Panel(){const [open,setOpen]=useState(false);return <main><button id="toggle" onClick={()=>setOpen(!open)} aria-label="Toggle"/>{open&&<div id="panel"/>}</main>}`,
  mount:`import Component from 'fixture-component';import {createRoot} from 'react-dom/client';import {createElement} from 'react';createRoot(document.getElementById('app')).render(createElement(Component));`},
 {name:'vue',derive:deriveVueState,source:`<script setup>import {ref} from 'vue';const open=ref(false)</script><template><main><button id="toggle" @click="open = !open" aria-label="Toggle"></button><div v-if="open" id="panel"></div></main></template>`,
  mount:`import Component from 'fixture-component';import {createApp} from 'vue';createApp(Component).mount(document.getElementById('app'));`},
 {name:'svelte',derive:deriveSvelteState,source:`<script>let open=$state(false)</script><main><button id="toggle" onclick={()=>open=!open} aria-label="Toggle"></button>{#if open}<div id="panel"></div>{/if}</main>`,
  mount:`import Component from 'fixture-component';import {mount} from 'svelte';mount(Component,{target:document.getElementById('app')});`},
];
const css='*{box-sizing:border-box;margin:0;padding:0}html,body,#app,main{display:grid;grid-template-columns:minmax(0,1fr)}button{width:100%;height:48px;border:0;appearance:none}#panel{height:80px}';
async function bundle(f){
 const dir=adapter(f.name);
 const code=f.name==='vue'?compileScript(parse(f.source).descriptor,{id:'finite-ui',inlineTemplate:true}).content:f.name==='svelte'?compile(f.source,{generate:'client',filename:'Component.svelte',css:'injected'}).js.code:f.source;
 const r=await build({stdin:{contents:f.mount,resolveDir:dir,sourcefile:'entry.mjs'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',conditions:['browser'],define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture',setup(b){
   b.onResolve({filter:/^fixture-component$/},()=>({path:'component',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:code,loader:f.name==='react'?'jsx':'js',resolveDir:dir}));
 }}]});
 return r.outputFiles[0].text;
}
for(const f of fixtures)test(f.name+' finite click graph and actual mounted layout agree',async({page,browserName})=>{
 const result=f.derive(f.source);
 expect(result.status).toBe('derived');
 const profile={id:'web',ua:browserName,viewport:{min:320,max:900,height:{min:400,max:900}}};
 const proof=verifyFiniteUI(result,{profiles:[profile],targets:['toggle'],contracts:[{id:'stable',kind:'stable',target:'toggle',event:'click:toggle'}],css});
 expect(proof.status,JSON.stringify(proof)).toBe('verified');
 const js=await bundle(f);
 for(const [width,height] of [[320,400],[601,650],[900,900]]){
  await page.goto('about:blank');await page.setViewportSize({width,height});
  await page.setContent('<!doctype html><html lang="en"><head><style>'+css+'</style></head><body><div id="app"></div></body></html>');
  await page.addScriptTag({content:js});
  let state=result.state.initial,initial;
  for(let i=0;i<4;i++){
   const variant=result.variants.find(v=>v.id===state);
   const toggle=page.locator('#toggle');await expect(toggle).toBeVisible();
   await expect(page.locator('#panel')).toHaveCount(variant.values.open?1:0);
   const rect=await toggle.boundingBox();
   initial??=rect;expect(rect).toEqual(initial);
   expect(rect.height).toBe(48);expect(rect.width).toBe(width);
   await toggle.click();
   state=result.state.transitions.find(t=>t.from===state&&t.event==='click:toggle').to;
  }
 }
});
