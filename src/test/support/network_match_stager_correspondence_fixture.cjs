// Test-only fresh compiler correspondence. Never invokes staging or emitted code.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const {verifyRetainedCallerEvidence}=require('./network_match_rewrite_fixture.cjs');
const SOURCE='src/shared/network_match.ts',STAGER='scripts/stage-backend.cjs';
const PROFILE='network-match-fresh-stager-correspondence-v1',CAP=131072;
const RETAINED='71e626d63db9235fd02459166a8ca9c457327ca066bcba7c988000b4502413cb';
const OPTIONS=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true});
const FLAGS=Object.freeze(['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure']);
const PINS=[
 [SOURCE,1384,'c19ebe9bf1dbf7efe842dc37a43d2110a04f3fbac09bec41cda992859699ab76'],
 [STAGER,24741,'1776a2e8483f179c6b91270ddaa7ccd170f99eb9f3c6b8634b0f50bcb85b27ab'],
 ['node_modules/typescript/lib/typescript.js',9112572,'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'],
 ['node_modules/typescript/package.json',3620,'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6'],
 ['package.json',1377,'22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f'],
 ['package-lock.json',162554,'b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32'],
 ['tsconfig.json',530,'3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7'],
];
const OWN=['src/test/support/network_match_stager_correspondence_fixture.cjs','src/test/network_match_stager_correspondence.test.cjs'];
const STATUS=Object.freeze({freshCompilerCorrespondence:'VERIFIED',historicalStagedCorrespondence:'UNVERIFIED',runtimeEquivalence:'UNVERIFIED',productionAdmission:'NOT AUTHORIZED'});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function check(ok,why){if(!ok)throw Error('Stager correspondence denied: '+why);}
function shape(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort()),'schema');}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function read(file,cap){
 const fd=fs.openSync(file,'r');try{
  const s=fs.fstatSync(fd,{bigint:true});check(s.isFile()&&s.size>0n&&s.size<=BigInt(cap),'input bound');
  const b=Buffer.alloc(Number(s.size));let offset=0;while(offset<b.length){const n=fs.readSync(fd,b,offset,b.length-offset,null);check(n>0,'short input');offset+=n;}
  check(fs.readSync(fd,Buffer.alloc(1),0,1,null)===0,'grown input');
  for(const after of [fs.fstatSync(fd,{bigint:true}),fs.statSync(file,{bigint:true})])check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===after[k]),'changed input');
  check(Buffer.from(b.toString('utf8')).equals(b),'UTF8');return b.toString('utf8');
 }finally{fs.closeSync(fd);}
}
function stagerProfile(text){
 check(Buffer.byteLength(text)===PINS[1][1]&&sha(text)===PINS[1][2],'stager pin');
 check(text.includes('const source = path.resolve(root, record.source), target = path.resolve(out, record.output);'),'filename construction');
 check(text.includes("ts.transpileModule(fs.readFileSync(source, 'utf8'), { fileName: source, reportDiagnostics: true,"),'stager invocation');
 const marker='compilerOptions: {',start=text.indexOf(marker),end=text.indexOf('}',start)+1;
 check(start>=0&&text.indexOf(marker,start+1)===-1,'unique compiler options');
 check(text.slice(start,end).replace(/\s+/g,' ')=== 'compilerOptions: { target: ts.ScriptTarget.ES2022, module: /\\.cts$/i.test(source) ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, rewriteRelativeImportExtensions: true }','exact stager options');
 return {suppliedOptions:{...OPTIONS},reportDiagnostics:true,tsconfigInherited:false};
}
function verifyEvidence(json,expectedSha256){
 check(typeof json==='string'&&Buffer.byteLength(json)<=CAP,'record bound');
 check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external digest');
 let e;try{e=JSON.parse(json);}catch{check(false,'JSON');}check(JSON.stringify(e)===json,'canonical JSON');
 shape(e,['profile','source','sourceText','stagerText','compiler','observations','retainedJson','output','comparison','status','limitations','remainingCallerObligations','authoritativeBaseline','ceiling',...FLAGS]);
 check(e.profile===PROFILE&&e.source===SOURCE,'profile');
 check(typeof e.sourceText==='string'&&Buffer.byteLength(e.sourceText)===1384&&sha(e.sourceText)===PINS[0][2],'source pin');
 const profile=stagerProfile(e.stagerText);
 shape(e.compiler,['version','entry','fileName','nodeVersion','profile']);
 check(e.compiler.version==='5.9.3'&&e.compiler.entry===PINS[2][0]&&same(e.compiler.profile,profile),'compiler profile/version');
 check(/^v\d+\.\d+\.\d+$/.test(e.compiler.nodeVersion),'Node version');
 check(Array.isArray(e.observations)&&e.observations.length===11,'observation count');
 const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'},{root:'retained',path:RETAINED+'.json'}];
 for(let i=0;i<refs.length;i++){
  const row=e.observations[i];shape(row,['root','path','size','sha256','identity']);
  check(row.root===refs[i].root&&row.path===refs[i].path&&Number.isSafeInteger(row.size)&&row.size>0&&/^[a-f0-9]{64}$/.test(row.sha256),'observation');
  shape(row.identity,['dev','ino','size','mtimeNs','ctimeNs']);check(Object.values(row.identity).every(v=>typeof v==='string'&&/^\d{1,24}$/.test(v))&&row.identity.size===String(row.size),'identity');
  if(i<PINS.length)check(row.size===PINS[i][1]&&row.sha256===PINS[i][2],'input pin');
 }
 check(e.observations[10].size===9344&&e.observations[10].sha256===RETAINED,'retained observation');
 check(path.isAbsolute(e.compiler.fileName)&&path.normalize(e.compiler.fileName)===e.compiler.fileName&&e.compiler.fileName===path.resolve(__dirname,'../../..',SOURCE),'resolved absolute filename');
 verifyRetainedCallerEvidence(e.retainedJson,RETAINED);
 const original=JSON.parse(e.retainedJson).evidence.outputs.find(r=>r.variant==='original');
 shape(e.output,['path','text','bytes','sha256','filesystemIdentity','admission']);
 const out=e.output;check(out.path==='src/shared/network_match.js'&&out.filesystemIdentity===null&&out.admission===null,'in-memory output identity');
 check(typeof out.text==='string'&&out.bytes===1421&&Buffer.byteLength(out.text)===out.bytes&&out.sha256===sha(out.text)&&out.sha256==='cbb643628d3e0a336404bf14c8da91812cd3a99aedbe9f531b632e5dd594b0b6','output pin');
 check(Buffer.from(out.text).equals(Buffer.from(original.text))&&same(e.comparison,{byteIdentical:true,differingBytes:0}),'direct byte correspondence');
 check(same(e.status,STATUS)&&e.remainingCallerObligations===29&&e.authoritativeBaseline===825&&e.ceiling===64&&FLAGS.every(f=>e[f]===false),'acceptance boundaries');
 check(e.limitations==='Fresh sequential observations only; compiler authenticity, pinned consumption, historical staging, dependency closure, runtime semantics and Windows confinement are unverified. Concrete local absolute filename is retained; record is not portable admission.','limitations');
 return freeze({status:'blocked',compilerLoaded:false,recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,...STATUS,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(f=>[f,false]))});
}
function prepareCorrespondence(repo,optIn){
 check(optIn===true,'explicit compiler-only opt-in');
 check(['NODE_OPTIONS','NODE_PATH','DISCOVERY_ISLAND_GENERATED_EXECUTION'].every(k=>!process.env[k]),'inherited overrides/execution');
 repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
 const fileName=path.resolve(repo,SOURCE);check(fs.realpathSync.native(fileName)===fileName,'canonical filename');
 const retainedRoot=path.join(os.homedir(),'.codex/artifacts/phase18c7t-network-match');
 const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath},{id:'retained',path:retainedRoot}];
 const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:path.basename(process.execPath)},{root:'retained',path:RETAINED+'.json'}];
 const observe=()=>observeCatalogFiles(roots,refs),observations=observe();
 for(let i=0;i<PINS.length;i++)check(observations[i].size===PINS[i][1]&&observations[i].sha256===PINS[i][2],'current input pin');
 const verifyInputs=()=>check(same(observe(),observations),'input preservation');
 const sourceText=read(fileName,16384),stagerText=read(path.join(repo,STAGER),65536),retainedJson=read(path.join(retainedRoot,RETAINED+'.json'),65536);
 check(Buffer.byteLength(sourceText)===1384&&sha(sourceText)===PINS[0][2],'consumed source');
 const profile=stagerProfile(stagerText);verifyRetainedCallerEvidence(retainedJson,RETAINED);verifyInputs();
 const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');
 check(entry===path.join(repo,PINS[2][0])&&!require.cache[entry],'fresh measured compiler');
 const cache=new Set(Object.keys(require.cache));let result,version;
 try{
  const ts=req('typescript');version=ts.version;check(version==='5.9.3','compiler version');
  check(Object.keys(require.cache).filter(k=>!cache.has(k)).every(k=>k===entry),'unexpected dependency');
  check(JSON.parse(read(path.join(repo,PINS[3][0]),8192)).version===version&&JSON.parse(read(path.join(repo,'package-lock.json'),262144)).packages['node_modules/typescript'].version===version,'package/lock version');
  result=ts.transpileModule(sourceText,{fileName,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true}});
  check(Array.isArray(result.diagnostics)&&result.diagnostics.length===0&&!result.sourceMapText,'unexpected diagnostics/map');
 }finally{if(!cache.has(entry))delete require.cache[entry];}
 verifyInputs();
 const evidence=freeze({profile:PROFILE,source:SOURCE,sourceText,stagerText,compiler:{version,entry:PINS[2][0],fileName,nodeVersion:process.version,profile},observations,retainedJson,
  output:{path:'src/shared/network_match.js',text:result.outputText,bytes:Buffer.byteLength(result.outputText),sha256:sha(result.outputText),filesystemIdentity:null,admission:null},
  comparison:{byteIdentical:Buffer.from(result.outputText).equals(Buffer.from(JSON.parse(retainedJson).evidence.outputs[0].text)),differingBytes:0},status:STATUS,
  limitations:'Fresh sequential observations only; compiler authenticity, pinned consumption, historical staging, dependency closure, runtime semantics and Windows confinement are unverified. Concrete local absolute filename is retained; record is not portable admission.',
  remainingCallerObligations:29,authoritativeBaseline:825,ceiling:64,...Object.fromEntries(FLAGS.map(f=>[f,false]))});
 const json=JSON.stringify(evidence),sha256=sha(json);verifyEvidence(json,sha256);
 return Object.freeze({evidence,retained:Object.freeze({json,sha256,bytes:Buffer.byteLength(json)}),verifyInputs,cleanup:Object.freeze({temporaryRootsCreated:0,outputFilesWritten:0,compilerCacheRestored:true})});
}
module.exports={prepareCorrespondence,verifyEvidence,FLAGS};
