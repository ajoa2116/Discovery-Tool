'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const {prepareCameraRewrite,rewriteCameraImports,verifyCameraEvidence}=require('./support/camera_access_rewrite_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const refresh=r=>{r.bytes=Buffer.byteLength(r.text);r.sha256=sha(r.text);};
test('camera rewrite requires explicit compile-only opt-in',()=>assert.throws(()=>prepareCameraRewrite(repo,false),/explicit compile-only opt-in/));
test('camera_access two-import compile-only provenance',{timeout:30000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];let forbidden=0,fixture;
  const patch=(owner,name,value)=>{const original=owner[name];owner[name]=value;restore.push(()=>{owner[name]=original;});};
  const deny=()=>{forbidden++;throw Error('Forbidden camera provenance process/network/write activity');};
  // Instrumentation only, not OS confinement against a malicious compiler.
  for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,name,deny);
  patch(net.Socket.prototype,'connect',deny);patch(net.Server.prototype,'listen',deny);patch(dgram,'createSocket',deny);patch(globalThis,'fetch',deny);
  for(const owner of [http,https])for(const name of ['request','get'])patch(owner,name,deny);
  for(const name of ['writeFile','appendFile','mkdir','mkdtemp','rm','rmdir','unlink','rename','copyFile','cp','chmod','chown','truncate','link','symlink','utimes','lutimes','lchown']){
    for(const [owner,key]of [[fs,name],[fs,name+'Sync'],[fs.promises,name]])if(typeof owner[key]==='function')patch(owner,key,deny);
  }
  for(const name of ['write','writeSync','writev','writevSync','ftruncate','ftruncateSync','fchmod','fchmodSync','fchown','fchownSync','futimes','futimesSync','createWriteStream'])if(typeof fs[name]==='function')patch(fs,name,deny);
  for(const [owner,name]of [[fs,'open'],[fs,'openSync'],[fs.promises,'open']]){
    const original=owner[name];patch(owner,name,function(file,flags,...args){if(flags!=='r'&&flags!==fs.constants.O_RDONLY)return deny();return original.call(this,file,flags,...args);});
  }
  try{
    fixture=prepareCameraRewrite(repo,true);const e=fixture.evidence,[original,redirected]=e.outputs;
    const ranges=e.derivation.replacements.map(r=>({slot:r.slot,byteStart:r.originalStart,byteEnd:r.originalEnd,from:r.from,to:r.to}));
    await t.test('four exact imports, two separate replacements and 14 observations',()=>{
      assert.ok(Object.isFrozen(e));assert.equal(e.observations.length,14);
      assert.deepEqual(e.sourceImports.map(r=>({slot:r.slot,specifier:r.specifier,names:r.bindings.map(b=>b.imported)})),[
        {slot:0,specifier:'../types/index.ts',names:['Device','IPCollisionRecord']},
        {slot:1,specifier:'./identity_policy.ts',names:['hasIdentity']},
        {slot:2,specifier:'./collision_state.ts',names:['isActiveCollision']},
        {slot:3,specifier:'./address_validation.ts',names:['normalizeIPv4']},
      ]);
      assert.ok(e.observations.some(r=>r.path==='src/types/index.ts'));assert.ok(e.observations.some(r=>r.path==='src/shared/collision_state.ts'));
      assert.equal(e.compiler.configuration.verbatimModuleSyntax,true);assert.equal(e.compiler.configuration.rewriteRelativeImportExtensions,true);
      assert.match(e.limitations[0],/type-use import may not have valid runtime exports/);
      assert.equal(e.derivation.totalDeltaBytes,49);assert.equal(e.derivation.mergedDeclarations,false);
      assert.equal(e.sourceImports[1].byteStart,e.derivation.replacements[0].originalStart+1,'source CRLF and emitted LF coordinates differ');
      assert.equal(e.sourceImports[3].byteStart,e.derivation.replacements[1].originalStart+3,'do not reuse source offsets in emitted bytes');
      assert.deepEqual(e.derivation.replacements.map(r=>[r.slot,r.removedBytes,r.insertedBytes,r.deltaBytes]),[[1,20,46,26],[3,23,46,23]]);
      assert.equal(redirected.bytes,original.bytes+49);assert.equal(redirected.text.split('./.consolidation/address-identity.generated.js').length-1,2);
    });
    await t.test('UTF8 prefix, intervening non-island import and suffix are identical',()=>{
      const a=Buffer.from(original.text),b=Buffer.from(redirected.text),[first,second]=e.derivation.replacements;
      const segments=[a.subarray(0,first.originalStart),a.subarray(first.originalEnd,second.originalStart),a.subarray(second.originalEnd)];
      const changed=[b.subarray(0,first.redirectedStart),b.subarray(first.redirectedEnd,second.redirectedStart),b.subarray(second.redirectedEnd)];
      segments.forEach((bytes,index)=>{assert.ok(bytes.equals(changed[index]));assert.equal(e.derivation.unchanged[index].sha256,sha(bytes));assert.equal(e.derivation.unchanged[index].bytes,bytes.length);});
      assert.match(segments[0].toString(),/Device, IPCollisionRecord.*\.\.\/types\/index\.js/);
      assert.match(segments[1].toString(),/isActiveCollision.*\.\/collision_state\.js/);
      for(const r of e.outputs){assert.equal(r.sha256,sha(r.text));assert.equal(r.bytes,Buffer.byteLength(r.text));assert.equal(r.filesystemIdentity,null);assert.equal(r.admission,null);}
      assert.equal(rewriteCameraImports(original.text,ranges),redirected.text);
    });
    await t.test('retained data verifies with no compiler, parser or module loads',()=>{
      const Module=require('node:module'),load=Module._load;let result;
      try{Module._load=()=>{throw Error('Verifier module load forbidden');};result=verifyCameraEvidence(fixture.retained.json,fixture.retained.sha256);}finally{Module._load=load;}
      assert.equal(result.status,'blocked');assert.equal(result.compilerLoaded,false);assert.equal(result.independentByteVerification,true);
      assert.deepEqual(result.derivation,e.derivation);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.ok(fixture.retained.bytes<=65536);assert.equal(fixture.retained.bytes,Buffer.byteLength(fixture.retained.json));
      assert.equal(fixture.retained.sha256,sha(fixture.retained.json));assert.deepEqual(JSON.parse(fixture.retained.json),e);
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(process.execPath));
    });
    const rangeCases=[
      ['missing range',r=>r.pop()],['extra range',r=>r.push(clone(r[0]))],['duplicate range',r=>{r[1]=clone(r[0]);}],
      ['overlapping ranges',r=>{r[1].byteStart=r[0].byteStart+1;}],['reversed range order',r=>r.reverse()],
      ['negative offset',r=>{r[0].byteStart=-1;}],['fractional offset',r=>{r[0].byteStart+=0.5;}],
      ['non-finite offset',r=>{r[1].byteEnd=Infinity;}],['out-of-bounds end',r=>{r[1].byteEnd=original.bytes+1;}],
      ['empty range',r=>{r[0].byteEnd=r[0].byteStart;}],['reversed bounds',r=>{r[0].byteEnd=r[0].byteStart-1;}],
      ['stale shifted second range',r=>{r[1].byteStart+=26;r[1].byteEnd+=26;}],
      ['incorrect second old specifier',r=>{r[1].from='./identity_policy.js';}],['incorrect second target',r=>{r[1].to='./other.js';}],
      ['wrong declaration slot',r=>{r[1].slot=2;}],['extra range claim',r=>{r[0].admission=true;}],
    ];
    for(const [name,change]of rangeCases)await t.test(name+' denies before splicing',()=>{
      const candidate=clone(ranges);change(candidate);assert.throws(()=>rewriteCameraImports(original.text,candidate),error=>error.code==='CAMERA_REWRITE_DENIED');
    });
    const cases=[
      ['missing second substitution',r=>{r.outputs[1].text=r.outputs[1].text.replace(/(import \{ normalizeIPv4 \} from ["'])\.\/\.consolidation\/address-identity\.generated\.js(["'];)/,'$1./address_validation.js$2');refresh(r.outputs[1]);}],
      ['incorrect second substitution',r=>{r.outputs[1].text=r.outputs[1].text.replace(/(import \{ normalizeIPv4 \} from ["'])\.\/\.consolidation\/address-identity\.generated\.js(["'];)/,'$1./other.js$2');refresh(r.outputs[1]);}],
      ['swapped bindings',r=>{r.outputs[1].text=r.outputs[1].text.replace('{ hasIdentity }','{ SWAP }').replace('{ normalizeIPv4 }','{ hasIdentity }').replace('{ SWAP }','{ normalizeIPv4 }');refresh(r.outputs[1]);}],
      ['changed binding alias',r=>{r.outputs[1].text=r.outputs[1].text.replace('{ hasIdentity }','{ hasIdentity as other }');refresh(r.outputs[1]);}],
      ['merged declarations',r=>{r.outputs[1].text=r.outputs[1].text.replace('{ hasIdentity }','{ hasIdentity, normalizeIPv4 }').replace(/import \{ normalizeIPv4 \} from ["']\.\/\.consolidation\/address-identity\.generated\.js["'];\n/,'');refresh(r.outputs[1]);}],
      ['reordered declarations',r=>{const lines=r.outputs[1].text.split('\n');[lines[1],lines[2]]=[lines[2],lines[1]];r.outputs[1].text=lines.join('\n');refresh(r.outputs[1]);}],
      ['non-island types import change',r=>{r.outputs[1].text=r.outputs[1].text.replace('../types/index.js','../types/other.js');refresh(r.outputs[1]);}],
      ['non-island middle import change',r=>{r.outputs[1].text=r.outputs[1].text.replace('./collision_state.js','./other_state.js');refresh(r.outputs[1]);}],
      ['type-use import elision',r=>{r.outputs[1].text=r.outputs[1].text.slice(r.outputs[1].text.indexOf('\n')+1);refresh(r.outputs[1]);}],
      ['extra static import',r=>{r.outputs[1].text+="\nimport 'node:fs';";refresh(r.outputs[1]);}],
      ['unrelated body edit',r=>{r.outputs[1].text=r.outputs[1].text.replace('allowed: code ===','allowed: code !==');refresh(r.outputs[1]);}],
      ['Unicode unrelated edit',r=>{r.outputs[1].text=r.outputs[1].text.replace('unique current address','unique current addréss');refresh(r.outputs[1]);}],
      ['self-consistent substituted pair',r=>{for(const o of r.outputs){o.text+='\n// substitution';refresh(o);}const tail=Buffer.from(r.outputs[0].text).subarray(r.derivation.replacements[1].originalEnd);r.derivation.unchanged[2]={region:'suffix',bytes:tail.length,sha256:sha(tail)};}],
      ['forged overlapping proof',r=>{r.derivation.replacements[1].originalStart=r.derivation.replacements[0].originalStart;}],
      ['stale redirected offset',r=>{r.derivation.replacements[1].redirectedStart-=26;}],
      ['source binding descriptor',r=>{r.sourceImports[1].bindings[0].local='other';}],
      ['source type-only reclassification',r=>{r.sourceImports[0].bindings[0].typeOnly=true;}],
      ['input digest substitution',r=>{r.observations[0].sha256='0'.repeat(64);}],
      ['types input substitution',r=>{r.observations[2].sha256='0'.repeat(64);}],
      ['compiler input substitution',r=>{r.observations[8].sha256='0'.repeat(64);}],
      ['missing observation',r=>r.observations.pop()],['duplicate observation',r=>{r.observations[1]=clone(r.observations[0]);}],
      ['identity inconsistency',r=>{r.observations[0].identity.size='1';}],
      ['changed compiler option',r=>{r.compiler.configuration.verbatimModuleSyntax=false;}],
      ['invented runtime export validity',r=>{r.limitations[0]='runtime exports proven';}],
      ['missing output',r=>r.outputs.pop()],['extra output',r=>r.outputs.push(clone(r.outputs[0]))],
      ['reordered outputs',r=>r.outputs.reverse()],['incorrect output hash',r=>{r.outputs[1].sha256='0'.repeat(64);}],
      ['incorrect output length',r=>{r.outputs[0].bytes++;}],['historical admission',r=>{r.historicalAdmission=true;}],
      ['output admission',r=>{r.outputs[1].admission=true;}],['absolute path',r=>{r.compiler.node.executable='C:/Users/private/node.exe';}],
      ['credential field',r=>{r.compiler.secret='forbidden';}],['discharged review',r=>{r.remainingCallerObligations=28;}],
      ['false baseline',r=>{r.authoritativeBaseline=824;}],['false ceiling',r=>{r.ceiling=65;}],['false achieved count',r=>{r.achievedPayloadCount=64;}],
      ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'].map(key=>['false '+key,r=>{r[key]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('retained '+name+' denies with refreshed digest',()=>{
      const candidate=clone(e);change(candidate);assert.notDeepEqual(candidate,e,'negative must actually change evidence');const json=JSON.stringify(candidate);
      assert.throws(()=>verifyCameraEvidence(json,sha(json)),error=>error.code==='CAMERA_REWRITE_DENIED');
    });
    await t.test('external capture digest anchors unpinned runtime and fixture observations',()=>{
      const candidate=clone(e);candidate.observations.at(-1).sha256='0'.repeat(64);
      assert.throws(()=>verifyCameraEvidence(JSON.stringify(candidate),fixture.retained.sha256),/external capture digest/);
      assert.throws(()=>fixture.assess(candidate),/external capture digest/);
    });
    await t.test('malformed, duplicate-key, oversized and unanchored JSON denies',()=>{
      for(const json of ['{',' '.repeat(65537),fixture.retained.json.replace('{','{"profile":"shadowed",')])assert.throws(()=>verifyCameraEvidence(json,sha(json)),error=>error.code==='CAMERA_REWRITE_DENIED');
      assert.throws(()=>verifyCameraEvidence(fixture.retained.json),/external capture digest/);
    });
    await t.test('consumed source substitution denies with compiler cache restored',()=>{
      const read=fs.readFileSync;try{fs.readFileSync=function(file,...args){const bytes=read.call(this,file,...args);return file===path.join(repo,'src/shared/camera_access.ts')?Buffer.concat([bytes,Buffer.from('\n')]):bytes;};assert.throws(()=>prepareCameraRewrite(repo,true),/consumed source bytes/);}finally{fs.readFileSync=read;}
      fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('live identity drift denies without changing source inputs',()=>{
      const stat=fs.fstatSync;try{fs.fstatSync=function(fd,options){const value=stat.call(this,fd,options);return options?.bigint?Object.assign(value,{ino:value.ino+1n}):value;};assert.throws(()=>fixture.assess(e),/changed-during-read/);}finally{fs.fstatSync=stat;}fixture.verifyInputs();
    });
    await t.test('success remains blocked; inputs, environment, cache and cleanup preserved',()=>{
      const result=fixture.assess(e);assert.equal(result.status,'blocked');assert.equal(result.remainingCallerObligations,29);assert.equal(result.authoritativeBaseline,825);assert.equal(result.ceiling,64);assert.equal(result.achievedPayloadCount,null);
      for(const key of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'])assert.equal(result[key],false);
      fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});assert.equal(forbidden,0);
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('CAMERA_RETAINED_JSON '+fixture.retained.json);
  console.log('CAMERA_RETAINED_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,cleanup:fixture.cleanup,forbiddenActivity:forbidden}));
});
