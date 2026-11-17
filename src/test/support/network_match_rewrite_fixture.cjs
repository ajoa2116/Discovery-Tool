// Test-only, single-file transpilation and byte-range rewrite. Never loads emitted code.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/shared/network_match.ts',OUTPUT='src/shared/network_match.js';
const TARGET='./.consolidation/address-identity.generated.js';
const PROFILE='network-match-caller-rewrite-compile-only-v1';
const RECORD_PROFILE='network-match-retained-data-v1',RECORD_LIMIT=65536;
const CONFIGURATION=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true,
  newLine:'LineFeed',sourceMap:false,inlineSourceMap:false,declaration:false,removeComments:false,
  verbatimModuleSyntax:true,isolatedModules:true,noEmitHelpers:true,noResolve:true});
const pins=[
  [SOURCE,1384,'c19ebe9bf1dbf7efe842dc37a43d2110a04f3fbac09bec41cda992859699ab76'],
  ['src/shared/address_validation.ts',1168,'e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc'],
  ['src/shared/identity_policy.ts',3176,'b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614'],
  ['package.json',1377,'22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f'],
  ['package-lock.json',162554,'b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32'],
  ['tsconfig.json',530,'3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7'],
  ['node_modules/typescript/lib/typescript.js',9112572,'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'],
  ['node_modules/typescript/package.json',3620,'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6'],
  ['scripts/payload-byte-catalog.cjs',14803,'016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d'],
];
const ownFiles=['src/test/support/network_match_rewrite_fixture.cjs','src/test/network_match_rewrite.test.cjs'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const seal=value=>digest(JSON.stringify(value));
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Caller rewrite denied: '+reason),{code:'CALLER_REWRITE_DENIED',reason});}
const authorities=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'];
// Data-only verifier: built-in modules only. Never calls the emitter, TypeScript
// parser, inspect(), derivation(), or a module loader on retained output text.
function verifyRetainedCallerEvidence(json,expectedSha256){
  check(typeof json==='string'&&Buffer.byteLength(json)<=RECORD_LIMIT,'retained record bound');
  check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&digest(json)===expectedSha256,'retained external digest');
  let record;try{record=JSON.parse(json);}catch{check(false,'retained JSON');}
  check(JSON.stringify(record)===json,'retained canonical JSON'); // Also denies duplicate JSON keys.
  const keys=(value,expected)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&
    seal(Object.keys(value).sort())===seal([...expected].sort()),'retained schema');
  keys(record,['profile','evidence','replacement']);check(record.profile===RECORD_PROFILE,'retained profile');
  const e=record.evidence;
  keys(e,['profile','source','sourceImport','observations','compiler','outputs','derivation','provenanceScope','historicalAdmission',
    'authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...authorities]);
  check(e.profile===PROFILE&&e.source===SOURCE&&e.historicalAdmission===null&&authorities.every(key=>e[key]===false),'retained authority');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'retained accounting');
  check(e.provenanceScope==='fresh in-memory fixture observations; not historical staged output identities','retained provenance');
  check(seal(record.replacement)===seal({from:'./address_validation.js',to:TARGET,removedBytes:23,insertedBytes:46,netBytesAdded:23}),'retained replacement');
  keys(e.compiler,['version','entry','method','configuration','repositoryTsconfig','node']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&
    e.compiler.method==='transpileModule; no resolution, bundling, typecheck or application evaluation'&&
    e.compiler.repositoryTsconfig==='measured context only; noEmit remains true and unchanged'&&seal(e.compiler.configuration)===seal(CONFIGURATION),'retained compiler');
  keys(e.compiler.node,['path','version']);check(e.compiler.node.path==='node.exe'&&/^v\d+\.\d+\.\d+$/.test(e.compiler.node.version),'retained runtime basename');
  const expectedRefs=[...pins.map(([path])=>({root:'repository',path})),...ownFiles.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'}];
  check(Array.isArray(e.observations)&&e.observations.length===12,'retained observations');
  for(let index=0;index<12;index++){
    const row=e.observations[index],ref=expectedRefs[index];keys(row,['root','path','size','sha256','identity']);
    check(row.root===ref.root&&row.path===ref.path&&Number.isSafeInteger(row.size)&&row.size>0&&row.size<=128*1024*1024&&/^[a-f0-9]{64}$/.test(row.sha256),'retained measurement');
    keys(row.identity,['dev','ino','size','mtimeNs','ctimeNs']);
    check(Object.values(row.identity).every(value=>typeof value==='string'&&/^\d{1,24}$/.test(value))&&row.identity.size===String(row.size),'retained file identity');
    if(index<pins.length)check(row.size===pins[index][1]&&row.sha256===pins[index][2],'retained fixed pin');
  }
  check(Array.isArray(e.outputs)&&e.outputs.length===2,'retained outputs');
  const located=[];
  // This intentionally recognizes only this pinned emit profile, not general JS.
  // Locate the complete declaration independently, without supplied AST offsets.
  const declaration=/^import \{ normalizeIPv4, ipv4Number \} from (['"])([^'"\\\r\n]+)\1;\n/;
  const known=[
    [1421,'cbb643628d3e0a336404bf14c8da91812cd3a99aedbe9f531b632e5dd594b0b6'],
    [1444,'fb82119de2db80b89cb6bd846b0dccaad8edf552d5ee454c7d9d355a6435c989'],
  ];
  for(let index=0;index<2;index++){
    const row=e.outputs[index];keys(row,['variant','path','text','bytes','sha256','filesystemIdentity','admission']);
    check(row.variant===(index?'redirected':'original')&&row.path===OUTPUT&&row.filesystemIdentity===null&&row.admission===null,'retained output identity');
    check(typeof row.text==='string'&&row.text.length<=16384&&row.bytes===Buffer.byteLength(row.text)&&row.sha256===digest(row.text),'retained output bytes');
    const match=declaration.exec(row.text),specifier=index?TARGET:'./address_validation.js';
    check(match&&match[2]===specifier,'retained independently located import');
    const start=Buffer.byteLength(match[0].slice(0,match[0].indexOf(match[1])+1)),end=start+Buffer.byteLength(match[2]);
    located.push({bytes:Buffer.from(row.text),start,end,specifier});
  }
  const [a,b]=located;
  check(a.end-a.start===23&&b.end-b.start===46&&b.bytes.length-a.bytes.length===23,'retained exact replacement lengths');
  check(a.bytes.subarray(0,a.start).equals(b.bytes.subarray(0,b.start))&&a.bytes.subarray(a.end).equals(b.bytes.subarray(b.end)),'retained unrelated bytes');
  check(e.outputs.every((row,index)=>row.bytes===known[index][0]&&row.sha256===known[index][1]),'retained observed output reference');
  const bindings=['normalizeIPv4','ipv4Number'].map(name=>({imported:name,local:name,typeOnly:false}));
  const description=row=>({statementIndex:0,bindings,specifier:row.specifier,byteStart:row.start,byteEnd:row.end,exports:['networkMatchError']});
  check(seal(e.derivation)===seal({kind:'single-UTF8-import-content-splice-after-transpile',before:description(a),after:description(b),
    unchangedPrefixSha256:digest(a.bytes.subarray(0,a.start)),unchangedSuffixSha256:digest(a.bytes.subarray(a.end)),
    replacementBytes:46,unrelatedBytesIdentical:true,mergedDeclarations:false}),'retained independent derivation');
  check(seal(e.sourceImport)===seal({...description({...a,specifier:'./address_validation.ts'}),exports:['NetworkMatchInput','networkMatchError']}),'retained source import');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,
    ...Object.fromEntries(authorities.map(key=>[key,false])),authoritativeBaseline:825,ceiling:64,remainingCallerObligations:29,
    recordSha256:expectedSha256,recordBytes:Buffer.byteLength(json),observedInputs:12,
    outputs:e.outputs.map(({text,...row})=>row),independentlyLocated:located.map(({start,end})=>({byteStart:start,byteEnd:end}))});
}
function readRetainedCallerEvidence(file,expectedSha256){
  check(!fs.lstatSync(file).isSymbolicLink(),'retained linked file');
  const fd=fs.openSync(file,'r');
  try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(RECORD_LIMIT),'retained file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(count>0,'retained truncated read');offset+=count;}
    const after=fs.fstatSync(fd,{bigint:true});check(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),'retained changed read');
    const json=bytes.toString('utf8');check(Buffer.from(json).equals(bytes),'retained UTF8');
    return verifyRetainedCallerEvidence(json,expectedSha256);
  }finally{fs.closeSync(fd);}
}
function retainedRecord(evidence){
  const safe=clone(evidence);safe.compiler.node.path=path.basename(safe.compiler.node.path);
  const json=JSON.stringify({profile:RECORD_PROFILE,evidence:safe,replacement:{from:'./address_validation.js',to:TARGET,removedBytes:23,insertedBytes:46,netBytesAdded:23}});
  const sha256=digest(json);verifyRetainedCallerEvidence(json,sha256);
  return freeze({json,sha256,bytes:Buffer.byteLength(json)});
}
function inspect(ts,text,name,specifier,source=false){
  check(typeof text==='string'&&Buffer.byteLength(text)<=16384,'output text bound');
  const tree=ts.createSourceFile(name,text,ts.ScriptTarget.ES2022,true,source?ts.ScriptKind.TS:ts.ScriptKind.JS);
  check(tree.parseDiagnostics.length===0,'independent parse');
  const imports=tree.statements.filter(ts.isImportDeclaration);
  check(imports.length===1&&tree.statements[0]===imports[0],'exact import count/placement');
  const node=imports[0],clause=node.importClause;
  check(ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text===specifier,'exact specifier');
  check(clause&&!clause.isTypeOnly&&!clause.name&&!node.attributes&&clause.namedBindings&&ts.isNamedImports(clause.namedBindings),'named import form');
  const bindings=clause.namedBindings.elements.map(e=>({imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly}));
  check(seal(bindings)===seal(['normalizeIPv4','ipv4Number'].map(name=>({imported:name,local:name,typeOnly:false}))),'exact bindings');
  const visit=n=>{
    check(!ts.isCallExpression(n)||(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!(ts.isIdentifier(n.expression)&&n.expression.text==='require')),'no dynamic import/require');
    if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'no re-export edge');
    ts.forEachChild(n,visit);
  };visit(tree);
  const exported=tree.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
  check(seal(exported.map(n=>n.name?.text))===seal(source?['NetworkMatchInput','networkMatchError']:['networkMatchError']),'exact export declarations');
  const start=node.moduleSpecifier.getStart(tree)+1,end=node.moduleSpecifier.end-1;
  const byteStart=Buffer.byteLength(text.slice(0,start)),byteEnd=Buffer.byteLength(text.slice(0,end));
  return {statementIndex:0,bindings,specifier,byteStart,byteEnd,exports:source?['NetworkMatchInput','networkMatchError']:['networkMatchError']};
}
function outputRow(variant,text){return {variant,path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:digest(text),filesystemIdentity:null,admission:null};}
function derivation(ts,original,redirected){
  const before=inspect(ts,original,OUTPUT,'./address_validation.js');
  const after=inspect(ts,redirected,OUTPUT,TARGET);
  const a=Buffer.from(original),b=Buffer.from(redirected);
  check(a.subarray(0,before.byteStart).equals(b.subarray(0,after.byteStart))&&
    a.subarray(before.byteEnd).equals(b.subarray(after.byteEnd)),'non-specifier bytes changed');
  check(path.posix.normalize(path.posix.join(path.posix.dirname(OUTPUT),TARGET))==='src/shared/.consolidation/address-identity.generated.js','emitted relative target');
  return {kind:'single-UTF8-import-content-splice-after-transpile',before,after,
    unchangedPrefixSha256:digest(a.subarray(0,before.byteStart)),unchangedSuffixSha256:digest(a.subarray(before.byteEnd)),
    replacementBytes:Buffer.byteLength(TARGET),unrelatedBytesIdentical:true,mergedDeclarations:false};
}
function prepareNetworkMatchRewrite(repo,optIn){
  check(optIn===true,'explicit compile-only opt-in');
  check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,'generated execution must remain disabled');
  check(['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(key=>!process.env[key]),'inherited overrides');
  check(process.execArgv.every(arg=>['--test','--test-isolation=none','--test-reporter=tap'].includes(arg)),'parent Node flags');
  repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}];
  const refs=[...pins.map(([path])=>({root:'repository',path})),...ownFiles.map(path=>({root:'repository',path})),{root:'node-runtime',path:path.basename(process.execPath)}];
  const read=()=>observeCatalogFiles(roots,refs),observations=read();
  for(const [file,size,sha256]of pins){const row=observations.find(r=>r.root==='repository'&&r.path===file);check(row?.size===size&&row.sha256===sha256,'checkpoint input '+file);}
  const verify=()=>check(seal(read())===seal(observations),'current input measurements');
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');
  check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'compiler resolution');
  // Refuse an unmeasured previously loaded compiler instance.
  check(!require.cache[entry],'compiler already loaded');
  const cacheBefore=new Set(Object.keys(require.cache));
  let ts;
  try{
    ts=req('typescript');check(ts.version==='5.9.3','compiler version');
    check(Object.keys(require.cache).filter(key=>!cacheBefore.has(key)).every(key=>key===entry),'external compiler dependency');
    const pkg=JSON.parse(fs.readFileSync(path.join(repo,'node_modules/typescript/package.json'),'utf8'));
    const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
    check(pkg.version===ts.version&&lock.packages['node_modules/typescript'].version===ts.version,'package/lock version');
    const sourceBytes=fs.readFileSync(path.join(repo,SOURCE));check(digest(sourceBytes)===pins[0][2]&&sourceBytes.length===pins[0][1],'consumed source bytes');
    const source=sourceBytes.toString('utf8');check(Buffer.from(source).equals(sourceBytes),'source UTF8');
    const sourceImport=inspect(ts,source,SOURCE,'./address_validation.ts',true);
    // Deliberate test-only emit profile. tsconfig.json is measured context, not
    // loaded as an executable config or silently treated as an emitting build.
    const configuration=CONFIGURATION;
    const compilerOptions={...configuration,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,newLine:ts.NewLineKind.LineFeed};
    const emit=()=>ts.transpileModule(source,{fileName:SOURCE,compilerOptions,reportDiagnostics:true});
    const first=emit(),repeat=emit();
    check(!first.diagnostics?.length&&!repeat.diagnostics?.length&&!first.sourceMapText&&!repeat.sourceMapText,'compiler diagnostics/extra output');
    check(first.outputText===repeat.outputText,'repeatable emission');
    const original=first.outputText,parsed=inspect(ts,original,OUTPUT,'./address_validation.js');
    const bytes=Buffer.from(original),redirected=Buffer.concat([bytes.subarray(0,parsed.byteStart),Buffer.from(TARGET),bytes.subarray(parsed.byteEnd)]).toString('utf8');
    const evidence=freeze({profile:PROFILE,source:SOURCE,sourceImport,observations,
      compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',method:'transpileModule; no resolution, bundling, typecheck or application evaluation',configuration,
        repositoryTsconfig:'measured context only; noEmit remains true and unchanged',node:{path:process.execPath,version:process.version}},
      outputs:[outputRow('original',original),outputRow('redirected',redirected)],derivation:derivation(ts,original,redirected),
      provenanceScope:'fresh in-memory fixture observations; not historical staged output identities',historicalAdmission:null,
      authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,
      ...Object.fromEntries(authorities.map(key=>[key,false]))});
    const captured=seal(evidence);verify();
    const validate=candidate=>{
      verify();check(candidate?.profile===PROFILE,'profile');
      check(authorities.every(key=>candidate[key]===false)&&candidate.historicalAdmission===null,'authority/historical admission');
      check(seal(candidate.observations)===seal(observations),'input measurements');
      check(Array.isArray(candidate.outputs)&&candidate.outputs.length===2,'exact output count');
      for(let index=0;index<2;index++){
        const row=candidate.outputs[index];check(row.path===OUTPUT&&row.variant===(index?'redirected':'original')&&row.filesystemIdentity===null&&row.admission===null,'output identity/admission');
        check(typeof row.text==='string'&&Buffer.byteLength(row.text)<=16384&&row.bytes===Buffer.byteLength(row.text)&&row.sha256===digest(row.text),'output bytes/digest');
      }
      check(seal(derivation(ts,candidate.outputs[0].text,candidate.outputs[1].text))===seal(candidate.derivation),'derivation correspondence');
      check(seal(candidate)===captured,'captured evidence substitution');verify();
      return freeze({status:'blocked',...Object.fromEntries(authorities.map(key=>[key,false])),
        authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,
        limits:['One caller byte derivation only; no application module evaluated.',
          'Both parses use the measured TypeScript parser; this is not an independent compiler implementation.',
          'Sequential input observations are not pinned consumption or compiler/runtime authenticity.',
          'In-memory output digests are not filesystem identities or admission; all 29 caller reviews remain open.',
          'Live bindings, evaluation/cache identity, dependency closure and facade removability are unproven.']});
    };
    validate(evidence);
    return Object.freeze({evidence,assess:validate,verifyInputs:verify,retained:retainedRecord(evidence),
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{
    // Remove only the compiler loaded by this invocation; never evict preexisting modules.
    if(!cacheBefore.has(entry))delete require.cache[entry];
  }
}
module.exports={prepareNetworkMatchRewrite,verifyRetainedCallerEvidence,readRetainedCallerEvidence};
// Explicit data-only CLI: no compile mode, no arbitrary module loading.
if(require.main===module){
  const [mode,file,sha256,...extra]=process.argv.slice(2);
  check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'retained CLI invocation');
  console.log(JSON.stringify(readRetainedCallerEvidence(file,sha256)));
}
