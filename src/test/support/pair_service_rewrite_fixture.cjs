// Test-only compile provenance. Emitted JavaScript is bounded data, never loaded.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/core/network/pair_service.ts',OUTPUT='src/core/network/pair_service.js';
const PROFILE='pair-service-three-import-compile-only-v1';
const BOUNDARY_SHA='ae8b7be17c9cbd571298cde6fef911703d328e167a1db9bd135865a4eca1c44f';
const BOUNDARY_BYTES=33790;
const TARGET='../../shared/.consolidation/address-identity.generated.js';
const OWN=['src/test/support/pair_service_rewrite_fixture.cjs','src/test/pair_service_rewrite.test.cjs'];
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const CAPS=Object.freeze({callerSource:65536,dependencySource:131072,prospectiveOutput:65536,sourceRecord:65536,futureOutputRecord:262144});
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true,
  newLine:'LineFeed',sourceMap:false,inlineSourceMap:false,declaration:false,removeComments:false,
  verbatimModuleSyntax:true,isolatedModules:true,noEmitHelpers:true,noResolve:true});
const LIMITATIONS=Object.freeze([
  'Eight ordinary interface imports may not have valid runtime exports under verbatimModuleSyntax: NetworkMatchInput, Device, PairCandidate, PairSessionState, WindowsAdapterSnapshot, PingProvider, NeighborProvider, WindowsNetworkAdapterService.',
  'No emitted module executed, service instantiated, camera accessed, network adapter changed or pairing action invoked.',
  'Compiler authenticity, pinned/native mapped-image consumption, transitive dependency closure, runtime linking and equivalence remain unproven.',
  'Dynamic request syntax and extension rewrite are observed; fallback execution and dynamic resolution remain unverified.',
  'Compiler-free recognition is restricted to the measured fixed import header/profile, not a general JavaScript parser or name-resolution proof.',
  'Data hashes and an externally held capture digest do not grant historical admission, external confinement or production authority; all 29 obligations remain open.',
]);
// Fresh outputs measured by this fixture's scoped compile-only observation.
// These data references confer no historical admission or execution authority.
const OUTPUT_REFERENCES=Object.freeze([
  Object.freeze([51230,'d03ff52713ce34036ddb1f59ce7e9abfcc9bdd5eff374a7c221f5059e1ffa4fc']),
  Object.freeze([51302,'2018608955300c29fbac7adbb753a918a8996a055980fcb7bdc2ccc573c2c0f5']),
]);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Pair rewrite denied: '+reason),{code:'PAIR_REWRITE_DENIED',reason});}
function shape(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort()),'record schema');}
function checkPairRewriteBudget(kind,bytes){check(Object.hasOwn(CAPS,kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=CAPS[kind],'size budget '+kind);return bytes;}
function boundedText(text,kind){check(typeof text==='string','text required');checkPairRewriteBudget(kind,Buffer.byteLength(text));check(Buffer.from(text).toString('utf8')===text,'UTF8 roundtrip');return text;}
function readBounded(file,cap){
  for(let current=path.resolve(file);;current=path.dirname(current)){check(!fs.lstatSync(current).isSymbolicLink(),'linked input');if(path.dirname(current)===current)break;}
  const fd=fs.openSync(file,'r');
  try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(cap),'file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(count>0,'truncated input');offset+=count;}
    const extra=Buffer.alloc(1);check(fs.readSync(fd,extra,0,1,null)===0,'grown input');
    for(const after of [fs.fstatSync(fd,{bigint:true}),fs.statSync(file,{bigint:true})])check(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),'changed input');
    check(Buffer.from(bytes.toString('utf8')).equals(bytes),'input UTF8');return bytes;
  }finally{fs.closeSync(fd);}
}
function verifyBoundary(boundary){
  const json=JSON.stringify(boundary);checkPairRewriteBudget('sourceRecord',Buffer.byteLength(json));
  check(Buffer.byteLength(json)===BOUNDARY_BYTES&&sha(json)===BOUNDARY_SHA,'reviewed source-boundary capture');
  check(boundary.status==='blocked'&&boundary.observations.length===27&&same(boundary.budgets.caps,CAPS)&&same(boundary.configuration.expectedFutureEmitProfile,CONFIG),'source-boundary profile');
  check(FLAGS.every(key=>boundary[key]===false)&&boundary.remainingCallerObligations===29,'source-boundary authority');return boundary;
}
const pairs=row=>row.bindings.map(b=>({imported:b.imported,local:b.local,typeOnly:false}));
function emittedRow(boundary,slot,specifier,start,end){return {slot,sourceSlot:slot+1,specifier,bindings:pairs(boundary.boundary.imports[slot+1]),byteStart:start,byteEnd:end};}
function expectedSpec(boundary,slot,mode){return mode==='redirected'&&[0,2,19].includes(slot)?TARGET:boundary.boundary.imports[slot+1].specifier.replace(/\.ts$/,'.js');}

// Independent compiler-free recognizer: derives ranges from complete header lines,
// never from producer offsets. Rejection outside this fixed emitted grammar is intentional.
function locateEmitted(text,boundary,mode){
  boundedText(text,'prospectiveOutput');check(mode==='original'||mode==='redirected','output mode');
  const rows=[];let cursor=0;
  for(let slot=0;slot<20;slot++){
    const end=text.indexOf('\n',cursor);check(end>=0,'20 header lines');
    const line=text.slice(cursor,end),m=/^import \{ ([A-Za-z0-9_$, ]+) \} from (['"])([^'"\\\r\n]+)\2;$/.exec(line);
    const names=pairs(boundary.boundary.imports[slot+1]).map(b=>b.imported===b.local?b.imported:b.imported+' as '+b.local).join(', ');
    check(m&&m[1]===names&&m[3]===expectedSpec(boundary,slot,mode),'20 import header contract');
    const start=Buffer.byteLength(text.slice(0,cursor+line.indexOf(m[2])+1));
    rows.push(emittedRow(boundary,slot,m[3],start,start+Buffer.byteLength(m[3])));cursor=end+1;
  }
  check(!/\bMatchApplyPlan\b/.test(text),'explicit type-only erasure');
  // Conservative fixed-profile keyword census also rejects added comment/string occurrences.
  check((text.match(/\bimport\b/g)||[]).length===21,'20 static plus sole dynamic keyword');
  const requests=[...text.matchAll(/\bimport\s*\(([^)]*)\)/g)];
  check(requests.length===1&&/^(['"])\.\/match_candidate_service\.js\1$/.test(requests[0][1]),'sole emitted literal dynamic request');
  const call=requests[0],dynamicStart=Buffer.byteLength(text.slice(0,call.index));
  return {imports:rows,dynamicImport:{specifier:'./match_candidate_service.js',rawRequest:call[0],byteStart:dynamicStart,byteEnd:dynamicStart+Buffer.byteLength(call[0])}};
}
function rangesFor(rows){return [0,2,19].map(slot=>({slot,sourceSlot:slot+1,byteStart:rows[slot].byteStart,byteEnd:rows[slot].byteEnd,from:rows[slot].specifier,to:TARGET}));}
function rewritePairImports(text,ranges,boundary){
  verifyBoundary(boundary);const expected=rangesFor(locateEmitted(text,boundary,'original').imports),bytes=Buffer.from(text);
  check(Array.isArray(ranges)&&ranges.length===3,'three ranges');let previousEnd=-1;
  for(let index=0;index<3;index++){
    const r=ranges[index];shape(r,['slot','sourceSlot','byteStart','byteEnd','from','to']);
    check(Number.isSafeInteger(r.byteStart)&&Number.isSafeInteger(r.byteEnd)&&r.byteStart>=0&&r.byteStart<r.byteEnd&&r.byteEnd<=bytes.length,'range bounds');
    check(r.byteStart>=previousEnd,'ordered disjoint ranges');previousEnd=r.byteEnd;
    check(same(r,expected[index])&&bytes.subarray(r.byteStart,r.byteEnd).equals(Buffer.from(r.from)),'fresh range correspondence');
  }
  const chunks=[];let cursor=0;
  for(const r of ranges){chunks.push(bytes.subarray(cursor,r.byteStart),Buffer.from(r.to));cursor=r.byteEnd;}chunks.push(bytes.subarray(cursor));
  const size=chunks.reduce((sum,b)=>sum+b.length,0);checkPairRewriteBudget('prospectiveOutput',size);
  return Buffer.concat(chunks,size).toString('utf8');
}
function derive(original,redirected,before,after){
  const left=Buffer.from(original),right=Buffer.from(redirected),old=[0,2,19].map(i=>before.imports[i]),next=[0,2,19].map(i=>after.imports[i]);
  const replacements=[],unchanged=[];let shift=0,oldCursor=0,newCursor=0;
  for(let i=0;i<3;i++){
    const a=old[i],b=next[i];check(a.byteStart>=oldCursor&&b.byteStart>=newCursor&&b.byteStart===a.byteStart+shift,'disjoint cumulative UTF8 shifts');
    const prefix=left.subarray(oldCursor,a.byteStart),other=right.subarray(newCursor,b.byteStart);check(prefix.equals(other),'untouched region '+i);
    unchanged.push({region:i?'middle-'+i:'prefix',bytes:prefix.length,sha256:sha(prefix)});
    const delta=Buffer.byteLength(b.specifier)-Buffer.byteLength(a.specifier);replacements.push({slot:a.slot,sourceSlot:a.sourceSlot,from:a.specifier,to:b.specifier,
      originalStart:a.byteStart,originalEnd:a.byteEnd,redirectedStart:b.byteStart,redirectedEnd:b.byteEnd,removedBytes:a.byteEnd-a.byteStart,insertedBytes:b.byteEnd-b.byteStart,deltaBytes:delta});
    shift+=delta;oldCursor=a.byteEnd;newCursor=b.byteEnd;
  }
  const tail=left.subarray(oldCursor);check(tail.equals(right.subarray(newCursor)),'untouched suffix');unchanged.push({region:'suffix',bytes:tail.length,sha256:sha(tail)});
  check(right.length===left.length+shift,'combined byte delta');
  check(before.dynamicImport.rawRequest===after.dynamicImport.rawRequest&&after.dynamicImport.byteStart===before.dynamicImport.byteStart+shift,'dynamic request unchanged');
  return {kind:'three-disjoint-UTF8-import-content-splices',replacements,unchanged,totalDeltaBytes:shift,mergedDeclarations:false};
}
function correspondence(boundary,before,after){return boundary.boundary.imports.map((r,sourceSlot)=>({sourceSlot,sourceSpecifier:r.specifier,sourceBindings:r.bindings,
  disposition:sourceSlot===0?'observed-erased-explicit-type-only':'observed-retained-ordinary-import',emittedSlot:sourceSlot===0?null:sourceSlot-1,
  original:sourceSlot===0?null:before.imports[sourceSlot-1],redirected:sourceSlot===0?null:after.imports[sourceSlot-1]}));}
function inspectAST(ts,text,boundary,mode){
  boundedText(text,'prospectiveOutput');const tree=ts.createSourceFile(OUTPUT,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);check(tree.parseDiagnostics.length===0,'emitted AST syntax');
  const imports=tree.statements.filter(ts.isImportDeclaration);check(imports.length===20&&imports.every((n,i)=>tree.statements[i]===n),'AST imports/order');
  const rows=imports.map((n,slot)=>{
    const c=n.importClause;check(ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text===expectedSpec(boundary,slot,mode),'AST specifier');
    check(c&&!c.isTypeOnly&&!c.name&&!n.attributes&&c.namedBindings&&ts.isNamedImports(c.namedBindings),'AST named form');
    const bindings=c.namedBindings.elements.map(e=>({imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly===true}));check(same(bindings,pairs(boundary.boundary.imports[slot+1])),'AST binding pairs');
    return emittedRow(boundary,slot,n.moduleSpecifier.text,Buffer.byteLength(text.slice(0,n.moduleSpecifier.getStart(tree)+1)),Buffer.byteLength(text.slice(0,n.moduleSpecifier.end-1)));
  });
  let dynamic=0;const visit=n=>{
    check(!ts.isImportEqualsDeclaration(n)&&!ts.isImportTypeNode(n),'AST unsupported import');
    if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'AST re-export');
    if(ts.isCallExpression(n)){
      check(!(ts.isIdentifier(n.expression)&&n.expression.text==='require'),'AST require');
      if(n.expression.kind===ts.SyntaxKind.ImportKeyword){dynamic++;check(n.arguments.length===1&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text==='./match_candidate_service.js','AST dynamic literal');}
    }ts.forEachChild(n,visit);
  };visit(tree);check(dynamic===1,'AST sole dynamic');return rows;
}
function output(variant,text){boundedText(text,'prospectiveOutput');return {variant,path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:sha(text),filesystemIdentity:null,admission:null};}
function verifyPairEvidence(json,expectedSha256){
  boundedText(json,'futureOutputRecord');check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external capture digest');
  let e;try{e=JSON.parse(json);}catch{check(false,'record JSON');}check(JSON.stringify(e)===json,'canonical record');
  shape(e,['profile','status','source','sourceBoundary','sourceBoundaryCapture','fixtureObservations','compiler','outputs','imports','correspondence','derivation','limits','limitations','historicalAdmission','authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...FLAGS]);
  check(e.profile===PROFILE&&e.status==='blocked'&&e.source===SOURCE&&e.historicalAdmission===null&&FLAGS.every(k=>e[k]===false),'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(same(e.limits,CAPS)&&same(e.limitations,LIMITATIONS),'limits/limitations');verifyBoundary(e.sourceBoundary);
  check(same(e.sourceBoundaryCapture,{bytes:BOUNDARY_BYTES,sha256:BOUNDARY_SHA,consumption:'data only; all 27 current observations revalidated'}),'boundary capture');
  check(Array.isArray(e.fixtureObservations)&&e.fixtureObservations.length===2,'two fixture observations');
  for(let i=0;i<2;i++){
    const r=e.fixtureObservations[i];shape(r,['root','path','size','sha256','identity']);shape(r.identity,['dev','ino','size','mtimeNs','ctimeNs']);
    check(r.root==='repository'&&r.path===OWN[i]&&Number.isSafeInteger(r.size)&&r.size>0&&r.size<=131072&&/^[a-f0-9]{64}$/.test(r.sha256)&&r.identity.size===String(r.size)&&Object.values(r.identity).every(v=>typeof v==='string'&&/^\d{1,24}$/.test(v)),'fixture observation');
  }
  shape(e.compiler,['version','entry','method','configuration','repositoryTsconfig','node','repeatOutputMatched']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&e.compiler.method==='transpileModule; no resolution, bundling, typecheck or evaluation'&&same(e.compiler.configuration,CONFIG)&&same(e.compiler.node,e.sourceBoundary.parser.node)&&e.compiler.repositoryTsconfig==='measured context only; noEmit remains unchanged'&&e.compiler.repeatOutputMatched===true,'compiler evidence');
  check(Array.isArray(e.outputs)&&e.outputs.length===2,'two outputs');
  const located=e.outputs.map((r,i)=>{
    shape(r,['variant','path','text','bytes','sha256','filesystemIdentity','admission']);
    check(r.variant===(i?'redirected':'original')&&r.path===OUTPUT&&r.filesystemIdentity===null&&r.admission===null,'output identity/admission');boundedText(r.text,'prospectiveOutput');
    check(r.bytes===Buffer.byteLength(r.text)&&r.sha256===sha(r.text),'output measurements');
    return locateEmitted(r.text,e.sourceBoundary,i?'redirected':'original');
  });
  check(same(e.imports,located),'independently located imports');
  check(same(e.correspondence,correspondence(e.sourceBoundary,...located)),'source-to-emitted correspondence');
  const derivation=derive(e.outputs[0].text,e.outputs[1].text,...located);check(same(e.derivation,derivation),'independent derivation');
  check(e.outputs.every((r,i)=>r.bytes===OUTPUT_REFERENCES[i][0]&&r.sha256===OUTPUT_REFERENCES[i][1]),'fresh observed output reference');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,sourceBoundaryObservations:27,fixtureObservations:2,
    recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,outputs:e.outputs.map(({text,...r})=>r),derivation,
    ...Object.fromEntries(FLAGS.map(k=>[k,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29});
}
function readPairEvidence(file,expectedSha256){return verifyPairEvidence(readBounded(file,CAPS.futureOutputRecord).toString('utf8'),expectedSha256);}
function preparePairRewrite(repo,optIn){
  check(optIn===true,'explicit compile-only opt-in');
  check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION&&['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(k=>!process.env[k]),'inherited overrides/execution');
  check(process.execArgv.every(arg=>['--test','--test-isolation=none','--test-reporter=tap'].includes(arg)),'parent flags');
  repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
  const boundaryFile=path.join(require('node:os').homedir(),'.codex/artifacts/phase18c7t-pair-service-source',BOUNDARY_SHA+'.json');
  const boundaryBytes=readBounded(boundaryFile,CAPS.sourceRecord);check(boundaryBytes.length===BOUNDARY_BYTES&&sha(boundaryBytes)===BOUNDARY_SHA,'retained source-boundary bytes');
  const boundary=verifyBoundary(JSON.parse(boundaryBytes.toString('utf8')));
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}],refs=boundary.observations.map(({root,path})=>({root,path}));
  const read=()=>observeCatalogFiles(roots,refs),verifyBoundaryInputs=()=>check(same(read(),boundary.observations),'27 source-boundary observations');verifyBoundaryInputs();
  const ownRefs=OWN.map(path=>({root:'repository',path})),own=()=>observeCatalogFiles(roots,ownRefs),fixtureObservations=own();
  const verifyInputs=()=>{verifyBoundaryInputs();check(same(own(),fixtureObservations),'current fixture observations');check(sha(readBounded(boundaryFile,CAPS.sourceRecord))===BOUNDARY_SHA,'retained boundary preservation');};
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');
  check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'compiler resolution');
  check(!require.cache[entry],'compiler already loaded');const cached=new Set(Object.keys(require.cache));
  try{
    const ts=req('typescript');check(ts.version==='5.9.3','compiler version');check(Object.keys(require.cache).filter(k=>!cached.has(k)).every(k=>k===entry),'external compiler dependency');
    const bytes=readBounded(path.join(repo,SOURCE),CAPS.callerSource),sourceObservation=boundary.observations[0];
    check(bytes.length===sourceObservation.size&&sha(bytes)===sourceObservation.sha256,'consumed source bytes');
    const compilerOptions={...CONFIG,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,newLine:ts.NewLineKind.LineFeed};
    const emit=()=>ts.transpileModule(bytes.toString('utf8'),{fileName:SOURCE,compilerOptions,reportDiagnostics:true});
    const first=emit();boundedText(first.outputText,'prospectiveOutput');const second=emit();boundedText(second.outputText,'prospectiveOutput');
    check(!first.diagnostics?.length&&!second.diagnostics?.length&&!first.sourceMapText&&!second.sourceMapText&&first.outputText===second.outputText,'emit diagnostics/extra output/repeat');
    const original=first.outputText,originalAST=inspectAST(ts,original,boundary,'original'),before=locateEmitted(original,boundary,'original');check(same(originalAST,before.imports),'independent original parse agreement');
    const redirected=rewritePairImports(original,rangesFor(originalAST),boundary),redirectedAST=inspectAST(ts,redirected,boundary,'redirected'),after=locateEmitted(redirected,boundary,'redirected');check(same(redirectedAST,after.imports),'independent redirected parse agreement');
    const evidence=freeze({profile:PROFILE,status:'blocked',source:SOURCE,sourceBoundary:boundary,
      sourceBoundaryCapture:{bytes:BOUNDARY_BYTES,sha256:BOUNDARY_SHA,consumption:'data only; all 27 current observations revalidated'},fixtureObservations,
      compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',method:'transpileModule; no resolution, bundling, typecheck or evaluation',configuration:CONFIG,
        repositoryTsconfig:'measured context only; noEmit remains unchanged',node:boundary.parser.node,repeatOutputMatched:true},
      outputs:[output('original',original),output('redirected',redirected)],imports:[before,after],correspondence:correspondence(boundary,before,after),derivation:derive(original,redirected,before,after),
      limits:CAPS,limitations:LIMITATIONS,historicalAdmission:null,authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(k=>[k,false]))});
    const json=JSON.stringify(evidence);checkPairRewriteBudget('futureOutputRecord',Buffer.byteLength(json));const sha256=sha(json);verifyInputs();verifyPairEvidence(json,sha256);
    return Object.freeze({evidence,retained:freeze({json,sha256,bytes:Buffer.byteLength(json)}),verifyInputs,
      assess(candidate){verifyInputs();const result=verifyPairEvidence(JSON.stringify(candidate),sha256);verifyInputs();return result;},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{if(!cached.has(entry))delete require.cache[entry];}
}
module.exports={preparePairRewrite,rewritePairImports,verifyPairEvidence,readPairEvidence,checkPairRewriteBudget};
if(require.main===module){const [mode,file,hash,...extra]=process.argv.slice(2);check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'data-only invocation');console.log(JSON.stringify(readPairEvidence(file,hash)));}
