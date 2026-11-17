'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const {prepareAliasRewrite,rewriteAliasImport,verifyAliasEvidence}=require('./support/add_to_existing_project_rewrite_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const refresh=r=>{r.bytes=Buffer.byteLength(r.text);r.sha256=sha(r.text);};
test('aliased rewrite requires explicit compile-only opt-in',()=>assert.throws(()=>prepareAliasRewrite(repo,false),/explicit compile-only opt-in/));
test('add_to_existing_project aliased-import compile-only provenance',{timeout:30000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];let forbidden=0,fixture;
  const patch=(owner,name,value)=>{const original=owner[name];owner[name]=value;restore.push(()=>{owner[name]=original;});};
  const deny=()=>{forbidden++;throw Error('Forbidden aliased provenance process/network/write activity');};
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
    fixture=prepareAliasRewrite(repo,true);const e=fixture.evidence,[original,redirected]=e.outputs,d=e.derivation;
    const range={slot:0,byteStart:d.originalStart,byteEnd:d.originalEnd,from:d.from,to:d.to};
    await t.test('exact four-import contract retains imported/local alias pairs',()=>{
      assert.ok(Object.isFrozen(e));assert.equal(e.observations.length,15);
      assert.deepEqual(e.sourceImports.map(r=>({slot:r.slot,specifier:r.specifier,pairs:r.bindings.map(b=>[b.imported,b.local])})),[
        {slot:0,specifier:'../../shared/identity_policy.ts',pairs:[['canonicalAnchor','canonicalAnchor'],['sharesAnchor','sharesAnchor'],['conflicts','conflict']]},
        {slot:1,specifier:'../../types/index.ts',pairs:[['Device','Device']]},
        {slot:2,specifier:'../network/local_host_identity.ts',pairs:[['LocalHostIdentity','LocalHostIdentity']]},
        {slot:3,specifier:'./project_db.ts',pairs:[['ProjectValidationError','ProjectValidationError'],['SiteProjectDatabase','SiteProjectDatabase']]},
      ]);
      assert.ok(e.sourceImports.every(r=>r.bindings.every(b=>b.typeOnly===false)));
      for(const file of ['src/types/index.ts','src/core/network/local_host_identity.ts','src/core/storage/project_db.ts'])assert.ok(e.observations.some(r=>r.path===file));
      assert.equal(e.compiler.configuration.verbatimModuleSyntax,true);assert.match(e.limitations[0],/Device type-use import may not have valid runtime exports/);
      assert.match(original.text,/export class AddToExistingProjectService/);assert.ok(!original.text.includes('export interface'));
      assert.equal(e.sourceImports[0].byteStart,d.originalStart,'fresh first-line coordinates');
      assert.ok(!original.text.includes('\r')&&!redirected.text.includes('\r'),'emitted LF profile');
      const emittedFirstLineBytes=Buffer.byteLength(original.text.slice(0,original.text.indexOf('\n')+1));
      const sourceFirstLineBytes=Buffer.byteLength(fs.readFileSync(path.join(repo,'src/core/storage/add_to_existing_project.ts'),'utf8').split('\n')[0]+'\n');
      assert.equal(sourceFirstLineBytes,emittedFirstLineBytes+1,'source CRLF is not reused as emitted coordinates');
    });
    await t.test('single UTF8 splice preserves the alias clause and the entire suffix',()=>{
      const a=Buffer.from(original.text),b=Buffer.from(redirected.text);
      assert.equal(d.removedBytes,31);assert.equal(d.insertedBytes,57);assert.equal(d.deltaBytes,26);
      assert.equal(d.from,'../../shared/identity_policy.js');assert.equal(d.to,'../../shared/.consolidation/address-identity.generated.js');
      assert.equal(a.subarray(d.originalStart,d.originalEnd).toString(),d.from);
      assert.equal(b.subarray(d.redirectedStart,d.redirectedEnd).toString(),d.to);
      assert.equal(redirected.bytes,original.bytes+26);assert.equal(d.mergedDeclarations,false);
      const prefix=a.subarray(0,d.originalStart),suffix=a.subarray(d.originalEnd);
      assert.ok(prefix.equals(b.subarray(0,d.redirectedStart)));assert.ok(suffix.equals(b.subarray(d.redirectedEnd)));
      assert.deepEqual(d.unchanged,[{region:'prefix',bytes:prefix.length,sha256:sha(prefix)},{region:'suffix',bytes:suffix.length,sha256:sha(suffix)}]);
      assert.match(prefix.toString(),/conflicts as conflict/);
      for(const spec of ['../../types/index.js','../network/local_host_identity.js','./project_db.js'])assert.ok(suffix.includes(Buffer.from(spec)));
      assert.equal(rewriteAliasImport(original.text,range),redirected.text);
      for(const row of e.outputs){assert.equal(row.bytes,Buffer.byteLength(row.text));assert.equal(row.sha256,sha(row.text));assert.equal(row.filesystemIdentity,null);assert.equal(row.admission,null);}
    });
    await t.test('sharesAnchor value assignment and conflict usage are preserved as data',()=>{
      assert.deepEqual(e.usage,{matchesAssignment:{local:'matches',sourceBinding:'sharesAnchor',count:1},conflictCall:{local:'conflict',arguments:['found[0]','device'],count:1},conflictIdentifierOccurrences:2});
      for(const row of e.outputs){
        assert.equal((row.text.match(/\bconst matches\s*=\s*sharesAnchor;/g)||[]).length,1);
        assert.equal((row.text.match(/\bconflict\(found\[0\],\s*device\)/g)||[]).length,1);
        assert.equal((row.text.match(/\bconflict\b/g)||[]).length,2);
      }
    });
    await t.test('retained evidence is bounded, sanitized and compiler-free verifiable',()=>{
      const Module=require('node:module'),load=Module._load;let result;
      try{Module._load=()=>{throw Error('Verifier cannot load modules');};result=verifyAliasEvidence(fixture.retained.json,fixture.retained.sha256);}finally{Module._load=load;}
      assert.equal(result.status,'blocked');assert.equal(result.compilerLoaded,false);assert.equal(result.independentByteVerification,true);assert.equal(result.observedInputs,15);
      assert.deepEqual(result.derivation,e.derivation);assert.ok(fixture.retained.bytes<=65536);assert.equal(fixture.retained.bytes,Buffer.byteLength(fixture.retained.json));
      assert.equal(fixture.retained.sha256,sha(fixture.retained.json));assert.deepEqual(JSON.parse(fixture.retained.json),e);
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(process.execPath));
      assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    const rangeCases=[
      ['wrong slot',r=>{r.slot=1;}],['negative start',r=>{r.byteStart=-1;}],['fractional start',r=>{r.byteStart+=0.5;}],
      ['non-finite end',r=>{r.byteEnd=Infinity;}],['out-of-bounds end',r=>{r.byteEnd=original.bytes+1;}],
      ['reversed bounds',r=>{[r.byteStart,r.byteEnd]=[r.byteEnd,r.byteStart];}],['empty span',r=>{r.byteEnd=r.byteStart;}],
      ['stale shifted offsets',r=>{r.byteStart+=26;r.byteEnd+=26;}],['off-by-one start',r=>{r.byteStart++;}],
      ['wrong old specifier',r=>{r.from='../../shared/address_validation.js';}],['wrong replacement path',r=>{r.to='./.consolidation/address-identity.generated.js';}],
      ['invented admission field',r=>{r.admitted=true;}],
    ];
    for(const [name,change]of rangeCases)await t.test(name+' denies before splicing',()=>{
      const r=clone(range);change(r);assert.throws(()=>rewriteAliasImport(original.text,r),error=>error.code==='ALIAS_REWRITE_DENIED');
    });
    const mutateOutput=(r,work,both=false)=>{for(const row of both?r.outputs:[r.outputs[1]]){row.text=work(row.text);refresh(row);}};
    const cases=[
      ['dropped alias',r=>mutateOutput(r,s=>s.replace('conflicts as conflict','conflicts'))],
      ['reversed alias relationship',r=>mutateOutput(r,s=>s.replace('conflicts as conflict','conflict as conflicts'))],
      ['changed local alias',r=>mutateOutput(r,s=>s.replace('conflicts as conflict','conflicts as other'))],
      ['changed imported name',r=>mutateOutput(r,s=>s.replace('conflicts as conflict','hasIdentity as conflict'))],
      ['swapped import bindings',r=>mutateOutput(r,s=>s.replace('canonicalAnchor, sharesAnchor','sharesAnchor, canonicalAnchor'))],
      ['renamed conflict call',r=>mutateOutput(r,s=>s.replace(/conflict\(found\[0\],\s*device\)/,'conflicts(found[0], device)'))],
      ['changed conflict arguments',r=>mutateOutput(r,s=>s.replace(/conflict\(found\[0\],\s*device\)/,'conflict(device, found[0])'))],
      ['changed sharesAnchor assignment',r=>mutateOutput(r,s=>s.replace(/const matches\s*=\s*sharesAnchor;/,'const matches = canonicalAnchor;'))],
      ['changed matches usage',r=>mutateOutput(r,s=>s.replace('matches(candidate, device)','sharesAnchor(candidate, device)'))],
      ['shadowed conflict identifier',r=>mutateOutput(r,s=>s+'\nconst conflict = null;')],
      ['missing redirection',r=>mutateOutput(r,s=>s.replace(d.to,d.from))],
      ['non-island import changed',r=>mutateOutput(r,s=>s.replace('./project_db.js','./other_db.js'))],
      ['type-use import elided',r=>mutateOutput(r,s=>s.replace(/import \{ Device \} from ["']\.\.\/\.\.\/types\/index\.js["'];\n/,''))],
      ['type-only import modifier invented',r=>mutateOutput(r,s=>s.replace('import { Device }','import type { Device }'))],
      ['reordered declarations',r=>mutateOutput(r,s=>{const lines=s.split('\n');[lines[0],lines[1]]=[lines[1],lines[0]];return lines.join('\n');})],
      ['merged declarations',r=>mutateOutput(r,s=>s.replace('conflicts as conflict }','conflicts as conflict, Device }').replace(/import \{ Device \} from ["']\.\.\/\.\.\/types\/index\.js["'];\n/,''))],
      ['extra import',r=>mutateOutput(r,s=>s+"\nimport 'node:fs';")],
      ['unrelated body edit',r=>mutateOutput(r,s=>s.replace('let added = 0','let added = 1'))],
      ['alias in comment',r=>mutateOutput(r,s=>'// '+s)],
      ['self-consistent substituted pair',r=>{mutateOutput(r,s=>s+'\n// substitution',true);const tail=Buffer.from(r.outputs[0].text).subarray(r.derivation.originalEnd);r.derivation.unchanged[1]={region:'suffix',bytes:tail.length,sha256:sha(tail)};}],
      ['reversed descriptor binding pair',r=>{r.sourceImports[0].bindings[2]={imported:'conflict',local:'conflicts',typeOnly:false};}],
      ['aliased descriptor flattened',r=>{r.derivation.bindings[2]={imported:'conflicts',local:'conflicts',typeOnly:false};}],
      ['usage claim changed',r=>{r.usage.conflictCall.count=0;}],
      ['stale producer offset',r=>{r.derivation.originalStart++;}],['forged redirected end',r=>{r.derivation.redirectedEnd--;}],
      ['prefix proof changed',r=>{r.derivation.unchanged[0].sha256='0'.repeat(64);}],
      ['source measurement substitution',r=>{r.observations[0].sha256='0'.repeat(64);}],
      ['dependency measurement substitution',r=>{r.observations[3].sha256='0'.repeat(64);}],
      ['compiler measurement substitution',r=>{r.observations[9].sha256='0'.repeat(64);}],
      ['missing observation',r=>r.observations.pop()],['duplicate observation',r=>{r.observations[1]=clone(r.observations[0]);}],
      ['identity inconsistency',r=>{r.observations[0].identity.size='1';}],['configuration changed',r=>{r.compiler.configuration.verbatimModuleSyntax=false;}],
      ['type-use limitation concealed',r=>{r.limitations[0]='runtime exports verified';}],
      ['missing output',r=>r.outputs.pop()],['extra output',r=>r.outputs.push(clone(r.outputs[0]))],['swapped outputs',r=>r.outputs.reverse()],
      ['incorrect output length',r=>{r.outputs[0].bytes++;}],['incorrect output hash',r=>{r.outputs[1].sha256='0'.repeat(64);}],
      ['historical admission',r=>{r.historicalAdmission=true;}],['output admission',r=>{r.outputs[1].admission=true;}],
      ['absolute runtime path',r=>{r.compiler.node.executable='C:/Users/private/node.exe';}],['sensitive field',r=>{r.compiler.credentials='forbidden';}],
      ['false achieved count',r=>{r.achievedPayloadCount=64;}],['false baseline',r=>{r.authoritativeBaseline=824;}],['false ceiling',r=>{r.ceiling=65;}],
      ['discharged caller obligation',r=>{r.remainingCallerObligations=28;}],
      ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'].map(key=>['false '+key,r=>{r[key]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('retained '+name+' denies with refreshed digest',()=>{
      const candidate=clone(e);change(candidate);assert.notDeepEqual(candidate,e,'negative must actually change evidence');const json=JSON.stringify(candidate);
      assert.throws(()=>verifyAliasEvidence(json,sha(json)),error=>error.code==='ALIAS_REWRITE_DENIED');
    });
    await t.test('separate capture digest rejects substitutions in runtime observations',()=>{
      const candidate=clone(e);candidate.observations.at(-1).sha256='0'.repeat(64);const json=JSON.stringify(candidate);
      assert.throws(()=>verifyAliasEvidence(json,fixture.retained.sha256),/external capture digest/);
      assert.throws(()=>fixture.assess(candidate),/external capture digest/);
    });
    await t.test('malformed, duplicate-key, oversized and unanchored records deny',()=>{
      for(const json of ['{',' '.repeat(65537),fixture.retained.json.replace('{','{"profile":"shadowed",')])assert.throws(()=>verifyAliasEvidence(json,sha(json)),error=>error.code==='ALIAS_REWRITE_DENIED');
      assert.throws(()=>verifyAliasEvidence(fixture.retained.json),/external capture digest/);
    });
    await t.test('consumed source substitution denies and cache cleanup survives failure',()=>{
      const read=fs.readFileSync;try{fs.readFileSync=function(file,...args){const bytes=read.call(this,file,...args);return file===path.join(repo,'src/core/storage/add_to_existing_project.ts')?Buffer.concat([bytes,Buffer.from('\n')]):bytes;};assert.throws(()=>prepareAliasRewrite(repo,true),/consumed source bytes/);}finally{fs.readFileSync=read;}
      fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('live identity drift denies without changing files',()=>{
      const stat=fs.fstatSync;try{fs.fstatSync=function(fd,options){const value=stat.call(this,fd,options);return options?.bigint?Object.assign(value,{ino:value.ino+1n}):value;};assert.throws(()=>fixture.assess(e),/changed-during-read/);}finally{fs.fstatSync=stat;}fixture.verifyInputs();
    });
    await t.test('success blocked, all inputs preserved and no owned compiler resources remain',()=>{
      const result=fixture.assess(e);assert.equal(result.status,'blocked');assert.equal(result.remainingCallerObligations,29);assert.equal(result.authoritativeBaseline,825);assert.equal(result.ceiling,64);assert.equal(result.achievedPayloadCount,null);
      for(const key of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'])assert.equal(result[key],false);
      fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});assert.equal(forbidden,0);
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('ALIAS_RETAINED_JSON '+fixture.retained.json);
  console.log('ALIAS_RETAINED_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,cleanup:fixture.cleanup,forbiddenActivity:forbidden}));
});
