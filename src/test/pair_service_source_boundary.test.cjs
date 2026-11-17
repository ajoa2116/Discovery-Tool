'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const {preparePairSourceBoundary,checkPairBudget}=require('./support/pair_service_source_boundary_fixture.cjs');
require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const refresh=r=>{r.bytes=Buffer.byteLength(r.text);r.sha256=sha(r.text);};
test('pair source boundary requires explicit source-only opt-in',()=>assert.throws(()=>preparePairSourceBoundary(repo,false),/explicit source-only opt-in/));
test('pair_service_source_boundary source-only boundary',{timeout:30000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];let forbidden=0,fixture;
  const patch=(owner,name,value)=>{const original=owner[name];owner[name]=value;restore.push(()=>{owner[name]=original;});};
  const deny=()=>{forbidden++;throw Error('Forbidden source-only provenance process/network/write activity');};
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
  const Module=require('node:module'),load=Module._load;let forbiddenParserAccesses=0;
  const syntaxAPI=new Set(['version','createSourceFile','ScriptTarget','ScriptKind','SyntaxKind','isImportDeclaration','isStringLiteral','isNamedImports','isImportEqualsDeclaration','isImportTypeNode','isExportDeclaration','isTypeReferenceNode','isIdentifier','isCallExpression','isMethodDeclaration','isClassDeclaration','isAwaitExpression','isParenthesizedExpression','isPropertyAccessExpression','isBinaryExpression','forEachChild','isInterfaceDeclaration']);
  patch(Module,'_load',function(request,...args){
    if(typeof request==='string'&&request.endsWith('.ts'))return deny();
    const value=load.call(this,request,...args);
    if(request==='typescript'||request===path.join(repo,'node_modules/typescript/lib/typescript.js'))return new Proxy(value,{get(target,key){
      if(!syntaxAPI.has(key)){forbiddenParserAccesses++;throw Error('Non-syntax TypeScript API forbidden: '+String(key));}return Reflect.get(target,key);
    }});
    return value;
  });
  try{
    fixture=preparePairSourceBoundary(repo,true);const e=fixture.evidence,b=e.boundary;
    const source=fs.readFileSync(path.join(repo,'src/core/network/pair_service.ts'),'utf8');
    await t.test('21 exact imports retain source bytes, aliases and type-only distinctions',()=>{
      assert.ok(Object.isFrozen(e));assert.equal(e.observations.length,27);assert.equal(e.selectedDependencySources.length,17);
      assert.equal(b.imports.length,21);assert.deepEqual(b.imports.map(r=>r.slot),Array.from({length:21},(_,i)=>i));
      assert.deepEqual(b.imports.map(r=>r.line),Array.from({length:21},(_,i)=>i+1));
      for(const r of b.imports){
        assert.equal(Buffer.from(source).subarray(r.sourceSpan.byteStart,r.sourceSpan.byteEnd).toString(),r.rawDeclaration);
        assert.equal(Buffer.from(source).subarray(r.literalSpan.byteStart,r.literalSpan.byteEnd).toString(),"'"+r.specifier+"'");
        assert.equal(r.clauseTypeOnly,r.slot===0);assert.equal(r.expectedEmission.status,'UNOBSERVED');assert.equal(r.expectedEmission.byteRange,null);
        for(const binding of r.bindings){assert.equal(binding.explicitTypeOnly,false);assert.equal(binding.effectiveTypeOnly,r.slot===0);}
      }
      assert.deepEqual(b.imports[10].bindings,[{imported:'promises',local:'fs',explicitTypeOnly:false,effectiveTypeOnly:false}]);
      assert.deepEqual(b.imports[0].bindings,[{imported:'MatchApplyPlan',local:'MatchApplyPlan',explicitTypeOnly:false,effectiveTypeOnly:true}]);
      assert.deepEqual(b.imports[0].expectedEmission,{status:'UNOBSERVED',disposition:'expected-erased-explicit-type-only',importOrdinal:null,specifier:null,byteRange:null});
      assert.deepEqual(b.imports.slice(1).map(r=>r.expectedEmission.importOrdinal),Array.from({length:20},(_,i)=>i));
      assert.equal(e.configuration.repository.compilerOptions.noEmit,true);assert.equal(e.configuration.appliedEmitProfile,null);assert.equal(e.configuration.expectedFutureEmitProfile.verbatimModuleSyntax,true);
    });
    await t.test('three island occurrences retain both address declarations separately',()=>{
      assert.deepEqual(b.islandImports.map(r=>[r.sourceSlot,r.expectedEmittedImportOrdinal,r.bindings.map(v=>v.imported)]),[
        [1,0,['canonicalAnchor','sharesAnchor']],[3,2,['addressRelationship']],[20,19,['normalizeIPv4']],
      ]);
      assert.equal(b.islandImports[1].sourceTarget,b.islandImports[2].sourceTarget);
      assert.notEqual(b.imports[3].sourceSpan.byteStart,b.imports[20].sourceSpan.byteStart);
      for(const r of b.islandImports){assert.equal(r.proposedSpecifier,'../../shared/.consolidation/address-identity.generated.js');assert.equal(r.actualOriginalRange,null);assert.equal(r.actualRedirectedRange,null);}
    });
    await t.test('sole literal dynamic request is measured syntax, not execution or resolved closure',()=>{
      assert.equal(b.dynamicImports.length,1);const r=b.dynamicImports[0];
      assert.equal(r.specifier,'./match_candidate_service.ts');assert.equal(r.ownerMethod,'recheckMatch');assert.equal(r.ownerClass,'PairService');assert.equal(r.line,316);
      assert.equal(r.rawRequest,"import('./match_candidate_service.ts')");
      assert.equal(Buffer.from(source).subarray(r.sourceSpan.byteStart,r.sourceSpan.byteEnd).toString(),r.rawRequest);
      assert.deepEqual(r.expectedEmission,{status:'UNOBSERVED',specifier:'./match_candidate_service.js',byteRange:null});
      assert.equal(r.runtimeExecution,'UNOBSERVED');assert.equal(r.resolutionAndClosure,'UNRESOLVED');
    });
    await t.test('eight ordinary interface imports remain unresolved runtime-export obligations',()=>{
      assert.deepEqual(b.typeUseImports.map(r=>r.imported),['NetworkMatchInput','Device','PairCandidate','PairSessionState','WindowsAdapterSnapshot','PingProvider','NeighborProvider','WindowsNetworkAdapterService']);
      for(const r of b.typeUseImports){assert.equal(r.explicitTypeOnly,false);assert.equal(r.runtimeExportValidity,'UNRESOLVED');assert.ok(r.typeReferenceOccurrences>0);assert.equal(r.sourceDeclarationKind,'exported-interface');}
    });
    await t.test('all emit metrics remain null and budgets are caps rather than predictions',()=>{
      assert.equal(b.sourceEncoding.bytes,47120);assert.equal(b.sourceEncoding.crlfCount,487);assert.equal(b.sourceEncoding.lfCount,487);
      assert.deepEqual(b.coverage,{sourceDeclarations:21,distinctStaticSpecifiers:20,builtinOccurrences:4,localOccurrences:17,distinctLocalTargets:16,explicitTypeOnlyDeclarations:1,expectedEmittedImports:20,islandOccurrences:3,dynamicImportOccurrences:1,ordinaryInterfaceTypeUseBindings:8});
      assert.equal(e.emission.compilationInvoked,false);assert.equal(e.emission.status,'UNOBSERVED');
      for(const row of [e.emission.original,e.emission.redirected])assert.deepEqual(row,{status:'UNOBSERVED',text:null,bytes:null,sha256:null,importOffsets:null});
      assert.deepEqual(e.budgets.caps,{callerSource:65536,dependencySource:131072,prospectiveOutput:65536,sourceRecord:65536,futureOutputRecord:262144});
      assert.equal(fixture.retained.bytes,Buffer.byteLength(fixture.retained.json));assert.ok(fixture.retained.bytes<=65536);assert.equal(fixture.retained.sha256,sha(fixture.retained.json));
      assert.ok(!fixture.retained.json.includes(repo));assert.ok(!fixture.retained.json.includes(process.execPath));
    });
    for(const [kind,cap]of Object.entries(e.budgets.caps)){
      await t.test(kind+' budget accepts boundary and rejects overflow without truncation',()=>{
        assert.equal(checkPairBudget(kind,cap),cap);assert.equal(checkPairBudget(kind,0),0);
        for(const invalid of [cap+1,-1,0.5,Infinity,NaN,'1'])assert.throws(()=>checkPairBudget(kind,invalid),error=>error.code==='PAIR_SOURCE_DENIED');
      });
    }
    await t.test('unknown budget kind denies',()=>assert.throws(()=>checkPairBudget('globalRelaxation',1),/size budget/));
    const syntaxCases=[
      ['missing declaration',s=>s.replace("import {canonicalAnchor,sharesAnchor} from '../../shared/identity_policy.ts';\r\n",'')],
      ['duplicated declaration',s=>s.replace("import {canonicalAnchor,sharesAnchor} from '../../shared/identity_policy.ts';","import {canonicalAnchor,sharesAnchor} from '../../shared/identity_policy.ts';\r\nimport {canonicalAnchor,sharesAnchor} from '../../shared/identity_policy.ts';")],
      ['reordered imports',s=>{const lines=s.split('\r\n');[lines[1],lines[3]]=[lines[3],lines[1]];return lines.join('\r\n');}],
      ['type-only MatchApplyPlan reclassified',s=>s.replace('import type {MatchApplyPlan}','import {MatchApplyPlan}')],
      ['ordinary island import reclassified',s=>s.replace('import {canonicalAnchor,sharesAnchor}','import type {canonicalAnchor,sharesAnchor}')],
      ['individual binding reclassified',s=>s.replace('{ NetworkMatchInput, networkMatchError }','{ type NetworkMatchInput, networkMatchError }')],
      ['builtin alias reversed',s=>s.replace('promises as fs','fs as promises')],
      ['builtin alias renamed',s=>s.replace('promises as fs','promises as otherFs')],
      ['new island alias',s=>s.replace('{canonicalAnchor,sharesAnchor}','{canonicalAnchor as anchor,sharesAnchor}')],
      ['missing normalizeIPv4 declaration',s=>s.replace("import { normalizeIPv4 } from '../../shared/address_validation.ts';",'')],
      ['merged address imports',s=>s.replace('{addressRelationship}','{addressRelationship,normalizeIPv4}').replace("import { normalizeIPv4 } from '../../shared/address_validation.ts';",'')],
      ['substituted target',s=>s.replace("from '../../shared/identity_policy.ts'","from '../../shared/other.ts'")],
      ['default import form',s=>s.replace('import {canonicalAnchor,sharesAnchor}','import canonicalAnchor')],
      ['namespace import form',s=>s.replace('import {canonicalAnchor,sharesAnchor}','import * as identity')],
      ['computed dynamic import',s=>s.replace("import('./match_candidate_service.ts')",'import(dynamicTarget)')],
      ['template dynamic import',s=>s.replace("import('./match_candidate_service.ts')",'import(`./match_candidate_service.ts`)')],
      ['substituted dynamic target',s=>s.replace("import('./match_candidate_service.ts')","import('./other.ts')")],
      ['extra dynamic import',s=>s+"\r\nimport('./match_candidate_service.ts');\r\n"],
      ['missing dynamic import',s=>s.replace("(await import('./match_candidate_service.ts')).matchCandidateChecker",'missingFactory')],
      ['extra dynamic argument',s=>s.replace("import('./match_candidate_service.ts')","import('./match_candidate_service.ts', {})")],
      ['dynamic member substitution',s=>s.replace("import('./match_candidate_service.ts')).matchCandidateChecker","import('./match_candidate_service.ts')).otherChecker")],
      ['dynamic owner changed',s=>s.replace('private async recheckMatch(','private async anotherMethod(')],
      ['dynamic fallback changed',s=>s.replace("this.verificationOptions.matchCheckerFactory||(await import",'this.verificationOptions.otherFactory||(await import')],
      ['extra require request',s=>s+"\r\nrequire('node:fs');\r\n"],
      ['extra re-export',s=>s+"\r\nexport * from './other.ts';\r\n"],
      ['import type expression',s=>s+"\r\ntype Other = import('./other.ts').Other;\r\n"],
    ];
    for(const [name,change]of syntaxCases)await t.test('source '+name+' denies without compiling',()=>{
      const text=change(source);assert.notEqual(text,source,'negative must change input');assert.throws(()=>fixture.inspectSource(text),error=>error.code==='PAIR_SOURCE_DENIED');
    });
    await t.test('oversized caller text denies before parsing',()=>assert.throws(()=>fixture.inspectSource(' '.repeat(65537)),/size budget callerSource/));
    await t.test('unbound syntax diagnostics never execute added source or become captured provenance',()=>{
      const diagnostic=fixture.inspectSource(source+'\r\nthrow Error("SOURCE_MUST_NOT_RUN");\r\n');
      assert.equal(diagnostic.status,'blocked');assert.equal(diagnostic.executionAuthority,false);
      const candidate=clone(e);candidate.boundary=diagnostic.boundary;assert.throws(()=>fixture.assess(candidate),/captured evidence substitution/);
    });
    const cases=[
      ['missing import record',r=>r.boundary.imports.pop()],['duplicate import record',r=>{r.boundary.imports[1]=clone(r.boundary.imports[0]);}],
      ['reordered import records',r=>r.boundary.imports.reverse()],['substituted specifier',r=>{r.boundary.imports[1].specifier='./other.ts';}],
      ['changed alias pair',r=>{r.boundary.imports[10].bindings[0].local='other';}],
      ['false type-only disposition',r=>{r.boundary.imports[0].clauseTypeOnly=false;}],
      ['invented emitted slot',r=>{r.boundary.imports[1].expectedEmission.importOrdinal=1;}],
      ['invented emitted import offset',r=>{r.boundary.imports[1].expectedEmission.byteRange={start:0,end:1};}],
      ['merged island occurrences',r=>r.boundary.islandImports.pop()],['reordered island records',r=>r.boundary.islandImports.reverse()],
      ['substituted island binding',r=>{r.boundary.islandImports[1].bindings[0].local='wrong';}],
      ['false island emitted range',r=>{r.boundary.islandImports[0].actualOriginalRange=[0,1];}],
      ['missing dynamic record',r=>r.boundary.dynamicImports.pop()],['duplicated dynamic record',r=>r.boundary.dynamicImports.push(clone(r.boundary.dynamicImports[0]))],
      ['substituted dynamic record',r=>{r.boundary.dynamicImports[0].specifier='./other.ts';}],
      ['dynamic execution claim',r=>{r.boundary.dynamicImports[0].runtimeExecution='executed';}],
      ['dynamic resolution claim',r=>{r.boundary.dynamicImports[0].resolutionAndClosure='resolved';}],
      ['invented expected dynamic rewrite',r=>{r.boundary.dynamicImports[0].expectedEmission.specifier='./other.js';}],
      ['discarded runtime-export uncertainty',r=>r.boundary.typeUseImports.pop()],
      ['false runtime export validity',r=>{r.boundary.typeUseImports[0].runtimeExportValidity='valid';}],
      ['changed source hash',r=>{r.observations[0].sha256='0'.repeat(64);}],['changed source identity',r=>{r.observations[0].identity.ino='0';}],
      ['changed dependency hash',r=>{r.observations[1].sha256='0'.repeat(64);}],['changed parser hash',r=>{r.observations.find(row=>row.path.endsWith('typescript.js')).sha256='0'.repeat(64);}],
      ['changed runtime identity',r=>{r.observations.at(-1).identity.ino='0';}],['missing observation',r=>r.observations.pop()],
      ['changed config',r=>{r.configuration.expectedFutureEmitProfile.verbatimModuleSyntax=false;}],
      ['discarded dependency boundary',r=>r.selectedDependencySources.pop()],
      ['globally relaxed budgets',r=>{r.budgets.caps.callerSource=1048576;}],['invented budget rationale',r=>{r.budgets.rationale.prospectiveOutput='measured output fits';}],
      ['invented original output length',r=>{r.emission.original.bytes=1;}],['invented output digest',r=>{r.emission.redirected.sha256='0'.repeat(64);}],
      ['invented output text',r=>{r.emission.original.text='export {};';}],['invented import offsets',r=>{r.emission.original.importOffsets=[1];}],
      ['claimed compilation',r=>{r.emission.compilationInvoked=true;}],['claimed emission observation',r=>{r.emission.status='OBSERVED';}],
      ['historical admission reuse',r=>{r.historicalAdmission=true;}],['false baseline',r=>{r.authoritativeBaseline=824;}],['false ceiling',r=>{r.ceiling=65;}],
      ['false achieved payload',r=>{r.achievedPayloadCount=64;}],['discharged caller obligation',r=>{r.remainingCallerObligations=28;}],
      ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'].map(key=>['false '+key,r=>{r[key]=true;}]),
    ];
    for(const [name,change]of cases)await t.test('record '+name+' denies',()=>{
      const candidate=clone(e);change(candidate);assert.notDeepEqual(candidate,e);assert.throws(()=>fixture.assess(candidate),error=>error.code==='PAIR_SOURCE_DENIED');
    });
    await t.test('oversized record denies instead of truncation',()=>{
      const candidate=clone(e);candidate.extra='x'.repeat(65537);assert.throws(()=>fixture.assess(candidate),/size budget sourceRecord/);
    });
    await t.test('consumed source bytes are checked independently; failure restores parser cache',()=>{
      const read=fs.readFileSync;try{fs.readFileSync=function(file,...args){const value=read.call(this,file,...args);return file===path.join(repo,'src/core/network/pair_service.ts')?Buffer.concat([value,Buffer.from('\n')]):value;};assert.throws(()=>preparePairSourceBoundary(repo,true),/consumed source bytes/);}finally{fs.readFileSync=read;}
      fixture.verifyInputs();assert.deepEqual(Object.keys(require.cache).sort(),cache);
    });
    await t.test('current filesystem identity drift denies without production mutation',()=>{
      const stat=fs.fstatSync;try{fs.fstatSync=function(fd,options){const value=stat.call(this,fd,options);return options?.bigint?Object.assign(value,{ino:value.ino+1n}):value;};assert.throws(()=>fixture.assess(e),/changed-during-read/);}finally{fs.fstatSync=stat;}fixture.verifyInputs();
    });
    await t.test('success stays blocked with no compilation, activity or cleanup resources',()=>{
      const result=fixture.assess(e);assert.equal(result.status,'blocked');assert.equal(result.emissionStatus,'UNOBSERVED');assert.equal(result.remainingCallerObligations,29);
      assert.equal(result.authoritativeBaseline,825);assert.equal(result.ceiling,64);assert.equal(result.achievedPayloadCount,null);
      for(const key of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'])assert.equal(result[key],false);
      fixture.verifyInputs();assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
      assert.equal(forbidden,0);assert.equal(forbiddenParserAccesses,0);
      assert.deepEqual(fixture.cleanup,{temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,parserCacheRestored:true});
    });
  }finally{for(const undo of restore.reverse())undo();}
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
  console.log('PAIR_SOURCE_JSON '+fixture.retained.json);
  console.log('PAIR_SOURCE_RECEIPT '+JSON.stringify({sha256:fixture.retained.sha256,bytes:fixture.retained.bytes,cleanup:fixture.cleanup,forbiddenActivity:forbidden,nonSyntaxParserRequests:forbiddenParserAccesses}));
});
