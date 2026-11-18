// Test-only compile provenance. Caller/emitted texts are data, never loaded.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/core/storage/project_db.ts',OUTPUT='src/core/storage/project_db.js';
const PROFILE='project-db-inline-type-erasure-compile-only-v1';
const TARGET='../../shared/.consolidation/address-identity.generated.js';
const OWN=['src/test/support/project_db_rewrite_fixture.cjs','src/test/project_db_rewrite.test.cjs'];
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const CAPS=Object.freeze({source:65536,dependency:131072,output:65536,record:262144});
const BUDGET_REASON=Object.freeze({source:'37896 pinned bytes fit 64 KiB with 27640 bytes headroom; no global fixture limit changes.',
  dependency:'128 KiB per selected source, not transitive closure or a runtime allowance.',
  output:'64 KiB per future measured output; overflow rejects, not a size prediction or execution permission.',
  record:'256 KiB for the complete record including two outputs and JSON escaping; overflow rejects without truncation or growth.'});
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true,
  newLine:'LineFeed',sourceMap:false,inlineSourceMap:false,declaration:false,removeComments:false,
  verbatimModuleSyntax:true,isolatedModules:true,noEmitHelpers:true,noResolve:true});
const CONTRACT=[
  ['./session_suppression.ts',['SessionSuppression']],
  ['../../shared/metadata_write_context.ts',['MetadataWriteContext','isMetadataWriteContext','MetadataWriteConflictError']],
  ['../engine/collision_reconciliation.ts',['reconcileCollisionState']],
  ['../../shared/identity_policy.ts',['canonicalAnchor','canonicalMac','mergeAnchors','selectIdentity','sameIdentity']],
  ['node:fs',[['promises','fs']]],
  ['node:path',['dirname']],
  ['../../types/index.ts',['CctvProjectBundle','Device','IPCollisionRecord','ProjectSession','ReachabilityEvidence','RogueDHCPOffer','SiteProject']],
  ['./app_db.ts',['appStateDb']],
  ['./project_history.ts',['AppendProjectHistory','ProjectHistoryFilter','ProjectHistoryService']],
  ['../projects/project_replacement_authority.ts',['createProjectReplacementProtection','ProjectReplacementAuthorityError',['ProjectExportOperation','ProjectExportOperation',true]]],
];
const EXPORTS=['ProjectValidationError','SiteProjectDatabase','createProtectedProjectStore','claimProjectReplacementAuthority','projectDb'];
const WARNINGS=[
  {sourceSlot:1,imported:'MetadataWriteContext',definition:'src/shared/metadata_write_context.ts',kind:'interface',via:null},
  ...['CctvProjectBundle','Device','IPCollisionRecord','ProjectSession','ReachabilityEvidence','RogueDHCPOffer','SiteProject'].map(imported=>({sourceSlot:6,imported,definition:'src/types/index.ts',kind:'interface',via:null})),
  ...['AppendProjectHistory','ProjectHistoryFilter'].map(imported=>({sourceSlot:8,imported,definition:'src/shared/project_history.ts',kind:imported==='AppendProjectHistory'?'interface':'type-alias',via:'src/core/storage/project_history.ts'})),
].map(r=>({...r,explicitTypeOnly:false,emittedDisposition:'retained ordinary binding',runtimeExportValidity:'UNRESOLVED'}));
const LIMITATIONS=Object.freeze([
  'Ten ordinary type-use bindings remain runtime-export uncertainties; the explicit ProjectExportOperation binding alone is observed erased.',
  'Project-history type re-exports and authority type-only backreferences are selected source ancestry, not complete dependency closure.',
  'No caller or emitted module loaded, protected project store constructed, production path invoked or emitted code evaluated.',
  'Compiler authenticity, pinned/native mapped-image consumption, transitive closure, runtime linking/equivalence and external confinement remain unproven.',
  'Compiler-free recognition is restricted to this fixed header/profile; source type-use syntax is not general name-resolution proof.',
  'A separately held capture digest anchors data integrity, not trust, historical admission, staging, signing or production authority; all 29 obligations remain open.',
]);
const PINS=[
  [SOURCE,37896,'8335df6f212a148961bb1ee8f3cd45cd8c68fb4cb57a67dba1d84dfa59c27670'],
  ['src/core/storage/session_suppression.ts',3036,'225017574549ee7b30de1257be7792456c1f8aecc44c28088b8bf840f9eddd3f'],
  ['src/shared/metadata_write_context.ts',1170,'c3564f8501ad0782db6e3ee66f697283ab4442efe55877a247f1570111bd1fe4'],
  ['src/core/engine/collision_reconciliation.ts',6199,'606675df3973bf88fb260f15cefbddf0733e4b64d3badd6629e9e73eef96c3c4'],
  ['src/shared/identity_policy.ts',3176,'b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614'],
  ['src/shared/address_validation.ts',1168,'e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc'],
  ['src/types/index.ts',14131,'d927701de585f24a11af932822db67349dd209240e4f21e0100a560bcab9bb32'],
  ['src/core/storage/app_db.ts',2862,'1bb9de2ae30d27e7d648ddc74ecf702629c1965137c048dbcdf6be507f619926'],
  ['src/core/storage/project_history.ts',5662,'a9df74217afdbdd843dfc36702e0e1404b10e94f80bf05215e6aaac4eb82868d'],
  ['src/shared/project_history.ts',1050,'30a671c5cda89fb88c59582c2ac476d939d96ba93b367044419c7cebe6e39f12'],
  ['src/core/projects/project_replacement_authority.ts',9883,'7363453303930f1d93e86b7e648a3c12a0960a6bcd639a23f3ad89c19c00de98'],
  ['package.json',1377,'22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f'],
  ['package-lock.json',162554,'b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32'],
  ['tsconfig.json',530,'3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7'],
  ['node_modules/typescript/lib/typescript.js',9112572,'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'],
  ['node_modules/typescript/package.json',3620,'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6'],
  ['scripts/payload-byte-catalog.cjs',14803,'016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d'],
];
// Fresh scoped compile-only observations, never historical admission or authority.
const OUTPUT_REFERENCES=Object.freeze([
  Object.freeze([37979,'c50a9c3bb5b39fc2c3a99b9137ede5fb8c4213516624bf837e08387fc4910924']),
  Object.freeze([38005,'1e2c932871829b9ada3eeeeb7f178a307406668e199718d37dfcf47f1d34d399']),
]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Project rewrite denied: '+reason),{code:'PROJECT_REWRITE_DENIED',reason});}
function shape(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort()),'record schema');}
function checkProjectBudget(kind,bytes){check(Object.hasOwn(CAPS,kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=CAPS[kind],'size budget '+kind);return bytes;}
function textBound(text,kind){check(typeof text==='string','text required');checkProjectBudget(kind,Buffer.byteLength(text));check(Buffer.from(text).toString('utf8')===text,'UTF8 roundtrip');return text;}
function readBounded(file,cap){
  for(let current=path.resolve(file);;current=path.dirname(current)){check(!fs.lstatSync(current).isSymbolicLink(),'linked input');if(path.dirname(current)===current)break;}
  const fd=fs.openSync(file,'r');try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(cap),'file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(n>0,'truncated input');offset+=n;}
    check(fs.readSync(fd,Buffer.alloc(1),0,1,null)===0,'grown input');
    for(const after of [fs.fstatSync(fd,{bigint:true}),fs.statSync(file,{bigint:true})])check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),'changed input');
    check(Buffer.from(bytes.toString('utf8')).equals(bytes),'input UTF8');return bytes;
  }finally{fs.closeSync(fd);}
}
function bindings(slot,source){return CONTRACT[slot][1].map(v=>{const [imported,local,typeOnly]=typeof v==='string'?[v,v,false]:v;return {imported,local,typeOnly:typeOnly===true};}).filter(b=>source||!b.typeOnly);}
function specifier(slot,mode){const spec=CONTRACT[slot][0];return mode==='source'?spec:mode==='redirected'&&slot===3?TARGET:spec.replace(/\.ts$/,'.js');}
function row(slot,spec,b,start,end){return {slot,sourceSlot:slot,specifier:spec,clauseTypeOnly:false,bindings:b,byteStart:start,byteEnd:end};}
// Compiler-free: locate all ten complete header lines anew, then derive literal
// content byte ranges. No producer positions or TypeScript APIs are consulted.
function locateHeader(text,mode){
  check(['source','original','redirected'].includes(mode),'header mode');textBound(text,mode==='source'?'source':'output');
  const rows=[];let cursor=0;
  for(let slot=0;slot<10;slot++){
    const end=text.indexOf('\n',cursor);check(end>=0,'ten header lines');const raw=text.slice(cursor,end);
    check(mode!=='source'||raw.endsWith('\r'),'source CRLF');const line=mode==='source'?raw.slice(0,-1):raw;
    const m=/^import\s*\{([^}\r\n]+)\}\s*from\s*(['"])([^'"\\\r\n]+)\2;$/.exec(line);check(m,'named header form');
    const found=m[1].split(',').map(raw=>{
      const p=/^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(raw.trim());check(p,'binding grammar');return {imported:p[2],local:p[3]??p[2],typeOnly:!!p[1]};
    });
    check(m[3]===specifier(slot,mode)&&same(found,bindings(slot,mode==='source')),'binding/specifier header contract');
    const start=Buffer.byteLength(text.slice(0,cursor+line.indexOf(m[2])+1));rows.push(row(slot,m[3],found,start,start+Buffer.byteLength(m[3])));cursor=end+1;
  }
  if(mode!=='source'){
    check((text.match(/\bimport\b/g)||[]).length===10&&!/\bProjectExportOperation\b/.test(text),'no extra imports and inline type erased');
    const exported=[...text.matchAll(/\bexport (?:class|function|const) ([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);check(same(exported,EXPORTS),'retained runtime exports');
  }
  return rows;
}
function sourceHeaderRecord(text){
  const header=text.split('\r\n').slice(0,10).join('\r\n')+'\r\n';
  check(Buffer.byteLength(header)===949&&sha(header)==='7c462fc8fac636b1bd06d20ebd495951e9284dea715879cfa4cd183d706381af','measured source header');
  return {text:header,bytes:949,sha256:sha(header),imports:locateHeader(header,'source')};
}
function rewriteProjectImport(text,ranges){
  const r=locateHeader(text,'original')[3],bytes=Buffer.from(text),expected={slot:3,byteStart:r.byteStart,byteEnd:r.byteEnd,from:r.specifier,to:TARGET};
  check(Array.isArray(ranges)&&ranges.length===1,'one authorized range; duplicate/overlap denied');const value=ranges[0];shape(value,Object.keys(expected));
  check(Number.isSafeInteger(value.byteStart)&&Number.isSafeInteger(value.byteEnd)&&value.byteStart>=0&&value.byteStart<value.byteEnd&&value.byteEnd<=bytes.length,'range bounds');
  check(same(value,expected)&&bytes.subarray(value.byteStart,value.byteEnd).equals(Buffer.from(value.from)),'fresh range correspondence');
  const size=bytes.length-Buffer.byteLength(value.from)+Buffer.byteLength(value.to);checkProjectBudget('output',size);
  return Buffer.concat([bytes.subarray(0,value.byteStart),Buffer.from(value.to),bytes.subarray(value.byteEnd)],size).toString('utf8');
}
function proof(original,redirected,before,after){
  const a=Buffer.from(original),b=Buffer.from(redirected),left=before[3],right=after[3];
  check(right.byteStart===left.byteStart,'replacement start');const delta=Buffer.byteLength(TARGET)-Buffer.byteLength(left.specifier);check(b.length===a.length+delta,'replacement delta');
  const prefix=a.subarray(0,left.byteStart),suffix=a.subarray(left.byteEnd);check(prefix.equals(b.subarray(0,right.byteStart))&&suffix.equals(b.subarray(right.byteEnd)),'unrelated bytes preserved');
  for(let slot=0;slot<10;slot++){const shift=slot>3?delta:0;check(after[slot].byteStart===before[slot].byteStart+shift,'subsequent import shift');}
  return {kind:'single-UTF8-import-content-splice',sourceSlot:3,emittedSlot:3,from:left.specifier,to:TARGET,originalStart:left.byteStart,originalEnd:left.byteEnd,
    redirectedStart:right.byteStart,redirectedEnd:right.byteEnd,removedBytes:left.byteEnd-left.byteStart,insertedBytes:right.byteEnd-right.byteStart,deltaBytes:delta,
    unchanged:[{region:'prefix',bytes:prefix.length,sha256:sha(prefix)},{region:'suffix',bytes:suffix.length,sha256:sha(suffix)}],mergedDeclarations:false};
}
function correspondence(source,before,after){return source.map((r,slot)=>({sourceSlot:slot,emittedSlot:slot,sourceSpecifier:r.specifier,sourceBindings:r.bindings,
  erasedBindings:r.bindings.filter(b=>b.typeOnly),retainedBindings:r.bindings.filter(b=>!b.typeOnly),disposition:slot===9?'observed-partial-inline-type-erasure':'observed-retained-declaration',original:before[slot],redirected:after[slot]}));}
function inspectAST(ts,text,mode){
  const source=mode==='source';textBound(text,source?'source':'output');const tree=ts.createSourceFile(source?SOURCE:OUTPUT,text,ts.ScriptTarget.ES2022,true,source?ts.ScriptKind.TS:ts.ScriptKind.JS);
  check(tree.parseDiagnostics.length===0,'AST syntax');const imports=tree.statements.filter(ts.isImportDeclaration);check(imports.length===10&&imports.every((n,i)=>tree.statements[i]===n),'ten ordered AST declarations');
  const rows=imports.map((n,slot)=>{
    const c=n.importClause;check(c&&!c.isTypeOnly&&!c.name&&!n.attributes&&c.namedBindings&&ts.isNamedImports(c.namedBindings)&&ts.isStringLiteral(n.moduleSpecifier),'AST import form');
    const b=c.namedBindings.elements.map(n=>({imported:n.propertyName?.text??n.name.text,local:n.name.text,typeOnly:n.isTypeOnly===true}));
    check(n.moduleSpecifier.text===specifier(slot,mode)&&same(b,bindings(slot,source)),'AST binding/type contract');
    return row(slot,n.moduleSpecifier.text,b,Buffer.byteLength(text.slice(0,n.moduleSpecifier.getStart(tree)+1)),Buffer.byteLength(text.slice(0,n.moduleSpecifier.end-1)));
  });
  const visit=n=>{check(!ts.isImportEqualsDeclaration(n)&&!ts.isImportTypeNode(n),'unsupported import syntax');
    if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'unexpected re-export');
    if(ts.isCallExpression(n))check(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!(ts.isIdentifier(n.expression)&&n.expression.text==='require'),'dynamic/require request');ts.forEachChild(n,visit);};visit(tree);
  if(!source){
    const names=tree.statements.filter(n=>n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).flatMap(n=>ts.isVariableStatement(n)?n.declarationList.declarations.map(d=>d.name.text):[n.name?.text]);
    check(same(names,EXPORTS),'AST runtime exports');
  }
  return rows;
}
function verifyTypeAncestry(ts,texts){
  const trees=new Map(),parse=file=>{if(!trees.has(file)){const t=ts.createSourceFile(file,texts.get(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);check(t.parseDiagnostics.length===0,'dependency syntax');trees.set(file,t);}return trees.get(file);};
  for(const warning of WARNINGS){const definitions=parse(warning.definition).statements.filter(n=>(warning.kind==='interface'?ts.isInterfaceDeclaration(n):ts.isTypeAliasDeclaration(n))&&n.name.text===warning.imported&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));check(definitions.length===1,'type-use definition '+warning.imported);}
  const history=parse('src/core/storage/project_history.ts').statements.filter(n=>ts.isExportDeclaration(n)&&n.isTypeOnly&&n.moduleSpecifier?.text==='../../shared/project_history.ts');
  check(history.length===1&&history[0].exportClause&&ts.isNamedExports(history[0].exportClause)&&['AppendProjectHistory','ProjectHistoryFilter'].every(name=>history[0].exportClause.elements.some(n=>n.name.text===name)),'history type re-export ancestry');
  const authority=parse('src/core/projects/project_replacement_authority.ts');
  check(authority.statements.some(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='ProjectExportOperation'&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)),'explicit erased type definition');
  check(authority.statements.some(n=>ts.isImportDeclaration(n)&&n.importClause?.isTypeOnly&&n.moduleSpecifier.text==='../storage/project_db.ts'),'authority type-only backreference');
}
function output(variant,text){textBound(text,'output');return {variant,path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:sha(text),filesystemIdentity:null,admission:null};}
function verifyProjectEvidence(json,expectedSha256){
  textBound(json,'record');check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external capture digest');
  let e;try{e=JSON.parse(json);}catch{check(false,'record JSON');}check(JSON.stringify(e)===json,'canonical record');
  shape(e,['profile','status','source','sourceHeader','observations','compiler','outputs','imports','correspondence','derivation','exports','runtimeExportUncertainties','selectedDependencyBoundary','limits','budgetRationale','limitations','historicalAdmission','authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...FLAGS]);
  check(e.profile===PROFILE&&e.status==='blocked'&&e.source===SOURCE&&FLAGS.every(k=>e[k]===false)&&e.historicalAdmission===null,'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(same(e.limits,CAPS)&&same(e.budgetRationale,BUDGET_REASON)&&same(e.limitations,LIMITATIONS)&&same(e.runtimeExportUncertainties,WARNINGS)&&same(e.exports,EXPORTS),'limits/limitations/exports');
  const selected=PINS.filter(([p])=>p.endsWith('.ts')&&p!==SOURCE).map(([p])=>p);check(same(e.selectedDependencyBoundary,{sources:selected,closure:'UNRESOLVED',runtimeResolution:'UNOBSERVED'}),'selected dependency boundary');
  shape(e.sourceHeader,['text','bytes','sha256','imports']);const header=sourceHeaderRecord(e.sourceHeader.text);check(same(e.sourceHeader,header),'independent source header');
  const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'}];
  check(Array.isArray(e.observations)&&e.observations.length===20,'20 observations');
  for(let i=0;i<20;i++){
    const r=e.observations[i];shape(r,['root','path','size','sha256','identity']);shape(r.identity,['dev','ino','size','mtimeNs','ctimeNs']);
    check(r.root===refs[i].root&&r.path===refs[i].path&&Number.isSafeInteger(r.size)&&r.size>0&&r.size<=134217728&&/^[a-f0-9]{64}$/.test(r.sha256)&&r.identity.size===String(r.size)&&Object.values(r.identity).every(v=>typeof v==='string'&&/^\d{1,24}$/.test(v)),'measurement schema');
    if(i<PINS.length)check(r.size===PINS[i][1]&&r.sha256===PINS[i][2],'pinned input measurement');
  }
  shape(e.compiler,['version','entry','method','configuration','repositoryTsconfig','node','repeatOutputMatched']);shape(e.compiler.node,['executable','version']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&e.compiler.method==='transpileModule; no resolution, bundling, typecheck or evaluation'&&same(e.compiler.configuration,CONFIG)&&e.compiler.repositoryTsconfig==='measured context only; noEmit remains unchanged'&&e.compiler.repeatOutputMatched===true&&e.compiler.node.executable==='node.exe'&&/^v\d+\.\d+\.\d+$/.test(e.compiler.node.version),'compiler configuration');
  check(Array.isArray(e.outputs)&&e.outputs.length===2,'two outputs');
  const headers=e.outputs.map((r,i)=>{
    shape(r,['variant','path','text','bytes','sha256','filesystemIdentity','admission']);check(r.variant===(i?'redirected':'original')&&r.path===OUTPUT&&r.filesystemIdentity===null&&r.admission===null,'output identity');textBound(r.text,'output');
    check(r.bytes===Buffer.byteLength(r.text)&&r.sha256===sha(r.text),'output measurement');return locateHeader(r.text,i?'redirected':'original');
  });
  check(same(e.imports,headers)&&same(e.correspondence,correspondence(header.imports,...headers)),'independent import correspondence');
  const derivation=proof(e.outputs[0].text,e.outputs[1].text,...headers);check(same(derivation,e.derivation),'independent derivation');
  check(e.outputs.every((r,i)=>r.bytes===OUTPUT_REFERENCES[i][0]&&r.sha256===OUTPUT_REFERENCES[i][1]),'fresh observed output references');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,
    observedInputs:20,sourceDeclarations:10,emittedDeclarations:headers[0].length,outputs:e.outputs.map(({text,...r})=>r),derivation,
    ...Object.fromEntries(FLAGS.map(k=>[k,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29});
}
function readProjectEvidence(file,sha256){return verifyProjectEvidence(readBounded(file,CAPS.record).toString('utf8'),sha256);}
function prepareProjectRewrite(repo,optIn){
  check(optIn===true,'explicit compile-only opt-in');
  check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION&&['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(k=>!process.env[k]),'inherited overrides/execution');
  check(process.execArgv.every(arg=>['--test','--test-isolation=none','--test-reporter=tap'].includes(arg)),'parent flags');
  repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}],refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:path.basename(process.execPath)}];
  const read=()=>observeCatalogFiles(roots,refs),observations=read();
  for(let i=0;i<PINS.length;i++)check(observations[i]?.size===PINS[i][1]&&observations[i].sha256===PINS[i][2],'checkpoint input '+PINS[i][0]);
  const verifyInputs=()=>check(same(read(),observations),'current input measurements');
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');
  check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'compiler resolution');
  check(!require.cache[entry],'compiler already loaded');const cached=new Set(Object.keys(require.cache));
  try{
    const ts=req('typescript');check(ts.version==='5.9.3','compiler version');check(Object.keys(require.cache).filter(k=>!cached.has(k)).every(k=>k===entry),'external compiler dependency');
    check(JSON.parse(fs.readFileSync(path.join(repo,'node_modules/typescript/package.json'),'utf8')).version===ts.version&&JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8')).packages['node_modules/typescript'].version===ts.version,'compiler package/lock');
    check(JSON.parse(fs.readFileSync(path.join(repo,'tsconfig.json'),'utf8')).compilerOptions.noEmit===true,'repository noEmit');
    const texts=new Map();for(const [p,size,digest]of PINS.filter(([p])=>p.endsWith('.ts'))){const b=readBounded(path.join(repo,p),p===SOURCE?CAPS.source:CAPS.dependency);check(b.length===size&&sha(b)===digest,'consumed source/dependency bytes '+p);texts.set(p,b.toString('utf8'));}
    const source=texts.get(SOURCE),sourceAST=inspectAST(ts,source,'source'),sourceHeader=sourceHeaderRecord(source);check(same(sourceAST,sourceHeader.imports),'independent source parse agreement');verifyTypeAncestry(ts,texts);
    const compilerOptions={...CONFIG,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,newLine:ts.NewLineKind.LineFeed};
    const emit=()=>ts.transpileModule(source,{fileName:SOURCE,compilerOptions,reportDiagnostics:true});
    const first=emit();textBound(first.outputText,'output');const repeat=emit();textBound(repeat.outputText,'output');
    check(!first.diagnostics?.length&&!repeat.diagnostics?.length&&!first.sourceMapText&&!repeat.sourceMapText&&first.outputText===repeat.outputText,'emit diagnostics/extra output/repeat');
    const original=first.outputText,before=inspectAST(ts,original,'original');check(same(before,locateHeader(original,'original')),'independent original parse agreement');
    const r=before[3],redirected=rewriteProjectImport(original,[{slot:3,byteStart:r.byteStart,byteEnd:r.byteEnd,from:r.specifier,to:TARGET}]),after=inspectAST(ts,redirected,'redirected');check(same(after,locateHeader(redirected,'redirected')),'independent redirected parse agreement');
    const evidence=freeze({profile:PROFILE,status:'blocked',source:SOURCE,sourceHeader,observations,
      compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',method:'transpileModule; no resolution, bundling, typecheck or evaluation',configuration:CONFIG,repositoryTsconfig:'measured context only; noEmit remains unchanged',node:{executable:path.basename(process.execPath),version:process.version},repeatOutputMatched:true},
      outputs:[output('original',original),output('redirected',redirected)],imports:[before,after],correspondence:correspondence(sourceHeader.imports,before,after),derivation:proof(original,redirected,before,after),exports:EXPORTS,runtimeExportUncertainties:WARNINGS,
      selectedDependencyBoundary:{sources:[...texts.keys()].filter(p=>p!==SOURCE),closure:'UNRESOLVED',runtimeResolution:'UNOBSERVED'},limits:CAPS,budgetRationale:BUDGET_REASON,limitations:LIMITATIONS,
      historicalAdmission:null,authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(k=>[k,false]))});
    const json=JSON.stringify(evidence);checkProjectBudget('record',Buffer.byteLength(json));const sha256=sha(json);verifyInputs();verifyProjectEvidence(json,sha256);
    return Object.freeze({evidence,retained:freeze({json,sha256,bytes:Buffer.byteLength(json)}),verifyInputs,
      inspectSource(text){return freeze({status:'blocked',executionAuthority:false,imports:inspectAST(ts,text,'source')});},
      assess(candidate){verifyInputs();const result=verifyProjectEvidence(JSON.stringify(candidate),sha256);verifyInputs();return result;},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{if(!cached.has(entry))delete require.cache[entry];}
}
module.exports={prepareProjectRewrite,rewriteProjectImport,verifyProjectEvidence,readProjectEvidence,checkProjectBudget};
if(require.main===module){const [mode,file,hash,...extra]=process.argv.slice(2);check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'data-only invocation');console.log(JSON.stringify(readProjectEvidence(file,hash)));}
