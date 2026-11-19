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
