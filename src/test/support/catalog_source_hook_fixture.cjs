// Test-only callback prototype. Sample source is data; no hooks are installed.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {types:{isProxy}}=require('node:util');
const SAMPLES=Object.freeze([
 Object.freeze({name:'sample.cjs',format:'commonjs',text:"module.exports = Object.freeze({ marker: 'catalog-cjs-inert-v1' });\n",size:68,sha256:'1466fc8f7080131b02c77ac0b929e9481cdb3856c611127914aeaa88275a93ef'}),
 Object.freeze({name:'sample.mjs',format:'module',text:"export const marker = 'catalog-esm-inert-v1';\n",size:46,sha256:'f0004e0a09450688e346d91ea293c9c7721daed3b10279ba817dc482d20a31e6'}),
]);
const CAP=1024,FLAGS=Object.freeze(['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure']);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const deny=reason=>{throw Object.assign(Error('Catalog source hook denied: '+reason),{code:'CATALOG_SOURCE_DENIED'});};
const identity=s=>Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(s[k])]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const catalog=()=>SAMPLES.map(({name,format,size,sha256})=>({name,format,size,sha256}));
function plainData(value,allowed,required,reason){
 if(!value||typeof value!=='object'||isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)deny(reason);
 const keys=Reflect.ownKeys(value),data=Object.getOwnPropertyDescriptors(value);
 if(keys.some(k=>typeof k!=='string'||!allowed.includes(k)||!Object.hasOwn(data[k],'value'))||required.some(k=>!Object.hasOwn(data,k)))deny(reason);
 return data;
}
function hookContext(value,format){
 const resolving=format===undefined;
 const data=plainData(value,resolving?['parentURL','importAttributes']:['format','importAttributes'],resolving?['importAttributes']:['format','importAttributes'],'context/import attributes');
 if(resolving?data.parentURL&&data.parentURL.value!==undefined:data.format.value!==format)deny('dependency request/unsupported format');
 plainData(data.importAttributes.value,[],[],'import attributes');
}
function checkCatalog(candidate){
 const expected=catalog();
 if(isProxy(candidate)||!Array.isArray(candidate)||Object.getPrototypeOf(candidate)!==Array.prototype||!same(Reflect.ownKeys(candidate),['0','1','length']))deny('missing/substituted catalog');
 const array=Object.getOwnPropertyDescriptors(candidate);
 if(array.length.value!==expected.length)deny('catalog array length');
 for(let i=0;i<expected.length;i++){
  const item=array[i];if(!item||!Object.hasOwn(item,'value'))deny('catalog accessor');
  const row=item.value;
  if(!row||typeof row!=='object'||isProxy(row)||Object.getPrototypeOf(row)!==Object.prototype||!same(Reflect.ownKeys(row),Object.keys(expected[i])))deny('substituted catalog entry');
  const data=Object.getOwnPropertyDescriptors(row);
  for(const [key,value]of Object.entries(expected[i]))if(!Object.hasOwn(data[key],'value')||data[key].value!==value)deny('substituted catalog value');
 }
}
function closeDescriptor(fd,descriptors,reject){
 try{
  const expected=descriptors.get(fd),actual=fs.fstatSync(fd,{bigint:true});
  if(expected&&(String(actual.dev)!==expected.dev||String(actual.ino)!==expected.ino))reject('descriptor cleanup identity');
 }catch(error){if(error.code==='EBADF'){descriptors.delete(fd);return;}throw error;}
 try{fs.closeSync(fd);descriptors.delete(fd);}
 catch(error){
  // A close can throw after closing. Probe without blindly retrying a reused fd.
  try{fs.fstatSync(fd);}catch(probe){if(probe.code==='EBADF')descriptors.delete(fd);}
  throw error;
 }
}
function readVerifiedSource(row,{checkRoot,descriptors,closeOwned,reject}){
 checkRoot();const fd=fs.openSync(row.path,'r');descriptors.set(fd,null);let primaryError;
 try{
  const before=fs.fstatSync(fd,{bigint:true});
  descriptors.set(fd,identity(before));
  if(row.observation&&!same(identity(before),row.observation.identity))reject('selected source identity');
  if(!before.isFile()||before.nlink!==1n||before.size>BigInt(CAP))reject('source size/type overflow');
  const raw=Buffer.alloc(CAP+1);let size=0;
  for(;;){const n=fs.readSync(fd,raw,size,raw.length-size,size);if(!n)break;size+=n;if(size>CAP)reject('source size overflow');}
  const bytes=Buffer.from(raw.subarray(0,size)),after=fs.fstatSync(fd,{bigint:true}),named=fs.lstatSync(row.path,{bigint:true});
  if(named.isSymbolicLink()||!same(identity(before),identity(after))||!same(identity(before),identity(named)))reject('changed source identity');
  const text=bytes.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(bytes)||text.charCodeAt(0)===0xfeff)reject('unsupported encoding');
  if(bytes.length!==row.size||hash(bytes)!==row.sha256)reject('source length/hash');
  // Only texts matching the private catalog reach this point. Strings are
  // immutable and do not expose the private read buffer to downstream callers.
  return {text,size:bytes.length,sha256:hash(bytes),identity:identity(before)};
 }catch(error){primaryError=error;throw error;}
 finally{try{closeOwned(fd);}catch(cleanupError){if(primaryError)primaryError.cleanupError=cleanupError;else throw cleanupError;}}
}
function sourceCallbacks({entry,sources,resolved,handed,journal,reject,contextFailed}){return Object.freeze({
 resolve(specifier,context,nextResolve){
  const row=entry(specifier);
  try{hookContext(context);}catch(error){contextFailed();throw error;}
  if(resolved.has(row.url)||handed.has(row.url))reject('duplicate resolution/cache coverage');
  resolved.add(row.url);journal.push({name:row.name,phase:'resolve',format:row.format});
  return {url:row.url,format:row.format,shortCircuit:true};
 },
 load(url,context,nextLoad){
  const row=entry(url);
  if(!resolved.has(url)||handed.has(url))reject('load order/cache coverage');
  try{hookContext(context,row.format);}catch(error){contextFailed();throw error;}
  const verified=sources.get(url);if(!verified)reject('missing private source');
  // No nextLoad call and no content read: return precisely the verified string.
  handed.add(url);journal.push({name:row.name,phase:'source-handoff',format:row.format,size:verified.size,sha256:verified.sha256});
  return {format:row.format,source:verified.text,shortCircuit:true};
 },
});}
function cleanupOwnedRoot(root,expected){
 const absolute=path.resolve(root),relative=path.relative(path.resolve(os.tmpdir()),absolute);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(absolute).startsWith('discovery-source-hook-'))deny('cleanup ownership');
 let stat;try{stat=fs.lstatSync(absolute,{bigint:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync.native(absolute)!==absolute||(expected&&(stat.dev!==expected.dev||stat.ino!==expected.ino)))deny('cleanup root identity');
 // Before the initial identity exists, initialization has written nothing.
 // Remove only an empty directory; preserve explicit ownership on failure.
 if(expected)fs.rmSync(absolute,{recursive:true,force:false});else fs.rmdirSync(absolute);
}
function createSourceHookPrototype(optIn=false){
 if(optIn!==true||arguments.length!==1)deny('explicit non-executing opt-in');
 if(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION)deny('generated execution enabled');
 let root,rootIdentity;
 try{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-source-hook-'));
 rootIdentity=fs.lstatSync(root,{bigint:true});
 const sources=new Map(),resolved=new Set(),handed=new Set(),journal=[],descriptors=new Map();
 let state='created';
 const files=SAMPLES.map(s=>({...s,path:path.join(root,s.name),url:pathToFileURL(path.join(root,s.name)).href}));
 function reject(reason){if(state!=='disposed')state='denied';deny(reason);}
 function checkRoot(exact=true){
  const stat=fs.lstatSync(root,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==rootIdentity.dev||stat.ino!==rootIdentity.ino||fs.realpathSync.native(root)!==root)reject('owned root identity');
  if(exact&&!same(fs.readdirSync(root).sort(),SAMPLES.map(s=>s.name).sort()))reject('unexpected file/package metadata');
 }
 function checkCache(){if(Object.keys(require.cache).some(p=>p===root||p.startsWith(root+path.sep)))reject('pre-existing CommonJS cache');}
 function closeOwned(fd){return closeDescriptor(fd,descriptors,reject);}
 function readVerified(row){return readVerifiedSource(row,{checkRoot,descriptors,closeOwned,reject});}
 function prepare(candidate=catalog()){
  if(state!=='created')reject('prepare order');
  try{
   checkCatalog(candidate);checkCache();
   for(const row of files)sources.set(row.url,readVerified(row));
   checkRoot();checkCache();state='prepared';
  }catch(error){sources.clear();state='denied';throw error;}
 }
 function entry(url){
  if(state!=='prepared')reject('hook order/state');
  checkRoot();checkCache();
  // Exact canonical URL equality rejects aliases, query/fragment, encoding,
  // traversal, other schemes and all unexpected dependency requests.
  const row=files.find(r=>r.url===url);if(!row)reject('unexpected/ambiguous URL');return row;
 }
 const hooks=sourceCallbacks({entry,sources,resolved,handed,journal,reject,contextFailed:()=>{state='denied';}});
 function evidence(){
  return {profile:'catalog-source-hook-callback-only-v1',status:'BLOCKED',catalog:catalog(),sourceCap:CAP,
   state,handedSources:handed.size,journal:journal.map(r=>({...r})),openDescriptors:descriptors.size,
   hookRegistration:'NOT_INSTALLED',nodeEvaluation:'UNOBSERVED',esmCacheCoverage:'UNOBSERVED',actualHookChainOrdering:'UNOBSERVED',
   callbackOrdering:'prepare -> resolve -> one source handoff per URL; sticky denial',
   limitations:['Callback-level handoff only; no Node registration, parsing, linking or evaluation.',
    'No ESM cache inspection or real hook-chain coverage is claimed. A fresh controlled consumer remains required.',
    'Windows external confinement and native mapped-image identity are not established.',
    'Owned-root checks are sequential observations, not an immutable namespace or held source-file lease.'],
   remainingCallerObligations:29,authoritativeBaseline:825,ceiling:64,...Object.fromEntries(FLAGS.map(f=>[f,false]))};
 }
 function dispose(){
  if(state==='disposed')return;
  sources.clear();resolved.clear();handed.clear();
  const cleanupErrors=[];
  for(const fd of descriptors.keys())try{closeOwned(fd);}catch(error){cleanupErrors.push(error);}
  if(descriptors.size||cleanupErrors.length){state='denied';throw Object.assign(Error('Pending owned descriptor cleanup'),{cleanupErrors});}
  cleanupOwnedRoot(root,rootIdentity);state='disposed';
 }
 for(const row of files)fs.writeFileSync(row.path,row.text,{flag:'wx',encoding:'utf8'});
 return Object.freeze({root,entries:()=>files.map(({name,url,format})=>({name,url,format})),prepare,hooks,evidence,dispose});
 }catch(primaryError){
  const cleanupErrors=[];
  const retry=()=>cleanupOwnedRoot(root,rootIdentity);
  if(root!==undefined)try{retry();}catch(error){cleanupErrors.push(error);}
  primaryError.cleanupErrors=cleanupErrors;
  if(cleanupErrors.length)primaryError.pendingCleanup=Object.freeze({root,dispose:retry});
  throw primaryError;
 }
}
// Non-executing bridge for the existing synthetic generated profile only.
// It creates a real selection owner; a caller's report/admitted array is never authority.
function createGeneratedSourceHandoff(input,optIn=false){
 if(optIn!==true||arguments.length!==2)deny('explicit generated handoff opt-in');
 if(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION)deny('generated execution enabled');
 let nodes=0;
 function data(value,depth=0,seen=new Set()){
  if(++nodes>200000||depth>64)deny('handoff data bound');
  if(value===null||value===undefined||['string','boolean'].includes(typeof value))return;
  if(typeof value==='number'){if(!Number.isFinite(value))deny('handoff number');return;}
  if(typeof value!=='object'||isProxy(value)||seen.has(value))deny('handoff non-data');
  const array=Array.isArray(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))deny('handoff prototype');
  const ds=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);seen.add(value);
  if(array&&(value.length>20000||!same(keys,[...Array(value.length).keys()].map(String).concat('length'))))deny('handoff array');
  for(const key of keys){if(typeof key!=='string'||!Object.hasOwn(ds[key],'value'))deny('handoff accessor/key');if(array&&key==='length')continue;data(ds[key].value,depth+1,seen);}
  seen.delete(value);
 }
 function serialized(){nodes=0;data(input);return JSON.stringify(input);}
 plainData(input,['roots','payloadRoot','sourceRoot','manifest','inventory','catalog','selection'],['roots','payloadRoot','sourceRoot','manifest','inventory','catalog','selection'],'handoff input');
 const captured=serialized(),snapshot=JSON.parse(captured);
 if(snapshot.selection.variant!=='synthetic-generated-v1')deny('handoff synthetic profile only');
 const {createGeneratedArtifactSelection}=require('../../../scripts/staged-backend-review.cjs');
 const owner=createGeneratedArtifactSelection(input);
 const root=snapshot.roots.find(r=>r.id===snapshot.payloadRoot)?.path;
 if(typeof root!=='string')deny('handoff payload root');
 const rootIdentity=fs.lstatSync(root,{bigint:true});
 const sources=new Map(),resolved=new Set(),handed=new Set(),descriptors=new Map(),journal=[];
 let state='created',files=[];
 function reject(reason){if(state!=='disposed')state='denied';deny(reason);}
 function checkRoot(){
  const stat=fs.lstatSync(root,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==rootIdentity.dev||stat.ino!==rootIdentity.ino||fs.realpathSync.native(root)!==root)reject('handoff root identity');
  if(Object.keys(require.cache).some(p=>p===root||p.startsWith(root+path.sep)))reject('pre-existing CommonJS cache');
 }
 function closeOwned(fd){return closeDescriptor(fd,descriptors,reject);}
 function unchanged(){if(serialized()!==captured)reject('handoff evidence changed');}
 function prepare(){
  if(state!=='created')reject('handoff prepare order');
  try{
   unchanged();const report=owner.admit();
   if(report.productionAuthority!==false||report.executionAuthority!==false||report.atomicMeasuredHandleBinding!==false||report.basis!=='synthetic-generated-artifact-evidence-only')reject('handoff authority');
   const c=snapshot.manifest.generatedArtifact.content;
   if(c.derivation.options.format!=='cjs'||c.outputs.length!==1)reject('handoff one CommonJS output only');
   files=c.outputs.map(out=>{
    if(out.root!==snapshot.payloadRoot||!out.path.endsWith('.cjs')||out.size>CAP)reject('handoff source shape/bound');
    const observations=snapshot.manifest.generatedArtifact.observations.filter(o=>o.root===out.root&&o.path===out.path);
    const admitted=report.admitted.filter(o=>o.path===out.path&&o.status==='generated-artifact');
    if(observations.length!==1||admitted.length!==1||admitted[0].sha256!==out.sha256||observations[0].size!==out.size||observations[0].sha256!==out.sha256)reject('handoff selected observation');
    const full=path.resolve(root,out.path),relative=path.relative(root,full);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))reject('handoff path');
    return {name:out.path,path:full,url:pathToFileURL(full).href,format:'commonjs',size:out.size,sha256:out.sha256,observation:observations[0]};
   });
   checkRoot();for(const row of files)sources.set(row.url,readVerifiedSource(row,{checkRoot,descriptors,closeOwned,reject}));
   owner.admit();unchanged();checkRoot();state='prepared';
  }catch(error){sources.clear();state='denied';throw error;}
 }
 function entry(url){
  if(state!=='prepared')reject('handoff callback order/state');
  try{unchanged();checkRoot();}catch(error){state='denied';throw error;}
  const row=files.find(r=>r.url===url);if(!row)reject('unexpected/ambiguous URL');return row;
 }
 const hooks=sourceCallbacks({entry,sources,resolved,handed,journal,reject,contextFailed:()=>{state='denied';}});
 function dispose(){
  if(state==='disposed')return;state='denied';sources.clear();resolved.clear();handed.clear();
  const cleanupErrors=[];for(const fd of descriptors.keys())try{closeOwned(fd);}catch(error){cleanupErrors.push(error);}
  if(descriptors.size||cleanupErrors.length)throw Object.assign(Error('Pending generated handoff cleanup'),{cleanupErrors});
  state='disposed'; // Payload root is caller-owned; this adapter never deletes it.
 }
 return Object.freeze({prepare,hooks,dispose,entries:()=>files.map(({name,url,format})=>({name,url,format})),evidence:()=>({
  profile:'synthetic-generated-source-handoff-v1',status:'BLOCKED',state,sourceCap:CAP,provenanceRef:snapshot.selection.contentSha256,
  handedSources:handed.size,openDescriptors:descriptors.size,journal:journal.map(r=>({...r})),
  hookRegistration:'NOT_INSTALLED',nodeEvaluation:'UNOBSERVED',actualHookChainOrdering:'UNOBSERVED',esmCacheCoverage:'UNOBSERVED',
  atomicMeasuredHandleBinding:false,scope:'one synthetic CommonJS output; no iconv or runtime admission',remainingCallerObligations:29,authoritativeBaseline:825,ceiling:64,
  ...Object.fromEntries(FLAGS.map(f=>[f,false]))})});
}
module.exports={createSourceHookPrototype,createGeneratedSourceHandoff,checkCatalog,sampleCatalog:catalog,CAP,FLAGS};
