// Capture a fixed, source-attributed offline fixture. Never called by the
// published demo: fetching here is a deliberate local developer operation.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

type HtmlNode = {tagName?:string;attrs?:{name:string;value:string}[];childNodes?:HtmlNode[];value?:string};
const require=createRequire(new URL('../packages/veriss/package.json',import.meta.url));
const parser:{parse:(html:string)=>HtmlNode;serialize:(node:HtmlNode)=>string}=require('parse5');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dest=resolve(root,'tests/fixtures/product-real-ui');
const specs=[
 {name:'portfolio-about',url:'https://kikuta.dev/about/'},
 {name:'duo-game-title',htmlFile:resolve(root,'../game/duo-breaker/index.html'),cssFile:resolve(root,'../game/duo-breaker/src/style.css'),source:'game/duo-breaker (local project)'},
 {name:'bootstrap-album',url:'https://getbootstrap.com/docs/5.3/examples/album/'},
];
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const attr=(node:HtmlNode,key:string)=>node.attrs?.find(a=>a.name===key)?.value;
const visit=(node:HtmlNode):HtmlNode[]=>[node,...(node.childNodes??[]).flatMap(visit)];
async function request(url:string):Promise<string>{
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);
 return r.text();
}
if(process.argv.length!==3||process.argv[2]!=='--capture'){
 console.error('Usage: node tools/capture-product-real-ui.mjs --capture (network fetches; offline snapshots are otherwise unchanged)');
 process.exitCode=3;
}else{
 await mkdir(dest,{recursive:true});
 for(const spec of specs){
  const input=spec.htmlFile?await readFile(spec.htmlFile,'utf8'):await request(spec.url!);
  const doc=parser.parse(input);
  const sheets:{url:string;value:string}[]=[];
  for(const node of visit(doc)){
   if(node.tagName==='style')sheets.push({url:'inline',value:(node.childNodes??[]).map(n=>n.value??'').join('')});
   else if(node.tagName==='link'&&attr(node,'rel')==='stylesheet'&&spec.url){
    const cssUrl=new URL(attr(node,'href')??'',spec.url).href;
    sheets.push({url:cssUrl,value:await request(cssUrl)});
   }
  }
  if(spec.cssFile)sheets.push({url:'game/duo-breaker/src/style.css',value:await readFile(spec.cssFile,'utf8')});
  function removeLoading(node:HtmlNode):void{
   if(!node.childNodes)return;
   node.childNodes=node.childNodes.filter(n=>!['script','style'].includes(n.tagName??'')&&!(n.tagName==='link'&&attr(n,'rel')==='stylesheet'));
   for(const n of node.childNodes)removeLoading(n);
  }
  removeLoading(doc);
  const html=parser.serialize(doc),css=sheets.map(s=>s.value).join('\n');
  const meta={name:spec.name,source:spec.url??spec.source,markup:spec.htmlFile?'game/duo-breaker/index.html':spec.url,
   stylesheets:sheets.map(s=>({url:s.url,sha256:sha(s.value),bytes:Buffer.byteLength(s.value)})),
   htmlSha256:sha(html),cssSha256:sha(css),
   method:'Initial HTML plus author CSS in source order; scripts and CSS-link nodes removed. No JS state, external fonts or images captured.'};
  await Promise.all([writeFile(resolve(dest,spec.name+'.html'),html),writeFile(resolve(dest,spec.name+'.css'),css),writeFile(resolve(dest,spec.name+'.source.json'),JSON.stringify(meta,null,2)+'\n')]);
  console.log(`${spec.name}: HTML ${html.length} chars, CSS ${css.length} chars`);
 }
}
