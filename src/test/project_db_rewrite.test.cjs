'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https'),Module=require('node:module');
const {prepareProjectRewrite,rewriteProjectImport,verifyProjectEvidence,checkProjectBudget}=require('./support/project_db_rewrite_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=v=>JSON.parse(JSON.stringify(v));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const refresh=o=>{o.bytes=Buffer.byteLength(o.text);o.sha256=sha(o.text);};
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
test('project rewrite requires explicit compile-only opt-in',()=>assert.throws(()=>prepareProjectRewrite(repo,false),/explicit compile-only opt-in/));
test('project_db inline type erasure and specifier-only provenance',{timeout:60000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];let forbidden=0,forbiddenCompilerAPI=0,fixture;
  const patch=(owner,name,value)=>{const old=owner[name];owner[name]=value;restore.push(()=>{owner[name]=old;});};
  const deny=()=>{forbidden++;throw Error('Forbidden project provenance process/network/write/module activity');};
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
  const load=Module._load,api=new Set(['version','transpileModule','ScriptTarget','ModuleKind','JsxEmit','NewLineKind','createSourceFile','ScriptKind','SyntaxKind','isImportDeclaration','isStringLiteral','isNamedImports','isImportEqualsDeclaration','isImportTypeNode','isExportDeclaration','isCallExpression','isIdentifier','forEachChild','isVariableStatement','isInterfaceDeclaration','isTypeAliasDeclaration','isNamedExports']);
  patch(Module,'_load',function(request,...args){
    if(request!=='typescript'&&!Module.isBuiltin(request)&&request!=='../../../scripts/payload-byte-catalog.cjs')return deny();
    const result=load.call(this,request,...args);if(request==='typescript')return new Proxy(result,{get(target,key){if(!api.has(key)){forbiddenCompilerAPI++;throw Error('Forbidden compiler API '+String(key));}return Reflect.get(target,key);}});return result;
  });
  try{
    fixture=prepareProjectRewrite(repo,true);const e=fixture.evidence,[original,redirected]=e.outputs;
    const range={slot:3,byteStart:e.derivation.originalStart,byteEnd:e.derivation.originalEnd,from:e.derivation.from,to:e.derivation.to};
    const source=fs.readFileSync(path.join(repo,e.source),'utf8');
    await t.test('twenty measured source/dependency/compiler/tool/runtime inputs stay bound',()=>{
      assert.ok(Object.isFrozen(e));assert.equal(e.observations.length,20);assert.equal(e.observations[0].size,37896);
      assert.equal(e.selectedDependencyBoundary.sources.length,10);assert.equal(e.selectedDependencyBoundary.closure,'UNRESOLVED');
      for(const p of ['src/core/projects/project_replacement_authority.ts','src/core/storage/project_history.ts','src/shared/project_history.ts','src/shared/address_validation.ts'])assert.ok(e.observations.some(r=>r.path===p));
      assert.equal(e.compiler.version,'5.9.3');assert.equal(e.compiler.configuration.verbatimModuleSyntax,true);assert.equal(e.compiler.repeatOutputMatched,true);
      assert.equal(JSON.parse(fs.readFileSync(path.join(repo,'tsconfig.json'),'utf8')).compilerOptions.noEmit,true);
    });
    await t.test('ten ordered source declarations retain binding pairs and per-binding type flags',()=>{
      const rows=e.sourceHeader.imports;assert.equal(rows.length,10);assert.deepEqual(rows.map(r=>r.slot),Array.from({length:10},(_,i)=>i));
      assert.equal(e.sourceHeader.bytes,949);assert.equal(e.sourceHeader.sha256,sha(e.sourceHeader.text));assert.ok(source.startsWith(e.sourceHeader.text));
      assert.deepEqual(fixture.inspectSource(source).imports,rows);
      assert.deepEqual(rows[4].bindings,[{imported:'promises',local:'fs',typeOnly:false}]);
      assert.deepEqual(rows[9].bindings,[
        {imported:'createProjectReplacementProtection',local:'createProjectReplacementProtection',typeOnly:false},
        {imported:'ProjectReplacementAuthorityError',local:'ProjectReplacementAuthorityError',typeOnly:false},
        {imported:'ProjectExportOperation',local:'ProjectExportOperation',typeOnly:true},
      ]);
      assert.ok(rows.every(r=>r.clauseTypeOnly===false));assert.equal(rows.flatMap(r=>r.bindings.filter(b=>b.typeOnly)).length,1);
    });
    await t.test('actual ten-to-ten emission erases only the inline type binding',()=>{
      assert.equal(e.correspondence.length,10);for(const o of e.imports)assert.equal(o.length,10);
      for(let i=0;i<10;i++){
        const r=e.correspondence[i];assert.equal(r.sourceSlot,i);assert.equal(r.emittedSlot,i);assert.deepEqual(r.sourceBindings,e.sourceHeader.imports[i].bindings);
        assert.deepEqual(r.original.bindings,r.sourceBindings.filter(b=>!b.typeOnly));assert.deepEqual(r.redirected.bindings,r.original.bindings);
        assert.equal(r.original.specifier,e.sourceHeader.imports[i].specifier.replace(/\.ts$/,'.js'));
        assert.equal(r.erasedBindings.length,i===9?1:0);
      }
      assert.equal(e.correspondence[9].disposition,'observed-partial-inline-type-erasure');assert.equal(e.imports[0][9].bindings.length,2);
      assert.equal(e.imports[0][9].specifier,'../projects/project_replacement_authority.js');
      for(const o of e.outputs){assert.ok(!/\bProjectExportOperation\b/.test(o.text));assert.equal(o.bytes,Buffer.byteLength(o.text));assert.equal(o.sha256,sha(o.text));assert.equal(o.filesystemIdentity,null);assert.equal(o.admission,null);}
    });
    await t.test('one island specifier changes; alias, exports and entire protected-store suffix remain data',()=>{
      assert.equal(e.derivation.sourceSlot,3);assert.equal(e.derivation.emittedSlot,3);assert.equal(e.derivation.deltaBytes,26);assert.equal(redirected.bytes,original.bytes+26);
      assert.deepEqual(e.imports[0][4].bindings,[{imported:'promises',local:'fs',typeOnly:false}]);assert.deepEqual(e.imports[1][4].bindings,e.imports[0][4].bindings);
      for(let i=0;i<10;i++)assert.equal(e.imports[1][i].byteStart,e.imports[0][i].byteStart+(i>3?26:0));
      assert.equal(rewriteProjectImport(original.text,[range]),redirected.text);
      const a=Buffer.from(original.text),b=Buffer.from(redirected.text),prefix=a.subarray(0,e.derivation.originalStart),suffix=a.subarray(e.derivation.originalEnd);
      assert.ok(prefix.equals(b.subarray(0,e.derivation.redirectedStart)));assert.ok(suffix.equals(b.subarray(e.derivation.redirectedEnd)));
      assert.equal(e.derivation.unchanged[0].sha256,sha(prefix));assert.equal(e.derivation.unchanged[1].sha256,sha(suffix));
      assert.equal(e.derivation.unchanged[0].bytes,prefix.length);assert.equal(e.derivation.unchanged[1].bytes,suffix.length);
      for(const o of e.outputs)assert.ok(o.text.includes('export const projectDb = createProtectedProjectStore();'),'initializer retained as text, never evaluated');
      assert.deepEqual(e.exports,['ProjectValidationError','SiteProjectDatabase','createProtectedProjectStore','claimProjectReplacementAuthority','projectDb']);
      assert.notEqual(range.byteStart,e.sourceHeader.imports[3].byteStart,'fresh LF emission coordinate differs from CRLF source');
    });
    await t.test('compiler-free verifier locates bytes with all module loads forbidden',()=>{
      const old=Module._load;let result;try{Module._load=()=>{throw Error('Verifier module load');};result=verifyProjectEvidence(fixture.retained.json,fixture.retained.sha256);}finally{Module._load=old;}
      assert.equal(result.status,'blocked');assert.equal(result.independentByteVerification,true);assert.equal(result.compilerLoaded,false);assert.equal(result.generatedExecution,false);
      assert.deepEqual(result.derivation,e.derivation);assert.equal(result.recordBytes,fixture.retained.bytes);assert.equal(result.recordSha256,fixture.retained.sha256);
      assert.equal(e.runtimeExportUncertainties.length,10);assert.ok(e.runtimeExportUncertainties.every(r=>r.runtimeExportValidity==='UNRESOLVED'));
      assert.equal(e.runtimeExportUncertainties.filter(r=>r.via==='src/core/storage/project_history.ts').length,2);
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(process.execPath));
    });
    for(const [kind,cap]of Object.entries(e.limits))await t.test(kind+' budget boundary and overflow checks',()=>{
      assert.equal(checkProjectBudget(kind,cap),cap);assert.equal(checkProjectBudget(kind,0),0);
      for(const v of [cap+1,-1,0.5,Infinity,NaN,'1'])assert.throws(()=>checkProjectBudget(kind,v),error=>error.code==='PROJECT_REWRITE_DENIED');
    });
    await t.test('unknown budget and oversized source/output deny',()=>{
      assert.throws(()=>checkProjectBudget('global',1),/size budget/);assert.throws(()=>fixture.inspectSource(' '.repeat(65537)),/size budget source/);
      assert.throws(()=>rewriteProjectImport(original.text+' '.repeat(65537),[range]),/size budget output/);
    });
    await t.test('UTF8 suffix preserves bytes under single permitted splice',()=>{
      const suffix='\n// caf\u00e9 \ud83d\ude00\r\n';assert.equal(rewriteProjectImport(original.text+suffix,[range]),redirected.text+suffix);
    });
    await t.test('input within cap rejects an overflowing replacement result',()=>{
      const near=original.text+' '.repeat(65536-original.bytes-25);assert.equal(Buffer.byteLength(near),65511);
      assert.throws(()=>rewriteProjectImport(near,[range]),/size budget output/);
    });
    const sourceCases=[
      ['inline modifier removed',s=>s.replace('type ProjectExportOperation','ProjectExportOperation')],
      ['inline modifier moved to value binding',s=>s.replace('type ProjectExportOperation','ProjectExportOperation').replace('{ createProjectReplacementProtection,','{ type createProjectReplacementProtection,')],
      ['whole declaration made type-only',s=>s.replace('import { createProjectReplacementProtection,','import type { createProjectReplacementProtection,')],
      ['value binding removed',s=>s.replace('createProjectReplacementProtection, ProjectReplacementAuthorityError,','ProjectReplacementAuthorityError,')],
      ['type alias renamed',s=>s.replace('type ProjectExportOperation','type ProjectExportOperation as OtherOperation')],
      ['declaration reordered',s=>{const a=s.split('\r\n');[a[3],a[9]]=[a[9],a[3]];return a.join('\r\n');}],
      ['island target changed',s=>s.replace('../../shared/identity_policy.ts','../../shared/other.ts')],
      ['fs alias reversed',s=>s.replace('promises as fs','fs as promises')],
      ['extra dynamic',s=>s+"\nimport('./other.ts');"],['computed dynamic',s=>s+'\nimport(target);'],
      ['extra require',s=>s+"\nrequire('node:fs');"],['re-export request',s=>s+"\nexport * from './other.ts';"],
    ];
    for(const [name,change]of sourceCases)await t.test('source '+name+' denies without emission',()=>{const value=change(source);assert.notEqual(value,source);assert.throws(()=>fixture.inspectSource(value),error=>error.code==='PROJECT_REWRITE_DENIED');});
    const rangeCases=[
      ['missing',r=>r.pop()],['extra overlapping',r=>r.push({...r[0],byteStart:r[0].byteStart+1})],['duplicate',r=>r.push(clone(r[0]))],
      ['stale source coordinate',r=>{r[0].byteStart=e.sourceHeader.imports[3].byteStart;}],['stale shifted end',r=>{r[0].byteEnd+=26;}],
      ['negative',r=>{r[0].byteStart=-1;}],['fractional',r=>{r[0].byteStart+=0.5;}],['nonfinite',r=>{r[0].byteEnd=Infinity;}],
      ['out of bounds',r=>{r[0].byteEnd=original.bytes+1;}],['empty',r=>{r[0].byteEnd=r[0].byteStart;}],['reversed',r=>{r[0].byteEnd=r[0].byteStart-1;}],
      ['wrong slot',r=>{r[0].slot=9;}],['wrong from',r=>{r[0].from='../projects/project_replacement_authority.js';}],['wrong target',r=>{r[0].to='./other.js';}],['false admission',r=>{r[0].admission=true;}],
    ];
    for(const [name,change]of rangeCases)await t.test('range '+name+' denies',()=>{const r=clone([range]);change(r);assert.throws(()=>rewriteProjectImport(original.text,r),error=>error.code==='PROJECT_REWRITE_DENIED');});
    const edit=(r,index,change)=>{r.outputs[index].text=change(r.outputs[index].text);refresh(r.outputs[index]);};
    const cases=[
      ['type binding retained',r=>edit(r,0,s=>s.replace('createProjectReplacementProtection, ProjectReplacementAuthorityError','createProjectReplacementProtection, ProjectReplacementAuthorityError, ProjectExportOperation'))],
      ['wrong value binding erased',r=>edit(r,0,s=>s.replace('createProjectReplacementProtection, ProjectReplacementAuthorityError','createProjectReplacementProtection'))],
      ['both value bindings erased',r=>edit(r,0,s=>s.replace(/import \{ createProjectReplacementProtection, ProjectReplacementAuthorityError \} from[^\n]+\n/,''))],
      ['value binding altered',r=>edit(r,1,s=>s.replace('createProjectReplacementProtection, ProjectReplacementAuthorityError','createOtherProtection, ProjectReplacementAuthorityError'))],
      ['value binding order changed',r=>edit(r,1,s=>s.replace('createProjectReplacementProtection, ProjectReplacementAuthorityError','ProjectReplacementAuthorityError, createProjectReplacementProtection'))],
      ['whole mixed declaration removed',r=>edit(r,1,s=>s.split('\n').filter((_,i)=>i!==9).join('\n'))],
      ['declarations reordered',r=>edit(r,1,s=>{const a=s.split('\n');[a[3],a[9]]=[a[9],a[3]];return a.join('\n');})],
      ['declaration duplicated',r=>edit(r,1,s=>s.slice(0,s.indexOf('\n')+1)+s)],
      ['missing island substitution',r=>edit(r,1,s=>s.replace(e.derivation.to,e.derivation.from))],
      ['wrong island binding alias',r=>edit(r,1,s=>s.replace('canonicalAnchor, canonicalMac','canonicalAnchor as other, canonicalMac'))],
      ['fs alias changed',r=>edit(r,1,s=>s.replace('promises as fs','promises as otherFs'))],
      ['fs alias reversed',r=>edit(r,1,s=>s.replace('promises as fs','fs as promises'))],
      ['non-island target changed',r=>edit(r,1,s=>s.replace('../projects/project_replacement_authority.js','../projects/other_authority.js'))],
      ['unrelated protected-store edit',r=>edit(r,1,s=>s.replace('private protected store construction','other protected store construction'))],
      ['export initializer changed',r=>edit(r,1,s=>s.replace('export const projectDb = createProtectedProjectStore();','export const projectDb = null;'))],
      ['extra dynamic',r=>edit(r,1,s=>s+"\nimport('./other.js');")],
      ['CRLF emitted substitution',r=>edit(r,1,s=>s.replace(/\n/g,'\r\n'))],
      ['Unicode unrelated edit',r=>edit(r,1,s=>s+'\n// caf\u00e9')],
      ['self-consistent substituted pair',r=>{for(const o of r.outputs){o.text+='\n// substituted';refresh(o);}const tail=Buffer.from(r.outputs[0].text).subarray(r.derivation.originalEnd);r.derivation.unchanged[1]={region:'suffix',bytes:tail.length,sha256:sha(tail)};}],
      ['stale producer coordinate',r=>{r.derivation.originalStart++;}],['overlapping proof boundaries',r=>{r.derivation.originalEnd=r.derivation.originalStart-1;}],
      ['stale redirected offset',r=>{r.derivation.redirectedEnd-=26;}],['wrong prefix hash',r=>{r.derivation.unchanged[0].sha256='0'.repeat(64);}],
      ['producer offsets substituted',r=>{r.imports[0][3].byteStart++;}],
      ['source modifier changed',r=>{r.sourceHeader.imports[9].bindings[2].typeOnly=false;}],
      ['source header substituted',r=>{r.sourceHeader.text=r.sourceHeader.text.replace('type ProjectExportOperation','ProjectExportOperation');r.sourceHeader.bytes=Buffer.byteLength(r.sourceHeader.text);r.sourceHeader.sha256=sha(r.sourceHeader.text);}],
      ['false whole-declaration erasure',r=>{r.correspondence[9].emittedSlot=null;}],['false erased binding',r=>{r.correspondence[9].erasedBindings=[];}],
      ['missing correspondence',r=>r.correspondence.pop()],
      ['source digest changed',r=>{r.observations[0].sha256='0'.repeat(64);}],
      ['dependency digest changed',r=>{r.observations[10].sha256='0'.repeat(64);}],
      ['compiler digest changed',r=>{r.observations.find(o=>o.path.endsWith('typescript.js')).sha256='0'.repeat(64);}],
      ['missing observation',r=>r.observations.pop()],['duplicate observation',r=>{r.observations[1]=clone(r.observations[0]);}],
      ['inconsistent file identity',r=>{r.observations[0].identity.size='1';}],
      ['configuration changed',r=>{r.compiler.configuration.verbatimModuleSyntax=false;}],['runtime path disclosure',r=>{r.compiler.node.executable='C:/Users/private/node.exe';}],
      ['invented compiler method',r=>{r.compiler.method='runtime import';}],['missing warning',r=>r.runtimeExportUncertainties.pop()],
      ['runtime export proven',r=>{r.runtimeExportUncertainties[0].runtimeExportValidity='VALID';}],
      ['ancestry discarded',r=>{r.runtimeExportUncertainties[9].via=null;}],['closure claimed',r=>{r.selectedDependencyBoundary.closure='COMPLETE';}],
      ['weakened bounds',r=>{r.limits.output*=2;}],['invented rationale',r=>{r.budgetRationale.output='unlimited';}],['warning replaced',r=>{r.limitations[0]='runtime equivalent';}],
      ['exports changed',r=>r.exports.pop()],['missing output',r=>r.outputs.pop()],['extra output',r=>r.outputs.push(clone(r.outputs[0]))],['reordered outputs',r=>r.outputs.reverse()],
      ['wrong output digest',r=>{r.outputs[0].sha256='0'.repeat(64);}],['wrong output length',r=>{r.outputs[1].bytes++;}],
      ['output admission',r=>{r.outputs[0].admission=true;}],['output inode invented',r=>{r.outputs[0].filesystemIdentity={ino:'1'};}],
      ['historical admission',r=>{r.historicalAdmission=true;}],['false baseline',r=>{r.authoritativeBaseline=824;}],['false ceiling',r=>{r.ceiling=65;}],
      ['achieved payload invented',r=>{r.achievedPayloadCount=64;}],['obligation closed',r=>{r.remainingCallerObligations=28;}],['credential field',r=>{r.compiler.secret='forbidden';}],
      ...FLAGS.map(key=>['false '+key,r=>{r[key]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('record '+name+' denies with refreshed digest',()=>{
      const r=clone(e);change(r);const json=JSON.stringify(r);assert.notEqual(sha(json),fixture.retained.sha256,'negative must change data');assert.throws(()=>verifyProjectEvidence(json,sha(json)),error=>error.code==='PROJECT_REWRITE_DENIED');
    });
    await t.test('external digest anchors runtime and own fixture measurements',()=>{
      const r=clone(e);r.observations.at(-1).sha256='0'.repeat(64);assert.throws(()=>fixture.assess(r),/external capture digest/);
      const own=clone(e);own.observations.at(-2).sha256='0'.repeat(64);assert.throws(()=>verifyProjectEvidence(JSON.stringify(own),fixture.retained.sha256),/external capture digest/);
    });
    await t.test('malformed, duplicate-key, oversized and unanchored JSON denies',()=>{
      for(const json of ['{',' '.repeat(262145),fixture.retained.json.replace('{','{"profile":"shadowed",')])assert.throws(()=>verifyProjectEvidence(json,sha(json)),error=>error.code==='PROJECT_REWRITE_DENIED');
      assert.throws(()=>verifyProjectEvidence(fixture.retained.json),/external capture digest/);
    });
    await t.test('output overflow denies inside whole-record cap',()=>{
      const r=clone(e);r.outputs[0].text=' '.repeat(65537);refresh(r.outputs[0]);const json=JSON.stringify(r);assert.ok(Buffer.byteLength(json)<262144);assert.throws(()=>verifyProjectEvidence(json,sha(json)),/size budget output/);
    });
    await t.test('complete JSON overflow denies before schema acceptance',()=>{
      const r=clone(e);r.extra='x'.repeat(262144);const json=JSON.stringify(r);assert.ok(Buffer.byteLength(json)>262144);
      assert.throws(()=>verifyProjectEvidence(json,sha(json)),/size budget record/);
    });
    await t.test('live measurement drift denies without modifying files',()=>{
      const old=fs.fstatSync;try{fs.fstatSync=function(fd,opts){const s=old.call(this,fd,opts);return opts?.bigint?Object.assign(s,{ino:s.ino+1n}):s;};assert.throws(()=>fixture.assess(e),/changed-during-read/);}finally{fs.fstatSync=old;}fixture.verifyInputs();
    });
    await t.test('consumed source substitution denies with compiler cache restored',()=>{
      const open=fs.openSync,read=fs.readSync,sourceFDs=new Set();try{
        fs.openSync=function(file,...args){const fd=open.call(this,file,...args);if(file===path.join(repo,e.source))sourceFDs.add(fd);return fd;};
        fs.readSync=function(fd,buffer,offset,length,...args){const n=read.call(this,fd,buffer,offset,length,...args);if(sourceFDs.has(fd)&&buffer.length===37896&&n>0)buffer[offset]^=1;return n;};
        assert.throws(()=>prepareProjectRewrite(repo,true),/consumed source\/dependency bytes/);
      }finally{fs.openSync=open;fs.readSync=read;}fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('unbound source diagnostics never execute and cannot replace captured provenance',()=>{
      const diagnostic=fixture.inspectSource(source+'\nthrow Error("MUST_NOT_EXECUTE");');assert.equal(diagnostic.status,'blocked');assert.equal(diagnostic.executionAuthority,false);
      assert.throws(()=>fixture.assess(diagnostic),/external capture digest/);
    });
    await t.test('success stays blocked; inputs/environment/cache restored and no activity',()=>{
      const r=fixture.assess(e);assert.equal(r.status,'blocked');assert.equal(r.sourceDeclarations,10);assert.equal(r.emittedDeclarations,10);assert.equal(r.remainingCallerObligations,29);assert.equal(r.authoritativeBaseline,825);assert.equal(r.ceiling,64);assert.equal(r.achievedPayloadCount,null);
      for(const k of FLAGS)assert.equal(r[k],false);fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true});assert.equal(forbidden,0);assert.equal(forbiddenCompilerAPI,0);
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('PROJECT_REWRITE_JSON '+fixture.retained.json);
  console.log('PROJECT_REWRITE_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,outputs:fixture.evidence.outputs.map(({text,...r})=>r),cleanup:fixture.cleanup,forbiddenActivity:forbidden,forbiddenCompilerAPI}));
});
