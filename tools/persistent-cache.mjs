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
 const hash=createHash('sha256'),seen=new Set();
 const add=(label,data)=>{hash.update(JSON.stringify([label,data.length]));hash.update(data)};
 function tree(path,label){
  for(const e of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(e.name==='node_modules'||e.name==='.git')continue;
   const p=join(path,e.name),l=label+'/'+e.name;
   if(e.isDirectory())tree(p,l);
   else if(e.isFile())add(l,readFileSync(p));
   else throw Error('Unsupported installed cache dependency');
  }
 }
 function dependency(name,from){
  // Only pure geometry and exact arithmetic are persisted; the solver
  // results are process-local. Include the actual dependency source trees.
  let path=dirname(createRequire(join(from,'package.json')).resolve(name));
  while(true){
   let meta;
   try{meta=JSON.parse(readFileSync(join(path,'package.json'),'utf8'))}catch{}
   if(meta?.name===name){
    path=realpathSync(path);
    if(seen.has(path))return;seen.add(path);
    tree(path,name+'@'+meta.version);
    for(const d of Object.keys(meta.dependencies??{}))dependency(d,path);
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
let engine;
export function openLocalVerificationCache(directory,{revision}={}){
 const dir=resolve(directory),keyFile=join(dir,'key'),file=join(dir,'cache.bin');
 // Never trust a shared directory, symlink or another user's cache.
 mkdirSync(dir,{recursive:true,mode:0o700});
 const own=(path,kind)=>{
  const s=lstatSync(path);
  if(!s[kind]()||(process.getuid!==undefined&&s.uid!==process.getuid())||s.mode&0o077)throw Error('Cache must be private to the current OS user: '+path);
  return s;
 };
 own(dir,'isDirectory');
 try{writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}
 if(own(keyFile,'isFile').size!==32)throw Error('Invalid local cache key');
 const key=readFileSync(keyFile);
 const version=revision??(engine??=fingerprint());
 const mac=bytes=>createHmac('sha256',key).update(version).update('\0').update(bytes).digest();
 const rows=new Map();let size=0,dirty=false;
 function insert(k,value){
  const bytes=serialize([k,value]).length;
  if(bytes>maxBytes/2)return;
  if(rows.has(k)){size-=rows.get(k).bytes;rows.delete(k)}
  while(rows.size>=maxEntries||size+bytes>maxBytes/2){const first=rows.keys().next().value;size-=rows.get(first).bytes;rows.delete(first)}
  rows.set(k,{value,bytes});size+=bytes;
 }
 try{
  if(own(file,'isFile').size>maxBytes)throw Error('Cache size');
  const data=readFileSync(file),body=data.subarray(32);
  if(data.length<32||!timingSafeEqual(data.subarray(0,32),mac(body)))throw Error('Cache authentication failed');
  const entries=deserialize(body);
  if(!Array.isArray(entries)||entries.length>maxEntries)throw Error('Cache shape');
  for(const [k,v] of entries)if(typeof k==='string')insert(k,v);
 }catch{rows.clear();size=0}
 const storage=namespace=>Object.freeze({
  get:k=>{const id=namespace+k,row=rows.get(id);if(!row)return undefined;rows.delete(id);rows.set(id,row);return structuredClone(row.value)},
  set:(k,v)=>{try{insert(namespace+k,structuredClone(v));dirty=true}catch{/* optional optimization */}}
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
 return Object.freeze({geometry:storage('geometry:'),proofs:storage('proof:'),flush});
}
