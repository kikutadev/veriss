// Reproducible application-level evaluation; no game source modifications.
// Run under the project-owned browser QA supervisor:
// node tools/eval-game-ui.mjs ../game/voxel-tide-defense/dist
import {webkit} from 'playwright';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyGameUI,domGeometry} from '../packages/adapter-core/src/game-ui.mjs';
import {captureSnapshot,captureGameObservation} from './capture-snapshots.mjs';

const dir=resolve(process.argv[2]??'');
if(!process.argv[2]||!existsSync(resolve(dir,'index.html')))throw Error('Provide the built 潮界防衛 directory');
const profile={id:'webkit-overlay',ua:'webkit',viewport:{min:320,max:1920,height:{min:320,max:1080}},dpr:1};
const model={version:1,initial:'home',states:['home','tech','prepare','pause','combat'],transitions:[
  {from:'home',event:'open-tech',to:'tech'},{from:'tech',event:'return-home',to:'home'},
  {from:'home',event:'start-defense',to:'prepare'},{from:'prepare',event:'pause',to:'pause'},
  {from:'pause',event:'resume',to:'prepare'},{from:'prepare',event:'start-wave',to:'combat'}
],profiles:[profile],contracts:[
  {id:'home-play-in-view',kind:'within-viewport',target:'home-play',states:['home']},
  {id:'home-buttons-separate',kind:'disjoint',target:'home-play',other:'home-tech',states:['home']},
  {id:'tech-dialog-in-view',kind:'within-viewport',target:'tech-dialog',states:['tech']},
  {id:'tech-open-action',kind:'action',event:'open-tech'},
  {id:'tech-return-action',kind:'action',event:'return-home'},
  {id:'start-defense-action',kind:'action',event:'start-defense'},
  {id:'battle-controls-separate',kind:'disjoint',target:'expand-btn',other:'start-wave',states:['prepare']},
  {id:'battle-start-in-view',kind:'within-viewport',target:'start-wave',states:['prepare']},
  {id:'hud-experimental-budget',kind:'max-occupancy',target:'field',overlays:['battle-controls','build-bar'],max:'1/3',states:['prepare']},
  {id:'scene-fits-field',kind:'contains',target:'field-model',other:'scene-canvas',states:['prepare','combat']},
  {id:'scene-fits-viewport',kind:'within-viewport',target:'scene-canvas',states:['prepare','combat']},
  {id:'pause-action',kind:'action',event:'pause'},{id:'resume-action',kind:'action',event:'resume'},{id:'wave-action',kind:'action',event:'start-wave'}
]};
const targets={home:['home-play','home-tech'],tech:['tech-dialog','tech-close'],prepare:['field','battle-controls','build-bar','expand-btn','start-wave','pause-btn'],pause:['overlay','overlay-primary'],combat:['field','battle-controls','build-bar','speed-btn','pause-btn']};
const evidence=[],observations=[],hashes={};
const affine=(constant='0',coefficient='0',heightCoefficient='0')=>({constant,coefficient,heightCoefficient});
function sceneEvidence(state,css) {
  // This is a deliberately narrow renderer model, not an automated CSS
  // extraction. Reject an unexpected build instead of reusing a stale formula.
  const root=css.match(/html,body,#app\s*\{([^}]+)\}/)?.[1]?.replace(/\s+/g,'');
  const field=css.match(/\.field\s*\{([^}]+)\}/)?.[1]?.replace(/\s+/g,'');
  const scene=css.match(/#scene\s*\{([^}]+)\}/)?.[1]?.replace(/\s+/g,'');
  const canvas=css.match(/#scene canvas\s*\{([^}]+)\}/)?.[1]?.replace(/\s+/g,'');
  const minimum=field?.match(/(?:^|;)min-height:(\d+)px(?:;|$)/)?.[1];
  if(!root?.includes('height:100dvh')||!root.includes('width:100%')||!minimum||!field.includes('width:100%')||!field.includes('height:100%')||!scene?.includes('position:absolute')||!scene.includes('inset:0')||!canvas?.includes('width:100%')||!canvas.includes('height:100%'))return [];
  const common={inlineStart:affine(),blockStart:affine(),inlineSize:affine('0','1')};
  const rows=[
    {rect:{...common,blockSize:affine(minimum)},constraints:[{...affine(minimum,'0','-1'),strict:true}]},
    {rect:{...common,blockSize:affine('0','0','1')},constraints:[{...affine('-'+minimum,'0','1'),strict:false}]}
  ];
  const assumptions=['Conditional renderer model from built CSS: root uses 100dvh equal to profile height; field width 100%, height max(profile height, min-height '+minimum+'px).',
    'No other cascade rule changes these field dimensions or origin in prepare/combat; #scene is inset:0 and canvas is 100% of the mount. Renderer uses mount client dimensions.'];
  return ['field-model','scene-canvas'].map(target=>({state,profile:profile.id,target,source:'scene',assumptions,rows}));
}
const browser=await webkit.launch({headless:true,timeout:10000});
try{
  for(const [width,height] of [[320,568],[390,844],[650,510],[651,510],[844,390],[1920,1080]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block'});
    try{
      const page=await context.newPage();
      await page.route('**/*',async r=>{
        const u=new URL(r.request().url()),f=resolve(dir,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
        if(u.origin!=='https://game.test'||!f.startsWith(dir+'/')||!existsSync(f))return r.abort();
        return r.fulfill({path:f});
      });
      await page.goto('https://game.test/',{waitUntil:'domcontentloaded',timeout:10000});
      await page.locator('#home-play').waitFor({state:'visible',timeout:10000});
      await page.waitForTimeout(200);
      async function capture(state){
        const observation=await captureGameObservation(page,{state,profile:profile.id,targets:targets[state]});
        if(['prepare','combat'].includes(state)){
          if(observation.rects.field)observation.rects['field-model']=observation.rects.field;
          const canvas=page.locator('#scene canvas');
          if(await canvas.count()===1){const r=await canvas.evaluate(el=>{const b=el.getBoundingClientRect();return Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(b[k].toFixed(6))]))});observation.rects['scene-canvas']=r}
        }
        observations.push(observation);
        if(width===390){
          const {html}=await captureSnapshot(page,{state},{headLayoutIndependent:true});
          const sheets=await page.locator('head > link[rel=stylesheet],head > style').evaluateAll(nodes=>nodes.map(n=>n.tagName==='STYLE'?{css:n.textContent}:{href:new URL(n.href).pathname}));
          const css=sheets.map(n=>n.css??readFileSync(resolve(dir,n.href.replace(/^\//,'')),'utf8')).join('\n');
          hashes[state]=createHash('sha256').update(html).update(css).digest('hex').slice(0,12);
          evidence.push(...domGeometry({state,profile,html,css,targets:targets[state]}));
          if(['prepare','combat'].includes(state))evidence.push(...sceneEvidence(state,css));
        }
      }
      async function action(state,event,to,selector,expected,expectedState='visible'){
        let passed=false;
        try{await page.locator(selector).click({timeout:5000});await page.locator(expected).waitFor({state:expectedState,timeout:5000});passed=true}catch(e){console.error(width,height,event,e.message.slice(0,150),await page.locator('#home-save-error').textContent().catch(()=>''),await page.evaluate(()=>({overlayHidden:document.querySelector('#overlay').hidden,pauseLabel:document.querySelector('#pause-btn').getAttribute('aria-label'),active:document.activeElement?.id})).catch(()=>null))}
        observations.push({state,profile:profile.id,width,height,event,...(passed?{to}:{}),passed});
        if(!passed)throw Error('Transition failed: '+event);
      }
      await capture('home');
      await action('home','open-tech','tech','#home-tech','#tech-dialog');
      await capture('tech');
      await action('tech','return-home','home','#tech-close','#tech-dialog','hidden');
      await action('home','start-defense','prepare','#home-play','#start-wave');
      await page.waitForFunction(()=>document.querySelector('#scene').getAnimations().every(a=>a.playState!=='running'),null,{timeout:10000});
      await capture('prepare');
      await action('prepare','pause','pause','#pause-btn','#overlay-primary');
      await capture('pause');
      await action('pause','resume','prepare','#overlay-primary','#overlay','hidden');
      await action('prepare','start-wave','combat','#start-wave','#speed-btn');
      await capture('combat');
    }catch(e){console.error(width,height,e.message)}finally{await context.close()}
  }
}finally{await browser.close()}
const report=verifyGameUI({model,evidence,observations});
console.log(JSON.stringify({hashes,report},null,2));
