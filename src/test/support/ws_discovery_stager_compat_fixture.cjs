// Test-only, fresh stager-option observation. Source, stager and outputs are data.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/core/drivers/ws_discovery_transport.ts',OUTPUT='src/core/drivers/ws_discovery_transport.js',STAGER='scripts/stage-backend.cjs';
const PROFILE='ws-discovery-stager-options-compile-only-v1',TARGET='../../shared/.consolidation/address-identity.generated.js';
const OWN=['src/test/support/ws_discovery_stager_compat_fixture.cjs','src/test/ws_discovery_stager_compat.test.cjs'];
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const CAPS=Object.freeze({source:65536,stager:65536,dependency:131072,output:65536,record:262144});
const REASONS=Object.freeze({source:'28253 measured bytes fit 64 KiB with 37283 bytes headroom.',stager:'24741 measured bytes fit 64 KiB; source is retained as data, never imported.',
  dependency:'128 KiB per selected dependency source, not complete closure.',output:'64 KiB per emitted variant; overflow rejects rather than truncating.',
  record:'256 KiB complete JSON including source/stager snapshots, both outputs, escaping and metadata; no automatic growth.'});
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true});
const EXPRESSIONS=[
  ['target','ts.ScriptTarget.ES2022'],
  ['module',String.raw`/\.cts$/i.test(source) ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext`],
  ['jsx','ts.JsxEmit.ReactJSX'],['rewriteRelativeImportExtensions','true'],
];
const CONTRACT=[
  ['../../shared/identity_policy.ts',null,['canonicalAnchor','mergeAnchors','selectIdentity']],
  ['node:os','os',[]],
  ['../../shared/evidence_provenance.ts',null,['EvidenceProvenance','packetProvenance']],
  ['../../shared/discovery_session.ts',null,['DiscoveryContext']],
  ['./ws_discovery_evidence.ts',null,['wsDiscoveryEvidence','WsDiscoveryEvidence','safeSocketCode']],
  ['node:buffer',null,['isUtf8']],
  ['./ws_discovery_hello.ts',null,['discoveryMessageKind','inspectDiscoveryHello','inspectDiscoveryMetadata']],
  ['node:dgram','dgram',['RemoteInfo']],
  ['../../types/index.ts',null,['Device','NICInfo']],
  ['./onvif.ts',null,['OnvifDriver']],
  ['../engine/device_enrichment.ts',null,['classifySubnet']],
  ['../../shared/network_relationship.ts',null,['DIFFERENT_NETWORK_MESSAGE']],
];
const TYPE_USES=[[2,'EvidenceProvenance'],[3,'DiscoveryContext'],[4,'WsDiscoveryEvidence'],[7,'RemoteInfo'],[8,'Device'],[8,'NICInfo']];
const EXPORTS=['ONVIF_MULTICAST_ADDRESS','ONVIF_DISCOVERY_PORT','DEFAULT_DISCOVERY_WINDOW_MS','mergeDiscoveredDevice','NodeOnvifWsDiscoveryTransport'];
const SEPARATION=Object.freeze({capture:'fresh current-source/stager-options observation; not recovered historical staging',
  previousFiveRecords:'separate verbatimModuleSyntax-profile captures; not replaced or reinterpreted',historicalAdmissionReused:false,actualStagingInvoked:false});
const LIMITATIONS=Object.freeze([
  'This reproduces only the measured current stager compiler call for this .ts caller; no full stage, runtime linking or module execution occurred.',
  'Supplied options contain exactly four keys. TypeScript internal defaults/forced transpile settings are not tsconfig inheritance.',
  'No transport/socket construction, camera discovery, multicast, dependency loading or production integration is authorized.',
  'Compiler authenticity, pinned/native mapped-image consumption, dependency closure, CommonJS/ESM interoperability and runtime equivalence remain unproven.',
  'Type-reference observations and fixed-profile header recognition are not general name-resolution or JavaScript-parser proofs.',
  'Retained source/stager texts and hashes are data, not executable admission; all 29 obligations remain open.',
]);
const PINS=[
  [
    "src/core/drivers/ws_discovery_transport.ts",
    28253,
    "a8f14c6a21483d63c479f4f82e6f9a6d610274ca0bbce147565b1bb3e147a9b2"
  ],
  [
    "src/shared/identity_policy.ts",
    3176,
    "b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614"
  ],
  [
    "src/shared/address_validation.ts",
    1168,
    "e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc"
  ],
  [
    "src/shared/evidence_provenance.ts",
    450,
    "21e754461ddedd5b8558fcd4aa848a2cac95f9392d665a20d8558d1d24eb44a9"
  ],
  [
    "src/shared/discovery_session.ts",
    2342,
    "977a4cf16388eb2cf5e6d9a72d0afd232f5fb5ddc6ff066b3d25d9295f12580f"
  ],
  [
    "src/core/drivers/ws_discovery_evidence.ts",
    4828,
    "ab7e9132eb534e1ef5ad0e5106947edcf6cec8feab3f3c1e3e8e752c5243dd79"
  ],
  [
    "src/core/drivers/ws_discovery_hello.ts",
    9532,
    "d557cc577d2fddaf31af7dacde810399f2bf91f63fc6104a72832153c84b9587"
  ],
  [
    "src/types/index.ts",
    14131,
    "d927701de585f24a11af932822db67349dd209240e4f21e0100a560bcab9bb32"
  ],
  [
    "src/core/drivers/onvif.ts",
    10262,
    "2a477264cedab7fa8b21ddf34776ed2d2a4e9caa42901b329ef06bfcf545f28f"
  ],
  [
    "src/core/engine/device_enrichment.ts",
    10196,
    "02bf870a71355514d13f1cd9ab14c4966051e97e7913732cfa3a3f1c5161bfa8"
  ],
  [
    "src/shared/network_relationship.ts",
    3604,
    "680d79404729f44b135a6774590ac0db70967bf232b3e38bd7515903fce29922"
  ],
  [
    "scripts/stage-backend.cjs",
    24741,
    "1776a2e8483f179c6b91270ddaa7ccd170f99eb9f3c6b8634b0f50bcb85b27ab"
  ],
  [
    "scripts/payload-byte-catalog.cjs",
    14803,
    "016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d"
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
    "node_modules/@types/node/package.json",
    4274,
    "1e6d3bbbc5082745123d236b38dce0eacdab987d4ac9e57e299e55f780c170de"
  ],
  [
    "node_modules/@types/node/dgram.d.ts",
    28114,
    "b2ade7657e2db96d18315694789eff2ddd3d8aea7215b181f8a0b303277cc579"
  ],
  [
    "node_modules/fast-xml-parser/package.json",
    1754,
    "3f968107034f562a74e322144bdaca1fec01b411cfb2662dcf65d10334d7e56f"
  ],
  [
    "node_modules/fast-xml-parser/src/fxp.js",
    259,
    "cde203552741b223053d58c5a7f629158dfbf9a2b694fda286ecec832158656b"
  ],
  [
    "node_modules/fast-xml-parser/src/validator.js",
    14396,
    "39576ba88aa380b591db3aac305d49bf922138d03a3ea83a2d11069109354707"
  ],
  [
    "node_modules/fast-xml-parser/src/util.js",
    2371,
    "7f12aaf523cce6a9ed6b8a6ead2b93116d4f79ead6201726cc7f5ab648fa6f2d"
  ],
  [
    "node_modules/fast-xml-parser/src/ignoreAttributes.js",
    611,
    "7e6a4bab0fb0eae6495cbdfa0aa0f1d20fd5ab4eec68b72749d12aa4dcc1d43f"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlparser/XMLParser.js",
    2120,
    "ec56754198d84d73cceff5247566fb861e9d1939185fd96eb83a115c9e67f886"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js",
    4685,
    "1a14c4879587a2ffd6d95abfd95baee05c70312ea51e7dda4c609f5e51b0dc1b"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js",
    26519,
    "3375723415ccaba97c0d874b40766af5efa3b990d91e1aabead0e05bae672531"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlparser/xmlNode.js",
    692,
    "f02e93afcb22144ede06ffab0a78f3c8178cfee542603d871188a1c54a7f7053"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js",
    14449,
    "cdf3fdd4acd30556e291cfdeecf820feee08a0fe0f3ca7832e55932bad2dba1f"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlparser/node2json.js",
    3156,
    "7fab80efb6e27b05323c685354ac9a752e8905e66b6d828e00af46a6d8bc2c5a"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js",
    10438,
    "5e35cc7de8de2ba77da91b4071609a82651b13ed739199da46cb41aa7d9e1bdc"
  ],
  [
    "node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js",
    5704,
    "49d07a60358db2263eb8e781aacffd456ece2f3769a04ac416c9bcc9e38831b9"
  ],
  [
    "node_modules/strnum/package.json",
    616,
    "04ffe4ae62946a51ddd85ee255789125240595668e3b1dcf8f69751009a163cb"
  ],
  [
    "node_modules/strnum/strnum.js",
    4333,
    "aafd1749301117d2be8e439197bbed411be81b879889238f2b9ee4fa0d271fa1"
  ]
];
// Fresh scoped emission data; never historical admission or staging authority.
const OUTPUT_REFERENCES=Object.freeze([
  Object.freeze([30198,'fbf94fb6a2c9f70ce058cd434dbdeb4a17152484c8f416ec6632df37a933f62a']),
  Object.freeze([30224,'a97fae6a4867a6a1509d5dec5f2a4e6ef1c43a46f74286c0a646e92b9c201783']),
]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Stager compatibility denied: '+reason),{code:'WS_STAGER_DENIED',reason});}
function shape(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort()),'record schema');}
function checkWsBudget(kind,bytes){check(Object.hasOwn(CAPS,kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=CAPS[kind],'size budget '+kind);return bytes;}
function boundedText(text,kind){check(typeof text==='string','text required');checkWsBudget(kind,Buffer.byteLength(text));check(Buffer.from(text).toString('utf8')===text,'UTF8 roundtrip');return text;}
function readBounded(file,cap){
  for(let p=path.resolve(file);;p=path.dirname(p)){check(!fs.lstatSync(p).isSymbolicLink(),'linked input');if(path.dirname(p)===p)break;}
  const fd=fs.openSync(file,'r');try{
    const before=fs.fstatSync(fd,{bigint:true});check(before.isFile()&&before.size>0n&&before.size<=BigInt(cap),'file bound');
    const bytes=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);check(n>0,'truncated input');offset+=n;}
    check(fs.readSync(fd,Buffer.alloc(1),0,1,null)===0,'grown input');
    for(const s of [fs.fstatSync(fd,{bigint:true}),fs.statSync(file,{bigint:true})])check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]),'changed input');
    check(Buffer.from(bytes.toString('utf8')).equals(bytes),'input UTF8');return bytes;
  }finally{fs.closeSync(fd);}
}
function snapshot(file,text,kind){boundedText(text,kind);const pin=PINS.find(r=>r[0]===file);check(pin&&Buffer.byteLength(text)===pin[1]&&sha(text)===pin[2],'snapshot pin '+file);return {path:file,text,bytes:Buffer.byteLength(text),sha256:sha(text)};}
function sourceBindings(slot){const [,local,names]=CONTRACT[slot];return [...(local?[{kind:'default',imported:'default',local,typeOnly:false}]:[]),...names.map(n=>({kind:'named',imported:n,local:n,typeOnly:false}))];}
function baseSpec(slot){return CONTRACT[slot][0].replace(/\.ts$/,'.js');}
function mappedSlot(spec,mode){const matches=CONTRACT.flatMap((_,i)=>(mode==='source'?CONTRACT[i][0]:mode==='redirected'&&i===0?TARGET:baseSpec(i))===spec?[i]:[]);check(matches.length===1,'unique source specifier mapping');return matches[0];}
function makeRow(slot,sourceSlot,specifier,bindings,start,end){return {slot,sourceSlot,specifier,clauseTypeOnly:false,bindings,byteStart:start,byteEnd:end};}
function validateRows(rows,mode){
  check(rows.length>0&&rows.length<=12&&new Set(rows.map(r=>r.sourceSlot)).size===rows.length,'unique declarations');
  check(rows.every((r,i)=>i===0||r.sourceSlot>rows[i-1].sourceSlot),'original declaration order');
  for(const r of rows){const allowed=sourceBindings(r.sourceSlot);check(r.bindings.length>0&&r.bindings.every((b,i)=>allowed.some(a=>same(a,b))&&(i===0||allowed.findIndex(a=>same(a,b))>allowed.findIndex(a=>same(a,r.bindings[i-1])))),'retained ordered binding subset');}
  if(mode==='source')check(rows.length===12&&rows.every((r,i)=>r.sourceSlot===i&&same(r.bindings,sourceBindings(i))),'12 source declarations/bindings');
  else{
    for(const [sourceSlot,local]of [[1,'os'],[7,'dgram']])check(rows.some(r=>r.sourceSlot===sourceSlot&&r.bindings.some(b=>b.kind==='default'&&b.local===local)),'default binding preserved');
    check(rows.some(r=>r.sourceSlot===0&&same(r.bindings,sourceBindings(0))),'sole island bindings retained');
  }
}
// Independent compiler-free recognizer: parses actual contiguous import lines;
// counts and erasures come from these bytes, never producer offsets.
function locateHeader(text,mode){
  check(['source','original','redirected'].includes(mode),'header mode');boundedText(text,mode==='source'?'source':'output');
  const rows=[];let cursor=0;
  while(text.startsWith('import ',cursor)){
    check(rows.length<12,'bounded header declarations');const end=text.indexOf('\n',cursor);check(end>=0,'complete header line');
    let line=text.slice(cursor,end);if(mode==='source'){check(line.endsWith('\r'),'source CRLF');line=line.slice(0,-1);}
    const m=/^import\s+(?:([A-Za-z_$][\w$]*)\s*(?:,\s*)?)?(?:\{([^}\r\n]+)\}\s*)?from\s*(['"])([^'"\\\r\n]+)\3;$/.exec(line);check(m&&(m[1]||m[2]),'default/named header form');
    const bindings=m[1]?[{kind:'default',imported:'default',local:m[1],typeOnly:false}]:[];
    if(m[2])for(const raw of m[2].split(',')){const n=/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(raw.trim());check(n,'named binding form');bindings.push({kind:'named',imported:n[1],local:n[2]??n[1],typeOnly:false});}
    const sourceSlot=mappedSlot(m[4],mode),start=Buffer.byteLength(text.slice(0,cursor+line.indexOf(m[3])+1));
    rows.push(makeRow(rows.length,sourceSlot,m[4],bindings,start,start+Buffer.byteLength(m[4])));cursor=end+1;
  }
  validateRows(rows,mode);check((text.match(/\bimport\b/g)||[]).length===rows.length&&!/\brequire\s*\(/.test(text),'no extra dynamic/static/require requests');
  if(mode!=='source')check(same([...text.matchAll(/^export (?:const|function|class) ([A-Za-z_$][\w$]*)/gm)].map(m=>m[1]),EXPORTS),'runtime export contract');
  return rows;
}
function optionSite(text){
  const marker='compilerOptions: {',start=text.indexOf(marker);check(start>=0&&text.indexOf(marker,start+1)===-1,'one stager option site');
  const end=text.indexOf('}',start)+1;check(end>start,'option site end');
  const raw=text.slice(start,end),inner=raw.slice(marker.length,-1),expressions=inner.split(',').map(part=>{const colon=part.indexOf(':');check(colon>0,'option property');return [part.slice(0,colon).trim(),part.slice(colon+1).trim().replace(/\s+/g,' ')];});
  check(same(expressions,EXPRESSIONS),'exact stager option expressions');
  const prefix=text.slice(0,start);check(prefix.endsWith("const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), { fileName: source, reportDiagnostics: true,\n          ")||prefix.endsWith("const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), { fileName: source, reportDiagnostics: true,\r\n          "),'stager transpile call context');
  return {text:raw,bytes:Buffer.byteLength(raw),sha256:sha(raw),byteStart:Buffer.byteLength(prefix),byteEnd:Buffer.byteLength(text.slice(0,end)),expressions,selectedModuleBranch:'.ts caller selects ESNext; .cts branch is not invoked'};
}
function correspondence(source,before,after){return source.map(r=>{
  const original=before.find(o=>o.sourceSlot===r.sourceSlot)??null,redirected=after.find(o=>o.sourceSlot===r.sourceSlot)??null,retained=original?.bindings??[];
  return {sourceSlot:r.sourceSlot,sourceSpecifier:r.specifier,sourceBindings:r.bindings,emittedSlot:original?.slot??null,
    disposition:original?'observed-retained-declaration':'observed-elided-declaration',
    retainedBindings:retained,erasedBindings:r.bindings.filter(b=>!retained.some(a=>same(a,b))),original,redirected};
});}
function typeObservations(sourceText,before){
  const body=sourceText.split('\n').slice(12).join('\n');
  // Fixed-source census: omit literal/comment tokens (including whole templates).
  // AST agreement below is required; this is not a general TypeScript lexer.
  let clean='',cursor=0;
  while(cursor<body.length){
    const code=body.charCodeAt(cursor);
    if([34,39,96].includes(code)){
      cursor++;while(cursor<body.length){if(body.charCodeAt(cursor)===92){cursor+=2;continue;}if(body.charCodeAt(cursor++)===code)break;}
      clean+=' ';continue;
    }
    if(body.slice(cursor,cursor+2)==='//'){const end=body.indexOf('\n',cursor+2);cursor=end<0?body.length:end;continue;}
    if(body.slice(cursor,cursor+2)==='/*'){const end=body.indexOf('*/',cursor+2);check(end>=0,'closed source comment');cursor=end+2;continue;}
    clean+=body[cursor++];
  }
  return TYPE_USES.map(([sourceSlot,name])=>({sourceSlot,imported:name,local:name,explicitTypeOnly:false,
    sourceTypeReferenceOccurrences:(clean.match(new RegExp('\\b'+name+'\\b','g'))||[]).length,
    sourceValueReferenceOccurrences:0,observation:before.some(r=>r.sourceSlot===sourceSlot&&r.bindings.some(b=>b.imported===name))?'retained':'erased'}));
}
function rewriteWsIsland(text,ranges){
  const row=locateHeader(text,'original').find(r=>r.sourceSlot===0),bytes=Buffer.from(text);
  const expected={sourceSlot:0,emittedSlot:row.slot,byteStart:row.byteStart,byteEnd:row.byteEnd,from:row.specifier,to:TARGET};
  check(Array.isArray(ranges)&&ranges.length===1,'one authorized range; duplicates/overlap denied');const r=ranges[0];shape(r,Object.keys(expected));
  check(Number.isSafeInteger(r.byteStart)&&Number.isSafeInteger(r.byteEnd)&&r.byteStart>=0&&r.byteStart<r.byteEnd&&r.byteEnd<=bytes.length,'range bounds');
  check(same(r,expected)&&bytes.subarray(r.byteStart,r.byteEnd).equals(Buffer.from(r.from)),'fresh range correspondence');
  const size=bytes.length-Buffer.byteLength(r.from)+Buffer.byteLength(r.to);checkWsBudget('output',size);
  return Buffer.concat([bytes.subarray(0,r.byteStart),Buffer.from(r.to),bytes.subarray(r.byteEnd)],size).toString('utf8');
}
function proof(original,redirected,before,after){
  const a=Buffer.from(original),b=Buffer.from(redirected),left=before.find(r=>r.sourceSlot===0),right=after.find(r=>r.sourceSlot===0),delta=Buffer.byteLength(TARGET)-Buffer.byteLength(left.specifier);
  check(before.length===after.length&&left.byteStart===right.byteStart&&b.length===a.length+delta,'replacement count/start/delta');
  for(let i=0;i<before.length;i++)check(before[i].sourceSlot===after[i].sourceSlot&&same(before[i].bindings,after[i].bindings)&&after[i].byteStart===before[i].byteStart+(i>left.slot?delta:0),'all binding/order/byte shifts preserved');
  const prefix=a.subarray(0,left.byteStart),suffix=a.subarray(left.byteEnd);check(prefix.equals(b.subarray(0,right.byteStart))&&suffix.equals(b.subarray(right.byteEnd)),'unchanged prefix/suffix');
  return {kind:'single-UTF8-import-content-splice',sourceSlot:0,emittedSlot:left.slot,from:left.specifier,to:TARGET,originalStart:left.byteStart,originalEnd:left.byteEnd,redirectedStart:right.byteStart,redirectedEnd:right.byteEnd,
    removedBytes:left.byteEnd-left.byteStart,insertedBytes:right.byteEnd-right.byteStart,deltaBytes:delta,
    unchanged:[{region:'prefix',bytes:prefix.length,sha256:sha(prefix)},{region:'suffix',bytes:suffix.length,sha256:sha(suffix)}],mergedDeclarations:false};
}
function inspectAST(ts,text,mode){
  const source=mode==='source';boundedText(text,source?'source':'output');const tree=ts.createSourceFile(source?SOURCE:OUTPUT,text,ts.ScriptTarget.ES2022,true,source?ts.ScriptKind.TS:ts.ScriptKind.JS);
  check(tree.parseDiagnostics.length===0,'AST syntax');const imports=tree.statements.filter(ts.isImportDeclaration);check(imports.every((n,i)=>tree.statements[i]===n),'contiguous AST imports');
  const rows=imports.map((n,slot)=>{
    const c=n.importClause;check(c&&!c.isTypeOnly&&!n.attributes&&ts.isStringLiteral(n.moduleSpecifier),'AST import form');
    const bindings=c.name?[{kind:'default',imported:'default',local:c.name.text,typeOnly:false}]:[];
    if(c.namedBindings){check(ts.isNamedImports(c.namedBindings),'AST named form');for(const e of c.namedBindings.elements)bindings.push({kind:'named',imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly===true});}
    const sourceSlot=mappedSlot(n.moduleSpecifier.text,mode);return makeRow(slot,sourceSlot,n.moduleSpecifier.text,bindings,Buffer.byteLength(text.slice(0,n.moduleSpecifier.getStart(tree)+1)),Buffer.byteLength(text.slice(0,n.moduleSpecifier.end-1)));
  });validateRows(rows,mode);
  const types=new Map(TYPE_USES.map(([,n])=>[n,{type:0,value:0}]));
  const visit=n=>{
    check(!ts.isImportEqualsDeclaration(n)&&!ts.isImportTypeNode(n),'unsupported import syntax');if(ts.isExportDeclaration(n))check(!n.moduleSpecifier,'unexpected re-export');
    if(ts.isCallExpression(n))check(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!(ts.isIdentifier(n.expression)&&n.expression.text==='require'),'dynamic/require request');
    if(source&&ts.isIdentifier(n)&&types.has(n.text)&&!ts.isImportSpecifier(n.parent)){
      let parent=n.parent;while(parent&&!ts.isTypeNode(parent)&&!ts.isSourceFile(parent))parent=parent.parent;
      types.get(n.text)[parent&&ts.isTypeNode(parent)?'type':'value']++;
    }
    ts.forEachChild(n,visit);
  };visit(tree);
  if(source)for(const [name,counts]of types)check(counts.type>0&&counts.value===0&&counts.type===typeObservations(text,[]).find(r=>r.imported===name).sourceTypeReferenceOccurrences,'fixed type-only use '+name);
  return rows;
}
function inspectStagerAST(ts,text){
  const site=optionSite(text),tree=ts.createSourceFile(STAGER,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);check(tree.parseDiagnostics.length===0,'stager syntax');
  const found=[];const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='ts.transpileModule')found.push(n);ts.forEachChild(n,visit);};visit(tree);
  check(found.length===1&&found[0].arguments.length===2&&ts.isObjectLiteralExpression(found[0].arguments[1]),'stager call AST');
  const prop=found[0].arguments[1].properties.find(p=>p.name?.getText(tree)==='compilerOptions');check(prop&&ts.isObjectLiteralExpression(prop.initializer),'stager option AST');
  check(same(prop.initializer.properties.map(p=>[p.name.getText(tree),p.initializer.getText(tree).replace(/\s+/g,' ')]),EXPRESSIONS),'AST exact option properties');return site;
}
function output(variant,text){boundedText(text,'output');return {variant,path:OUTPUT,text,bytes:Buffer.byteLength(text),sha256:sha(text),filesystemIdentity:null,admission:null};}
function verifyWsEvidence(json,expectedSha256){
  boundedText(json,'record');check(typeof expectedSha256==='string'&&/^[a-f0-9]{64}$/.test(expectedSha256)&&sha(json)===expectedSha256,'external capture digest');
  let e;try{e=JSON.parse(json);}catch{check(false,'record JSON');}check(JSON.stringify(e)===json,'canonical record');
  shape(e,['profile','status','sourceSnapshot','stagerSnapshot','stagerOptionSite','observations','compiler','sourceImports','outputs','imports','correspondence','typeUseObservations','derivation','exports','separation','limits','budgetRationale','limitations','historicalAdmission','authoritativeBaseline','ceiling','achievedPayloadCount','remainingCallerObligations',...FLAGS]);
  check(e.profile===PROFILE&&e.status==='blocked'&&FLAGS.every(k=>e[k]===false)&&e.historicalAdmission===null,'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(same(e.limits,CAPS)&&same(e.budgetRationale,REASONS)&&same(e.limitations,LIMITATIONS)&&same(e.separation,SEPARATION)&&same(e.exports,EXPORTS),'limits/separation/limitations');
  for(const [key,file,kind]of [['sourceSnapshot',SOURCE,'source'],['stagerSnapshot',STAGER,'stager']]){shape(e[key],['path','text','bytes','sha256']);check(same(e[key],snapshot(file,e[key].text,kind)),'snapshot correspondence');}
  check(same(e.stagerOptionSite,optionSite(e.stagerSnapshot.text)),'independent stager site');
  const source=locateHeader(e.sourceSnapshot.text,'source');check(same(e.sourceImports,source),'independent source imports');
  const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:'node.exe'}];
  check(Array.isArray(e.observations)&&e.observations.length===refs.length,'38 observations');
  for(let i=0;i<refs.length;i++){const r=e.observations[i];shape(r,['root','path','size','sha256','identity']);shape(r.identity,['dev','ino','size','mtimeNs','ctimeNs']);
    check(r.root===refs[i].root&&r.path===refs[i].path&&Number.isSafeInteger(r.size)&&r.size>0&&r.size<=134217728&&/^[a-f0-9]{64}$/.test(r.sha256)&&r.identity.size===String(r.size)&&Object.values(r.identity).every(v=>typeof v==='string'&&/^\d{1,24}$/.test(v)),'measurement schema');
    if(i<PINS.length)check(r.size===PINS[i][1]&&r.sha256===PINS[i][2],'pinned measurement');}
  shape(e.compiler,['version','entry','method','suppliedOptions','tsconfigDisposition','defaultsDisposition','node','repeatOutputMatched']);shape(e.compiler.node,['executable','version']);
  check(e.compiler.version==='5.9.3'&&e.compiler.entry==='node_modules/typescript/lib/typescript.js'&&e.compiler.method==='transpileModule; no resolution, bundling, typecheck or evaluation'&&same(e.compiler.suppliedOptions,CONFIG)&&e.compiler.tsconfigDisposition==='measured context only; never parsed into compilerOptions'&&e.compiler.defaultsDisposition==='TypeScript internal defaults/forced transpile settings; not extra supplied flags'&&e.compiler.node.executable==='node.exe'&&/^v\d+\.\d+\.\d+$/.test(e.compiler.node.version)&&e.compiler.repeatOutputMatched===true,'exact compiler profile');
  check(Array.isArray(e.outputs)&&e.outputs.length===2,'two outputs');
  const headers=e.outputs.map((r,i)=>{shape(r,['variant','path','text','bytes','sha256','filesystemIdentity','admission']);check(r.variant===(i?'redirected':'original')&&r.path===OUTPUT&&r.filesystemIdentity===null&&r.admission===null,'output identity');boundedText(r.text,'output');check(r.bytes===Buffer.byteLength(r.text)&&r.sha256===sha(r.text),'output measurement');return locateHeader(r.text,i?'redirected':'original');});
  check(same(e.imports,headers)&&same(e.correspondence,correspondence(source,...headers)),'independent declaration/binding correspondence');
  check(same(e.typeUseObservations,typeObservations(e.sourceSnapshot.text,headers[0])),'actual type-use emission observations');
  const derivation=proof(e.outputs[0].text,e.outputs[1].text,...headers);check(same(e.derivation,derivation),'independent derivation');
  check(e.outputs.every((r,i)=>r.bytes===OUTPUT_REFERENCES[i][0]&&r.sha256===OUTPUT_REFERENCES[i][1]),'fresh observed output reference');
  return freeze({status:'blocked',independentByteVerification:true,compilerLoaded:false,generatedExecution:false,recordBytes:Buffer.byteLength(json),recordSha256:expectedSha256,
    observedInputs:refs.length,sourceDeclarations:source.length,emittedDeclarations:headers[0].length,typeUseObservations:e.typeUseObservations,outputs:e.outputs.map(({text,...r})=>r),derivation,
    ...Object.fromEntries(FLAGS.map(k=>[k,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29});
}
function readWsEvidence(file,hash){return verifyWsEvidence(readBounded(file,CAPS.record).toString('utf8'),hash);}
function prepareWsCompatibility(repo,optIn){
  check(optIn===true,'explicit compile-only opt-in');check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION&&['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(k=>!process.env[k]),'inherited overrides/execution');
  check(process.execArgv.every(a=>['--test','--test-isolation=none','--test-reporter=tap'].includes(a)),'parent flags');repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs'),roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}];
  const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:path.basename(process.execPath)}],read=()=>observeCatalogFiles(roots,refs),observations=read();
  for(let i=0;i<PINS.length;i++)check(observations[i]?.size===PINS[i][1]&&observations[i].sha256===PINS[i][2],'checkpoint input '+PINS[i][0]);const verifyInputs=()=>check(same(read(),observations),'current input measurements');
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'compiler resolution');
  check(!require.cache[entry],'compiler already loaded');const cached=new Set(Object.keys(require.cache));
  try{
    const ts=req('typescript');check(ts.version==='5.9.3','compiler version');check(Object.keys(require.cache).filter(k=>!cached.has(k)).every(k=>k===entry),'external compiler dependency');
    const consumed=file=>{const kind=file===SOURCE?'source':file===STAGER?'stager':'dependency',b=readBounded(path.join(repo,file),CAPS[kind]),pin=PINS.find(r=>r[0]===file);check(b.length===pin[1]&&sha(b)===pin[2],'consumed bytes '+file);return b.toString('utf8');};
    const source=consumed(SOURCE),stager=consumed(STAGER),sourceImports=inspectAST(ts,source,'source');check(same(sourceImports,locateHeader(source,'source')),'independent source parser agreement');const stagerOptionSite=inspectStagerAST(ts,stager);
    // Exactly the four supplied options in the measured stager call. No tsconfig read,
    // verbatimModuleSyntax, newline override, noResolve or helper override is supplied.
    const compilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true};check(same(Object.keys(compilerOptions),Object.keys(CONFIG)),'exact supplied option keys');
    const emit=()=>ts.transpileModule(source,{fileName:SOURCE,compilerOptions,reportDiagnostics:true});
    const first=emit();boundedText(first.outputText,'output');const repeat=emit();boundedText(repeat.outputText,'output');check(!first.diagnostics?.length&&!repeat.diagnostics?.length&&!first.sourceMapText&&!repeat.sourceMapText&&first.outputText===repeat.outputText,'emit diagnostics/extra output/repeat');
    const original=first.outputText,before=inspectAST(ts,original,'original');check(same(before,locateHeader(original,'original')),'independent original parse agreement');
    const r=before.find(r=>r.sourceSlot===0),redirected=rewriteWsIsland(original,[{sourceSlot:0,emittedSlot:r.slot,byteStart:r.byteStart,byteEnd:r.byteEnd,from:r.specifier,to:TARGET}]),after=inspectAST(ts,redirected,'redirected');check(same(after,locateHeader(redirected,'redirected')),'independent redirected parse agreement');
    const evidence=freeze({profile:PROFILE,status:'blocked',sourceSnapshot:snapshot(SOURCE,source,'source'),stagerSnapshot:snapshot(STAGER,stager,'stager'),stagerOptionSite,observations,
      compiler:{version:ts.version,entry:'node_modules/typescript/lib/typescript.js',method:'transpileModule; no resolution, bundling, typecheck or evaluation',suppliedOptions:CONFIG,tsconfigDisposition:'measured context only; never parsed into compilerOptions',defaultsDisposition:'TypeScript internal defaults/forced transpile settings; not extra supplied flags',node:{executable:path.basename(process.execPath),version:process.version},repeatOutputMatched:true},
      sourceImports,outputs:[output('original',original),output('redirected',redirected)],imports:[before,after],correspondence:correspondence(sourceImports,before,after),typeUseObservations:typeObservations(source,before),derivation:proof(original,redirected,before,after),exports:EXPORTS,separation:SEPARATION,limits:CAPS,budgetRationale:REASONS,limitations:LIMITATIONS,
      historicalAdmission:null,authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(k=>[k,false]))});
    const json=JSON.stringify(evidence);checkWsBudget('record',Buffer.byteLength(json));const sha256=sha(json);verifyInputs();verifyWsEvidence(json,sha256);
    return Object.freeze({evidence,retained:freeze({json,bytes:Buffer.byteLength(json),sha256}),verifyInputs,
      inspectSource(text){return freeze({status:'blocked',executionAuthority:false,imports:inspectAST(ts,text,'source')});},
      assess(candidate){verifyInputs();const result=verifyWsEvidence(JSON.stringify(candidate),sha256);verifyInputs();return result;},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,compilerCacheRestored:true})});
  }finally{if(!cached.has(entry))delete require.cache[entry];}
}
module.exports={prepareWsCompatibility,rewriteWsIsland,verifyWsEvidence,readWsEvidence,checkWsBudget};
if(require.main===module){const [mode,file,hash,...extra]=process.argv.slice(2);check(mode==='--verify-retained'&&typeof file==='string'&&extra.length===0,'data-only invocation');console.log(JSON.stringify(readWsEvidence(file,hash)));}
