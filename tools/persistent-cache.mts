import type {LayoutIR} from '../packages/veriss/src/layout-contract.mjs';
// Local Node CLI only. The key is generated and retained by the same OS
// account as the verifier. This authenticates local results, not remote proofs.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,renameSync,rmSync,lstatSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serialize,deserialize} from 'node:v8';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const maxBytes=32*1024*1024,maxEntries=4096;
function fingerprint(){
 const hash=createHash('sha256'),seen=new Set<string>();
 const add=(label:string,data:Buffer)=>{hash.update(JSON.stringify([label,data.length]));hash.update(data)};
 function tree(path:string,label:string){
  for(const e of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(e.name==='node_modules'||e.name==='.git')continue;
   const p=join(path,e.name),l=label+'/'+e.name;
   if(e.isDirectory())tree(p,l);
   else if(e.isFile())add(l,readFileSync(p));
   else throw Error('Unsupported installed cache dependency');
  }
 }
 function dependency(name:string,from:string){
  // Only pure geometry and exact arithmetic are persisted; the solver
  // results are process-local. Include the actual dependency source trees.
  let path=dirname(createRequire(join(from,'package.json')).resolve(name));
  while(true){
   let meta:unknown;
   try{meta=JSON.parse(readFileSync(join(path,'package.json'),'utf8'))}catch{}
   if(typeof meta==='object'&&meta!==null&&'name' in meta&&meta.name===name){
    path=realpathSync(path);
    if(seen.has(path))return;seen.add(path);
    tree(path,name+'@'+('version' in meta?String(meta.version):'undefined'));
    for(const d of Object.keys('dependencies' in meta && typeof meta.dependencies==='object' && meta.dependencies!==null ? meta.dependencies : {}))dependency(d,path);
    return;
   }
   const parent=dirname(path);if(parent===path)throw Error('Cannot locate dependency '+name);
   path=parent;
  }
 }
 for(const p of ['packages/veriss/src','packages/adapter-core/src'])tree(join(root,p),p);
 for(const p of ['pnpm-lock.yaml','packages/veriss/package.json','packages/adapter-core/package.json','tools/persistent-cache.mjs','tools/ui-manifest.mjs'])add(p,readFileSync(join(root,p)));
 for(const d of ['postcss','css-tree','parse5'])dependency(d,join(root,'packages/veriss'));
 add('runtime',Buffer.from(JSON.stringify([process.versions,process.platform,process.arch])));
 return hash.digest('hex');
}
let engine:string|undefined;
export function openLocalVerificationCache(directory:string,{revision}: {revision?:string}={}){
 const dir=resolve(directory),keyFile=join(dir,'key'),file=join(dir,'cache.bin');
 // Never trust a shared directory, symlink or another user's cache.
 mkdirSync(dir,{recursive:true,mode:0o700});
 const own=(path:string,kind:'isDirectory'|'isFile')=>{
  const s=lstatSync(path);
  if(!s[kind]()||(process.getuid!==undefined&&s.uid!==process.getuid())||s.mode&0o077)throw Error('Cache must be private to the current OS user: '+path);
  return s;
 };
 own(dir,'isDirectory');
 try{writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600})}catch(e){if(!(e instanceof Error && 'code' in e && e.code==='EEXIST'))throw e}
 if(own(keyFile,'isFile').size!==32)throw Error('Invalid local cache key');
 const key=readFileSync(keyFile);
 const version=revision??(engine??=fingerprint());
 const mac=(bytes:Buffer)=>createHmac('sha256',key).update(version).update('\0').update(bytes).digest();
 const rows=new Map<string,{value:unknown;bytes:number}>();let size=0,dirty=false;
 function insert(k:string,value:unknown){
  const bytes=serialize([k,value]).length;
  if(bytes>maxBytes/2)return;
  const previous=rows.get(k);if(previous){size-=previous.bytes;rows.delete(k)}
  while(rows.size>=maxEntries||size+bytes>maxBytes/2){const first=rows.entries().next();if(first.done)throw Error('Cache eviction invariant');const [id,row]=first.value;size-=row.bytes;rows.delete(id)}
  rows.set(k,{value,bytes});size+=bytes;
 }
 try{
  if(own(file,'isFile').size>maxBytes)throw Error('Cache size');
  const data=readFileSync(file),body=data.subarray(32);
  if(data.length<32||!timingSafeEqual(data.subarray(0,32),mac(body)))throw Error('Cache authentication failed');
  const entries:unknown=deserialize(body);
  if(!Array.isArray(entries)||entries.length>maxEntries)throw Error('Cache shape');
  for(const entry of entries){if(!Array.isArray(entry))throw Error('Cache entry shape');const [k,v]:unknown[]=entry;if(typeof k==='string')insert(k,v);}
 }catch{rows.clear();size=0}
 const storage=(namespace:string)=>Object.freeze({
  get:(k:string)=>{const id=namespace+k,row=rows.get(id);if(!row)return undefined;rows.delete(id);rows.set(id,row);return structuredClone(row.value)},
  set:(k:string,v:unknown)=>{try{insert(namespace+k,structuredClone(v));dirty=true}catch{/* optional optimization */}}
 });
 function flush(){
  if(!dirty)return;
  const tmp=join(dir,'cache-'+randomBytes(12).toString('hex')+'.tmp');
  try{
   const body=serialize([...rows].map(([k,r])=>[k,r.value]));
   if(body.length+32>maxBytes)return;
   writeFileSync(tmp,Buffer.concat([mac(body),body]),{mode:0o600,flag:'wx'});
   renameSync(tmp,file);dirty=false;
  }finally{rmSync(tmp,{force:true})}
 }
 const proofs=storage('proof:');
 const geometry=storage('geometry:');
 // The MAC and revision fingerprint establish that these values came from
 // this verifier's own typed writer. Reject anything outside the layout envelope.
 const readGeometry=(k:string):LayoutIR|undefined=>{const v=geometry.get(k);
  if(typeof v!=='object'||v===null||!('version' in v)||v.version!==1||!('kind' in v)||v.kind!=='layout'||!('geometryComplete' in v)||v.geometryComplete!==true)return undefined;
  return v as LayoutIR;
 };
 return Object.freeze({geometry:Object.freeze({get:readGeometry,set:(k:string,v:LayoutIR)=>geometry.set(k,v)}),proofs:Object.freeze({get:(k:string)=>{const value=proofs.get(k);return typeof value==='number'?value:undefined},set:(k:string,v:number)=>proofs.set(k,v)}),flush});
}
