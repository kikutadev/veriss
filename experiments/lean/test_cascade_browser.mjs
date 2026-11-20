// Point observations only; never elevate a browser run to a Lean theorem.
// The caller supplies the existing project-specific guarded Chromium launcher.
import { chromium, firefox, webkit } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const [root, guardPath, mode] = process.argv.slice(2);
if (!root || !guardPath) throw Error('usage: node test_cascade_browser.mjs OUTPUT_DIR GUARDED_CHROMIUM_MODULE [--watchdog-probe|chromium|firefox|webkit]');
const { launchGuardedChromium } = await import(pathToFileURL(resolve(guardPath)).href);

if (mode === '--watchdog-probe') {
  const browser = await launchGuardedChromium(chromium, { headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div>guard probe</div>');
    console.log('WATCHDOG_READY',process.pid);
    await new Promise(resolve => setTimeout(resolve, 20000));
  } finally { await browser.close(); }
} else {
  const read = async (name, kind) => JSON.parse(await readFile(join(root,name+'-'+kind+'.json'),'utf8'));
  const rational = v => {
    const [n,d='1'] = String(v??0).split('/');
    return Number(n)/Number(d);
  };
  const value = (a,w,h) => rational(a.coefficient)*w+rational(a.heightCoefficient)*h+rational(a.constant);
  const model = (rows,w,h) => {
    const matches=rows.filter(r=>r.constraints.every(a=>a.strict?value(a,w,h)>0:value(a,w,h)>=0));
    assert(matches.length, 'uncovered model point');
    const rect = r => ['inlineStart','blockStart','inlineSize','blockSize'].map(k=>value(r.rect[k],w,h));
    const v=rect(matches[0]);
    for (const r of matches) assert.deepEqual(rect(r),v);
    return v;
  };
  const fixtures = [];
  for (const [name,ws,hs] of [
    ['cascade',[320,599,600,601,602,603,604,1200],[320,500,900]],
    ['two-axis-media',[320,599,600,601,1200],[320,499,500,501,900]]
  ]) {
    const source=await read(name,'source'), report=await read(name,'report');
    fixtures.push({name,source,rows:report.evidence[0].rows,ws,hs});
  }
  const engines=Object.entries({chromium,firefox,webkit});
  if(mode&&!engines.some(([name])=>name===mode))throw Error('Unknown browser');
  for (const [name,engine] of engines.filter(([name])=>!mode||mode===name)) {
    const browser=name==='chromium'
      ? await launchGuardedChromium(engine,{headless:true})
      : await engine.launch({headless:true});
    try {
      const context=await browser.newContext({viewport:{width:320,height:320},deviceScaleFactor:1});
      try {
        const page=await context.newPage();
        page.setDefaultTimeout(10000);
        let count=0,worst=0;
        for (const {source,rows,ws,hs} of fixtures) {
          await page.setContent(source.html.replace('</head>','<style>'+source.css+'</style></head>'));
          for (const w of ws) for (const h of hs) {
            await page.setViewportSize({width:w,height:h});
            const measured=await page.evaluate(id=>{
              const r=document.getElementById(id).getBoundingClientRect();
              return {w:innerWidth,h:innerHeight,rect:[r.x,r.y,r.width,r.height]};
            },source.target);
            assert.equal(measured.w,w);assert.equal(measured.h,h);
            const expected=model(rows,w,h);
            const err=Math.max(...expected.map((v,i)=>Math.abs(v-measured.rect[i])));
            assert(err<=0.03125,JSON.stringify({name,w,h,expected,measured,err}));
            count++;worst=Math.max(worst,err);
          }
        }
        console.log(JSON.stringify({browser:name,version:browser.version(),deviceScaleFactor:1,points:count,maxErrorCSSPx:worst}));
      } finally { await context.close(); }
    } finally { await browser.close(); }
  }
}
