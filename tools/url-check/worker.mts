// Public static HTML/CSS collector. The veriss engine runs in the browser.
import {parse,serializeOuter} from 'parse5';

export type ScanResult={
  sourceUrl:string;html:string;css:string;coverage:'static'|'partial';
  notes:string[];stylesheets:{url:string;bytes:number}[];
};
type HtmlNode={tagName?:string;attrs?:Array<{name:string;value:string}>;value?:string;childNodes?:HtmlNode[]};
type Fetcher=typeof fetch;
const MAX_HTML_BYTES=240_000,MAX_STYLE_BYTES=220_000,MAX_TOTAL_CSS_BYTES=300_000;
const MAX_STYLESHEETS=8,MAX_REDIRECTS=3,REQUEST_TIMEOUT_MS=7000;
const allowedOrigins=new Set(['https://kikutadev.github.io','http://127.0.0.1:48357','http://localhost:48357']);

export class ScanError extends Error {
  constructor(message:string,readonly httpStatus=400){super(message);this.name='ScanError';}
}
export function publicUrl(input:string,base?:string):URL {
  let url:URL;
  try{url=new URL(input,base)}catch{throw new ScanError('有効な公開URLを入力してください');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
    !host||host.length>253||host==='localhost'||host.endsWith('.localhost')||
    host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||
    host.endsWith('.onion')||host.includes(':')||
    /^(\d+\.){1,}\d+$/.test(host)||/^\d+$/.test(host)||
    !host.includes('.')||(url.port!==''&&!['80','443'].includes(url.port)))
    throw new ScanError('公開されたHTTP(S)のホスト名と標準ポートのみ対応しています');
  url.hash='';
  return url;
}
async function textWithin(res:Response,limit:number):Promise<{text:string;bytes:number}> {
  if(!res.body)throw new ScanError('取得先が空のレスポンスを返しました',502);
  const reader=res.body.getReader(),decoder=new TextDecoder();
  let total=0,text='';
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit)throw new ScanError('ページまたはCSSが大きすぎるため収集を中止しました',413);
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    return {text,bytes:total};
  }finally{await reader.cancel().catch(()=>{});}
}
async function fetchPublic(input:URL,accept:string,limit:number,fetcher:Fetcher):Promise<{url:URL;body:string;bytes:number}> {
  let url=input;
  for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
    let res:Response;
    try{
      res=await fetcher(url.toString(),{
        method:'GET',redirect:'manual',signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers:{'Accept':accept,'User-Agent':'veriss-static-source-check/1.0'},
      });
    }catch{throw new ScanError('公開サイトへの接続に失敗しました（制限・タイムアウト・接続不可）',502);}
    if([301,302,303,307,308].includes(res.status)){
      if(redirects===MAX_REDIRECTS)throw new ScanError('リダイレクト回数が上限を超えました',502);
      const location=res.headers.get('Location');
      if(!location)throw new ScanError('リダイレクト先がありません',502);
      url=publicUrl(location,url.toString());
      await res.body?.cancel().catch(()=>{});
      continue;
    }
    if(!res.ok)throw new ScanError('取得先が HTTP '+res.status+' を返しました',502);
    const type=(res.headers.get('Content-Type')??'').toLowerCase();
    if(accept.startsWith('text/html')&&type&&!/text\/html|application\/xhtml\+xml/.test(type))
      throw new ScanError('URLのレスポンスはHTMLではありません',415);
    if(accept==='text/css'&&type&&!/text\/css|application\/octet-stream/.test(type))
      throw new ScanError('CSSではないレスポンスです',415);
    const {text:body,bytes}=await textWithin(res,limit);
    return {url,body,bytes};
  }
  throw new ScanError('リダイレクト回数が上限を超えました',502);
}
function attr(node:HtmlNode,key:string):string|undefined {
  return node.attrs?.find(a=>a.name===key)?.value;
}
function walk(node:HtmlNode,fn:(node:HtmlNode)=>void):void {
  fn(node);
  for(const child of node.childNodes??[])walk(child,fn);
}
const javascriptType=(type:string|undefined)=>!type||/^(?:text\/javascript|application\/javascript|module)$/i.test(type.trim());
export async function collectPage(rawUrl:string,fetcher:Fetcher=fetch):Promise<ScanResult> {
  const input=publicUrl(rawUrl);
  const page=await fetchPublic(input,'text/html,application/xhtml+xml',MAX_HTML_BYTES,fetcher);
  const tree=parse(page.body) as unknown as HtmlNode;
  let base=page.url.toString(),bodyNode:HtmlNode|undefined,htmlRoot:HtmlNode|undefined,jsFound=false,noscriptFound=false;
  const styleRefs:Array<{kind:'link'|'inline';href?:string|undefined;css?:string|undefined;media?:string|undefined}>=[];
  walk(tree,(node)=>{
    if(node.tagName==='html')htmlRoot=node;
    if(node.tagName==='body')bodyNode=node;
    if(node.tagName==='base'&&attr(node,'href')){try{base=publicUrl(attr(node,'href')!,page.url.toString()).toString();}catch{/* fallback */}}
    if(node.tagName==='script'&&javascriptType(attr(node,'type')))jsFound=true;
    if(node.tagName==='noscript')noscriptFound=true;
    if(node.tagName==='style')styleRefs.push({kind:'inline',css:(node.childNodes??[]).map(c=>c.value??'').join(''),media:attr(node,'media')});
    if(node.tagName==='link'&&/\bstylesheet\b/i.test(attr(node,'rel')??'')&&attr(node,'href')&&!node.attrs?.some(a=>a.name==='disabled'))
      styleRefs.push({kind:'link',href:attr(node,'href'),media:attr(node,'media')});
  });
  if(!bodyNode)throw new ScanError('HTMLのbodyを見つけられませんでした',422);
  const omit=new Set(['script','style','link','base','noscript','template']);
  // Keep the html/body root and the viewport meta: CSS selectors for body/html
  // must not silently lose their subject when checking real site source.
  const prune=(n:HtmlNode):void=>{
    if(!n.childNodes)return;
    n.childNodes=n.childNodes.filter(c=>!c.tagName||!omit.has(c.tagName));
    if(n.tagName!=='head')n.childNodes=n.childNodes.filter(c=>c.tagName!=='meta');
    for(const child of n.childNodes)prune(child);
  };
  const staticRoot=htmlRoot??bodyNode;
  prune(staticRoot);
  const bodyHtml=serializeOuter(staticRoot as never);
  if(!bodyHtml.trim())throw new ScanError('検証できるbodyのHTMLがありません',422);
  if(new TextEncoder().encode(bodyHtml).byteLength>MAX_HTML_BYTES)
    throw new ScanError('HTMLが大きすぎます。まずCLIで一部分を検査してください',413);
  const notes:string[]=[],sheets:ScanResult['stylesheets']=[];
  if(jsFound)notes.push('JavaScriptの実行後に生成されるDOMとCSSは取得していません');
  if(noscriptFound)notes.push('noscript内の表示条件は検証していません');
  if(!styleRefs.length)notes.push('外部CSSまたは動的CSSがある場合、スタイルの取得が不完全です');
  let css='',count=0;
  for(const ref of styleRefs){
    if(ref.kind==='link'&&count>=MAX_STYLESHEETS){notes.push('CSSリンクの取得上限（8件）を超えました');break;}
    let source='',url=page.url.toString(),bytes=0;
    if(ref.kind==='inline'){
      source=ref.css??'';
      bytes=new TextEncoder().encode(source).byteLength;
    }else{
      count++;
      try{
        const result=await fetchPublic(publicUrl(ref.href!,base),'text/css',MAX_STYLE_BYTES,fetcher);
        source=result.body;url=result.url.toString();bytes=result.bytes;sheets.push({url,bytes});
      }catch(error){
        notes.push('CSSの取得に失敗: '+ref.href?.slice(0,120)+'（'+(error instanceof Error?error.message:String(error))+'）');
        continue;
      }
    }
    if(/@import\s+(?:url\(|["'])/i.test(source))notes.push('CSSの@import参照は展開していません');
    if(css.length+source.length>MAX_TOTAL_CSS_BYTES){notes.push('CSS総量が上限を超えたため、一部を検証できません');break;}
    const media=ref.media?.trim();
    css+=(media&&media.toLowerCase()!=='all'?'@media '+media+'{\n'+source+'\n}\n':source+'\n');
  }
  if(!css.trim())notes.push('CSSの収集結果が空です');
  return {
    sourceUrl:page.url.toString(),html:bodyHtml,css,
    coverage:notes.length?'partial':'static',
    notes:[...new Set(notes)],stylesheets:sheets,
  };
}
function json(value:unknown,status=200,origin:string|null=null):Response {
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'});
  if(origin&&allowedOrigins.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  return new Response(JSON.stringify(value),{status,headers});
}
const handler={
  async fetch(request:Request):Promise<Response>{
    const origin=request.headers.get('Origin');
    const u=new URL(request.url);
    if(request.method==='OPTIONS')
      return new Response(null,{status:204,headers:{
        'Access-Control-Allow-Origin':origin&&allowedOrigins.has(origin)?origin:'null',
        'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type',
        'Access-Control-Max-Age':'600','Vary':'Origin',
      }});
    if(request.method!=='GET'||u.pathname!=='/scan')return json({error:'GET /scan?url=https://example.com のみ対応'},404,origin);
    const target=u.searchParams.get('url');
    if(!target||target.length>2048)return json({error:'公開サイトのURLを入力してください（最大2048文字）'},400,origin);
    try{return json(await collectPage(target),200,origin);}
    catch(error){
      const failure=error instanceof ScanError?error:new ScanError('ページの収集に失敗しました',502);
      return json({error:failure.message},failure.httpStatus,origin);
    }
  },
};
export default handler;
