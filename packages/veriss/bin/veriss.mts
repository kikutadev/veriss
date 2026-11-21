#!/usr/bin/env node
// Closed HTML/CSS project check; no browser navigation or JS execution.
import {readFile} from 'node:fs/promises';
import {analyzeHTML} from '../src/html.mjs';
import {verifyLayoutReport} from '../src/layout-z3-node.mjs';
import type {LayoutSummary} from '../src/layout-contracts.d.ts';

type CheckStatus='verified'|'violated'|'unknown';
const help=`Usage: veriss check --html page.html --css style.css [--min-width 320] [--max-width 1280] [--json]
Checks one static HTML fragment and the complete CSS cascade; does not fetch linked CSS or run JS.
Exit: verified=0, violated=1, unknown=2, usage/input failure=3.`;

function parse(args:string[]) {
  if(args.length===1 && ['--help','-h'].includes(args[0]??'')) return null;
  if(args.shift()!=='check')throw new Error(help);
  let html:string|undefined,css:string|undefined,minWidth=320,maxWidth=1280,json=false;
  const seen=new Set<string>();
  while(args.length) {
    const key=args.shift()!;
    if(seen.has(key))throw new Error(`Duplicate argument: ${key}`);
    seen.add(key);
    if(key==='--json'){json=true;continue;}
    const value=args.shift();
    if(!value||value.startsWith('--'))throw new Error(`Missing value for ${key}\n${help}`);
    if(key==='--html')html=value;
    else if(key==='--css')css=value;
    else if(key==='--min-width'||key==='--max-width') {
      if(!/^[1-9]\d*$/.test(value))throw new Error(`Invalid viewport width: ${value}`);
      if(key==='--min-width')minWidth=Number(value);else maxWidth=Number(value);
    } else throw new Error(`Unknown argument: ${key}\n${help}`);
  }
  if(!html||!css)throw new Error(help);
  if(!Number.isSafeInteger(minWidth)||!Number.isSafeInteger(maxWidth)||minWidth<1||maxWidth>5000||minWidth>maxWidth)
    throw new Error('Viewport width must be 1–5000px with min <= max');
  return {html,css,minWidth,maxWidth,json};
}

function diagnosticsOf(report:LayoutSummary) {
  // These are findings; `checks` are proof obligations, not diagnostics.
  return [...report.diagnostics,...(report.layoutWarnings??[])].map((entry)=>{
    const d=entry as typeof entry & {witness?:{viewport:number;viewportHeight?:number};css?:Array<{file?:string;line?:number;selector?:string;property?:string}>};
    return {
      code:d.code,severity:d.severity,message:d.message??'',
      ...(d.box?{box:d.box}:{}),...(d.path?{path:d.path}:{}),
      ...(d.range?{range:d.range}:{}),...(d.witness?{witness:d.witness}:{}),
      ...(d.css?.[0]?{source:d.css[0]}:{}),
    };
  });
}

async function main():Promise<number> {
  let json=false;
  try {
    const args=parse(process.argv.slice(2));
    if(!args){console.log(help);return 0;}
    json=args.json;
    const [html,css]=await Promise.all([readFile(args.html,'utf8'),readFile(args.css,'utf8')]);
    if(!html.trim()||!css.trim())throw new Error('HTML and CSS files must not be empty');
    const report=analyzeHTML(html,{
      name:'CLI',css,viewport:{min:args.minWidth,max:args.maxWidth,height:{min:600,max:1000}},
      accessibility:true,integrity:true,
    });
    const proof=await verifyLayoutReport(report);
    const status:CheckStatus=report.status==='unknown'||proof.status==='unknown'?'unknown':
      report.status==='violated'||proof.status==='violated'?'violated':'verified';
    const diagnostics=diagnosticsOf(report);
    if(proof.status==='unknown' && !diagnostics.some(x=>x.severity==='unknown'))
      diagnostics.push(...proof.diagnostics.filter(x=>x.severity==='unknown').map(x=>({
        code:x.code,severity:x.severity,message:x.message??'',
      })));
    const counts={error:diagnostics.filter(x=>x.severity==='error').length,
      warning:diagnostics.filter(x=>x.severity==='warning').length,
      unknown:diagnostics.filter(x=>x.severity==='unknown').length};
    const output={status,modelStatus:report.status,proofStatus:proof.status,
      viewport:{min:args.minWidth,max:args.maxWidth},counts,diagnostics,
      ...(proof.witness?{proofWitness:proof.witness}:{}),
      scope:'static fragment / complete author stylesheet / no JS execution'};
    if(json)console.log(JSON.stringify(output,null,2));
    else {
      console.log(`${status.toUpperCase()} · エラー${counts.error} / 警告${counts.warning} / Unknown${counts.unknown} · ${args.minWidth}–${args.maxWidth}px`);
      for(const d of diagnostics){
        const w=d.witness && typeof d.witness.viewport==='number'?` | 反例 ${d.witness.viewport}px`:
          d.range?` | 発生幅 ${d.range.minExact??d.range.min}–${d.range.maxExact??d.range.max}px`:'';
        console.log(`  ${d.severity.toUpperCase()} ${d.code}${d.box?` · ${d.box}`:''}${w}\n    ${d.message}`);
      }
      if(proof.witness)console.log(`  Z3反例: ${proof.witness.viewportExact}px (${proof.witness.code})`);
      if(!diagnostics.length)console.log('  対応した条件で検出された問題はありません。');
      console.log(`  model=${report.status} Z3=${proof.status}`);
    }
    return status==='verified'?0:status==='violated'?1:2;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(json)console.log(JSON.stringify({status:'error',error:message},null,2));
    else console.error(message);
    return 3;
  }
}
process.exitCode=await main();
