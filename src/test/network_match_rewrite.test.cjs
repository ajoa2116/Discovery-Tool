'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const {prepareNetworkMatchRewrite,verifyRetainedCallerEvidence}=require('./support/network_match_rewrite_fixture.cjs');
// Baseline this existing measurement helper before the compiler-cache checks.
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const remeasure=row=>{row.bytes=Buffer.byteLength(row.text);row.sha256=sha(row.text);};

test('caller rewrite requires explicit compile-only opt-in',()=>{
  assert.throws(()=>prepareNetworkMatchRewrite(repo,false),/explicit compile-only opt-in/);
});

test('network_match compile-only rewrite provenance',{timeout:30000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];
  let forbidden=0,fixture;
  const patch=(owner,name,value)=>{const original=owner[name];owner[name]=value;restore.push(()=>{owner[name]=original;});};
  const deny=()=>{forbidden++;throw Error('Forbidden caller-rewrite process/network/write activity');};
  // Compiler operation is in-process only. These guards are instrumentation,
  // not a claim of Windows OS confinement against malicious compiler code.
  for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,name,deny);
  patch(net.Socket.prototype,'connect',deny);patch(net.Server.prototype,'listen',deny);
  patch(dgram,'createSocket',deny);patch(globalThis,'fetch',deny);
  for(const owner of [http,https])for(const name of ['request','get'])patch(owner,name,deny);
  const mutations=['writeFile','appendFile','mkdir','mkdtemp','rm','rmdir','unlink','rename','copyFile','cp','chmod','chown','truncate','link','symlink','utimes','lutimes','lchown'];
  for(const name of mutations){
    if(typeof fs[name]==='function')patch(fs,name,deny);
    if(typeof fs[name+'Sync']==='function')patch(fs,name+'Sync',deny);
    if(typeof fs.promises[name]==='function')patch(fs.promises,name,deny);
  }
  for(const name of ['write','writeSync','writev','writevSync','ftruncate','ftruncateSync','fchmod','fchmodSync','fchown','fchownSync','futimes','futimesSync','createWriteStream'])if(typeof fs[name]==='function')patch(fs,name,deny);
  const readonly=flags=>flags==='r'||flags===fs.constants.O_RDONLY;
  for(const [owner,name]of [[fs,'open'],[fs,'openSync'],[fs.promises,'open']]){
    const original=owner[name];patch(owner,name,function(file,flags,...args){if(!readonly(flags))return deny();return original.call(this,file,flags,...args);});
  }
  try{
    fixture=prepareNetworkMatchRewrite(repo,true);
    const evidence=fixture.evidence;
    await t.test('two fresh outputs differ only in the exact relative specifier',()=>{
      assert.ok(Object.isFrozen(evidence));assert.ok(Object.isFrozen(evidence.outputs));
      assert.equal(evidence.source,'src/shared/network_match.ts');assert.equal(evidence.outputs.length,2);
      const [original,redirected]=evidence.outputs;
      assert.equal(original.path,'src/shared/network_match.js');assert.equal(redirected.path,original.path);
      for(const row of evidence.outputs){assert.equal(row.bytes,Buffer.byteLength(row.text));assert.equal(row.sha256,sha(row.text));assert.equal(row.filesystemIdentity,null);assert.equal(row.admission,null);}
      const start=evidence.derivation.before.byteStart,end=evidence.derivation.before.byteEnd;
      const a=Buffer.from(original.text),expected=Buffer.concat([a.subarray(0,start),Buffer.from('./.consolidation/address-identity.generated.js'),a.subarray(end)]);
      assert.ok(Buffer.from(redirected.text).equals(expected));
      assert.equal(a.subarray(start,end).toString(),'./address_validation.js');
      assert.equal(evidence.derivation.after.statementIndex,0);
      assert.deepEqual(evidence.derivation.before.bindings,evidence.derivation.after.bindings);
      assert.deepEqual(evidence.derivation.before.exports,['networkMatchError']);
      assert.equal(evidence.derivation.unchangedPrefixSha256,sha(a.subarray(0,start)));
      assert.equal(evidence.derivation.unchangedSuffixSha256,sha(a.subarray(end)));
      assert.equal(evidence.compiler.version,'5.9.3');assert.equal(evidence.compiler.configuration.module,'ESNext');
      assert.equal(evidence.observations.length,12);
      assert.equal(evidence.observations.find(row=>row.path==='src/shared/network_match.ts').sha256,'c19ebe9bf1dbf7efe842dc37a43d2110a04f3fbac09bec41cda992859699ab76');
    });
    await t.test('success stays blocked with all caller obligations open',()=>{
      const result=fixture.assess(evidence);assert.equal(result.status,'blocked');assert.ok(Object.isFrozen(result));
      for(const key of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'])assert.equal(result[key],false);
      assert.equal(result.authoritativeBaseline,825);assert.equal(result.ceiling,64);assert.equal(result.achievedPayloadCount,null);assert.equal(result.remainingCallerObligations,29);
      assert.equal(evidence.historicalAdmission,null);assert.match(evidence.provenanceScope,/not historical/);
    });
    const substitutions=[
      ['source digest',e=>{e.observations[0].sha256='0'.repeat(64);}],
      ['source filesystem identity',e=>{e.observations[0].identity.ino='0';}],
      ['compiler measurement',e=>{e.observations.find(row=>row.path.endsWith('typescript.js')).sha256='0'.repeat(64);}],
      ['runtime measurement',e=>{e.observations.find(row=>row.root==='node-runtime').identity.ino='0';}],
      ['missing observation',e=>e.observations.pop()],
      ['compiler configuration',e=>{e.compiler.configuration.target='ESNext';}],
      ['compiler method',e=>{e.compiler.method='historical-admission';}],
      ['missing output',e=>e.outputs.pop()],
      ['extra output',e=>e.outputs.push(clone(e.outputs[0]))],
      ['reordered outputs',e=>e.outputs.reverse()],
      ['output pathname',e=>{e.outputs[1].path='src/shared/other.js';}],
      ['output byte count',e=>{e.outputs[1].bytes++;}],
      ['output digest',e=>{e.outputs[1].sha256='0'.repeat(64);}],
      ['output text without updated digest',e=>{e.outputs[1].text+='\n';}],
      ['extra static import',e=>{e.outputs[1].text+="\nimport 'node:fs';\n";remeasure(e.outputs[1]);}],
      ['dynamic import',e=>{e.outputs[1].text+="\nimport('node:fs');\n";remeasure(e.outputs[1]);}],
      ['changed imported binding',e=>{e.outputs[1].text=e.outputs[1].text.replace('normalizeIPv4, ipv4Number','normalizeIPv4, prefixMask');remeasure(e.outputs[1]);}],
      ['changed local alias',e=>{e.outputs[1].text=e.outputs[1].text.replace('normalizeIPv4,','normalizeIPv4 as other,');remeasure(e.outputs[1]);}],
      ['non-relative dot-directory target',e=>{e.outputs[1].text=e.outputs[1].text.replace('./.consolidation/','.consolidation/');remeasure(e.outputs[1]);}],
      ['declaration moved',e=>{e.outputs[1].text='const unexpected = 1;\n'+e.outputs[1].text;remeasure(e.outputs[1]);}],
      ['non-specifier edit',e=>{e.outputs[1].text=e.outputs[1].text.replace('return null;','return false;');remeasure(e.outputs[1]);}],
      ['self-consistent substituted pair and derivation',e=>{
        for(const row of e.outputs){row.text+='\n// substitution\n';remeasure(row);}
        e.derivation.unchangedSuffixSha256=sha(Buffer.from(e.outputs[0].text).subarray(e.derivation.before.byteEnd));
      }],
      ['derivation span',e=>{e.derivation.before.byteStart++;}],
      ['prefix proof',e=>{e.derivation.unchangedPrefixSha256='0'.repeat(64);}],
      ['historical admission reuse',e=>{e.historicalAdmission={admitted:true};}],
      ['output admission reuse',e=>{e.outputs[1].admission='copied-candidate';}],
      ['invented filesystem identity',e=>{e.outputs[1].filesystemIdentity={ino:'123'};}],
      ['claimed discharged caller',e=>{e.remainingCallerObligations=28;}],
      ['changed baseline',e=>{e.authoritativeBaseline=824;}],
      ['claimed achieved ceiling',e=>{e.achievedPayloadCount=64;}],
      ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'].map(key=>['false '+key,e=>{e[key]=true;}]),
    ];
    for(const [name,change]of substitutions)await t.test(name+' denies',()=>{
      const candidate=clone(evidence);change(candidate);
      assert.throws(()=>fixture.assess(candidate),error=>error.code==='CALLER_REWRITE_DENIED');
    });
    await t.test('consumed source bytes are checked independently of file observations',()=>{
      const read=fs.readFileSync;
      try{
        fs.readFileSync=function(file,...args){const value=read.call(this,file,...args);return file===path.join(repo,'src/shared/network_match.ts')?Buffer.concat([value,Buffer.from('\n')]):value;};
        assert.throws(()=>prepareNetworkMatchRewrite(repo,true),/consumed source bytes/);
      }finally{fs.readFileSync=read;}
      fixture.verifyInputs();
    });
    await t.test('live input identity drift denies and cache cleanup survives failure',()=>{
      const stat=fs.fstatSync;
      try{
        fs.fstatSync=function(fd,options){const value=stat.call(this,fd,options);return options?.bigint?Object.assign(value,{ino:value.ino+1n}):value;};
        assert.throws(()=>fixture.assess(evidence),/changed-during-read/);
      }finally{fs.fstatSync=stat;}
      fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('inputs, environment and compiler cache preserved; no owned resources created',()=>{
      fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});
      assert.equal(forbidden,0);
    });
    await t.test('retained canonical data contains full texts and 12 observations without absolute paths',()=>{
      const retained=fixture.retained,record=JSON.parse(retained.json);
      assert.ok(retained.bytes<=65536);assert.equal(retained.bytes,Buffer.byteLength(retained.json));assert.equal(retained.sha256,sha(retained.json));
      assert.deepEqual(record.evidence.outputs,evidence.outputs);assert.deepEqual(record.evidence.observations,evidence.observations);
      assert.deepEqual(record.evidence.compiler.configuration,evidence.compiler.configuration);
      assert.equal(record.evidence.compiler.node.path,'node.exe');
      assert.ok(!retained.json.includes(repo));assert.ok(!retained.json.includes(process.execPath));
      assert.deepEqual(record.replacement,{from:'./address_validation.js',to:'./.consolidation/address-identity.generated.js',removedBytes:23,insertedBytes:46,netBytesAdded:23});
      assert.equal(record.evidence.observations.length,12);
    });
    await t.test('independent verifier uses no compiler, parser, or module loading',()=>{
      const Module=require('node:module'),load=Module._load;
      const before=Object.keys(require.cache).sort();let result;
      try{
        Module._load=()=>{throw Error('Independent verifier must not load a module');};
        result=verifyRetainedCallerEvidence(fixture.retained.json,fixture.retained.sha256);
      }finally{Module._load=load;}
      assert.equal(result.status,'blocked');assert.equal(result.independentByteVerification,true);assert.equal(result.compilerLoaded,false);
      assert.deepEqual(result.independentlyLocated,[{byteStart:43,byteEnd:66},{byteStart:43,byteEnd:89}]);
      assert.equal(result.remainingCallerObligations,29);assert.equal(result.observedInputs,12);
      for(const key of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'])assert.equal(result[key],false);
      assert.deepEqual(Object.keys(require.cache).sort(),before);
    });
    await t.test('retained substitution fails with the separately held capture digest',()=>{
      const record=JSON.parse(fixture.retained.json);record.evidence.observations[11].sha256='0'.repeat(64);
      assert.throws(()=>verifyRetainedCallerEvidence(JSON.stringify(record),fixture.retained.sha256),/external digest/);
    });
    const retainedCases=[
      ['missing text',r=>{delete r.evidence.outputs[0].text;}],
      ['missing observation',r=>r.evidence.observations.pop()],
      ['duplicate observation',r=>{r.evidence.observations[1]=clone(r.evidence.observations[0]);}],
      ['fixed input substitution',r=>{r.evidence.observations[0].sha256='0'.repeat(64);}],
      ['absolute user path',r=>{r.evidence.compiler.node.path='C:/Users/private/node.exe';}],
      ['extra sensitive field',r=>{r.evidence.compiler.credentials='must-never-be-retained';}],
      ['inconsistent identity size',r=>{r.evidence.observations[0].identity.size='1';}],
      ['configuration change',r=>{r.evidence.compiler.configuration.target='ESNext';}],
      ['incorrect output length',r=>{r.evidence.outputs[0].bytes++;}],
      ['incorrect output hash',r=>{r.evidence.outputs[1].sha256='0'.repeat(64);}],
      ['forged producer offsets',r=>{r.evidence.derivation.before.byteStart=0;r.evidence.derivation.after.byteStart=0;}],
      ['binding substitution',r=>{r.evidence.outputs[1].text=r.evidence.outputs[1].text.replace('ipv4Number }','prefixMask }');remeasure(r.evidence.outputs[1]);}],
      ['import literal inside comment',r=>{r.evidence.outputs[0].text='// '+r.evidence.outputs[0].text;remeasure(r.evidence.outputs[0]);}],
      ['extra import',r=>{r.evidence.outputs[1].text+="\nimport 'node:fs';";remeasure(r.evidence.outputs[1]);}],
      ['unrelated edit',r=>{r.evidence.outputs[1].text=r.evidence.outputs[1].text.replace('return null;','return false;');remeasure(r.evidence.outputs[1]);}],
      ['self-consistent substituted outputs',r=>{for(const row of r.evidence.outputs){row.text+='\n// substitution';remeasure(row);}}],
      ['incorrect replacement claim',r=>{r.replacement.removedBytes=46;}],
      ['historical admission',r=>{r.evidence.historicalAdmission=true;}],
      ['output admission',r=>{r.evidence.outputs[1].admission=true;}],
      ['discharged caller obligation',r=>{r.evidence.remainingCallerObligations=28;}],
      ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'].map(key=>['false '+key,r=>{r.evidence[key]=true;}]),
    ];
    for(const [name,change]of retainedCases)await t.test('compiler-free '+name+' denies even with a refreshed container digest',()=>{
      const record=JSON.parse(fixture.retained.json);change(record);const json=JSON.stringify(record);
      assert.throws(()=>verifyRetainedCallerEvidence(json,sha(json)),error=>error.code==='CALLER_REWRITE_DENIED');
    });
    await t.test('compiler-free malformed, duplicate-key, oversized and unanchored records deny',()=>{
      for(const json of ['{',' '.repeat(65537),fixture.retained.json.replace('{','{"profile":"shadowed",')]){
        assert.throws(()=>verifyRetainedCallerEvidence(json,sha(json)),error=>error.code==='CALLER_REWRITE_DENIED');
      }
      assert.throws(()=>verifyRetainedCallerEvidence(fixture.retained.json),/external digest/);
      assert.throws(()=>verifyRetainedCallerEvidence(fixture.retained.json,'0'.repeat(64)),/external digest/);
    });
    fixture.verifyInputs();assert.equal(forbidden,0);
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log(JSON.stringify({callerRewrite:{outputs:fixture.evidence.outputs.map(({text,...row})=>row),derivation:fixture.evidence.derivation,
    inputFiles:fixture.evidence.observations.length,cleanup:fixture.cleanup,forbiddenActivity:forbidden,status:'blocked',remainingCallerObligations:29}}));
  console.log('CALLER_REWRITE_RETAINED_JSON '+fixture.retained.json);
  console.log('CALLER_REWRITE_RETAINED_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes}));
});
