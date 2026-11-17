// Dedicated test-only caller derivation. Emitted text is data, never loaded.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/core/storage/add_to_existing_project.ts',OUTPUT='src/core/storage/add_to_existing_project.js';
const TARGET='../../shared/.consolidation/address-identity.generated.js';
const PROFILE='add-project-aliased-import-compile-only-v1',MAX_RECORD=65536;
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true,
  newLine:'LineFeed',sourceMap:false,inlineSourceMap:false,declaration:false,removeComments:false,
  verbatimModuleSyntax:true,isolatedModules:true,noEmitHelpers:true,noResolve:true});
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability'];
const LIMITATIONS=Object.freeze([
  'The retained Device type-use import may not have valid runtime exports under verbatimModuleSyntax; runtime linking is unverified.',
  'No generated module executed; no runtime equivalence, dependency closure or facade removal established.',
  'Sequential measurements are not pinned consumption, compiler authenticity or native mapped-image attestation.',
  'The compiler-free header recognizer is specific to this fixed profile, not a general JavaScript parser.',
  'A separately held capture digest anchors data integrity, not authenticity or admission; all 29 reviews remain open.',
]);
const PINS=[
  [SOURCE,5469,'1387afa3c8722cc0ed79d07a109a0ddf3e353daeab1451952c8293bf61e142c7'],
  ['src/types/index.ts',14131,'d927701de585f24a11af932822db67349dd209240e4f21e0100a560bcab9bb32'],
  ['src/core/network/local_host_identity.ts',1519,'5a59cc021946af850e10639c948b0f2935f9bed96c36873c177f89ac9e7db971'],
  ['src/core/storage/project_db.ts',37896,'8335df6f212a148961bb1ee8f3cd45cd8c68fb4cb57a67dba1d84dfa59c27670'],
  ['src/shared/identity_policy.ts',3176,'b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614'],
  ['src/shared/address_validation.ts',1168,'e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc'],
  ['package.json',1377,'22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f'],
  ['package-lock.json',162554,'b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32'],
  ['tsconfig.json',530,'3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7'],
  ['node_modules/typescript/lib/typescript.js',9112572,'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'],
  ['node_modules/typescript/package.json',3620,'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6'],
  ['scripts/payload-byte-catalog.cjs',14803,'016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d'],
];
const OWN=['src/test/support/add_to_existing_project_rewrite_fixture.cjs','src/test/add_to_existing_project_rewrite.test.cjs'];
const BINDINGS=[
  [['canonicalAnchor','canonicalAnchor'],['sharesAnchor','sharesAnchor'],['conflicts','conflict']],
  [['Device','Device']],[['LocalHostIdentity','LocalHostIdentity']],
  [['ProjectValidationError','ProjectValidationError'],['SiteProjectDatabase','SiteProjectDatabase']],
];
const ORIGINAL=['../../shared/identity_policy.js','../../types/index.js','../network/local_host_identity.js','./project_db.js'];
// Fresh scoped compiler observations, not historical staged identities/admission.
const OUTPUT_REFERENCES=Object.freeze([
  Object.freeze([5491,'76f2d794f703d5c37545374e7ca1dc2727d839b4cc13850ff998ec561c3dbc20']),
  Object.freeze([5517,'19260089f5818f8439618b7995e4cb116640fcdf4d5f08374e94bab824520838']),
]);
const USAGE=Object.freeze({matchesAssignment:{local:'matches',sourceBinding:'sharesAnchor',count:1},
  conflictCall:{local:'conflict',arguments:['found[0]','device'],count:1},conflictIdentifierOccurrences:2});
const bindingsFor=slot=>BINDINGS[slot].map(([imported,local])=>({imported,local,typeOnly:false}));
const bindingText=slot=>BINDINGS[slot].map(([imported,local])=>imported===local?imported:imported+' as '+local).join(', ');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const seal=value=>sha(JSON.stringify(value));
const same=(a,b)=>seal(a)===seal(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Aliased caller denied: '+reason),{code:'ALIAS_REWRITE_DENIED',reason});}
function shape(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort()),'record schema');}
function specs(mode){return ORIGINAL.map((name,slot)=>mode==='source'?name.replace(/\.js$/,'.ts'):mode==='redirected'&&slot===0?TARGET:name);}
function row(slot,specifier,start,end){return {slot,specifier,bindings:bindingsFor(slot),byteStart:start,byteEnd:end};}

// Compiler-free lexical recognition of the complete fixed header. No producer
// offsets, TypeScript, VM, eval, dynamic import or application loader is used.
function locateHeader(text,mode){
  check(typeof text==='string'&&Buffer.byteLength(text)<=16384,'output bound');
  const expected=specs(mode),rows=[];let cursor=0;
  for(let slot=0;slot<4;slot++){
    const end=text.indexOf('\n',cursor);check(end>=0,'four header lines');
    const raw=text.slice(cursor,end);check(mode!=='source'||raw.endsWith('\r'),'pinned source CRLF');
    const line=mode==='source'?raw.slice(0,-1):raw,match=/^import \{ ([A-Za-z0-9_$, ]+) \} from (['"])([^'"\\\r\n]+)\2;$/.exec(line);
    check(match&&match[1]===bindingText(slot)&&match[3]===expected[slot],'four import header contract');
    const offset=line.indexOf(match[2])+1,start=Buffer.byteLength(text.slice(0,cursor+offset));
    rows.push(row(slot,match[3],start,start+Buffer.byteLength(match[3])));cursor=end+1;
  }
  return rows;
}
function sourceHeader(){return BINDINGS.map((names,slot)=>`import { ${bindingText(slot)} } from '${specs('source')[slot]}';\r\n`).join('');}
function rangeFor(rows){return {slot:0,byteStart:rows[0].byteStart,byteEnd:rows[0].byteEnd,from:ORIGINAL[0],to:TARGET};}
function rewriteAliasImport(text,r){
  const expected=rangeFor(locateHeader(text,'original')),bytes=Buffer.from(text);
  shape(r,['slot','byteStart','byteEnd','from','to']);
  check(Number.isSafeInteger(r.byteStart)&&Number.isSafeInteger(r.byteEnd)&&r.byteStart>=0&&r.byteStart<r.byteEnd&&r.byteEnd<=bytes.length,'range bounds');
  check(same(r,expected)&&bytes.subarray(r.byteStart,r.byteEnd).toString('utf8')===r.from,'range correspondence');
  return Buffer.concat([bytes.subarray(0,r.byteStart),Buffer.from(r.to),bytes.subarray(r.byteEnd)]).toString('utf8');
}
function proof(original,redirected,before,after){
  const a=Buffer.from(original),b=Buffer.from(redirected),old=before[0],next=after[0];
  check(a.length+26===b.length&&next.byteStart===old.byteStart,'replacement delta/position');
  const prefix=a.subarray(0,old.byteStart),suffix=a.subarray(old.byteEnd);
  check(prefix.equals(b.subarray(0,next.byteStart))&&suffix.equals(b.subarray(next.byteEnd)),'unrelated prefix/suffix bytes');
  return {kind:'one-aliased-import-UTF8-specifier-splice',slot:0,from:old.specifier,to:TARGET,
    originalStart:old.byteStart,originalEnd:old.byteEnd,redirectedStart:next.byteStart,redirectedEnd:next.byteEnd,
    removedBytes:31,insertedBytes:57,deltaBytes:26,bindings:bindingsFor(0),mergedDeclarations:false,
    unchanged:[{region:'prefix',bytes:prefix.length,sha256:sha(prefix)},{region:'suffix',bytes:suffix.length,sha256:sha(suffix)}]};
}
// Fixed lexical usage observations supplement the full-byte preservation proof.
// They do not establish general JS name resolution or runtime behavior.
function lexicalUsage(text){
  check((text.match(/\bconst matches\s*=\s*sharesAnchor;/g)||[]).length===1,'matches value assignment');
  check((text.match(/\bconflict\(found\[0\],\s*device\)/g)||[]).length===1,'local conflict call');
  check((text.match(/\bconflict\b/g)||[]).length===2,'conflict declaration/use count');
  return USAGE;
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
    check(same(names,bindingsFor(slot)),'AST bindings');
    return row(slot,n.moduleSpecifier.text,Buffer.byteLength(text.slice(0,n.moduleSpecifier.getStart(tree)+1)),Buffer.byteLength(text.slice(0,n.moduleSpecifier.end-1)));
  });
  const exported=tree.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
  check(same(exported.map(n=>n.name?.text),source?['AddProjectOutcome','AddProjectPreviewItem','AddProjectPreview','AddToExistingProjectService']:['AddToExistingProjectService']),'AST exports');
  const visit=n=>{check(!ts.isCallExpression(n)||(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!(ts.isIdentifier(n.expression)&&n.expression.text==='require')),'dynamic request');if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'re-export');ts.forEachChild(n,visit);};visit(tree);
  check(source?ts.isTypeAliasDeclaration(exported[0])&&ts.isInterfaceDeclaration(exported[1])&&ts.isInterfaceDeclaration(exported[2])&&ts.isClassDeclaration(exported[3]):ts.isClassDeclaration(exported[0]),'export declaration kinds');
  let assignments=0,calls=0,identifiers=0;
  const usage=n=>{
    if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='matches'){
      check(n.initializer&&ts.isIdentifier(n.initializer)&&n.initializer.text==='sharesAnchor','AST matches assignment');assignments++;
    }
    if(ts.isIdentifier(n)&&n.text==='conflict')identifiers++;
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='conflict'){
      check(n.arguments.length===2&&ts.isElementAccessExpression(n.arguments[0])&&n.arguments[0].expression.getText(tree)==='found'&&n.arguments[0].argumentExpression.getText(tree)==='0'&&n.arguments[1].getText(tree)==='device','AST conflict call');calls++;
    }
    ts.forEachChild(n,usage);
  };usage(tree);
  check(assignments===1&&calls===1&&identifiers===2,'AST alias usages');
  return {imports:rows,usage:USAGE};
}
function output(variant,text){return {variant,path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:sha(text),filesystemIdentity:null,admission:null};}
function verifyAliasEvidence(json,expectedSha256){
  check(typeof json==='string'&&Buffer.byteLength(json)<=MAX_RECORD,'record bound');
  check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external capture digest');
  let e;try{e=JSON.parse(json);}catch{check(false,'record JSON');}check(JSON.stringify(e)===json,'canonical record');
  shape(e,['profile','source','sourceImports','usage','observations','compiler','outputs','derivation','limitations','historicalAdmission',
    'authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...FLAGS]);
  check(e.profile===PROFILE&&e.source===SOURCE&&e.historicalAdmission===null&&FLAGS.every(key=>e[key]===false),'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(same(e.limitations,LIMITATIONS)&&same(e.sourceImports,locateHeader(sourceHeader(),'source'))&&same(e.usage,USAGE),'source contract/usages/limitations');
  shape(e.compiler,['version','entry','method','configuration','repositoryTsconfig','node']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&e.compiler.method==='transpileModule; no resolution, bundling, typecheck or evaluation'&&
    e.compiler.repositoryTsconfig==='measured context only; noEmit remains unchanged'&&same(e.compiler.configuration,CONFIG),'compiler configuration');
  shape(e.compiler.node,['executable','version']);check(e.compiler.node.executable==='node.exe'&&/^v\d+\.\d+\.\d+$/.test(e.compiler.node.version),'runtime basename');
  const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'}];
  check(Array.isArray(e.observations)&&e.observations.length===15,'15 observations');
  for(let index=0;index<15;index++){
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
    check(same(lexicalUsage(r.text),e.usage),'retained alias usages');
    return locateHeader(r.text,index?'redirected':'original');
  });
  const calculated=proof(e.outputs[0].text,e.outputs[1].text,headers[0],headers[1]);
  check(same(calculated,e.derivation),'independent derivation');
  check(e.outputs.every((r,index)=>r.bytes===OUTPUT_REFERENCES[index][0]&&r.sha256===OUTPUT_REFERENCES[index][1]),'observed output reference');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,
    ...Object.fromEntries(FLAGS.map(key=>[key,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,
    recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,observedInputs:15,outputs:e.outputs.map(({text,...r})=>r),derivation:calculated,limitations:LIMITATIONS});
}
function readAliasEvidence(file,expectedSha256){
  check(!fs.lstatSync(file).isSymbolicLink(),'linked evidence');const fd=fs.openSync(file,'r');
  try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(MAX_RECORD),'evidence file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(count>0,'truncated evidence');offset+=count;}
    const after=fs.fstatSync(fd,{bigint:true});check(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),'evidence changed');
    const json=bytes.toString('utf8');check(Buffer.from(json).equals(bytes),'evidence UTF8');return verifyAliasEvidence(json,expectedSha256);
  }finally{fs.closeSync(fd);}
}
function prepareAliasRewrite(repo,optIn){
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
    const original=first.outputText,before=inspect(ts,original,'original'),redirected=rewriteAliasImport(original,rangeFor(before.imports)),after=inspect(ts,redirected,'redirected');
    const evidence=freeze({profile:PROFILE,source:SOURCE,sourceImports:sourceImports.imports,usage:sourceImports.usage,observations,compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',
      method:'transpileModule; no resolution, bundling, typecheck or evaluation',configuration:CONFIG,repositoryTsconfig:'measured context only; noEmit remains unchanged',node:{executable:path.basename(process.execPath),version:process.version}},
      outputs:[output('original',original),output('redirected',redirected)],derivation:proof(original,redirected,before.imports,after.imports),limitations:LIMITATIONS,historicalAdmission:null,
      authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(key=>[key,false]))});
    const json=JSON.stringify(evidence),sha256=sha(json);verifyInputs();verifyAliasEvidence(json,sha256);
    return Object.freeze({evidence,retained:freeze({json,sha256,bytes:Buffer.byteLength(json)}),verifyInputs,
      assess(candidate){verifyInputs();const result=verifyAliasEvidence(JSON.stringify(candidate),sha256);verifyInputs();return result;},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{if(!cacheBefore.has(entry))delete require.cache[entry];}
}
module.exports={prepareAliasRewrite,rewriteAliasImport,verifyAliasEvidence,readAliasEvidence};
if(require.main===module){const [mode,file,hash,...extra]=process.argv.slice(2);check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'data-only invocation');console.log(JSON.stringify(readAliasEvidence(file,hash)));}
