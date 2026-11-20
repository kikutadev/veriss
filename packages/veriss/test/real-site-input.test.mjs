import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML,htmlBoxTree} from '../src/html.mjs';

const css='*{box-sizing:border-box;margin:0;padding:0}html{font-size:16px}main,a{display:block}';
const run=(html,extra='',block=false)=>analyzeHTML(html,{css:css+extra,viewport:{min:320,max:1920,...(block?{height:{min:480,max:1080}}:{})}});
const page='<html lang="ja"><head><title>T</title></head><body><main></main></body></html>';

test('document comments preserve the html root and layout',()=>{
  const reference=run('<!doctype html>'+page);
  assert.equal(reference.status,'verified');
  for(const prefix of ['<!doctype html><!-- generated -->','<!-- generated --><!doctype html>','<!-- before --><!doctype html>\n<!-- after -->\n','<!-- generated -->']) {
    const actual=run(prefix+page);
    assert.equal(actual.status,'verified',prefix);
    assert.deepEqual(actual.sizes,reference.sizes);
  }
  assert.equal(htmlBoxTree('<!-- fragment --><main></main>').tree.tag,'main');
  assert.throws(()=>htmlBoxTree('<!-- fragment --><main></main><main></main>'),/single root/);
});

test('minified fractional box lengths preserve the result',()=>{
  for(const [a,b] of [['padding:.7rem','padding:0.7rem'],['padding:.5em 1px','padding:0.5em 1px'],['padding:.5px','padding:0.5px'],['letter-spacing:-.03em','letter-spacing:-0.03em'],['padding-inline:.5rem .25rem','padding-inline:0.5rem 0.25rem']]) {
    const ref=run(page,'main{font-size:16px;'+b+'}');
    assert.equal(ref.status,'verified',b);
    const actual=run(page,'main{font-size:16px;'+a+'}');
    assert.equal(actual.status,'verified',a);
    assert.deepEqual(actual.sizes,ref.sizes,a);
  }
  assert.equal(run(page,'main{padding:.7remx}').status,'unknown');
});

test('ordinary anchor rel tokens do not require a rendering adapter',()=>{
  const ref=run('<main><a href="https://example.org"></a></main>');
  assert.equal(ref.status,'verified');
  for(const rel of ['noopener noreferrer','nofollow','external','noopener noreferrer external']) {
    const actual=run('<main><a href="https://example.org" rel="'+rel+'"></a></main>');
    assert.equal(actual.status,'verified',rel);
    assert.deepEqual(actual.sizes,ref.sizes);
  }
  assert.equal(run('<main rel="stylesheet"></main>').status,'unknown');
});

test('physical single-side border shorthands match the supported longhands',()=>{
  for(const side of ['top','right','bottom','left']){
    for(const [value,width,style,color] of [['2px solid #123456','2px','solid','#123456'],['0','0','none','currentcolor'],['none','3px','none','currentcolor']]){
      const html='<main></main>';
      const options={css:css+'main{width:160px;height:50px;',viewport:{min:320,max:1920,height:{min:480,max:1080}}};
      const report=d=>analyzeHTML(html,{...options,css:options.css+d+'}'});
      const ref=report('border-'+side+'-width:'+width+';border-'+side+'-style:'+style+';border-'+side+'-color:'+color);
      assert.equal(ref.status,'verified',side+' '+value);
      const actual=report('border-'+side+':'+value);
      assert.equal(actual.status,'verified',side+' '+value);
      assert.deepEqual(actual.sizes,ref.sizes);
    }
  }
  assert.equal(run(page,'main{border-top:2px dashed red}').status,'unknown');
});

test('side border reset keeps the initial width if style is set later',()=>{
  const html='<main></main>';
  const a=run(html,'main{border-left:none} main{border-left-style:solid}');
  const b=run(html,'main{border-left:3px solid currentcolor}');
  assert.equal(a.status,'verified');
  assert.deepEqual(a.sizes,b.sizes);
  for(const reset of ['initial','unset']) {
    const r=run(html,'main{border-left:'+reset+'} main{border-left-style:solid}');
    assert.equal(r.status,'verified',reset);
    assert.deepEqual(r.sizes,b.sizes,reset);
  }
  assert.equal(run(html,'main{border-left:inherit}').status,'unknown');
});

test('time with datetime has ordinary inline and block geometry',()=>{
  for(const display of ['block','inline']){
    const decl='main{display:grid;grid-template-columns:minmax(0,1fr)} .date{display:'+display+';height:24px}';
    const html=tag=>'<main><'+tag+' class="date"'+(tag==='time'?' datetime="2026-11-20"':'')+'></'+tag+'></main>';
    const ref=run(html('span'),decl,true), actual=run(html('time'),decl,true);
    assert.equal(ref.status,'verified');
    assert.equal(actual.status,'verified');
    assert.deepEqual(actual.sizes,ref.sizes);
  }
  assert.equal(run('<main datetime="2026-11-20"></main>').status,'unknown');
});
test('image fetchpriority is a loading hint, not a geometry attribute',()=>{
  const decl='img{display:block;width:80px;height:40px}';
  const html=attr=>'<main><img src="a.png" alt="a" width="80" height="40" '+attr+'></main>';
  const ref=run(html(''),decl,true);
  assert.equal(ref.status,'verified');
  for(const value of ['high','low','auto']){
    const actual=run(html('fetchpriority="'+value+'"'),decl,true);
    assert.equal(actual.status,'verified');
    assert.deepEqual(actual.sizes,ref.sizes);
  }
  assert.equal(run('<main fetchpriority="high"></main>').status,'unknown');
});

test('noscript fallback stays hidden in an explicitly scripting-enabled snapshot',()=>{
  const html='<!doctype html><html lang="en"><body><main><noscript><p>fallback</p></noscript><div class="item"></div></main></body></html>';
  const sheet=css+'main{display:grid;grid-template-columns:minmax(0,1fr)} .item{width:80px;height:40px} @media (scripting: none){.item{width:500px}} @media (scripting: enabled){.item{width:100px}}';
  const options={css:sheet,viewport:{min:320,max:1920,height:{min:480,max:1080}}};
  assert.equal(analyzeHTML(html,options).status,'unknown');
  const actual=analyzeHTML(html,{...options,scripting:'enabled'});
  assert.equal(actual.status,'verified',JSON.stringify(actual.diagnostics));
  assert.equal(actual.sizes.find(s=>s.box==='.item').inlineSize.constant,'100');
  assert.ok(!actual.sizes.some(s=>s.box.startsWith('noscript@')));
  assert.ok(actual.assumptions.some(s=>s.includes('scripting')));
  const visible=analyzeHTML(html,{...options,scripting:'enabled',css:sheet+'noscript{display:block}'});
  assert.equal(visible.status,'unknown');
  const combined=analyzeHTML(html,{...options,scripting:'enabled',css:sheet+'@media (scripting: none) and (min-width: 500px){.item{width:200px}}'});
  assert.equal(combined.status,'unknown');
});

test('viewport-fixed horizontal translation checks painted fit, not the pre-transform coordinate',()=>{
  const html='<!doctype html><html lang="en"><body><div class="island"></div></body></html>';
  const css='*{box-sizing:border-box;margin:0;padding:0}html,body{font-size:16px}.island{position:fixed;bottom:14px;left:50%;width:min(344px,100vw - 22px);height:57px;border:1px solid #3c4943}';
  const opt={viewport:{min:320,max:1920,height:{min:320,max:1080}},integrity:true};
  const centered=analyzeHTML(html,{...opt,css:css+'.island{transform:translate(-50%)translateZ(0)}'});
  assert.equal(centered.status,'verified',JSON.stringify(centered.diagnostics));
  assert.ok(centered.checks.length>0);
  const uncentered=analyzeHTML(html,{...opt,css});
  assert.equal(uncentered.status,'violated');
  assert.ok(uncentered.diagnostics.some(d=>d.code==='E_LAYOUT_ABSOLUTE_END'));
  const left=analyzeHTML(html,{...opt,css:css+'.island{transform:translate(-110%)}'});
  assert.equal(left.status,'violated');
  assert.ok(left.diagnostics.some(d=>d.code==='E_LAYOUT_ABSOLUTE_START'));
  const right=analyzeHTML(html,{...opt,css:css+'.island{transform:translate(10%)}'});
  assert.equal(right.status,'violated');
  assert.ok(right.diagnostics.some(d=>d.code==='E_LAYOUT_ABSOLUTE_END'));
});

test('fully off-canvas fixed drawer retains layout obligations instead of reporting painted overflow',()=>{
  const html='<!doctype html><html><body><div class="drawer"></div></body></html>';
  const base='*{box-sizing:border-box;margin:0;padding:0}.drawer{position:fixed;left:0;top:0;width:240px;height:240px;transform:translateX(-100%)}';
  const options={viewport:{min:320,max:1280,height:{min:320,max:900}},integrity:true};
  for(const css of [base,base+'.drawer{visibility:hidden}',base+'.drawer{width:100%;visibility:hidden}']){
    const r=analyzeHTML(html,{...options,css});
    assert.equal(r.status,'verified',JSON.stringify(r.diagnostics));
  }
  const partial=analyzeHTML(html,{...options,css:base+'.drawer{transform:translateX(-50%)}'});
  assert.equal(partial.status,'violated');
  assert.ok(partial.diagnostics.some(d=>d.code==='E_LAYOUT_ABSOLUTE_START'));
});

test('minified unitless zero rotation is identical to zero degrees',()=>{
  const html='<main><div class="item"></div></main>';
  const css='*{box-sizing:border-box;margin:0;padding:0}.item{width:100px;height:40px;transform:rotate(0deg)}';
  const options={viewport:{min:320,max:1920,height:{min:320,max:1080}},integrity:true};
  const ref=analyzeHTML(html,{...options,css});
  assert.equal(ref.status,'verified');
  const actual=analyzeHTML(html,{...options,css:css.replace('0deg','0')});
  assert.equal(actual.status,'verified');
  assert.deepEqual(actual.sizes,ref.sizes);
  assert.equal(analyzeHTML(html,{...options,css:css.replace('0deg','1')}).status,'unknown');
});

test('viewport flex basis variants use the same fixed viewport profile',()=>{
  const html='<main><div class="item"></div></main>';
  const css='*{box-sizing:border-box;margin:0;padding:0}main{display:flex;height:300px}.item{flex:0 0 38vh;min-width:0;min-height:0}';
  const options={viewport:{min:320,max:1920,height:{min:320,max:600}}};
  const ref=analyzeHTML(html,{...options,css});
  assert.equal(ref.status,'verified');
  for(const unit of ['dvh','svh','lvh']){
    const report=analyzeHTML(html,{...options,css:css.replace('38vh','38'+unit)});
    assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
    assert.deepEqual(report.sizes,ref.sizes);
  }
  assert.equal(analyzeHTML(html,{...options,css:css.replace('display:flex','display:flex;flex-direction:column').replace('38vh','38dvh')}).status,'unknown');
});

test('viewport-dependent grid gap preserves exact piecewise coordinates and overflow witnesses',()=>{
  const html='<main><div class="a"></div><div class="b"></div></main>';
  const css='*{box-sizing:border-box;margin:0;padding:0}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(12px,4vw,48px)}main>div{height:40px;min-width:0}';
  const options={viewport:{min:240,max:1600,height:{min:320,max:800}},integrity:true};
  const r=analyzeHTML(html,{...options,css});
  assert.equal(r.status,'verified',JSON.stringify(r.diagnostics));
  const at=(a,w,h)=>{const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};return rat(a.constant)+rat(a.coefficient)*w+rat(a.heightCoefficient)*h};
  for(const w of [240,300,301,500,1199,1200,1600]){
    const b=r.sizes.find(s=>s.box==='.b'&&(w>s.range.min||w===s.range.min&&s.range.minInclusive)&&(w<s.range.max||w===s.range.max&&s.range.maxInclusive));
    const g=Math.max(12,Math.min(w*.04,48));
    assert.ok(b?.rect);assert.equal(at(b.rect.inlineStart,w,500),(w+g)/2);
    assert.equal(at(b.rect.inlineSize,w,500),(w-g)/2);
  }
  const overflow=analyzeHTML(html,{...options,css:css.replace('repeat(2,minmax(0,1fr))','150px 150px')});
  assert.equal(overflow.status,'violated');
  assert.ok(overflow.diagnostics.some(d=>d.code==='E_LAYOUT_TRACKS'&&d.witness));
  assert.equal(analyzeHTML(html,{...options,css:css.replace('clamp(12px,4vw,48px)','clamp(12px,4%,48px)')}).status,'unknown');
});

test('viewport-dependent padding and gaps compose inside a block and responsive grid',()=>{
  const html='<main class="shell"><section class="grid"><div class="a"></div><div class="b"></div></section></main>';
  const css='*{box-sizing:border-box;margin:0;padding:0}.shell{padding:clamp(10px,3vh,30px) clamp(24px,5vw,76px)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(16px,2vw,30px)}.grid>div{height:40px;min-width:0}';
  const options={viewport:{min:320,max:1920,height:{min:320,max:1080}},integrity:true};
  const r=analyzeHTML(html,{...options,css});
  assert.equal(r.status,'verified',JSON.stringify(r.diagnostics));
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const w of [320,480,800,1440,1520,1920])for(const h of [320,400,1000,1080]){
    const at=a=>rat(a.constant)+rat(a.coefficient)*w+rat(a.heightCoefficient)*h;
    const b=r.sizes.find(s=>s.box==='.b'&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8));
    const p=Math.max(24,Math.min(w*.05,76)),g=Math.max(16,Math.min(w*.02,30));
    assert.ok(b?.rect);
    assert.ok(Math.abs(at(b.rect.inlineStart)-(w+g)/2)<1e-8);
    assert.ok(Math.abs(at(b.rect.inlineSize)-(w-2*p-g)/2)<1e-8);
    assert.ok(Math.abs(at(b.rect.blockStart)-Math.max(10,Math.min(30,h*.03)))<1e-8);
  }
  const bad=analyzeHTML(html,{...options,css:css.replace('repeat(2,minmax(0,1fr))','240px 240px')});
  assert.equal(bad.status,'violated');
  assert.ok(bad.diagnostics.some(d=>d.code==='E_LAYOUT_TRACKS'&&d.witness));
});

test('block-flow auto margins use the same exact used width as responsive width constraints',()=>{
 const html='<!doctype html><html lang="en"><head><title>T</title></head><body><main id="x"></main></body></html>';
 const opts={viewport:{min:320,max:1000,height:{min:400,max:900}},scrollbars:[{name:'overlay',inlineSize:0,blockSize:0}]};
 const r=analyzeHTML(html,{...opts,css:'*{box-sizing:border-box;margin:0}#x{width:min(100%,520px);height:100px;margin:0 auto;border-inline:2px solid #123456}'});
 assert.equal(r.status,'verified',JSON.stringify(r.diagnostics));
 const rows=r.sizes.filter(s=>s.box==='#x');
 assert.ok(rows.length>=2);
 const wide=rows.find(s=>s.range.max===1000);
 assert.equal(wide.rect.inlineStart.coefficient,'1/2');
 assert.equal(wide.rect.inlineStart.constant,'-260');
 assert.equal(wide.rect.inlineSize.constant,'520');
 const narrow=rows.find(s=>s.range.min===320);
 assert.equal(narrow.rect.inlineStart.constant,'0');
 assert.equal(narrow.rect.inlineSize.coefficient,'1');
});

test('responsive sibling margins collapse by exact region, while grid item margins do not',()=>{
  const html='<main><div class="a"></div><div class="b"></div></main>';
  const base='*{box-sizing:border-box;margin:0;padding:0}main{padding:1px}main>div{height:40px;min-width:0;min-height:0}.a{margin-bottom:clamp(12px,4vw,48px);margin-left:clamp(8px,2vw,24px)}.b{margin-top:clamp(18px,3vh,36px)}';
  const options={viewport:{min:320,max:1600,height:{min:320,max:1000}},integrity:true};
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const grid of [false,true]){
    const css=base+(grid?'main{display:grid;grid-template-columns:minmax(0,1fr)}':'');
    const report=analyzeHTML(html,{...options,css});
    assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
    for(const w of [320,449,450,451,750,900,1200,1600])for(const h of [320,600,800,1000]){
      const at=a=>rat(a.constant)+rat(a.coefficient)*w+rat(a.heightCoefficient)*h;
      const rect=name=>report.sizes.find(s=>s.box===name&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8))?.rect;
      const a=rect('.a'),b=rect('.b');
      assert.ok(a&&b);const m=Math.max(12,Math.min(w*.04,48)),n=Math.max(18,Math.min(h*.03,36)),left=Math.max(8,Math.min(w*.02,24));
      assert.ok(Math.abs(at(b.blockStart)-(41+(grid?m+n:Math.max(m,n))))<1e-8);
      assert.ok(Math.abs(at(a.inlineStart)-(1+left))<1e-8);
      assert.ok(Math.abs(at(a.inlineSize)-(w-2-left))<1e-8);
    }
  }
  for(const extra of ['main{display:flex}.a{flex:0 0 50%}','main{padding:0}.a{margin-top:10vw}','.a{height:auto}','.a{position:absolute;top:0;left:0;width:100px}','.a{margin-left:5vw;margin-right:auto}']){
    assert.equal(analyzeHTML(html,{...options,css:base+extra}).status,'unknown',extra);
  }
  assert.equal(analyzeHTML(html,{...options,css:base.replace('clamp(12px,4vw,48px)','clamp(-12px,4vw,48px)')}).status,'unknown');
});

test('responsive flex margins preserve inner shrink weights and outer line thresholds',()=>{
  const html='<main><div class="a"></div><div class="b"></div></main>';
  const base='*{box-sizing:border-box;margin:0;padding:0}main{display:flex}main>div{height:40px;min-width:0;min-height:0}.a{flex:1 1 240px;margin-left:clamp(8px,2vw,24px);margin-top:clamp(12px,4vh,32px)}.b{flex:1 1 180px;margin-right:clamp(10px,3vw,30px)}';
  const options={viewport:{min:320,max:1600,height:{min:320,max:1000}},integrity:true};
  const report=analyzeHTML(html,{...options,css:base});
  assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
  const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
  for(const w of [320,420,450,800,1600])for(const h of [320,600,1000]){
    const at=a=>rat(a.constant)+rat(a.coefficient)*w+rat(a.heightCoefficient)*h;
    const rect=name=>report.sizes.find(s=>s.box===name&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8))?.rect;
    const a=rect('.a'),b=rect('.b');assert.ok(a&&b);
    const left=Math.max(8,Math.min(w*.02,24)),right=Math.max(10,Math.min(w*.03,30)),free=w-420-left-right;
    const width=240+free*(free<0?240/420:.5);
    assert.ok(Math.abs(at(a.inlineSize)-width)<1e-8);
    assert.ok(Math.abs(at(b.inlineStart)-width-left)<1e-8);
  }
  assert.equal(analyzeHTML(html,{...options,css:base+'.a{flex:0 0 50%}'}).status,'unknown');
});

test('responsive margins refuse undecided containing and through-collapse dependencies',()=>{
  const options={viewport:{min:320,max:1600,height:{min:320,max:1000}},integrity:true};
  const reset='*{box-sizing:border-box;margin:0;padding:0}';
  const cases=[
    ['<main><section><div class="a"></div></section></main>', 'main{padding:1px}.a{height:40px;margin-top:5vw}'],
    ['<main><div class="a"></div><div class="b"></div></main>', 'main{padding:1px}.a{height:40px;margin-bottom:5vw}.b{height:40px;margin-top:-10px}'],
    ['<main><div class="a"></div></main>', 'main{display:grid;grid-template-columns:min-content}.a{width:200px;height:40px;margin-inline:5vw}'],
    ['<main><div class="a"></div></main>', 'main{display:flex;flex-direction:column}.a{margin-top:5vw}'],
    ['<main><div class="a"></div></main>', 'main{display:flex}.a{height:20px;flex:1 1 80px;margin-left:5vw;margin-right:auto}'],
  ];
  for(const [html,css] of cases)assert.equal(analyzeHTML(html,{...options,css:reset+css}).status,'unknown',css);
  assert.equal(analyzeHTML('<main><div class="a"></div></main>',{viewport:{min:320,max:1600},css:reset+'main{display:grid;grid-template-columns:minmax(0,1fr)}.a{margin-top:5vw}'}).status,'unknown');
});

test('explicit media environment resolves interaction capabilities and reduced motion with width and height',()=>{
  const html='<main><div id="panel"></div></main>';
  const css='*{box-sizing:border-box;margin:0;padding:0}#panel{height:40px;width:100%}@media (hover:hover) and (min-width:600px),(pointer:coarse) and (min-height:700px){#panel{width:50%}}@media (prefers-reduced-motion:reduce){#panel{height:80px}@media (min-width:800px){#panel{height:100px}}}';
  const viewport={min:320,max:1200,height:{min:320,max:1000}};
  const run=mediaFeatures=>analyzeHTML(html,{css,viewport,integrity:true,...(mediaFeatures?{mediaFeatures}:{})});
  assert.equal(run().status,'unknown');
  for(const features of [
    {hover:'hover',pointer:'fine','prefers-reduced-motion':'no-preference'},
    {hover:'none',pointer:'coarse','prefers-reduced-motion':'reduce'},
    {hover:'none',pointer:'none','prefers-reduced-motion':'reduce'}
  ]){
    const r=run(features);
    assert.equal(r.status,'verified',JSON.stringify(r.diagnostics));
    assert.deepEqual(r.scope.mediaFeatures,features);
    const rat=v=>{const [n,d='1']=String(v??0).split('/');return Number(n)/Number(d)};
    for(const w of [320,599,600,799,800,1200])for(const h of [320,699,700,1000]){
      const at=a=>rat(a.constant)+rat(a.coefficient)*w+rat(a.heightCoefficient)*h;
      const row=r.sizes.find(s=>s.box==='#panel'&&s.region.constraints.every(c=>c.strict?at(c)>1e-8:at(c)>=-1e-8));
      assert.ok(row?.rect);
      assert.equal(at(row.rect.inlineSize),w*((features.hover==='hover'&&w>=600||features.pointer==='coarse'&&h>=700)?.5:1));
      assert.equal(at(row.rect.blockSize),features['prefers-reduced-motion']==='reduce'?(w>=800?100:80):40);
    }
  }
  assert.throws(()=>run({hover:'sometimes'}),/mediaFeatures/);
  assert.equal(run({hover:'hover',pointer:'fine'}).status,'unknown');
});
