'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),Module=require('node:module');
const cp=require('node:child_process'),net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https'),vm=require('node:vm');
const {prepareCorrespondence,verifyEvidence,FLAGS}=require('./support/network_match_stager_correspondence_fixture.cjs');
const repo=path.resolve(__dirname,'../..'),source=path.join(repo,'src/shared/network_match.ts'),clone=v=>JSON.parse(JSON.stringify(v));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
test('fresh network_match stager-profile correspondence',{timeout:60000},async t=>{
 const environment={...process.env},cache=Object.keys(require.cache).sort(),undo=[];let calls=0,forbidden=0,failed=false,fixture;
 const patch=(o,k,v)=>{if(typeof o[k]==='function'){const old=o[k];o[k]=v;undo.push(()=>{o[k]=old;});}};
 const deny=()=>{forbidden++;throw Error('Forbidden compiler-only operation');};
 for(const k of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,k,deny);
 patch(net.Socket.prototype,'connect',deny);patch(net.Server.prototype,'listen',deny);patch(dgram,'createSocket',deny);patch(globalThis,'fetch',deny);patch(process,'dlopen',deny);
 for(const o of [http,https])for(const k of ['get','request'])patch(o,k,deny);
 for(const k of ['register','registerHooks'])patch(Module,k,deny);
 for(const k of ['Script','SourceTextModule','SyntheticModule','compileFunction','runInThisContext','runInNewContext','runInContext'])patch(vm,k,deny);
 for(const k of ['writeFile','appendFile','mkdir','mkdtemp','rm','rmdir','unlink','rename','copyFile','cp','chmod','chown','truncate','link','symlink','utimes','lutimes','lchown'])for(const [o,key]of [[fs,k],[fs,k+'Sync'],[fs.promises,k]])patch(o,key,deny);
 for(const k of ['write','writeSync','writev','writevSync','ftruncate','ftruncateSync','fchmod','fchmodSync','fchown','fchownSync','futimes','futimesSync','createWriteStream'])patch(fs,k,deny);
 for(const [o,k]of [[fs,'open'],[fs,'openSync'],[fs.promises,'open']]){const old=o[k];patch(o,k,function(file,flags,...args){if(flags!=='r'&&flags!==fs.constants.O_RDONLY)return deny();return old.call(this,file,flags,...args);});}
 const load=Module._load;
 patch(Module,'_load',function(request,...args){
  if(request!=='typescript'&&!Module.isBuiltin(request))return deny();
  const value=load.call(this,request,...args);if(request!=='typescript')return value;
  return new Proxy(value,{get(target,key){
   if(!['version','transpileModule','ScriptTarget','ModuleKind','JsxEmit'].includes(key))return deny();
   if(key!=='transpileModule')return Reflect.get(target,key);
   return (text,options)=>{
    assert.equal(calls++,0,'exactly one actual compiler call');assert.equal(options.fileName,source);assert.equal(fs.realpathSync.native(source),source);
    assert.deepEqual(Object.keys(options),['fileName','reportDiagnostics','compilerOptions']);assert.equal(options.reportDiagnostics,true);
    assert.deepEqual(options.compilerOptions,{target:target.ScriptTarget.ES2022,module:target.ModuleKind.ESNext,jsx:target.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true});
    assert.equal(Buffer.byteLength(text),1384);assert.equal(sha(text),'c19ebe9bf1dbf7efe842dc37a43d2110a04f3fbac09bec41cda992859699ab76');
    return target.transpileModule(text,options);
   };
  }});
 });
 const sub=async(name,body)=>t.test(name,()=>{try{body();}catch(e){failed=true;throw e;}});
 try{
  await sub('explicit opt-in required',()=>assert.throws(()=>prepareCorrespondence(repo,false),/opt-in/));
  fixture=prepareCorrespondence(repo,true);
  await sub('one exact stager call produces directly equal original bytes',()=>{
   const e=fixture.evidence,original=JSON.parse(e.retainedJson).evidence.outputs[0];
   assert.equal(calls,1);assert.equal(e.compiler.version,'5.9.3');assert.equal(e.output.bytes,1421);
   assert.equal(e.output.sha256,'cbb643628d3e0a336404bf14c8da91812cd3a99aedbe9f531b632e5dd594b0b6');
   assert.ok(Buffer.from(e.output.text).equals(Buffer.from(original.text)));assert.equal(e.output.filesystemIdentity,null);assert.equal(e.output.admission,null);
  });
  await sub('compiler-free verification loads no module',()=>{
   const old=Module._load;try{Module._load=()=>{throw Error('unexpected verifier load');};assert.equal(verifyEvidence(fixture.retained.json,fixture.retained.sha256).compilerLoaded,false);}finally{Module._load=old;}
  });
  const mutations=[
   ['source bytes',e=>{e.sourceText+=' ';}],['stager options',e=>{e.stagerText=e.stagerText.replace('target: ts.ScriptTarget.ES2022','target: ts.ScriptTarget.ES2020');}],
   ['extra compiler option',e=>{e.compiler.profile.suppliedOptions.verbatimModuleSyntax=true;}],['missing compiler option',e=>{delete e.compiler.profile.suppliedOptions.jsx;}],
   ['diagnostics disabled',e=>{e.compiler.profile.reportDiagnostics=false;}],['tsconfig inherited',e=>{e.compiler.profile.tsconfigInherited=true;}],
   ['compiler version',e=>{e.compiler.version='5.9.2';}],['relative filename',e=>{e.compiler.fileName='src/shared/network_match.ts';}],
   ['wrong absolute filename',e=>{e.compiler.fileName=path.join(repo,'other.ts');}],['output byte change with refreshed hash',e=>{e.output.text=e.output.text.replace('import','Import');e.output.sha256=sha(e.output.text);}],
   ['output length',e=>{e.output.bytes++;}],['output identity claim',e=>{e.output.filesystemIdentity='claimed';}],['output admission',e=>{e.output.admission=true;}],
   ['retained substitution',e=>{e.retainedJson+=' ';}],['observation missing',e=>{e.observations.pop();}],['source observation',e=>{e.observations[0].sha256='0'.repeat(64);}],
   ['identity malformed',e=>{e.observations[0].identity.ino='unknown';}],['comparison false',e=>{e.comparison.byteIdentical=false;}],
   ['historical claim',e=>{e.status.historicalStagedCorrespondence='VERIFIED';}],['runtime claim',e=>{e.status.runtimeEquivalence='VERIFIED';}],['production admission claim',e=>{e.status.productionAdmission='AUTHORIZED';}],
   ['closed obligations',e=>{e.remainingCallerObligations=28;}],['baseline change',e=>{e.authoritativeBaseline=824;}],['ceiling increase',e=>{e.ceiling=65;}],['extra property',e=>{e.extra=true;}],
   ...FLAGS.map(k=>['authority '+k,e=>{e[k]=true;}]),
  ];
  for(const [name,change]of mutations)await sub('deny altered evidence: '+name,()=>{const e=clone(fixture.evidence);change(e);const json=JSON.stringify(e);assert.throws(()=>verifyEvidence(json,sha(json)),/denied/);});
  await sub('external digest rejects altered record',()=>assert.throws(()=>verifyEvidence(fixture.retained.json+' ',fixture.retained.sha256),/external digest/));
  await sub('duplicate JSON keys reject even with refreshed digest',()=>{const json=fixture.retained.json.replace('{','{"profile":"duplicate",');assert.throws(()=>verifyEvidence(json,sha(json)),/canonical JSON/);});
  await sub('record cap rejects without truncation',()=>{const json=' '.repeat(131073);assert.throws(()=>verifyEvidence(json,sha(json)),/record bound/);});
  await sub('current identity drift denies without disk mutation',()=>{const old=fs.fstatSync;try{fs.fstatSync=function(fd,options){const s=old(fd,options);return options?.bigint?Object.assign(s,{ino:s.ino+1n}):s;};assert.throws(()=>fixture.verifyInputs(),/changed-during-read|input preservation/);}finally{fs.fstatSync=old;}});
  // Inject compiler reports without another compiler invocation or source modification.
  for(const [name,change]of [['diagnostics',r=>{r.diagnostics=[{category:1,code:1}];}],['unexpected map',r=>{r.sourceMapText='map';}],['mismatched output',r=>{r.outputText+=' ';}]])await sub('reject injected compiler '+name,()=>{
   const old=Module._load;try{Module._load=function(request,...args){if(request==='typescript'){const ts=load.call(this,request,...args);return new Proxy(ts,{get(target,k){if(k==='transpileModule')return ()=>{const r={outputText:fixture.evidence.output.text,diagnostics:[]};change(r);return r;};return Reflect.get(target,k);}});}return old.call(this,request,...args);};assert.throws(()=>prepareCorrespondence(repo,true),/denied/);}finally{Module._load=old;}
   assert.equal(calls,1);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  });
  await sub('preservation, cleanup and non-authorizing boundaries',()=>{
   fixture.verifyInputs();assert.equal(forbidden,0);assert.equal(calls,1);assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
   assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,compilerCacheRestored:true});
   const result=verifyEvidence(fixture.retained.json,fixture.retained.sha256);assert.equal(result.status,'blocked');assert.equal(result.remainingCallerObligations,29);for(const k of FLAGS)assert.equal(result[k],false);
  });
 }finally{for(const restore of undo.reverse())restore();}
 if(failed||!fixture)return;
 // Retain data only after guarded compiler/data checks pass; never persist a JS module.
 const dir=path.join(os.homedir(),'.codex/artifacts/phase18c7t-network-match-stager-correspondence');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,fixture.retained.sha256+'.json');
 if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),fixture.retained.json);else fs.writeFileSync(file,fixture.retained.json,{flag:'wx'});
 assert.equal(sha(fs.readFileSync(file)),fixture.retained.sha256);fixture.verifyInputs();
 console.log('CORRESPONDENCE_EVIDENCE '+JSON.stringify({file,bytes:fixture.retained.bytes,sha256:fixture.retained.sha256,compilerCalls:calls,forbiddenOperations:forbidden,outputBytes:fixture.evidence.output.bytes,outputSha256:fixture.evidence.output.sha256,cleanup:fixture.cleanup}));
});
