// Dedicated test-only caller derivation. Emitted text is data, never loaded.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/shared/camera_access.ts',OUTPUT='src/shared/camera_access.js';
const TARGET='./.consolidation/address-identity.generated.js';
const PROFILE='camera-access-two-import-compile-only-v1',MAX_RECORD=65536;
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true,
  newLine:'LineFeed',sourceMap:false,inlineSourceMap:false,declaration:false,removeComments:false,
  verbatimModuleSyntax:true,isolatedModules:true,noEmitHelpers:true,noResolve:true});
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'];
const LIMITATIONS=Object.freeze([
  'The retained Device/IPCollisionRecord type-use import may not have valid runtime exports under verbatimModuleSyntax; runtime linking is unverified.',
  'No generated module executed; no runtime equivalence, dependency closure or facade removal established.',
  'Sequential measurements are not pinned consumption, compiler authenticity or native mapped-image attestation.',
  'The compiler-free header recognizer is specific to this fixed profile, not a general JavaScript parser.',
  'A separately held capture digest anchors data integrity, not authenticity or admission; all 29 reviews remain open.',
]);
const PINS=[
  [SOURCE,2728,'b5d7e0c8ed5c5c5cc7cd844bebbf6be99b57a52961d8f17ddaaef005341301fc'],
  ['src/shared/collision_state.ts',248,'46eea14e613afd6f5d9f8ccdd48b7b6c768cda389a575c95e23a3cbc3e870968'],
  ['src/types/index.ts',14131,'d927701de585f24a11af932822db67349dd209240e4f21e0100a560bcab9bb32'],
  ['src/shared/identity_policy.ts',3176,'b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614'],
  ['src/shared/address_validation.ts',1168,'e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc'],
  ['package.json',1377,'22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f'],
  ['package-lock.json',162554,'b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32'],
  ['tsconfig.json',530,'3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7'],
  ['node_modules/typescript/lib/typescript.js',9112572,'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'],
  ['node_modules/typescript/package.json',3620,'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6'],
  ['scripts/payload-byte-catalog.cjs',14803,'016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d'],
];
const OWN=['src/test/support/camera_access_rewrite_fixture.cjs','src/test/camera_access_rewrite.test.cjs'];
const BINDINGS=[['Device','IPCollisionRecord'],['hasIdentity'],['isActiveCollision'],['normalizeIPv4']];
const ORIGINAL=['../types/index.js','./identity_policy.js','./collision_state.js','./address_validation.js'];
// Filled from the first scoped compile-only observation, never historical admission.
const OUTPUT_REFERENCES=Object.freeze([
  Object.freeze([2521,'85dc3943cb11028d9283eab94dc7d084ec267f7888edf3bca6776fbd146ddb47']),
  Object.freeze([2570,'dff10ef322ebb0f25d3f6cb2389113370948784e91e316bd57b1d433c67cb8d2']),
]);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const seal=value=>sha(JSON.stringify(value));
const same=(a,b)=>seal(a)===seal(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Camera caller denied: '+reason),{code:'CAMERA_REWRITE_DENIED',reason});}
function shape(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort()),'record schema');}
function specs(mode){return ORIGINAL.map((name,slot)=>mode==='source'?name.replace(/\.js$/,'.ts'):mode==='redirected'&&(slot===1||slot===3)?TARGET:name);}
function row(slot,specifier,start,end){return {slot,specifier,bindings:BINDINGS[slot].map(name=>({imported:name,local:name,typeOnly:false})),byteStart:start,byteEnd:end};}

// Compiler-free lexical recognition of the complete fixed header. No producer
// offsets, TypeScript, VM, eval, dynamic import or application loader is used.
function locateHeader(text,mode){
  check(typeof text==='string'&&Buffer.byteLength(text)<=16384,'output bound');
  const expected=specs(mode),rows=[];let cursor=0;
  for(let slot=0;slot<4;slot++){
    const end=text.indexOf('\n',cursor);check(end>=0,'four header lines');
    const raw=text.slice(cursor,end);check(mode!=='source'||raw.endsWith('\r'),'pinned source CRLF');
    const line=mode==='source'?raw.slice(0,-1):raw,match=/^import \{ ([A-Za-z0-9_$, ]+) \} from (['"])([^'"\\\r\n]+)\2;$/.exec(line);
    check(match&&match[1]===BINDINGS[slot].join(', ')&&match[3]===expected[slot],'four import header contract');
    const offset=line.indexOf(match[2])+1,start=Buffer.byteLength(text.slice(0,cursor+offset));
    rows.push(row(slot,match[3],start,start+Buffer.byteLength(match[3])));cursor=end+1;
  }
  return rows;
}
function sourceHeader(){return BINDINGS.map((names,slot)=>`import { ${names.join(', ')} } from '${specs('source')[slot]}';\r\n`).join('');}
function rangesFor(rows){return [1,3].map(slot=>({slot,byteStart:rows[slot].byteStart,byteEnd:rows[slot].byteEnd,from:ORIGINAL[slot],to:TARGET}));}
function rewriteCameraImports(text,ranges){
  const expected=rangesFor(locateHeader(text,'original')),bytes=Buffer.from(text);
  check(Array.isArray(ranges)&&ranges.length===2,'two ranges');let previousEnd=-1;
  for(let index=0;index<2;index++){
    const r=ranges[index];shape(r,['slot','byteStart','byteEnd','from','to']);
    check(Number.isSafeInteger(r.byteStart)&&Number.isSafeInteger(r.byteEnd)&&r.byteStart>=0&&r.byteStart<r.byteEnd&&r.byteEnd<=bytes.length,'range bounds');
    check(r.byteStart>=previousEnd,'disjoint ordered ranges');previousEnd=r.byteEnd;
    check(same(r,expected[index])&&bytes.subarray(r.byteStart,r.byteEnd).toString('utf8')===r.from,'range correspondence');
  }
  const [a,b]=ranges;
  // One pass over original bytes: earlier insertions never shift later source offsets.
  return Buffer.concat([bytes.subarray(0,a.byteStart),Buffer.from(a.to),bytes.subarray(a.byteEnd,b.byteStart),Buffer.from(b.to),bytes.subarray(b.byteEnd)]).toString('utf8');
}
function proof(original,redirected,before,after){
  const a=Buffer.from(original),b=Buffer.from(redirected),old=[before[1],before[3]],next=[after[1],after[3]];
  check(a.length+49===b.length,'combined delta');
  check(next[0].byteStart===old[0].byteStart&&next[1].byteStart===old[1].byteStart+26,'shifted second offset');
  const regions=[['prefix',a.subarray(0,old[0].byteStart),b.subarray(0,next[0].byteStart)],
    ['middle',a.subarray(old[0].byteEnd,old[1].byteStart),b.subarray(next[0].byteEnd,next[1].byteStart)],
    ['suffix',a.subarray(old[1].byteEnd),b.subarray(next[1].byteEnd)]];
  check(regions.every(([,left,right])=>left.equals(right)),'untouched prefix/middle/suffix');
  return {kind:'two-disjoint-UTF8-import-content-splices',replacements:old.map((r,index)=>({slot:r.slot,from:r.specifier,to:TARGET,
    originalStart:r.byteStart,originalEnd:r.byteEnd,redirectedStart:next[index].byteStart,redirectedEnd:next[index].byteEnd,
    removedBytes:index?23:20,insertedBytes:46,deltaBytes:index?23:26})),
    unchanged:regions.map(([region,bytes])=>({region,bytes:bytes.length,sha256:sha(bytes)})),totalDeltaBytes:49,mergedDeclarations:false};
}
function inspect(ts,text,mode){
  const source=mode==='source',tree=ts.createSourceFile(source?SOURCE:OUTPUT,text,ts.ScriptTarget.ES2022,true,source?ts.ScriptKind.TS:ts.ScriptKind.JS);
  check(Buffer.byteLength(text)<=16384&&tree.parseDiagnostics.length===0,'AST syntax/bound');
  const imports=tree.statements.filter(ts.isImportDeclaration),expected=specs(mode);
  check(imports.length===4&&imports.every((n,index)=>tree.statements[index]===n),'AST import count/order');
  const rows=imports.map((n,slot)=>{
    const c=n.importClause;check(ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text===expected[slot],'AST specifier');
    check(c&&!c.isTypeOnly&&!c.name&&!n.attributes&&c.namedBindings&&ts.isNamedImports(c.namedBindings),'AST import form');
    const names=c.namedBindings.elements.map(e=>({imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly}));
    check(same(names,BINDINGS[slot].map(name=>({imported:name,local:name,typeOnly:false}))),'AST bindings');
    return row(slot,n.moduleSpecifier.text,Buffer.byteLength(text.slice(0,n.moduleSpecifier.getStart(tree)+1)),Buffer.byteLength(text.slice(0,n.moduleSpecifier.end-1)));
  });
  const exported=tree.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
  check(same(exported.map(n=>n.name?.text),source?['CameraAccessDecision','decideCameraAccess']:['decideCameraAccess']),'AST exports');
  const visit=n=>{check(!ts.isCallExpression(n)||(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!(ts.isIdentifier(n.expression)&&n.expression.text==='require')),'dynamic request');if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'re-export');ts.forEachChild(n,visit);};visit(tree);
  return rows;
}
function output(variant,text){return {variant,path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:sha(text),filesystemIdentity:null,admission:null};}
function verifyCameraEvidence(json,expectedSha256){
  check(typeof json==='string'&&Buffer.byteLength(json)<=MAX_RECORD,'record bound');
  check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external capture digest');
  let e;try{e=JSON.parse(json);}catch{check(false,'record JSON');}check(JSON.stringify(e)===json,'canonical record');
  shape(e,['profile','source','sourceImports','observations','compiler','outputs','derivation','limitations','historicalAdmission',
    'authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...FLAGS]);
  check(e.profile===PROFILE&&e.source===SOURCE&&e.historicalAdmission===null&&FLAGS.every(key=>e[key]===false),'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(same(e.limitations,LIMITATIONS)&&same(e.sourceImports,locateHeader(sourceHeader(),'source')),'source contract/limitations');
  shape(e.compiler,['version','entry','method','configuration','repositoryTsconfig','node']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&e.compiler.method==='transpileModule; no resolution, bundling, typecheck or evaluation'&&
    e.compiler.repositoryTsconfig==='measured context only; noEmit remains unchanged'&&same(e.compiler.configuration,CONFIG),'compiler configuration');
  shape(e.compiler.node,['executable','version']);check(e.compiler.node.executable==='node.exe'&&/^v\d+\.\d+\.\d+$/.test(e.compiler.node.version),'runtime basename');
  const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'}];
  check(Array.isArray(e.observations)&&e.observations.length===14,'14 observations');
  for(let index=0;index<14;index++){
    const r=e.observations[index];shape(r,['root','path','size','sha256','identity']);
    check(r.root===refs[index].root&&r.path===refs[index].path&&Number.isSafeInteger(r.size)&&r.size>0&&r.size<=134217728&&/^[a-f0-9]{64}$/.test(r.sha256),'measurement');
    shape(r.identity,['dev','ino','size','mtimeNs','ctimeNs']);check(Object.values(r.identity).every(v=>typeof v==='string'&&/^\d{1,24}$/.test(v))&&r.identity.size===String(r.size),'file identity');
    if(index<PINS.length)check(r.size===PINS[index][1]&&r.sha256===PINS[index][2],'input pin');
  }
  check(Array.isArray(e.outputs)&&e.outputs.length===2,'two outputs');
  const headers=e.outputs.map((r,index)=>{
    shape(r,['variant','path','text','bytes','sha256','filesystemIdentity','admission']);
    check(r.variant===(index?'redirected':'original')&&r.path===OUTPUT&&r.filesystemIdentity===null&&r.admission===null,'output identity/admission');
    check(typeof r.text==='string'&&Buffer.byteLength(r.text)<=16384&&r.bytes===Buffer.byteLength(r.text)&&r.sha256===sha(r.text),'output measurement');
    return locateHeader(r.text,index?'redirected':'original');
  });
  const calculated=proof(e.outputs[0].text,e.outputs[1].text,headers[0],headers[1]);
  check(same(calculated,e.derivation),'independent derivation');
  check(e.outputs.every((r,index)=>r.bytes===OUTPUT_REFERENCES[index][0]&&r.sha256===OUTPUT_REFERENCES[index][1]),'observed output reference');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,
    ...Object.fromEntries(FLAGS.map(key=>[key,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,
    recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,observedInputs:14,outputs:e.outputs.map(({text,...r})=>r),derivation:calculated,limitations:LIMITATIONS});
}
function readCameraEvidence(file,expectedSha256){
  check(!fs.lstatSync(file).isSymbolicLink(),'linked evidence');const fd=fs.openSync(file,'r');
  try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(MAX_RECORD),'evidence file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(count>0,'truncated evidence');offset+=count;}
    const after=fs.fstatSync(fd,{bigint:true});check(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),'evidence changed');
    const json=bytes.toString('utf8');check(Buffer.from(json).equals(bytes),'evidence UTF8');return verifyCameraEvidence(json,expectedSha256);
  }finally{fs.closeSync(fd);}
}
function prepareCameraRewrite(repo,optIn){
  check(optIn===true,'explicit compile-only opt-in');
  check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION&&['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(key=>!process.env[key]),'inherited overrides/execution');
  check(process.execArgv.every(arg=>['--test','--test-isolation=none','--test-reporter=tap'].includes(arg)),'parent flags');
  repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}],refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:path.basename(process.execPath)}];
  const read=()=>observeCatalogFiles(roots,refs),observations=read();
  for(const [name,size,hash]of PINS){const r=observations.find(r=>r.root==='repository'&&r.path===name);check(r?.size===size&&r.sha256===hash,'checkpoint input '+name);}
  const verifyInputs=()=>check(same(read(),observations),'current input measurements');
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');
  check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'compiler resolution');
  check(!require.cache[entry],'compiler already loaded');const cacheBefore=new Set(Object.keys(require.cache));
  try{
    const ts=req('typescript');check(ts.version==='5.9.3','compiler version');
    check(Object.keys(require.cache).filter(key=>!cacheBefore.has(key)).every(key=>key===entry),'external compiler dependency');
    check(JSON.parse(fs.readFileSync(path.join(repo,'node_modules/typescript/package.json'),'utf8')).version===ts.version&&
      JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8')).packages['node_modules/typescript'].version===ts.version,'package/lock');
    const source=fs.readFileSync(path.join(repo,SOURCE));check(source.length===PINS[0][1]&&sha(source)===PINS[0][2]&&Buffer.from(source.toString('utf8')).equals(source),'consumed source bytes');
    const sourceImports=inspect(ts,source.toString('utf8'),'source');
    const compilerOptions={...CONFIG,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,newLine:ts.NewLineKind.LineFeed};
    const emit=()=>ts.transpileModule(source.toString('utf8'),{fileName:SOURCE,compilerOptions,reportDiagnostics:true});
    const first=emit(),repeat=emit();check(!first.diagnostics?.length&&!repeat.diagnostics?.length&&!first.sourceMapText&&!repeat.sourceMapText&&first.outputText===repeat.outputText,'emit diagnostics/extra output/repeat');
    const original=first.outputText,before=inspect(ts,original,'original'),redirected=rewriteCameraImports(original,rangesFor(before)),after=inspect(ts,redirected,'redirected');
    const evidence=freeze({profile:PROFILE,source:SOURCE,sourceImports,observations,compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',
      method:'transpileModule; no resolution, bundling, typecheck or evaluation',configuration:CONFIG,repositoryTsconfig:'measured context only; noEmit remains unchanged',node:{executable:path.basename(process.execPath),version:process.version}},
      outputs:[output('original',original),output('redirected',redirected)],derivation:proof(original,redirected,before,after),limitations:LIMITATIONS,historicalAdmission:null,
      authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(key=>[key,false]))});
    const json=JSON.stringify(evidence),sha256=sha(json);verifyInputs();verifyCameraEvidence(json,sha256);
    return Object.freeze({evidence,retained:freeze({json,sha256,bytes:Buffer.byteLength(json)}),verifyInputs,
      assess(candidate){verifyInputs();const result=verifyCameraEvidence(JSON.stringify(candidate),sha256);verifyInputs();return result;},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{if(!cacheBefore.has(entry))delete require.cache[entry];}
}
module.exports={prepareCameraRewrite,rewriteCameraImports,verifyCameraEvidence,readCameraEvidence};
if(require.main===module){const [mode,file,hash,...extra]=process.argv.slice(2);check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'data-only invocation');console.log(JSON.stringify(readCameraEvidence(file,hash)));}
