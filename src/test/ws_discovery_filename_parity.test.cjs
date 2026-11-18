'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https'),Module=require('node:module');
const {prepareFilenameParity,verifyFilenameEvidence,compareFilenameOutputs,checkFilenameBudget}=require('./support/ws_discovery_filename_parity_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),SOURCE='src/core/drivers/ws_discovery_transport.ts',clone=v=>JSON.parse(JSON.stringify(v)),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const refresh=o=>{o.bytes=Buffer.byteLength(o.text);o.sha256=sha(o.text);};
test('filename comparison requires explicit compile-only opt-in',()=>assert.throws(()=>prepareFilenameParity(repo,false),/explicit compile-only opt-in/));
test('ws_discovery relative versus actual absolute filename',{timeout:60000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[],calls=[];let forbidden=0,forbiddenCompilerAPI=0,fixture;
  const patch=(owner,name,value)=>{const old=owner[name];owner[name]=value;restore.push(()=>{owner[name]=old;});};
  const deny=()=>{forbidden++;throw Error('Forbidden filename comparison process/network/write/module activity');};
  // Instrumentation only; not OS confinement against a malicious compiler.
  for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,name,deny);
  patch(net.Socket.prototype,'connect',deny);patch(net.Server.prototype,'listen',deny);patch(dgram,'createSocket',deny);patch(globalThis,'fetch',deny);
  for(const owner of [http,https])for(const name of ['request','get'])patch(owner,name,deny);
  for(const name of ['writeFile','appendFile','mkdir','mkdtemp','rm','rmdir','unlink','rename','copyFile','cp','chmod','chown','truncate','link','symlink','utimes','lutimes','lchown']){
    for(const [owner,key]of [[fs,name],[fs,name+'Sync'],[fs.promises,name]])if(typeof owner[key]==='function')patch(owner,key,deny);
  }
  for(const name of ['write','writeSync','writev','writevSync','ftruncate','ftruncateSync','fchmod','fchmodSync','fchown','fchownSync','futimes','futimesSync','createWriteStream'])if(typeof fs[name]==='function')patch(fs,name,deny);
  for(const [owner,name]of [[fs,'open'],[fs,'openSync'],[fs.promises,'open']]){
    const old=owner[name];patch(owner,name,function(file,flags,...args){if(flags!=='r'&&flags!==fs.constants.O_RDONLY)return deny();return old.call(this,file,flags,...args);});
  }
  const load=Module._load,api=new Set(['version','transpileModule','ScriptTarget','ModuleKind','JsxEmit','createSourceFile','ScriptKind','SyntaxKind','isImportDeclaration','isStringLiteral','isNamedImports','isCallExpression','isIdentifier','isExportDeclaration','forEachChild']);
  patch(Module,'_load',function(request,...args){
    if(request!=='typescript'&&!Module.isBuiltin(request)&&request!=='../../../scripts/payload-byte-catalog.cjs')return deny();
    const value=load.call(this,request,...args);if(request==='typescript')return new Proxy(value,{get(target,key){
      if(!api.has(key)){forbiddenCompilerAPI++;throw Error('Forbidden compiler API '+String(key));}
      if(key==='transpileModule')return function(text,options){
        assert.ok(calls.length<2,'only one compilation per variant');assert.deepEqual(Object.keys(options),['fileName','compilerOptions','reportDiagnostics']);
        assert.deepEqual(Object.keys(options.compilerOptions),['target','module','jsx','rewriteRelativeImportExtensions']);
        assert.deepEqual(options.compilerOptions,{target:target.ScriptTarget.ES2022,module:target.ModuleKind.ESNext,jsx:target.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true});
        const expected=calls.length===0?SOURCE:path.resolve(repo,SOURCE);assert.equal(options.fileName,expected);assert.equal(options.reportDiagnostics,true);
        if(calls.length===1){assert.ok(path.isAbsolute(expected));assert.equal(fs.realpathSync.native(expected),expected);assert.equal(fs.statSync(expected,{bigint:true}).ino,fs.statSync(path.join(repo,SOURCE),{bigint:true}).ino);}
        calls.push({role:calls.length?'absolute':'relative',sourceSha256:sha(text)});return target.transpileModule(text,options);
      }
      return Reflect.get(target,key);
    }});return value;
  });
  try{
    fixture=prepareFilenameParity(repo,true);const e=fixture.evidence,[relative,absolute]=e.outputs;
    await t.test('fresh observations bind source/compiler/stager/config and six preserved records',()=>{
      assert.equal(e.observations.length,19);assert.equal(e.sourceSnapshot.bytes,28253);assert.equal(e.stagerSnapshot.bytes,24741);assert.equal(e.preservedRecords.records.length,6);
      for(const p of ['scripts/stage-backend.cjs','tsconfig.json','package-lock.json','node_modules/typescript/lib/typescript.js','src/test/support/ws_discovery_stager_compat_fixture.cjs'])assert.ok(e.observations.some(r=>r.path===p));
      assert.equal(e.observations.filter(r=>r.root==='retained-records').length,6);assert.ok(e.preservedRecords.interpretation.includes('no admission'));
    });
    await t.test('two actual filename arguments use only four stager options',()=>{
      assert.equal(calls.length,2);assert.deepEqual(calls.map(r=>r.role),['relative','absolute']);assert.ok(calls.every(r=>r.sourceSha256===e.sourceSnapshot.sha256));
      assert.deepEqual(e.compiler.suppliedOptions,{target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true});
      assert.equal(e.filenameArguments[0].argument,SOURCE);assert.equal(e.filenameArguments[1].argument,null);
      for(const k of ['pathIsAbsolute','canonicalPathMatches','sameMeasuredFile','absoluteUserPathRedacted'])assert.equal(e.filenameArguments[1][k],true);
      assert.ok(e.stagerCall.sourceResolution.includes('path.resolve(root, record.source)'));
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(path.resolve(repo,SOURCE)));assert.ok(!fixture.retained.json.includes(process.execPath));
    });
    await t.test('measured byte parity and exact output/import observations',()=>{
      assert.equal(e.comparison.byteIdentical,true);assert.equal(relative.bytes,absolute.bytes);assert.equal(relative.sha256,absolute.sha256);assert.equal(relative.text,absolute.text);
      assert.deepEqual(e.comparison.differences,[]);assert.equal(e.comparison.commonPrefixBytes,relative.bytes);assert.equal(e.comparison.commonSuffixBytes,0);
      assert.equal(e.importComparison.byteCoordinatesIdentical,true);assert.deepEqual(e.imports[0],e.imports[1]);assert.equal(e.imports[0].length,10);
      for(const o of e.outputs){assert.equal(o.bytes,Buffer.byteLength(o.text));assert.equal(o.sha256,sha(o.text));assert.equal(o.filesystemIdentity,null);assert.equal(o.admission,null);}
      assert.deepEqual(e.imports[0][1].bindings,[{kind:'default',imported:'default',local:'os'}]);assert.deepEqual(e.imports[0][6].bindings,[{kind:'default',imported:'default',local:'dgram'}]);
      assert.equal(e.imports[0][0].specifier,'../../shared/identity_policy.js');
    });
    await t.test('compiler-free verifier recomputes parity and import ranges with module loads forbidden',()=>{
      const old=Module._load;let result;try{Module._load=()=>{throw Error('Verifier module load');};result=verifyFilenameEvidence(fixture.retained.json,fixture.retained.sha256);}finally{Module._load=old;}
      assert.equal(result.status,'blocked');assert.equal(result.compilerLoaded,false);assert.equal(result.generatedExecution,false);assert.equal(result.independentByteVerification,true);
      assert.deepEqual(result.comparison,e.comparison);assert.equal(result.recordBytes,fixture.retained.bytes);assert.equal(result.recordSha256,fixture.retained.sha256);
    });
    const accountingCases=[['a','abc'],['abc','a'],['aXc','aYc'],['aXcZ','aYcW'],['café','cafe'],['','x'],['x','']];
    for(const [left,right]of accountingCases)await t.test('exhaustive byte difference accounting '+JSON.stringify([left,right]),()=>{
      const result=compareFilenameOutputs(left,right),a=Buffer.from(left),b=Buffer.from(right),rebuilt=Buffer.alloc(b.length);let cursor=0;
      assert.equal(result.byteIdentical,false);assert.ok(result.differences.length>0);
      for(const r of result.differences){
        a.subarray(cursor,Math.min(r.byteStart,b.length)).copy(rebuilt,cursor);
        assert.equal(a.subarray(r.byteStart,r.relativeEnd).toString('hex'),r.relativeHex);assert.equal(b.subarray(r.byteStart,r.absoluteEnd).toString('hex'),r.absoluteHex);
        Buffer.from(r.absoluteHex,'hex').copy(rebuilt,r.byteStart);cursor=r.absoluteEnd;
      }
      a.subarray(cursor,b.length).copy(rebuilt,cursor);assert.ok(rebuilt.equals(b));
    });
    for(const [kind,cap]of Object.entries(e.limits))await t.test(kind+' exact bound and overflow/invalid denial',()=>{
      assert.equal(checkFilenameBudget(kind,cap),cap);assert.equal(checkFilenameBudget(kind,0),0);for(const bad of [cap+1,-1,0.5,Infinity,NaN,'1'])assert.throws(()=>checkFilenameBudget(kind,bad),error=>error.code==='FILENAME_PARITY_DENIED');
    });
    const edit=(r,i,change)=>{r.outputs[i].text=change(r.outputs[i].text);refresh(r.outputs[i]);};
    const cases=[
      ['extra verbatim option',r=>{r.compiler.suppliedOptions.verbatimModuleSyntax=true;}],['extra false verbatim option',r=>{r.compiler.suppliedOptions.verbatimModuleSyntax=false;}],
      ['inherited tsconfig',r=>{r.compiler.tsconfigDisposition='inherited';}],['wrong module',r=>{r.compiler.suppliedOptions.module='CommonJS';}],['missing option',r=>{delete r.compiler.suppliedOptions.jsx;}],
      ['relative argument changed',r=>{r.filenameArguments[0].argument='./other.ts';}],['absolute construction changed',r=>{r.filenameArguments[1].construction='arbitrary filename';}],
      ['unredacted absolute argument',r=>{r.filenameArguments[1].argument='C:/Users/private/source.ts';}],['file identity witness false',r=>{r.filenameArguments[1].sameMeasuredFile=false;}],
      ['absolute path witness false',r=>{r.filenameArguments[1].pathIsAbsolute=false;}],['canonical witness false',r=>{r.filenameArguments[1].canonicalPathMatches=false;}],
      ['source substituted',r=>{r.sourceSnapshot.text+='\n// substituted';r.sourceSnapshot.bytes=Buffer.byteLength(r.sourceSnapshot.text);r.sourceSnapshot.sha256=sha(r.sourceSnapshot.text);}],
      ['stager substituted',r=>{r.stagerSnapshot.text=r.stagerSnapshot.text.replace('rewriteRelativeImportExtensions: true','rewriteRelativeImportExtensions: false');r.stagerSnapshot.bytes=Buffer.byteLength(r.stagerSnapshot.text);r.stagerSnapshot.sha256=sha(r.stagerSnapshot.text);}],
      ['stager option site changed',r=>{r.stagerCall.optionSite.byteStart++;}],['stager source resolution changed',r=>{r.stagerCall.sourceResolution='other';}],
      ['relative output substituted',r=>edit(r,0,s=>s+'\n// relative edit')],['absolute output substituted',r=>edit(r,1,s=>s+'\n// absolute edit')],
      ['same substituted pair',r=>{for(const o of r.outputs){o.text+='\n// substituted';refresh(o);}r.comparison=compareFilenameOutputs(r.outputs[0].text,r.outputs[1].text);}],
      ['default alias changed',r=>edit(r,1,s=>s.replace('import os from','import otherOS from'))],
      ['dgram erased',r=>edit(r,1,s=>s.replace(/import dgram from[^\n]+\n/,''))],
      ['RemoteInfo restored',r=>edit(r,1,s=>s.replace('import dgram from','import dgram, { RemoteInfo } from'))],
      ['island import substituted',r=>edit(r,1,s=>s.replace('../../shared/identity_policy.js','../../shared/.consolidation/address-identity.generated.js'))],
      ['extra import',r=>edit(r,1,s=>s+"\nimport './other.js';")],['computed dynamic',r=>edit(r,1,s=>s+'\nimport(target);')],
      ['unrelated body change',r=>edit(r,1,s=>s.replace('reuseAddr: true','reuseAddr: false'))],
      ['invented parity',r=>{r.comparison.byteIdentical=false;}],['invented difference',r=>r.comparison.differences.push({byteStart:0,relativeHex:'ff',absoluteHex:'00'})],
      ['prefix comparison changed',r=>{r.comparison.commonPrefixBytes--;}],['import count invented',r=>{r.importComparison.absoluteDeclarations=12;}],
      ['import coordinate substituted',r=>{r.imports[1][0].byteStart++;}],['binding descriptor substituted',r=>{r.imports[0][1].bindings[0].local='other';}],
      ['source hash changed',r=>{r.observations[0].sha256='0'.repeat(64);}],['stager hash changed',r=>{r.observations[1].sha256='0'.repeat(64);}],
      ['compiler hash changed',r=>{r.observations[2].sha256='0'.repeat(64);}],['existing compatibility source changed',r=>{r.observations[8].sha256='0'.repeat(64);}],
      ['historical capture changed',r=>{r.observations.at(-1).sha256='0'.repeat(64);}],['historical record identity inconsistent',r=>{r.observations.at(-1).identity.size='1';}],
      ['missing observation',r=>r.observations.pop()],['duplicated observation',r=>{r.observations[1]=clone(r.observations[0]);}],
      ['historical hash replaced',r=>{r.preservedRecords.records[0].sha256='0'.repeat(64);}],['historical authority inherited',r=>{r.preservedRecords.interpretation='production approved';}],
      ['false compile count',r=>{r.compiler.compileCount=1;}],['runtime path disclosed',r=>{r.compiler.node.executable='C:/Users/private/node.exe';}],
      ['false output limit',r=>{r.limits.output*=2;}],['false rationale',r=>{r.budgetRationale.record='unbounded';}],['warning removed',r=>r.limitations.pop()],
      ['missing output',r=>r.outputs.pop()],['extra output',r=>r.outputs.push(clone(r.outputs[0]))],['reordered outputs',r=>r.outputs.reverse()],
      ['output hash changed',r=>{r.outputs[1].sha256='0'.repeat(64);}],['output length changed',r=>{r.outputs[0].bytes++;}],
      ['output admission',r=>{r.outputs[1].admission=true;}],['output inode invented',r=>{r.outputs[0].filesystemIdentity={ino:'1'};}],
      ['historical admission',r=>{r.historicalAdmission=true;}],['false baseline',r=>{r.authoritativeBaseline=824;}],['false ceiling',r=>{r.ceiling=65;}],
      ['payload invented',r=>{r.achievedPayloadCount=64;}],['review closed',r=>{r.remainingCallerObligations=28;}],['credential field',r=>{r.compiler.secret='forbidden';}],
      ...FLAGS.map(k=>['false '+k,r=>{r[k]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('record '+name+' denies with refreshed digest',()=>{
      const r=clone(e);change(r);const json=JSON.stringify(r);assert.notEqual(sha(json),fixture.retained.sha256,'negative must change data');assert.throws(()=>verifyFilenameEvidence(json,sha(json)),error=>error.code==='FILENAME_PARITY_DENIED');
    });
    await t.test('external digest anchors unpinned own/runtime identities',()=>{
      const r=clone(e);r.observations[12].sha256='0'.repeat(64);assert.throws(()=>fixture.assess(r),/external capture digest/);
      const own=clone(e);own.observations[10].sha256='0'.repeat(64);assert.throws(()=>verifyFilenameEvidence(JSON.stringify(own),fixture.retained.sha256),/external capture digest/);
    });
    await t.test('malformed, duplicate-key, oversized and unanchored JSON denies',()=>{
      for(const json of ['{',' '.repeat(262145),fixture.retained.json.replace('{','{"profile":"shadowed",')])assert.throws(()=>verifyFilenameEvidence(json,sha(json)),error=>error.code==='FILENAME_PARITY_DENIED');
      assert.throws(()=>verifyFilenameEvidence(fixture.retained.json),/external capture digest/);
    });
    await t.test('output overflow denies within record cap',()=>{
      const r=clone(e);r.outputs[1].text=' '.repeat(65537);refresh(r.outputs[1]);const json=JSON.stringify(r);assert.ok(Buffer.byteLength(json)<262144);assert.throws(()=>verifyFilenameEvidence(json,sha(json)),/size budget output/);
    });
    await t.test('complete record overflow denies without truncation',()=>{
      const r=clone(e);r.extra='x'.repeat(262144);const json=JSON.stringify(r);assert.throws(()=>verifyFilenameEvidence(json,sha(json)),/size budget record/);
    });
    await t.test('fresh identity drift denies without changing files',()=>{
      const old=fs.fstatSync;try{fs.fstatSync=function(fd,options){const s=old.call(this,fd,options);return options?.bigint?Object.assign(s,{ino:s.ino+1n}):s;};assert.throws(()=>fixture.assess(e),/changed-during-read/);}finally{fs.fstatSync=old;}fixture.verifyInputs();
    });
    await t.test('consumed source substitution denies before either filename compilation',()=>{
      const open=fs.openSync,read=fs.readSync,fds=new Set(),count=calls.length;try{
        fs.openSync=function(file,...args){const fd=open.call(this,file,...args);if(file===path.join(repo,SOURCE))fds.add(fd);return fd;};
        fs.readSync=function(fd,buffer,offset,length,...args){const n=read.call(this,fd,buffer,offset,length,...args);if(fds.has(fd)&&buffer.length===28253&&n>0)buffer[offset]^=1;return n;};
        assert.throws(()=>prepareFilenameParity(repo,true),/consumed bytes/);
      }finally{fs.openSync=open;fs.readSync=read;}assert.equal(calls.length,count);fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('success remains blocked with preservation and cleanup observations',()=>{
      const r=fixture.assess(e);assert.equal(r.status,'blocked');assert.equal(r.remainingCallerObligations,29);assert.equal(r.authoritativeBaseline,825);assert.equal(r.ceiling,64);assert.equal(r.achievedPayloadCount,null);
      for(const k of FLAGS)assert.equal(r[k],false);assert.equal(calls.length,2);assert.equal(forbidden,0);assert.equal(forbiddenCompilerAPI,0);
      fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('FILENAME_PARITY_JSON '+fixture.retained.json);
  console.log('FILENAME_PARITY_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,outputs:fixture.evidence.outputs.map(({text,...r})=>r),comparison:fixture.evidence.comparison,importComparison:fixture.evidence.importComparison,cleanup:fixture.cleanup,forbiddenActivity:forbidden,forbiddenCompilerAPI,compileCalls:calls.length}));
});
