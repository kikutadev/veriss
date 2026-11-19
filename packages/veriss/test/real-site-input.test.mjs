import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML,htmlBoxTree} from '../src/html.mjs';

const css='*{box-sizing:border-box;margin:0;padding:0}html{font-size:16px}main,a{display:block}';
const run=(html,extra='')=>analyzeHTML(html,{css:css+extra,viewport:{min:320,max:1920}});
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
  assert.equal(run(html,'main{border-left:inherit}').status,'unknown');
});
