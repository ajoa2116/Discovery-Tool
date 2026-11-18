// Test-only static loading boundary. Dependency texts are data and are never loaded.
'use strict';
const PINS=[
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
    "scripts/payload-byte-catalog.cjs",
    14803,
    "016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d"
  ],
  [
    "scripts/staged-backend-review.cjs",
    49224,
    "8d4a85ad6503332350c73043fbd53850816451490b330c23966dddeed273b9f5"
  ]
];
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const OWN=['src/test/support/fast_xml_parser_closure_fixture.cjs','src/test/fast_xml_parser_closure.test.cjs'];
const BASE='node_modules/fast-xml-parser/src/',STRNUM='node_modules/strnum/strnum.js';
const PACKAGE_SCOPES=Object.freeze(['node_modules/fast-xml-parser/src/package.json','node_modules/fast-xml-parser/src/xmlparser/package.json','node_modules/fast-xml-parser/src/xmlbuilder/package.json']);
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const CAPS=Object.freeze({file:32768,input:262144,record:196608});
const EDGES=[
 ['fxp.js','./validator','validator.js'],['fxp.js','./xmlparser/XMLParser','xmlparser/XMLParser.js'],['fxp.js','./xmlbuilder/json2xml','xmlbuilder/json2xml.js'],
 ['validator.js','./util','util.js'],
 ['xmlparser/XMLParser.js','./OptionsBuilder','xmlparser/OptionsBuilder.js'],['xmlparser/XMLParser.js','./OrderedObjParser','xmlparser/OrderedObjParser.js'],['xmlparser/XMLParser.js','./node2json','xmlparser/node2json.js'],['xmlparser/XMLParser.js','../validator','validator.js'],
 ['xmlparser/OptionsBuilder.js','../util','util.js'],
 ['xmlparser/OrderedObjParser.js','../util','util.js'],['xmlparser/OrderedObjParser.js','./xmlNode','xmlparser/xmlNode.js'],['xmlparser/OrderedObjParser.js','./DocTypeReader','xmlparser/DocTypeReader.js'],['xmlparser/OrderedObjParser.js','strnum',STRNUM],['xmlparser/OrderedObjParser.js','../ignoreAttributes','ignoreAttributes.js'],
 ['xmlparser/DocTypeReader.js','../util','util.js'],['xmlbuilder/json2xml.js','./orderedJs2Xml','xmlbuilder/orderedJs2Xml.js'],['xmlbuilder/json2xml.js','../ignoreAttributes','ignoreAttributes.js'],
].map(([from,request,to])=>({from:BASE+from,request,to:to===STRNUM?to:BASE+to}));
const LIMITATIONS=[
 'Fixed pinned-source recognizer, not a general JavaScript parser or runtime resolver proof.',
 'Static eager entrypoint graph only; package CLI, alternate entries and application closure are outside scope.',
 'No dependency module is loaded. CommonJS/ESM named-export linking and runtime behavior remain untested.',
 'File identities and hashes are observations, not compiler/package authenticity or a loaded-byte consumption lease.',
 'Historical reviewed-path membership grants no admission. Staged selection and actual loaded-byte consumption are UNVERIFIED.',
 'Master Blueprint v1.1 and security gates unchanged; baseline 825, ceiling 64, all 29 caller obligations open.',
];
const fail=s=>{throw Error('Static closure rejected: '+s);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const equal=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))fail(label);};
function bounded(value,cap=CAPS.record){const text=JSON.stringify(value);if(Buffer.byteLength(text)>cap)fail('record overflow');return text;}
function inspectRequests(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>CAPS.file)fail('source overflow');
 // Recognize only standalone const-require statements in the initial header.
 // Compare every raw require/import token too: unfamiliar syntax fails closed.
 const rows=[];let end=0;
 const re=/^const[ \t]+(?:[A-Za-z_$][\w$]*|\{[^\r\n{}]+\})[ \t]*=[ \t]*require\((["'])([^"'\r\n]+)\1\)[ \t]*;?[ \t]*\r?$/gm;
 for(const m of text.matchAll(re)){
  const gap=text.slice(end,m.index).replace(/\/\/[^\r\n]*/g,'').replace(/['"]use strict['"];?/g,'');
  if(gap.trim())fail('non-unconditional header request');
  const offset=m.index+m[0].indexOf('require');rows.push({request:m[2],byteStart:Buffer.byteLength(text.slice(0,offset)),line:text.slice(0,offset).split('\n').length});end=m.index+m[0].length;
 }
 if((text.match(/\brequire\b/g)||[]).length!==rows.length||/\bimport\b|\beval\s*\(|\bFunction\s*\(/.test(text))fail('computed/dynamic/unsupported request');
 return rows;
}
function resolveEdge(repo,from,request){
 const exists=p=>fs.existsSync(path.join(repo,...p.split('/')));
 function relativeTarget(base){
  const candidates=[base,base+'.js',base+'.json',base+'.node'];
  const present=candidates.filter(exists);
  if(present.length!==1||present[0]!==base+'.js')fail('missing/shadowed relative target');
  return base+'.js';
 }
 if(request.startsWith('.'))return relativeTarget(path.posix.normalize(path.posix.join(path.posix.dirname(from),request)));
 if(request!=='strnum')fail('unexpected dependency target');
 for(let dir=path.posix.dirname(from);;dir=path.posix.dirname(dir)){
  if(path.posix.basename(dir)!=='node_modules'){
   const candidate=(dir==='.'?'':dir+'/')+'node_modules/strnum';
   if(['.js','.json','.node'].some(ext=>exists(candidate+ext)))fail('shadowed strnum file');
   if(exists(candidate)){
    if(candidate!=='node_modules/strnum'||!exists(candidate+'/package.json')||!exists(STRNUM))fail('shadowed strnum');
    return STRNUM;
   }
  }
  if(dir==='.')break;
 }
 fail('missing strnum');
}
function current(repo){
 checkPackageScopes(repo);
 const paths=[...PINS.map(p=>p[0]),...OWN];
 const rows=observeCatalogFiles([{id:'repository',path:repo}],paths.map(p=>({root:'repository',path:p})));
 for(const row of rows){if(row.size>CAPS.input)fail('input overflow');const pin=PINS.find(p=>p[0]===row.path);if(pin&&(row.size!==pin[1]||row.sha256!==pin[2]))fail('changed pinned measurement '+row.path);}
 return rows;
}
function checkPackageScopes(repo){
 for(const name of PACKAGE_SCOPES){
  const target=path.join(repo,...name.split('/')),parent=path.dirname(target);
  // lstat detects dangling links too. Only ENOENT for the leaf is accepted;
  // missing/unreadable/non-directory/reparse parents and other errors reject.
  const before=fs.lstatSync(parent,{bigint:true});
  if(!before.isDirectory()||before.isSymbolicLink())fail('ambiguous package scope '+name);
  try{fs.lstatSync(target);}
  catch(error){
   if(error.code!=='ENOENT')fail('unreadable package scope '+name);
   const after=fs.lstatSync(parent,{bigint:true});
   if(!after.isDirectory()||after.isSymbolicLink()||['dev','ino','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))fail('changed package scope '+name);
   continue;
  }
  // Contents, type and readability cannot authorize an unexpected manifest.
  fail('unexpected nested package manifest '+name);
 }
}
function derive(repo,observations){
 const read=p=>fs.readFileSync(path.join(repo,...p.split('/')),'utf8');
 const snapshots=PINS.filter(p=>p[0].startsWith('node_modules/')).map(([p])=>{const text=read(p);if(Buffer.byteLength(text)>CAPS.file)fail('source overflow');return {path:p,text};});
 const metadata=p=>JSON.parse(snapshots.find(s=>s.path===p).text);
 const fxp=metadata('node_modules/fast-xml-parser/package.json'),strnum=metadata('node_modules/strnum/package.json'),lock=JSON.parse(read('package-lock.json'));
 if(['.js','.json','.node'].some(ext=>fs.existsSync(path.join(repo,'node_modules','fast-xml-parser'+ext))))fail('shadowed fast-xml-parser entry');
 for(const [name,version,main]of [['fast-xml-parser','4.5.7','./src/fxp.js'],['strnum','1.1.2','strnum.js']]){
  const p=name==='strnum'?strnum:fxp;
  if(p.name!==name||p.version!==version||p.main!==main||p.type!==undefined||p.exports!==undefined||lock.packages['node_modules/'+name]?.version!==version)fail('package version/entrypoint');
 }
 equal(fxp.dependencies,{strnum:'^1.0.5'},'external dependencies');equal(strnum.dependencies??{},{},'strnum dependencies');
 const edges=[];
 for(const s of snapshots.filter(s=>s.path.endsWith('.js')))for(const r of inspectRequests(s.text))edges.push({from:s.path,...r,to:resolveEdge(repo,s.path,r.request)});
 equal(edges.map(({from,request,to})=>({from,request,to})),EDGES,'require edge contract');
 const executable=snapshots.filter(s=>s.path.endsWith('.js')).map(s=>s.path),reachable=new Set([BASE+'fxp.js']);
 for(let i=0;i<13;i++)for(const e of edges)if(reachable.has(e.from))reachable.add(e.to);
 equal([...reachable].sort(),[...executable].sort(),'exact reachable files');
 const review=read('scripts/staged-backend-review.cjs');
 const list=review.match(/const reviewedPackageFiles = \[([\s\S]*?)\n\]/)?.[1];if(!list)fail('review list');
 const reviewed=[...list.matchAll(/'([^']+)'/g)].map(m=>m[1]);
 if(executable.some(p=>reviewed.filter(r=>r===p).length!==1))fail('reviewed path membership');
 equal(current(repo),observations,'changed during observation');
 return {profile:'fast-xml-parser-static-entry-closure-v1',status:'BLOCKED',entrypoint:BASE+'fxp.js',versions:{'fast-xml-parser':'4.5.7',strnum:'1.1.2'},observations,snapshots,edges,
  reviewedPaths:executable,reviewMeaning:'path membership only; no admission',executableFiles:13,requireEdges:17,eagerBuilder:true,externalStrnum:true,
  stagedSelection:'UNVERIFIED',loadedByteConsumption:'UNVERIFIED',historicalAdmissionReused:false,remainingCallerObligations:29,authoritativeBaseline:825,ceiling:64,
  packageScopes:PACKAGE_SCOPES.map(p=>({path:p,status:'ABSENT'})),runtimeLinking:'UNVERIFIED',productionAdmission:'UNVERIFIED',
  limits:CAPS,limitations:LIMITATIONS,...Object.fromEntries(FLAGS.map(f=>[f,false]))};
}
function captureClosure(repo){const evidence=derive(repo,current(repo));return {evidence,json:bounded(evidence)};}
function verifyClosure(repo,bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>CAPS.record)fail('record overflow/type');
 const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))fail('UTF-8');
 const evidence=JSON.parse(text);if(bounded(evidence)!==text)fail('noncanonical record');
 // Independent enumeration/resolution from current measured files; retained edges and offsets are never trusted.
 const expected=derive(repo,current(repo));equal(evidence,expected,'substituted/inconsistent evidence');
 return {status:'BLOCKED',verified:true,recordBytes:bytes.length,recordSha256:hash(bytes),files:13,edges:17};
}
module.exports={captureClosure,verifyClosure,inspectRequests,resolveEdge,bounded,CAPS,FLAGS,PINS};
