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
