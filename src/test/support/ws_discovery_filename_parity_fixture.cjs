// Isolated test-only filename comparison. Source/stager/output texts are never loaded.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/core/drivers/ws_discovery_transport.ts',OUTPUT='src/core/drivers/ws_discovery_transport.js',STAGER='scripts/stage-backend.cjs';
const PROFILE='ws-discovery-compiler-filename-parity-v1';
const OWN=['src/test/support/ws_discovery_filename_parity_fixture.cjs','src/test/ws_discovery_filename_parity.test.cjs'];
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const CAPS=Object.freeze({source:65536,stager:65536,output:65536,record:262144});
const REASONS=Object.freeze({source:'28253 current bytes fit 64 KiB.',stager:'24741 current bytes fit 64 KiB; read as data only.',
  output:'64 KiB per filename variant; overflow denies without truncation.',record:'256 KiB complete JSON including snapshots, outputs, comparisons and escaping; overflow denies without growth.'});
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true});
const ARGUMENTS=Object.freeze([
  {variant:'relative',kind:'repository-relative',argument:SOURCE,sourceObservation:0},
  {variant:'absolute',kind:'actual-resolved-source',argument:null,sourceRelative:SOURCE,construction:'path.resolve(repositoryRoot, sourceRelative)',
    pathIsAbsolute:true,canonicalPathMatches:true,sameMeasuredFile:true,absoluteUserPathRedacted:true,sourceObservation:0},
]);
const PRESERVED=[
  ['phase18c7t-network-match',9344,'71e626d63db9235fd02459166a8ca9c457327ca066bcba7c988000b4502413cb'],
  ['phase18c7t-camera-access',12858,'ffcfd75075d79d984232794fdf78275c0b2e92fc32fe0f382586708aa6df281a'],
  ['phase18c7t-add-project-alias',19479,'0f01b7bc44ffa4516aaf0512da6d269eb19974e09947d601e27e70c36b321ffb'],
  ['phase18c7t-pair-service-rewrite',172322,'b41bca4c2f52f45897514e4ff56360a919d08fc308fde924fa5d2f5d9667ee22'],
  ['phase18c7t-project-db-rewrite',113135,'700c6635379d5b9fde6dfdab960e23befdb18a22f2327193c824e83d132124c9'],
  ['phase18c7t-ws-discovery-stager',152739,'3caa94d6e90c8f03a1c1d6bc1edeb0585e77b0b59454233a5bb5733dc2d8d61a'],
];
const LIMITATIONS=Object.freeze([
  'Filename observations cover only this measured caller, TypeScript implementation, stager options and current checkout; no universal filename equivalence is established.',
  'Absolute user paths are omitted. The local guarded call observes path.resolve(repositoryRoot, sourceRelative); exported data cannot independently replay a redacted concrete argument.',
  'No production stager invoked, transport/socket instantiated, dependency loaded or emitted module evaluated.',
  'Historical captures remain distinct; their bytes/identities are rechecked, not reused as admission or as substitutes for fresh compilation.',
  'Compiler authenticity, pinned/native mapped-image consumption, dependency closure, CommonJS/ESM interoperability, runtime equivalence and admission remain unresolved.',
  'Header recognition is fixed-profile lexical inspection, not general JavaScript parsing or name-resolution proof.',
]);
const PINS=[
  [
    "src/core/drivers/ws_discovery_transport.ts",
    28253,
    "a8f14c6a21483d63c479f4f82e6f9a6d610274ca0bbce147565b1bb3e147a9b2"
  ],
  [
    "scripts/stage-backend.cjs",
    24741,
    "1776a2e8483f179c6b91270ddaa7ccd170f99eb9f3c6b8634b0f50bcb85b27ab"
  ],
  [
    "node_modules/typescript/lib/typescript.js",
    9112572,
    "3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675"
  ],
  [
    "node_modules/typescript/package.json",
    3620,
    "822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6"
  ],
  [
    "package.json",
    1377,
    "22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f"
  ],
  [
    "package-lock.json",
    162554,
    "b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32"
  ],
  [
    "tsconfig.json",
    530,
    "3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7"
  ],
  [
    "scripts/payload-byte-catalog.cjs",
    14803,
    "016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d"
  ],
  [
    "src/test/support/ws_discovery_stager_compat_fixture.cjs",
    33594,
    "9d9b84f83b58dbe64c90e2bd1ea3c7f3d30f812e868b84e8450adc7276c01a33"
  ],
  [
    "src/test/ws_discovery_stager_compat.test.cjs",
    24733,
    "fef596124ec3b7d6599a24e3ab1fed1e03c331a04db31c3014b2035869ead8e6"
  ]
];
// Fresh relative and actual-absolute observations, not inherited admission.
const OUTPUT_REFERENCES=Object.freeze([
  Object.freeze([30198,'fbf94fb6a2c9f70ce058cd434dbdeb4a17152484c8f416ec6632df37a933f62a']),
  Object.freeze([30198,'fbf94fb6a2c9f70ce058cd434dbdeb4a17152484c8f416ec6632df37a933f62a']),
]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Filename parity denied: '+reason),{code:'FILENAME_PARITY_DENIED',reason});}
function shape(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort()),'record schema');}
function checkFilenameBudget(kind,bytes){check(Object.hasOwn(CAPS,kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=CAPS[kind],'size budget '+kind);return bytes;}
function textBound(text,kind){check(typeof text==='string','text required');checkFilenameBudget(kind,Buffer.byteLength(text));check(Buffer.from(text).toString('utf8')===text,'UTF8 roundtrip');return text;}
function readBounded(file,cap){
  for(let current=path.resolve(file);;current=path.dirname(current)){check(!fs.lstatSync(current).isSymbolicLink(),'linked input');if(path.dirname(current)===current)break;}
  const fd=fs.openSync(file,'r');try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(cap),'file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(n>0,'truncated input');offset+=n;}
    check(fs.readSync(fd,Buffer.alloc(1),0,1,null)===0,'grown input');
    for(const s of [fs.fstatSync(fd,{bigint:true}),fs.statSync(file,{bigint:true})])check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]),'changed input');
    check(Buffer.from(bytes.toString('utf8')).equals(bytes),'input UTF8');return bytes;
  }finally{fs.closeSync(fd);}
}
function snapshot(file,text,kind){textBound(text,kind);const pin=PINS.find(r=>r[0]===file);check(pin&&Buffer.byteLength(text)===pin[1]&&sha(text)===pin[2],'snapshot pin');return {path:file,text,bytes:Buffer.byteLength(text),sha256:sha(text)};}
function inspectStager(text){
  const marker='compilerOptions: {',start=text.indexOf(marker),end=text.indexOf('}',start)+1;check(start>=0&&end>start&&text.indexOf(marker,start+1)===-1,'unique option site');
  const site=text.slice(start,end),properties=site.slice(marker.length,-1).split(',').map(raw=>{const i=raw.indexOf(':');return [raw.slice(0,i).trim(),raw.slice(i+1).trim().replace(/\s+/g,' ')];});
  check(same(properties,[['target','ts.ScriptTarget.ES2022'],['module','/\\.cts$/i.test(source) ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext'],['jsx','ts.JsxEmit.ReactJSX'],['rewriteRelativeImportExtensions','true']]),'four exact stager expressions');
  const resolution='const source = path.resolve(root, record.source), target = path.resolve(out, record.output);';
  check(text.indexOf(resolution)>=0&&text.indexOf(resolution)===text.lastIndexOf(resolution),'actual stager filename construction');
  check(/ts\.transpileModule\(fs\.readFileSync\(source, 'utf8'\), \{ fileName: source, reportDiagnostics: true,/.test(text),'stager fileName context');
  return {optionSite:{text:site,sha256:sha(site),byteStart:Buffer.byteLength(text.slice(0,start)),byteEnd:Buffer.byteLength(text.slice(0,end))},
    sourceResolution:resolution,selectedModule:'ESNext for the measured .ts source'};
}
function header(text){
  textBound(text,'output');const rows=[];let cursor=0;
  while(text.startsWith('import ',cursor)){
    check(rows.length<16,'header count bound');const end=text.indexOf('\n',cursor);check(end>=0,'complete header line');
    const line=text.slice(cursor,end),m=/^import\s+(?:([A-Za-z_$][\w$]*)\s*(?:,\s*)?)?(?:\{([^}\r\n]+)\}\s*)?from\s*(['"])([^'"\\\r\n]+)\3;$/.exec(line);check(m&&(m[1]||m[2]),'default/named header');
    const bindings=m[1]?[{kind:'default',imported:'default',local:m[1]}]:[];
    if(m[2])for(const raw of m[2].split(',')){const b=/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(raw.trim());check(b,'named binding');bindings.push({kind:'named',imported:b[1],local:b[2]??b[1]});}
    const start=Buffer.byteLength(text.slice(0,cursor+line.indexOf(m[3])+1));rows.push({slot:rows.length,specifier:m[4],bindings,byteStart:start,byteEnd:start+Buffer.byteLength(m[4])});cursor=end+1;
  }
  check(rows.length>0&&(text.match(/\bimport\b/g)||[]).length===rows.length&&!/\brequire\s*\(/.test(text),'complete static request census');return rows;
}
function inspectAST(ts,text){
  textBound(text,'output');const tree=ts.createSourceFile(OUTPUT,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);check(tree.parseDiagnostics.length===0,'AST syntax');
  const imports=tree.statements.filter(ts.isImportDeclaration);check(imports.every((n,i)=>tree.statements[i]===n),'contiguous AST imports');
  const rows=imports.map((n,slot)=>{
    const c=n.importClause;check(c&&!c.isTypeOnly&&!n.attributes&&ts.isStringLiteral(n.moduleSpecifier),'AST import form');
    const bindings=c.name?[{kind:'default',imported:'default',local:c.name.text}]:[];
    if(c.namedBindings){check(ts.isNamedImports(c.namedBindings),'AST named form');for(const b of c.namedBindings.elements){check(!b.isTypeOnly,'no emitted type binding');bindings.push({kind:'named',imported:b.propertyName?.text??b.name.text,local:b.name.text});}}
    return {slot,specifier:n.moduleSpecifier.text,bindings,byteStart:Buffer.byteLength(text.slice(0,n.moduleSpecifier.getStart(tree)+1)),byteEnd:Buffer.byteLength(text.slice(0,n.moduleSpecifier.end-1))};
  });
  const visit=n=>{if(ts.isCallExpression(n))check(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!(ts.isIdentifier(n.expression)&&n.expression.text==='require'),'unexpected dynamic/require request');if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'re-export request');ts.forEachChild(n,visit);};visit(tree);return rows;
}
// Exhaustive aligned byte differences, including unequal tails. No truncation.
// This is a byte accounting representation, not a minimal semantic edit script.
function compareFilenameOutputs(relative,absolute){
  textBound(relative,'output');textBound(absolute,'output');const a=Buffer.from(relative),b=Buffer.from(absolute),max=Math.max(a.length,b.length),differences=[];
  let cursor=0,prefix=0;while(prefix<Math.min(a.length,b.length)&&a[prefix]===b[prefix])prefix++;
  let suffix=0;while(suffix<Math.min(a.length,b.length)-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  while(cursor<max){
    if(cursor<a.length&&cursor<b.length&&a[cursor]===b[cursor]){cursor++;continue;}
    const start=cursor++;while(cursor<max&&!(cursor<a.length&&cursor<b.length&&a[cursor]===b[cursor]))cursor++;
    differences.push({byteStart:start,relativeEnd:Math.min(cursor,a.length),absoluteEnd:Math.min(cursor,b.length),
      relativeHex:a.subarray(start,Math.min(cursor,a.length)).toString('hex'),absoluteHex:b.subarray(start,Math.min(cursor,b.length)).toString('hex')});
  }
  return {byteIdentical:a.equals(b),relativeBytes:a.length,absoluteBytes:b.length,commonPrefixBytes:prefix,commonSuffixBytes:suffix,
    differenceRepresentation:'all aligned differing byte runs; unequal tails included',differences};
}
function refs(){return [...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'},
  ...PRESERVED.map(([dir,,hash])=>({root:'retained-records',path:dir+'/'+hash+'.json'}))];}
function verifyFilenameEvidence(json,expectedSha256){
  textBound(json,'record');check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external capture digest');
  let e;try{e=JSON.parse(json);}catch{check(false,'record JSON');}check(JSON.stringify(e)===json,'canonical JSON');
  shape(e,['profile','status','sourceSnapshot','stagerSnapshot','stagerCall','observations','compiler','filenameArguments','outputs','imports','comparison','importComparison','preservedRecords','limits','budgetRationale','limitations','historicalAdmission','authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...FLAGS]);
  check(e.profile===PROFILE&&e.status==='blocked'&&FLAGS.every(k=>e[k]===false)&&e.historicalAdmission===null,'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(same(e.limits,CAPS)&&same(e.budgetRationale,REASONS)&&same(e.limitations,LIMITATIONS)&&same(e.filenameArguments,ARGUMENTS),'limits/arguments/limitations');
  for(const [key,file,kind]of [['sourceSnapshot',SOURCE,'source'],['stagerSnapshot',STAGER,'stager']]){shape(e[key],['path','text','bytes','sha256']);check(same(e[key],snapshot(file,e[key].text,kind)),'snapshot correspondence');}
  check(same(e.stagerCall,inspectStager(e.stagerSnapshot.text)),'stager call correspondence');
  const reference=refs();check(Array.isArray(e.observations)&&e.observations.length===reference.length,'19 observations');
  for(let i=0;i<reference.length;i++){const r=e.observations[i];shape(r,['root','path','size','sha256','identity']);shape(r.identity,['dev','ino','size','mtimeNs','ctimeNs']);
    check(r.root===reference[i].root&&r.path===reference[i].path&&Number.isSafeInteger(r.size)&&r.size>0&&r.size<=134217728&&/^[a-f0-9]{64}$/.test(r.sha256)&&r.identity.size===String(r.size)&&Object.values(r.identity).every(v=>typeof v==='string'&&/^\d{1,24}$/.test(v)),'measurement schema');
    if(i<PINS.length)check(r.size===PINS[i][1]&&r.sha256===PINS[i][2],'pinned repository input');
    if(i>=PINS.length+3){const p=PRESERVED[i-PINS.length-3];check(r.size===p[1]&&r.sha256===p[2],'preserved record measurement');}
  }
  check(same(e.preservedRecords,{records:PRESERVED.map(([profile,bytes,sha256])=>({profile,bytes,sha256})),interpretation:'separate historical evidence; no admission or universal production correspondence inherited'}),'historical separation');
  shape(e.compiler,['version','entry','method','suppliedOptions','tsconfigDisposition','node','compileCount']);shape(e.compiler.node,['executable','version']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&e.compiler.method==='transpileModule; two in-memory filename variants; no typecheck, resolution or evaluation'&&same(e.compiler.suppliedOptions,CONFIG)&&e.compiler.tsconfigDisposition==='measured context only; no inherited options'&&e.compiler.node.executable==='node.exe'&&/^v\d+\.\d+\.\d+$/.test(e.compiler.node.version)&&e.compiler.compileCount===2,'exact compiler profile');
  check(Array.isArray(e.outputs)&&e.outputs.length===2,'two outputs');
  const imports=e.outputs.map((r,i)=>{shape(r,['variant','path','text','bytes','sha256','filesystemIdentity','admission']);check(r.variant===(i?'absolute':'relative')&&r.path===OUTPUT&&r.filesystemIdentity===null&&r.admission===null,'output identity');textBound(r.text,'output');check(r.bytes===Buffer.byteLength(r.text)&&r.sha256===sha(r.text),'output measurement');return header(r.text);});
  check(same(e.imports,imports)&&same(e.importComparison,{byteCoordinatesIdentical:same(imports[0],imports[1]),relativeDeclarations:imports[0].length,absoluteDeclarations:imports[1].length}),'independent import comparison');
  const comparison=compareFilenameOutputs(e.outputs[0].text,e.outputs[1].text);check(same(e.comparison,comparison),'independent exhaustive byte comparison');
  check(e.outputs.every((o,i)=>o.bytes===OUTPUT_REFERENCES[i][0]&&o.sha256===OUTPUT_REFERENCES[i][1]),'fresh observed output references');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,
    observedInputs:reference.length,comparison,importComparison:e.importComparison,outputs:e.outputs.map(({text,...r})=>r),
    ...Object.fromEntries(FLAGS.map(k=>[k,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29});
}
function readFilenameEvidence(file,hash){return verifyFilenameEvidence(readBounded(file,CAPS.record).toString('utf8'),hash);}
function prepareFilenameParity(repo,optIn){
  check(optIn===true,'explicit compile-only opt-in');check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION&&['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(k=>!process.env[k]),'inherited overrides/execution');
  check(process.execArgv.every(a=>['--test','--test-isolation=none','--test-reporter=tap'].includes(a)),'parent flags');repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..')&&fs.realpathSync.native(repo)===repo,'fixed canonical checkout');
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath},{id:'retained-records',path:path.join(require('node:os').homedir(),'.codex/artifacts')}],references=refs(),read=()=>observeCatalogFiles(roots,references),observations=read();
  for(let i=0;i<PINS.length;i++)check(observations[i]?.size===PINS[i][1]&&observations[i].sha256===PINS[i][2],'current repository pin '+PINS[i][0]);
  for(let i=0;i<PRESERVED.length;i++){const r=observations[PINS.length+3+i],p=PRESERVED[i];check(r.size===p[1]&&r.sha256===p[2],'preserved record bytes');}
  const verifyInputs=()=>check(same(read(),observations),'current measurements');
  const absolute=path.resolve(repo,SOURCE);check(path.isAbsolute(absolute)&&fs.realpathSync.native(absolute)===absolute&&path.relative(repo,absolute).split(path.sep).join('/')===SOURCE,'actual absolute filename');
  const sourceStat=fs.statSync(absolute,{bigint:true});check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>String(sourceStat[k])===observations[0].identity[k]),'absolute argument measured file identity');
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'compiler resolution');
  check(!require.cache[entry],'compiler already loaded');const cached=new Set(Object.keys(require.cache));
  try{
    const ts=req('typescript');check(ts.version==='5.9.3','compiler version');check(Object.keys(require.cache).filter(k=>!cached.has(k)).every(k=>k===entry),'external compiler dependency');
    const consumed=(file,kind)=>{const b=readBounded(path.join(repo,file),CAPS[kind]),pin=PINS.find(r=>r[0]===file);check(b.length===pin[1]&&sha(b)===pin[2],'consumed bytes '+file);return b.toString('utf8');};
    const source=consumed(SOURCE,'source'),stager=consumed(STAGER,'stager'),stagerCall=inspectStager(stager);
    const compilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true};
    check(same(Object.keys(compilerOptions),Object.keys(CONFIG)),'exact supplied option keys');
    const outputs=[],imports=[];for(const [i,fileName]of [SOURCE,absolute].entries()){
      verifyInputs();const result=ts.transpileModule(source,{fileName,compilerOptions,reportDiagnostics:true});textBound(result.outputText,'output');check(!result.diagnostics?.length&&!result.sourceMapText,'diagnostics/extra output');
      const text=result.outputText,ast=inspectAST(ts,text),lex=header(text);check(same(ast,lex),'independent header parser agreement');
      outputs.push({variant:i?'absolute':'relative',path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:sha(text),filesystemIdentity:null,admission:null});imports.push(ast);
    }
    const evidence=freeze({profile:PROFILE,status:'blocked',sourceSnapshot:snapshot(SOURCE,source,'source'),stagerSnapshot:snapshot(STAGER,stager,'stager'),stagerCall,observations,
      compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',method:'transpileModule; two in-memory filename variants; no typecheck, resolution or evaluation',suppliedOptions:CONFIG,tsconfigDisposition:'measured context only; no inherited options',node:{executable:path.basename(process.execPath),version:process.version},compileCount:2},
      filenameArguments:ARGUMENTS,outputs,imports,comparison:compareFilenameOutputs(outputs[0].text,outputs[1].text),
      importComparison:{byteCoordinatesIdentical:same(imports[0],imports[1]),relativeDeclarations:imports[0].length,absoluteDeclarations:imports[1].length},
      preservedRecords:{records:PRESERVED.map(([profile,bytes,sha256])=>({profile,bytes,sha256})),interpretation:'separate historical evidence; no admission or universal production correspondence inherited'},
      limits:CAPS,budgetRationale:REASONS,limitations:LIMITATIONS,historicalAdmission:null,authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(k=>[k,false]))});
    const json=JSON.stringify(evidence);checkFilenameBudget('record',Buffer.byteLength(json));check(!json.includes(repo)&&!json.includes(absolute)&&!json.includes(process.execPath),'absolute user path redaction');
    const sha256=sha(json);verifyInputs();verifyFilenameEvidence(json,sha256);
    return Object.freeze({evidence,retained:freeze({json,bytes:Buffer.byteLength(json),sha256}),verifyInputs,
      assess(candidate){verifyInputs();const result=verifyFilenameEvidence(JSON.stringify(candidate),sha256);verifyInputs();return result;},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{if(!cached.has(entry))delete require.cache[entry];}
}
module.exports={prepareFilenameParity,verifyFilenameEvidence,readFilenameEvidence,compareFilenameOutputs,checkFilenameBudget};
if(require.main===module){const [mode,file,hash,...extra]=process.argv.slice(2);check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'data-only invocation');console.log(JSON.stringify(readFilenameEvidence(file,hash)));}
