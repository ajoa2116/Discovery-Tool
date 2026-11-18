'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https'),Module=require('node:module');
const {prepareWsCompatibility,rewriteWsIsland,verifyWsEvidence,checkWsBudget}=require('./support/ws_discovery_stager_compat_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=v=>JSON.parse(JSON.stringify(v)),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const refresh=o=>{o.bytes=Buffer.byteLength(o.text);o.sha256=sha(o.text);};
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
test('stager compatibility requires explicit compile-only opt-in',()=>assert.throws(()=>prepareWsCompatibility(repo,false),/explicit compile-only opt-in/));
test('ws_discovery current stager-option provenance',{timeout:60000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[],compileCalls=[];let forbidden=0,forbiddenCompilerAPI=0,fixture;
  const patch=(owner,name,value)=>{const old=owner[name];owner[name]=value;restore.push(()=>{owner[name]=old;});};
  const deny=()=>{forbidden++;throw Error('Forbidden ws compatibility process/network/write/module activity');};
  // Instrumentation only, not OS confinement against a malicious compiler.
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
  const load=Module._load,api=new Set(['version','transpileModule','ScriptTarget','ModuleKind','JsxEmit','createSourceFile','ScriptKind','SyntaxKind','isImportDeclaration','isStringLiteral','isNamedImports','isImportEqualsDeclaration','isImportTypeNode','isExportDeclaration','isCallExpression','isIdentifier','forEachChild','isImportSpecifier','isTypeNode','isSourceFile','isObjectLiteralExpression']);
  patch(Module,'_load',function(request,...args){
    if(request!=='typescript'&&!Module.isBuiltin(request)&&request!=='../../../scripts/payload-byte-catalog.cjs')return deny();
    const value=load.call(this,request,...args);
    if(request==='typescript')return new Proxy(value,{get(target,key){
      if(!api.has(key)){forbiddenCompilerAPI++;throw Error('Forbidden compiler API '+String(key));}
      if(key==='transpileModule')return function(source,options){
        assert.deepEqual(Object.keys(options.compilerOptions),['target','module','jsx','rewriteRelativeImportExtensions']);
        assert.deepEqual(options.compilerOptions,{target:target.ScriptTarget.ES2022,module:target.ModuleKind.ESNext,jsx:target.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true});
        assert.equal(options.fileName,'src/core/drivers/ws_discovery_transport.ts');assert.equal(options.reportDiagnostics,true);
        compileCalls.push({sourceSha256:sha(source),options:{...options.compilerOptions}});return target.transpileModule(source,options);
      };
      return Reflect.get(target,key);
    }});return value;
  });
  try{
    fixture=prepareWsCompatibility(repo,true);const e=fixture.evidence,[original,redirected]=e.outputs,source=e.sourceSnapshot.text;
    const row=e.imports[0].find(r=>r.sourceSlot===0),range={sourceSlot:0,emittedSlot:row.slot,byteStart:row.byteStart,byteEnd:row.byteEnd,from:row.specifier,to:e.derivation.to};
    await t.test('38 observations bind current source, stager, tools and nonexecuted parser boundary',()=>{
      assert.equal(e.observations.length,38);assert.equal(e.sourceSnapshot.bytes,28253);assert.equal(e.stagerSnapshot.bytes,24741);
      for(const p of ['scripts/stage-backend.cjs','node_modules/fast-xml-parser/src/fxp.js','node_modules/strnum/strnum.js','node_modules/@types/node/dgram.d.ts'])assert.ok(e.observations.some(r=>r.path===p));
      assert.equal(e.sourceSnapshot.sha256,sha(source));assert.equal(e.stagerSnapshot.sha256,sha(e.stagerSnapshot.text));
    });
    await t.test('exact stager options consumed twice, with no fixture-profile flags or tsconfig inheritance',()=>{
      assert.equal(compileCalls.length,2);assert.ok(compileCalls.every(r=>r.sourceSha256===e.sourceSnapshot.sha256));
      assert.deepEqual(e.compiler.suppliedOptions,{target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true});
      assert.equal(Object.hasOwn(e.compiler.suppliedOptions,'verbatimModuleSyntax'),false);assert.equal(Object.hasOwn(e.compiler.suppliedOptions,'isolatedModules'),false);
      assert.equal(e.compiler.repeatOutputMatched,true);assert.match(e.compiler.tsconfigDisposition,/never parsed/);
      const raw=Buffer.from(e.stagerSnapshot.text).subarray(e.stagerOptionSite.byteStart,e.stagerOptionSite.byteEnd);
      assert.equal(raw.toString(),e.stagerOptionSite.text);assert.equal(sha(raw),e.stagerOptionSite.sha256);assert.equal(e.stagerOptionSite.expressions.length,4);
      assert.ok(e.stagerOptionSite.text.includes('ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext'));
    });
    await t.test('12 source imports retain complete default/named contract and explicit type status',()=>{
      assert.equal(e.sourceImports.length,12);assert.deepEqual(fixture.inspectSource(source).imports,e.sourceImports);
      assert.deepEqual(e.sourceImports[1].bindings,[{kind:'default',imported:'default',local:'os',typeOnly:false}]);
      assert.deepEqual(e.sourceImports[7].bindings,[{kind:'default',imported:'default',local:'dgram',typeOnly:false},{kind:'named',imported:'RemoteInfo',local:'RemoteInfo',typeOnly:false}]);
      assert.ok(e.sourceImports.every(r=>!r.clauseTypeOnly&&r.bindings.every(b=>!b.typeOnly)));
    });
    await t.test('observed declaration correspondence records actual retained and erased bindings',()=>{
      assert.equal(e.correspondence.length,12);assert.equal(e.imports[0].length,10);assert.equal(e.imports[0].length,e.imports[1].length);
      assert.deepEqual(e.imports[0].map(r=>r.sourceSlot),[0,1,2,4,5,6,7,9,10,11]);
      for(const r of e.correspondence){
        assert.deepEqual(r.sourceBindings,e.sourceImports[r.sourceSlot].bindings);
        assert.deepEqual(r.erasedBindings,r.sourceBindings.filter(b=>!r.retainedBindings.some(a=>JSON.stringify(a)===JSON.stringify(b))));
        if(r.original){assert.deepEqual(r.retainedBindings,r.original.bindings);assert.deepEqual(r.redirected.bindings,r.original.bindings);assert.equal(r.emittedSlot,r.original.slot);}
        else{assert.equal(r.emittedSlot,null);assert.equal(r.redirected,null);assert.equal(r.disposition,'observed-elided-declaration');}
      }
      for(const o of e.outputs){assert.equal(o.bytes,Buffer.byteLength(o.text));assert.equal(o.sha256,sha(o.text));assert.equal(o.filesystemIdentity,null);assert.equal(o.admission,null);}
    });
    await t.test('both Node defaults preserved and measured ordinary type-use bindings erased',()=>{
      for(const [slot,local]of [[1,'os'],[7,'dgram']])for(const rows of e.imports)assert.deepEqual(rows.find(r=>r.sourceSlot===slot).bindings,[{kind:'default',imported:'default',local,typeOnly:false}]);
      assert.deepEqual(e.typeUseObservations.map(r=>r.imported),['EvidenceProvenance','DiscoveryContext','WsDiscoveryEvidence','RemoteInfo','Device','NICInfo']);
      assert.ok(e.typeUseObservations.every(r=>r.observation==='erased'&&r.sourceTypeReferenceOccurrences>0&&r.sourceValueReferenceOccurrences===0&&!r.explicitTypeOnly));
      assert.equal(e.typeUseObservations.find(r=>r.imported==='RemoteInfo').sourceTypeReferenceOccurrences,6);
      assert.equal(e.correspondence[3].original,null);assert.equal(e.correspondence[8].original,null);
      for(const r of e.outputs)for(const n of ['RemoteInfo','EvidenceProvenance','DiscoveryContext','WsDiscoveryEvidence','Device','NICInfo'])assert.ok(!new RegExp('\\b'+n+'\\b').test(r.text.replace(/Unknown ONVIF Device/g,'')));
    });
    await t.test('sole island literal splice preserves prefix, suffix, exports and all retained bindings',()=>{
      assert.equal(e.derivation.sourceSlot,0);assert.equal(e.derivation.deltaBytes,26);assert.equal(redirected.bytes,original.bytes+26);
      assert.equal(rewriteWsIsland(original.text,[range]),redirected.text);
      const a=Buffer.from(original.text),b=Buffer.from(redirected.text),prefix=a.subarray(0,e.derivation.originalStart),suffix=a.subarray(e.derivation.originalEnd);
      assert.ok(prefix.equals(b.subarray(0,e.derivation.redirectedStart)));assert.ok(suffix.equals(b.subarray(e.derivation.redirectedEnd)));
      assert.equal(e.derivation.unchanged[0].sha256,sha(prefix));assert.equal(e.derivation.unchanged[1].sha256,sha(suffix));
      assert.ok(original.text.includes('dgram.createSocket'));assert.ok(original.text.includes('os.networkInterfaces'));assert.ok(original.text.includes('class NodeOnvifWsDiscoveryTransport'));
      assert.equal(row.byteStart,e.sourceImports[0].byteStart,'independently derived first literal positions happen to coincide');
      assert.notEqual(e.imports[0][1].byteStart,e.sourceImports[1].byteStart,'later CRLF/LF coordinates differ');
    });
    await t.test('compiler-free verification uses no compiler, parser or module loading',()=>{
      const old=Module._load;let result;try{Module._load=()=>{throw Error('Verifier module load');};result=verifyWsEvidence(fixture.retained.json,fixture.retained.sha256);}finally{Module._load=old;}
      assert.equal(result.status,'blocked');assert.equal(result.independentByteVerification,true);assert.equal(result.compilerLoaded,false);assert.equal(result.generatedExecution,false);
      assert.equal(result.sourceDeclarations,12);assert.equal(result.emittedDeclarations,e.imports[0].length);assert.deepEqual(result.derivation,e.derivation);
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(process.execPath));assert.equal(e.separation.actualStagingInvoked,false);assert.equal(e.separation.historicalAdmissionReused,false);
    });
    for(const [kind,cap]of Object.entries(e.limits))await t.test(kind+' exact cap and invalid/overflow denial',()=>{
      assert.equal(checkWsBudget(kind,cap),cap);assert.equal(checkWsBudget(kind,0),0);for(const bad of [cap+1,-1,0.5,Infinity,NaN,'1'])assert.throws(()=>checkWsBudget(kind,bad),error=>error.code==='WS_STAGER_DENIED');
    });
    await t.test('source/output overflow and overflowing splice result deny',()=>{
      assert.throws(()=>fixture.inspectSource(' '.repeat(65537)),/size budget source/);assert.throws(()=>rewriteWsIsland(original.text+' '.repeat(65537),[range]),/size budget output/);
      const near=original.text+' '.repeat(65536-original.bytes-25);assert.throws(()=>rewriteWsIsland(near,[range]),/size budget output/);
    });
    await t.test('UTF8 suffix is preserved as data during splicing',()=>{
      const suffix='\n// caf\u00e9 \ud83d\ude00\r\n';assert.equal(rewriteWsIsland(original.text+suffix,[range]),redirected.text+suffix);
    });
    const sourceCases=[
      ['default os renamed',s=>s.replace("import os from 'node:os'","import otherOS from 'node:os'")],
      ['default dgram removed',s=>s.replace('import dgram, { RemoteInfo }','import { RemoteInfo }')],
      ['RemoteInfo reclassified',s=>s.replace('{ RemoteInfo }','{ type RemoteInfo }')],
      ['RemoteInfo aliased',s=>s.replace('{ RemoteInfo }','{ RemoteInfo as OtherInfo }')],
      ['namespace replacement',s=>s.replace("import dgram, { RemoteInfo } from 'node:dgram'","import * as dgram from 'node:dgram'")],
      ['declarations reordered',s=>{const a=s.split('\r\n');[a[1],a[7]]=[a[7],a[1]];return a.join('\r\n');}],
      ['island specifier substituted',s=>s.replace('../../shared/identity_policy.ts','../../shared/other.ts')],
      ['extra dynamic',s=>s+"\nimport('./other.ts');"],['computed dynamic',s=>s+'\nimport(target);'],['extra require',s=>s+"\nrequire('fast-xml-parser');"],
    ];
    for(const [name,change]of sourceCases)await t.test('source '+name+' denies without emission',()=>{const s=change(source);assert.notEqual(s,source);assert.throws(()=>fixture.inspectSource(s),error=>error.code==='WS_STAGER_DENIED');});
    const rangeCases=[
      ['missing',r=>r.pop()],['duplicate',r=>r.push(clone(r[0]))],['overlap',r=>r.push({...r[0],byteStart:r[0].byteStart+1})],
      ['stale off-by-one offset',r=>{r[0].byteStart++;}],['stale end',r=>{r[0].byteEnd+=26;}],
      ['negative',r=>{r[0].byteStart=-1;}],['fractional',r=>{r[0].byteStart+=0.5;}],['nonfinite',r=>{r[0].byteEnd=Infinity;}],
      ['empty',r=>{r[0].byteEnd=r[0].byteStart;}],['reversed',r=>{r[0].byteEnd=r[0].byteStart-1;}],['out of bounds',r=>{r[0].byteEnd=original.bytes+1;}],
      ['wrong slot',r=>{r[0].sourceSlot=7;}],['wrong target',r=>{r[0].to='./other.js';}],['extra authority',r=>{r[0].admission=true;}],
    ];
    for(const [name,change]of rangeCases)await t.test('range '+name+' denies',()=>{const r=clone([range]);change(r);assert.throws(()=>rewriteWsIsland(original.text,r),error=>error.code==='WS_STAGER_DENIED');});
    const edit=(r,i,change)=>{r.outputs[i].text=change(r.outputs[i].text);refresh(r.outputs[i]);};
    const cases=[
      ['verbatim flag added',r=>{r.compiler.suppliedOptions.verbatimModuleSyntax=true;}],
      ['false verbatim flag still extra',r=>{r.compiler.suppliedOptions.verbatimModuleSyntax=false;}],
      ['isolatedModules flag added',r=>{r.compiler.suppliedOptions.isolatedModules=true;}],
      ['newline flag added',r=>{r.compiler.suppliedOptions.newLine='LineFeed';}],
      ['wrong module option',r=>{r.compiler.suppliedOptions.module='CommonJS';}],['missing option',r=>{delete r.compiler.suppliedOptions.jsx;}],
      ['tsconfig inherited',r=>{r.compiler.tsconfigDisposition='inherited';}],
      ['stager source substituted',r=>{r.stagerSnapshot.text=r.stagerSnapshot.text.replace('rewriteRelativeImportExtensions: true','rewriteRelativeImportExtensions: false');r.stagerSnapshot.sha256=sha(r.stagerSnapshot.text);r.stagerSnapshot.bytes=Buffer.byteLength(r.stagerSnapshot.text);}],
      ['source substituted',r=>{r.sourceSnapshot.text+='\n// substituted';r.sourceSnapshot.sha256=sha(r.sourceSnapshot.text);r.sourceSnapshot.bytes=Buffer.byteLength(r.sourceSnapshot.text);}],
      ['wrong option site offset',r=>{r.stagerOptionSite.byteStart++;}],['invented option expression',r=>{r.stagerOptionSite.expressions[1][1]='ts.ModuleKind.CommonJS';}],
      ['default os erased',r=>edit(r,1,s=>s.replace(/import os from [^\n]+\n/,''))],
      ['default dgram erased',r=>edit(r,1,s=>s.replace(/import dgram from [^\n]+\n/,''))],
      ['default os alias changed',r=>edit(r,1,s=>s.replace('import os from','import otherOS from'))],
      ['default dgram replaced by named',r=>edit(r,1,s=>s.replace('import dgram from','import { dgram } from'))],
      ['RemoteInfo retained incorrectly',r=>edit(r,0,s=>s.replace('import dgram from','import dgram, { RemoteInfo } from'))],
      ['type-only declaration restored',r=>edit(r,1,s=>s+"import { DiscoveryContext } from '../../shared/discovery_session.js';\n")],
      ['island substitution missing',r=>edit(r,1,s=>s.replace(e.derivation.to,e.derivation.from))],
      ['island binding changed',r=>edit(r,1,s=>s.replace('canonicalAnchor, mergeAnchors','canonicalAnchor as other, mergeAnchors'))],
      ['unrelated static import changed',r=>edit(r,1,s=>s.replace('./onvif.js','./other.js'))],
      ['declarations reordered',r=>edit(r,1,s=>{const a=s.split('\n');[a[0],a[1]]=[a[1],a[0]];return a.join('\n');})],
      ['merged declarations',r=>edit(r,1,s=>s.replace('canonicalAnchor, mergeAnchors','canonicalAnchor, mergeAnchors, packetProvenance'))],
      ['duplicate declaration',r=>edit(r,1,s=>s.slice(0,s.indexOf('\n')+1)+s)],
      ['extra dynamic import',r=>edit(r,1,s=>s+"\nimport('./other.js');")],['unexpected require',r=>edit(r,1,s=>s+"\nrequire('fast-xml-parser');")],
      ['unrelated socket code edit',r=>edit(r,1,s=>s.replace('reuseAddr: true','reuseAddr: false'))],
      ['export altered',r=>edit(r,1,s=>s.replace('export class NodeOnvifWsDiscoveryTransport','export class OtherTransport'))],
      ['Unicode unrelated edit',r=>edit(r,1,s=>s+'\n// caf\u00e9')],['CRLF output substitution',r=>edit(r,1,s=>s.replace(/\n/g,'\r\n'))],
      ['self-consistent substituted pair',r=>{for(const o of r.outputs){o.text+='\n// substituted';refresh(o);}const tail=Buffer.from(r.outputs[0].text).subarray(r.derivation.originalEnd);r.derivation.unchanged[1]={region:'suffix',bytes:tail.length,sha256:sha(tail)};}],
      ['stale proof',r=>{r.derivation.originalStart++;}],['overlapping proof bounds',r=>{r.derivation.originalEnd=r.derivation.originalStart-1;}],
      ['wrong suffix hash',r=>{r.derivation.unchanged[1].sha256='0'.repeat(64);}],['producer import coordinate changed',r=>{r.imports[0][0].byteStart++;}],
      ['false retained type-use observation',r=>{r.typeUseObservations[0].observation='retained';}],
      ['type reference count substituted',r=>{r.typeUseObservations[3].sourceTypeReferenceOccurrences++;}],
      ['source binding changed',r=>{r.sourceImports[7].bindings[1].local='OtherInfo';}],
      ['elision correspondence invented',r=>{r.correspondence[3].emittedSlot=3;}],
      ['missing correspondence',r=>r.correspondence.pop()],
      ['source hash substituted',r=>{r.observations[0].sha256='0'.repeat(64);}],
      ['stager hash substituted',r=>{r.observations.find(o=>o.path==='scripts/stage-backend.cjs').sha256='0'.repeat(64);}],
      ['compiler hash substituted',r=>{r.observations.find(o=>o.path.endsWith('typescript.js')).sha256='0'.repeat(64);}],
      ['parser dependency hash substituted',r=>{r.observations.find(o=>o.path==='node_modules/fast-xml-parser/src/fxp.js').sha256='0'.repeat(64);}],
      ['missing observation',r=>r.observations.pop()],['duplicate observation',r=>{r.observations[1]=clone(r.observations[0]);}],
      ['identity inconsistent',r=>{r.observations[0].identity.size='1';}],
      ['old profile reused',r=>{r.profile='project-db-inline-type-erasure-compile-only-v1';}],
      ['previous records reinterpreted',r=>{r.separation.previousFiveRecords='equivalent production outputs';}],
      ['staging claimed invoked',r=>{r.separation.actualStagingInvoked=true;}],['historical admission reused',r=>{r.separation.historicalAdmissionReused=true;}],
      ['runtime path disclosure',r=>{r.compiler.node.executable='C:/Users/private/node.exe';}],
      ['invented method',r=>{r.compiler.method='stager execution';}],['false limit',r=>{r.limits.output*=2;}],['warning removed',r=>r.limitations.pop()],
      ['missing output',r=>r.outputs.pop()],['extra output',r=>r.outputs.push(clone(r.outputs[0]))],['outputs reordered',r=>r.outputs.reverse()],
      ['wrong output hash',r=>{r.outputs[0].sha256='0'.repeat(64);}],['wrong length',r=>{r.outputs[1].bytes++;}],
      ['output admission',r=>{r.outputs[0].admission=true;}],['output identity invented',r=>{r.outputs[0].filesystemIdentity={ino:'1'};}],
      ['historical admission',r=>{r.historicalAdmission=true;}],['baseline changed',r=>{r.authoritativeBaseline=824;}],['ceiling changed',r=>{r.ceiling=65;}],
      ['payload count invented',r=>{r.achievedPayloadCount=64;}],['review discharged',r=>{r.remainingCallerObligations=28;}],['credential field',r=>{r.compiler.secret='forbidden';}],
      ...FLAGS.map(k=>['false '+k,r=>{r[k]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('record '+name+' denies with refreshed digest',()=>{
      const r=clone(e);change(r);const json=JSON.stringify(r);assert.notEqual(sha(json),fixture.retained.sha256,'negative must change data');assert.throws(()=>verifyWsEvidence(json,sha(json)),error=>error.code==='WS_STAGER_DENIED');
    });
    await t.test('external digest anchors unpinned new-file/runtime observations',()=>{
      const r=clone(e);r.observations.at(-1).sha256='0'.repeat(64);assert.throws(()=>fixture.assess(r),/external capture digest/);
    });
    await t.test('malformed, duplicate-key, oversized and unanchored records deny',()=>{
      for(const json of ['{',' '.repeat(262145),fixture.retained.json.replace('{','{"profile":"shadowed",')])assert.throws(()=>verifyWsEvidence(json,sha(json)),error=>error.code==='WS_STAGER_DENIED');
      assert.throws(()=>verifyWsEvidence(fixture.retained.json),/external capture digest/);
    });
    await t.test('output cap denies inside complete-record cap',()=>{
      const r=clone(e);r.outputs[0].text=' '.repeat(65537);refresh(r.outputs[0]);const json=JSON.stringify(r);assert.ok(Buffer.byteLength(json)<262144);assert.throws(()=>verifyWsEvidence(json,sha(json)),/size budget output/);
    });
    await t.test('complete JSON cap denies without truncation',()=>{
      const r=clone(e);r.extra='x'.repeat(262144);const json=JSON.stringify(r);assert.throws(()=>verifyWsEvidence(json,sha(json)),/size budget record/);
    });
    await t.test('filesystem identity drift denies without file changes',()=>{
      const old=fs.fstatSync;try{fs.fstatSync=function(fd,opts){const s=old.call(this,fd,opts);return opts?.bigint?Object.assign(s,{ino:s.ino+1n}):s;};assert.throws(()=>fixture.assess(e),/changed-during-read/);}finally{fs.fstatSync=old;}fixture.verifyInputs();
    });
    await t.test('consumed source substitution denies before emitting and restores compiler cache',()=>{
      const open=fs.openSync,read=fs.readSync,fds=new Set(),calls=compileCalls.length;try{
        fs.openSync=function(file,...args){const fd=open.call(this,file,...args);if(file===path.join(repo,'src/core/drivers/ws_discovery_transport.ts'))fds.add(fd);return fd;};
        fs.readSync=function(fd,buffer,offset,length,...args){const n=read.call(this,fd,buffer,offset,length,...args);if(fds.has(fd)&&buffer.length===28253&&n>0)buffer[offset]^=1;return n;};
        assert.throws(()=>prepareWsCompatibility(repo,true),/consumed bytes/);
      }finally{fs.openSync=open;fs.readSync=read;}assert.equal(compileCalls.length,calls);fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('success stays blocked; inputs/environment/cache preserved and no activity',()=>{
      const r=fixture.assess(e);assert.equal(r.status,'blocked');assert.equal(r.remainingCallerObligations,29);assert.equal(r.authoritativeBaseline,825);assert.equal(r.ceiling,64);assert.equal(r.achievedPayloadCount,null);
      for(const k of FLAGS)assert.equal(r[k],false);assert.equal(forbidden,0);assert.equal(forbiddenCompilerAPI,0);assert.equal(compileCalls.length,2);
      fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('WS_STAGER_JSON '+fixture.retained.json);
  console.log('WS_STAGER_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,outputs:fixture.evidence.outputs.map(({text,...r})=>r),sourceDeclarations:fixture.evidence.sourceImports.length,emittedDeclarations:fixture.evidence.imports[0].length,typeUseObservations:fixture.evidence.typeUseObservations,cleanup:fixture.cleanup,forbiddenActivity:forbidden,forbiddenCompilerAPI,compileCalls:compileCalls.length}));
});
