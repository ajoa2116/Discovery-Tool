'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https'),Module=require('node:module');
const {preparePairRewrite,rewritePairImports,verifyPairEvidence,checkPairRewriteBudget}=require('./support/pair_service_rewrite_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const refresh=r=>{r.bytes=Buffer.byteLength(r.text);r.sha256=sha(r.text);};
const TARGET='../../shared/.consolidation/address-identity.generated.js';
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
test('pair rewrite requires explicit compile-only opt-in',()=>assert.throws(()=>preparePairRewrite(repo,false),/explicit compile-only opt-in/));
test('pair_service three-import compile-only provenance',{timeout:60000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];let forbidden=0,fixture,forbiddenCompilerAPI=0;
  const patch=(owner,name,value)=>{const old=owner[name];owner[name]=value;restore.push(()=>{owner[name]=old;});};
  const deny=()=>{forbidden++;throw Error('Forbidden pair provenance process/network/write/module activity');};
  // Instrumentation is not OS confinement against a malicious compiler.
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
  const load=Module._load,api=new Set(['version','transpileModule','ScriptTarget','ModuleKind','JsxEmit','NewLineKind','createSourceFile','ScriptKind','SyntaxKind','isImportDeclaration','isStringLiteral','isNamedImports','isImportEqualsDeclaration','isImportTypeNode','isExportDeclaration','isCallExpression','isIdentifier','forEachChild']);
  patch(Module,'_load',function(request,...args){
    if(request!=='typescript'&&!Module.isBuiltin(request)&&request!=='../../../scripts/payload-byte-catalog.cjs')return deny();
    const result=load.call(this,request,...args);
    if(request==='typescript')return new Proxy(result,{get(target,key){if(!api.has(key)){forbiddenCompilerAPI++;throw Error('Forbidden compiler API '+String(key));}return Reflect.get(target,key);}});
    return result;
  });
  try{
    fixture=preparePairRewrite(repo,true);const e=fixture.evidence,[original,redirected]=e.outputs,boundary=e.sourceBoundary;
    const ranges=e.derivation.replacements.map(r=>({slot:r.slot,sourceSlot:r.sourceSlot,byteStart:r.originalStart,byteEnd:r.originalEnd,from:r.from,to:r.to}));
    await t.test('27 source-boundary observations plus two fixture observations remain measured',()=>{
      assert.ok(Object.isFrozen(e));assert.equal(boundary.observations.length,27);assert.equal(e.fixtureObservations.length,2);
      assert.equal(e.sourceBoundaryCapture.sha256,sha(JSON.stringify(boundary)));assert.equal(e.sourceBoundaryCapture.bytes,33790);
      assert.equal(boundary.emission.status,'UNOBSERVED','read-only historical source contract remains unmodified');
      assert.equal(boundary.configuration.repository.compilerOptions.noEmit,true);assert.deepEqual(e.compiler.configuration,boundary.configuration.expectedFutureEmitProfile);
      assert.equal(e.compiler.version,'5.9.3');assert.equal(e.compiler.repeatOutputMatched,true);
    });
    await t.test('actual 21-to-20 correspondence and explicit type-only erasure',()=>{
      assert.equal(e.correspondence.length,21);assert.equal(e.correspondence[0].disposition,'observed-erased-explicit-type-only');
      assert.equal(e.correspondence[0].sourceBindings[0].imported,'MatchApplyPlan');assert.equal(e.correspondence[0].emittedSlot,null);
      assert.equal(e.correspondence[0].original,null);assert.equal(e.correspondence[0].redirected,null);
      for(const o of e.outputs){assert.doesNotMatch(o.text,/\bMatchApplyPlan\b/);assert.equal(o.bytes,Buffer.byteLength(o.text));assert.equal(o.sha256,sha(o.text));assert.equal(o.filesystemIdentity,null);assert.equal(o.admission,null);}
      for(let slot=1;slot<21;slot++){
        const r=e.correspondence[slot];assert.equal(r.emittedSlot,slot-1);assert.equal(r.original.specifier,boundary.boundary.imports[slot].specifier.replace(/\.ts$/,'.js'));
        assert.deepEqual(r.original.bindings,r.sourceBindings.map(b=>({imported:b.imported,local:b.local,typeOnly:false})));
      }
      assert.equal(e.imports[0].imports.length,20);assert.equal(e.imports[1].imports.length,20);
    });
    await t.test('three separate occurrences, fs alias and dynamic extension rewrite survive',()=>{
      assert.deepEqual(e.derivation.replacements.map(r=>[r.sourceSlot,r.slot]),[[1,0],[3,2],[20,19]]);
      assert.deepEqual(e.derivation.replacements.map(r=>r.deltaBytes),[26,23,23]);assert.equal(e.derivation.totalDeltaBytes,72);
      assert.equal(redirected.bytes,original.bytes+72);assert.equal(e.derivation.mergedDeclarations,false);
      for(const [i,r]of e.imports.entries()){
        assert.deepEqual(r.imports[9].bindings,[{imported:'promises',local:'fs',typeOnly:false}]);
        assert.equal(r.imports[2].bindings[0].imported,'addressRelationship');assert.equal(r.imports[19].bindings[0].imported,'normalizeIPv4');
        assert.equal(r.dynamicImport.specifier,'./match_candidate_service.js');assert.equal(r.dynamicImport.rawRequest,'import("./match_candidate_service.js")');
        assert.equal(e.outputs[i].text.split(TARGET).length-1,i?3:0);
      }
      assert.equal(e.imports[1].dynamicImport.byteStart,e.imports[0].dynamicImport.byteStart+72);
      assert.equal(rewritePairImports(original.text,ranges,boundary),redirected.text);
    });
    await t.test('four unchanged byte regions protect all unrelated pairing/recovery/adapter code',()=>{
      const a=Buffer.from(original.text),b=Buffer.from(redirected.text);let left=0,right=0;
      for(let i=0;i<3;i++){
        const r=e.derivation.replacements[i],region=a.subarray(left,r.originalStart);assert.ok(region.equals(b.subarray(right,r.redirectedStart)));
        assert.equal(e.derivation.unchanged[i].sha256,sha(region));assert.equal(e.derivation.unchanged[i].bytes,region.length);
        left=r.originalEnd;right=r.redirectedEnd;
      }
      assert.ok(a.subarray(left).equals(b.subarray(right)));assert.equal(e.derivation.unchanged[3].sha256,sha(a.subarray(left)));
      for(const o of e.outputs){assert.ok(/class PairService/.test(o.text));assert.ok(/class JsonPairRecoveryStore/.test(o.text));assert.ok(/this\.adapters\.restore\(/.test(o.text));}
      assert.notEqual(ranges[1].byteStart,boundary.boundary.imports[3].literalSpan.byteStart+1,'fresh emitted coordinates cannot reuse source coordinates');
    });
    await t.test('independent verifier uses no compiler, parser or module loads',()=>{
      const old=Module._load;let result;try{Module._load=()=>{throw Error('Verifier attempted module load');};result=verifyPairEvidence(fixture.retained.json,fixture.retained.sha256);}finally{Module._load=old;}
      assert.equal(result.status,'blocked');assert.equal(result.compilerLoaded,false);assert.equal(result.generatedExecution,false);assert.equal(result.independentByteVerification,true);
      assert.deepEqual(result.derivation,e.derivation);assert.equal(result.recordBytes,fixture.retained.bytes);assert.equal(result.recordSha256,fixture.retained.sha256);
      assert.equal(boundary.boundary.typeUseImports.length,8);assert.ok(boundary.boundary.typeUseImports.every(r=>r.runtimeExportValidity==='UNRESOLVED'));
      assert.match(e.limitations[0],/Eight ordinary interface imports may not have valid runtime exports/);
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(process.execPath));
    });
    for(const [kind,cap]of Object.entries(e.limits))await t.test(kind+' exact boundary accepted; overflow/invalid denied',()=>{
      assert.equal(checkPairRewriteBudget(kind,cap),cap);assert.equal(checkPairRewriteBudget(kind,0),0);
      for(const invalid of [cap+1,-1,0.5,Infinity,NaN,'1'])assert.throws(()=>checkPairRewriteBudget(kind,invalid),error=>error.code==='PAIR_REWRITE_DENIED');
    });
    await t.test('output overflow is rejected before recognition or splicing',()=>assert.throws(()=>rewritePairImports(original.text+' '.repeat(65537),ranges,boundary),/size budget prospectiveOutput/));
    await t.test('UTF8/CRLF suffix data survives byte splices without execution or admission',()=>{
      const suffix='\n// caf\u00e9 \ud83d\ude00\r\n';
      const rewritten=rewritePairImports(original.text+suffix,ranges,boundary);
      assert.equal(rewritten,redirected.text+suffix);assert.equal(Buffer.byteLength(rewritten),redirected.bytes+Buffer.byteLength(suffix));
      assert.ok(Buffer.from(rewritten).subarray(-Buffer.byteLength(suffix)).equals(Buffer.from(suffix)));
    });
    const rangeCases=[
      ['missing',r=>r.pop()],['duplicate',r=>{r[2]=clone(r[1]);}],['extra',r=>r.push(clone(r[0]))],['reordered',r=>r.reverse()],
      ['overlap first-middle',r=>{r[1].byteStart=r[0].byteStart+1;}],['overlap middle-last',r=>{r[2].byteStart=r[1].byteEnd-1;}],
      ['stale first',r=>{r[0].byteStart++;r[0].byteEnd++;}],['stale middle after first delta',r=>{r[1].byteStart+=26;r[1].byteEnd+=26;}],
      ['stale last after cumulative delta',r=>{r[2].byteStart+=49;r[2].byteEnd+=49;}],
      ['negative',r=>{r[0].byteStart=-1;}],['fractional',r=>{r[1].byteStart+=0.5;}],['non-finite',r=>{r[2].byteEnd=Infinity;}],
      ['out of bounds',r=>{r[2].byteEnd=original.bytes+1;}],['empty',r=>{r[0].byteEnd=r[0].byteStart;}],['reversed',r=>{r[1].byteEnd=r[1].byteStart-1;}],
      ['wrong original',r=>{r[2].from=r[0].from;}],['wrong target',r=>{r[1].to='./other.js';}],['wrong source slot',r=>{r[1].sourceSlot=2;}],
      ['extra authority',r=>{r[0].admission=true;}],['source offsets reused',r=>{r[1].byteStart=boundary.boundary.imports[3].literalSpan.byteStart+1;}],
    ];
    for(const [name,change]of rangeCases)await t.test('range '+name+' denies',()=>{const r=clone(ranges);change(r);assert.throws(()=>rewritePairImports(original.text,r,boundary),error=>error.code==='PAIR_REWRITE_DENIED');});
    const edit=(r,index,change)=>{r.outputs[index].text=change(r.outputs[index].text);refresh(r.outputs[index]);};
    const cases=[
      ...[0,2,19].map(slot=>['missing substitution slot '+slot,r=>edit(r,1,s=>{const lines=s.split('\n');lines[slot]=lines[slot].replace(TARGET,e.imports[0].imports[slot].specifier);return lines.join('\n');})]),
      ['missing declaration',r=>edit(r,1,s=>s.slice(s.indexOf('\n')+1))],
      ['merged address declarations',r=>edit(r,1,s=>{const lines=s.split('\n');lines[2]=lines[2].replace('addressRelationship','addressRelationship, normalizeIPv4');lines.splice(19,1);return lines.join('\n');})],
      ['reordered declarations',r=>edit(r,1,s=>{const a=s.split('\n');[a[0],a[2]]=[a[2],a[0]];return a.join('\n');})],
      ['duplicated declaration',r=>edit(r,1,s=>s.slice(0,s.indexOf('\n')+1)+s)],
      ['changed island alias',r=>edit(r,1,s=>s.replace('canonicalAnchor, sharesAnchor','canonicalAnchor as other, sharesAnchor'))],
      ['swapped island bindings',r=>edit(r,1,s=>s.replace('canonicalAnchor, sharesAnchor','sharesAnchor, canonicalAnchor'))],
      ['reversed fs alias',r=>edit(r,1,s=>s.replace('promises as fs','fs as promises'))],
      ['renamed fs alias',r=>edit(r,1,s=>s.replace('promises as fs','promises as otherFs'))],
      ['changed unrelated import',r=>edit(r,1,s=>s.replace('../storage/project_db.js','../storage/other_db.js'))],
      ['CRLF emitted header substitution',r=>edit(r,1,s=>s.replace(/\n/g,'\r\n'))],
      ['invented type-only retention',r=>edit(r,1,s=>"import { MatchApplyPlan } from '../../shared/match_candidate_preview.js';\n"+s)],
      ['dynamic target substituted',r=>edit(r,1,s=>s.replace('./match_candidate_service.js','./other_service.js'))],
      ['dynamic rewrite reverted',r=>edit(r,1,s=>s.replace('./match_candidate_service.js','./match_candidate_service.ts'))],
      ['computed dynamic',r=>edit(r,1,s=>s.replace('import("./match_candidate_service.js")','import(dynamicTarget)'))],
      ['extra dynamic',r=>edit(r,1,s=>s+"\nimport('./match_candidate_service.js');")],
      ['extra commented dynamic',r=>edit(r,1,s=>s+"\nimport /*extra*/ ('./other.js');")],
      ['missing dynamic',r=>edit(r,1,s=>s.replace('import("./match_candidate_service.js")','missingFactory'))],
      ['unrelated body edit',r=>edit(r,1,s=>s.replace('class PairService','class OtherService'))],
      ['Unicode unrelated edit',r=>edit(r,1,s=>s+'\n// caf\u00e9')],
      ['changed recovery code',r=>edit(r,1,s=>s.replace('class JsonPairRecoveryStore','class OtherRecoveryStore'))],
      ['changed adapter code',r=>edit(r,1,s=>s.replace('this.adapters.restore(','this.adapters.otherRestore('))],
      ['self-consistent substituted output pair',r=>{for(const o of r.outputs){o.text+='\n// substituted';refresh(o);}const tail=Buffer.from(r.outputs[0].text).subarray(r.derivation.replacements[2].originalEnd);r.derivation.unchanged[3]={region:'suffix',bytes:tail.length,sha256:sha(tail)};}],
      ['stale producer range',r=>{r.derivation.replacements[1].originalStart+=26;}],
      ['overlapping proof',r=>{r.derivation.replacements[2].originalStart=r.derivation.replacements[1].originalStart;}],
      ['stale redirected range',r=>{r.derivation.replacements[2].redirectedStart-=49;}],
      ['changed region hash',r=>{r.derivation.unchanged[2].sha256='0'.repeat(64);}],
      ['changed producer import location',r=>{r.imports[0].imports[2].byteStart++;}],
      ['false erasure',r=>{r.correspondence[0].emittedSlot=0;}],
      ['missing correspondence',r=>r.correspondence.pop()],
      ['substituted boundary source hash',r=>{r.sourceBoundary.observations[0].sha256='0'.repeat(64);}],
      ['changed boundary identity',r=>{r.sourceBoundary.observations[1].identity.ino='0';}],
      ['changed parser measurement',r=>{r.sourceBoundary.observations.find(o=>o.path.endsWith('typescript.js')).sha256='0'.repeat(64);}],
      ['missing boundary observation',r=>r.sourceBoundary.observations.pop()],
      ['changed boundary capture',r=>{r.sourceBoundaryCapture.sha256='0'.repeat(64);}],
      ['discarded runtime uncertainty',r=>r.sourceBoundary.boundary.typeUseImports.pop()],
      ['changed configuration',r=>{r.compiler.configuration.verbatimModuleSyntax=false;}],
      ['changed compiler method',r=>{r.compiler.method='runtime import';}],
      ['runtime path disclosure',r=>{r.compiler.node.executable='C:/Users/private/node.exe';}],
      ['extra credential field',r=>{r.compiler.secret='forbidden';}],
      ['weakened output cap',r=>{r.limits.prospectiveOutput*=2;}],
      ['weakened record cap',r=>{r.limits.futureOutputRecord*=2;}],
      ['claimed runtime validity',r=>{r.limitations[0]='all exports validated';}],
      ['missing output',r=>r.outputs.pop()],['extra output',r=>r.outputs.push(clone(r.outputs[0]))],['reversed outputs',r=>r.outputs.reverse()],
      ['output digest changed',r=>{r.outputs[0].sha256='0'.repeat(64);}],['output length changed',r=>{r.outputs[1].bytes++;}],
      ['output admission',r=>{r.outputs[1].admission=true;}],['filesystem identity invented',r=>{r.outputs[0].filesystemIdentity={ino:'1'};}],
      ['historical admission',r=>{r.historicalAdmission=true;}],['false baseline',r=>{r.authoritativeBaseline=824;}],['false ceiling',r=>{r.ceiling=65;}],
      ['false achieved payload',r=>{r.achievedPayloadCount=64;}],['closed obligation',r=>{r.remainingCallerObligations=28;}],
      ...FLAGS.map(key=>['false '+key,r=>{r[key]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('record '+name+' denies with refreshed digest',()=>{
      const r=clone(e);change(r);const json=JSON.stringify(r);assert.notEqual(sha(json),fixture.retained.sha256,'negative must change evidence');
      assert.throws(()=>verifyPairEvidence(json,sha(json)),error=>error.code==='PAIR_REWRITE_DENIED');
    });
    await t.test('external capture prevents substituting newly measured fixture identity',()=>{
      const r=clone(e);r.fixtureObservations[0].sha256='0'.repeat(64);assert.throws(()=>fixture.assess(r),/external capture digest/);
    });
    await t.test('malformed, noncanonical, oversized and unanchored records deny',()=>{
      for(const json of ['{',' '.repeat(262145),fixture.retained.json.replace('{','{"profile":"shadowed",')])assert.throws(()=>verifyPairEvidence(json,sha(json)),error=>error.code==='PAIR_REWRITE_DENIED');
      assert.throws(()=>verifyPairEvidence(fixture.retained.json),/external capture digest/);
    });
    await t.test('per-output overflow denies even inside complete record cap',()=>{
      const r=clone(e);r.outputs[0].text=' '.repeat(65537);refresh(r.outputs[0]);const json=JSON.stringify(r);assert.ok(Buffer.byteLength(json)<262144);
      assert.throws(()=>verifyPairEvidence(json,sha(json)),/size budget prospectiveOutput/);
    });
    await t.test('live measurement mismatch denies without changing any files',()=>{
      const old=fs.fstatSync;try{fs.fstatSync=function(fd,options){const s=old.call(this,fd,options);return options?.bigint?Object.assign(s,{ino:s.ino+1n}):s;};assert.throws(()=>fixture.assess(e),/changed input|changed-during-read/);}finally{fs.fstatSync=old;}fixture.verifyInputs();
    });
    await t.test('consumed source substitution denies and restores compiler cache',()=>{
      const open=fs.openSync,read=fs.readSync,sourceFDs=new Set();
      try{
        fs.openSync=function(file,...args){const fd=open.call(this,file,...args);if(file===path.join(repo,'src/core/network/pair_service.ts'))sourceFDs.add(fd);return fd;};
        fs.readSync=function(fd,buffer,offset,length,...args){const count=read.call(this,fd,buffer,offset,length,...args);if(sourceFDs.has(fd)&&buffer.length===47120&&count>0)buffer[offset]^=1;return count;};
        assert.throws(()=>preparePairRewrite(repo,true),/consumed source bytes/);
      }finally{fs.openSync=open;fs.readSync=read;}
      fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('success remains blocked with input/cache/environment preservation and no activity',()=>{
      const result=fixture.assess(e);assert.equal(result.status,'blocked');assert.equal(result.remainingCallerObligations,29);assert.equal(result.authoritativeBaseline,825);assert.equal(result.ceiling,64);assert.equal(result.achievedPayloadCount,null);
      for(const key of FLAGS)assert.equal(result[key],false);fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});assert.equal(forbidden,0);assert.equal(forbiddenCompilerAPI,0);
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('PAIR_REWRITE_JSON '+fixture.retained.json);
  console.log('PAIR_REWRITE_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,outputs:fixture.evidence.outputs.map(({text,...r})=>r),cleanup:fixture.cleanup,forbiddenActivity:forbidden,forbiddenCompilerAPI}));
});
