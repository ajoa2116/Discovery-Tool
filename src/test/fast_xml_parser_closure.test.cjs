'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Module=require('node:module'),cp=require('node:child_process'),net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const fixture=require('./support/fast_xml_parser_closure_fixture.cjs');
const repo=path.resolve(__dirname,'../..'),clone=v=>JSON.parse(JSON.stringify(v)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v));
test('fixed fast-xml-parser entrypoint static contract',async t=>{
 const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[];let denied=0,capture;
 const patch=(owner,key,value)=>{const before=owner[key];owner[key]=value;restore.push(()=>{owner[key]=before;});};
 const deny=()=>{denied++;throw Error('Forbidden process/network/write/package execution');};
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,key,deny);
 patch(net.Socket.prototype,'connect',deny);patch(net.Server.prototype,'listen',deny);patch(dgram,'createSocket',deny);patch(globalThis,'fetch',deny);
 for(const owner of [http,https])for(const key of ['get','request'])patch(owner,key,deny);
 for(const key of ['writeFileSync','appendFileSync','mkdirSync','rmSync','unlinkSync','renameSync','copyFileSync','createWriteStream'])patch(fs,key,deny);
 const load=Module._load;patch(Module,'_load',function(request,...args){if(!Module.isBuiltin(request))return deny();return load.call(this,request,...args);});
 try{
  capture=fixture.captureClosure(repo);const e=capture.evidence;
  await t.test('21 measured inputs include 15 package files and both new test files',()=>{
   assert.equal(e.observations.length,21);assert.equal(e.snapshots.length,15);assert.equal(e.observations.filter(o=>o.path.startsWith('node_modules/')).reduce((n,o)=>n+o.size,0),92103);
   for(const o of e.observations){assert.equal(o.sha256.length,64);assert.deepEqual(Object.keys(o.identity),['dev','ino','size','mtimeNs','ctimeNs']);assert.equal(o.root,'repository');}
  });
  await t.test('13 executable sources and 17 header require edges independently measured',()=>{
   assert.equal(e.edges.length,17);assert.equal(e.snapshots.filter(s=>s.path.endsWith('.js')).length,13);
   for(const s of e.snapshots){const o=e.observations.find(o=>o.path===s.path);assert.equal(Buffer.byteLength(s.text),o.size);assert.equal(sha(s.text),o.sha256);if(s.path.endsWith('.js'))assert.equal(fixture.inspectRequests(s.text).length,e.edges.filter(x=>x.from===s.path).length);}
  });
  await t.test('versions, eager builder and external strnum remain explicit',()=>{
   assert.deepEqual(e.versions,{'fast-xml-parser':'4.5.7',strnum:'1.1.2'});assert.ok(e.eagerBuilder&&e.externalStrnum);
   assert.ok(e.edges.some(r=>r.from.endsWith('/fxp.js')&&r.to.endsWith('/xmlbuilder/json2xml.js')));
   assert.ok(e.edges.some(r=>r.request==='strnum'&&r.to==='node_modules/strnum/strnum.js'));
  });
  await t.test('review membership is not selected staging or loaded-byte evidence',()=>{
   assert.equal(e.reviewedPaths.length,13);assert.equal(e.stagedSelection,'UNVERIFIED');assert.equal(e.loadedByteConsumption,'UNVERIFIED');assert.equal(e.remainingCallerObligations,29);for(const f of fixture.FLAGS)assert.equal(e[f],false);
  });
  await t.test('retained canonical evidence independently verifies without loading package',()=>assert.equal(fixture.verifyClosure(repo,Buffer.from(capture.json)).verified,true));
  const scopes=['node_modules/fast-xml-parser/src/package.json','node_modules/fast-xml-parser/src/xmlparser/package.json','node_modules/fast-xml-parser/src/xmlbuilder/package.json'];
  await t.test('all nested package scopes are independently checked absent',()=>{
   assert.deepEqual(e.packageScopes,scopes.map(p=>({path:p,status:'ABSENT'})));
   for(const p of scopes)assert.throws(()=>fs.lstatSync(path.join(repo,p)),{code:'ENOENT'});
   assert.equal(e.runtimeLinking,'UNVERIFIED');assert.equal(e.productionAdmission,'UNVERIFIED');
  });
  // Inject filesystem observations only: never create/change dependency metadata.
  for(const scope of scopes)for(const mode of ['present','unreadable','ambiguous-parent','unreadable-parent','missing-parent','dangling-link','changed-parent'])await t.test('reject nested scope '+scope+' / '+mode,()=>{
   const before=fs.lstatSync,target=path.join(repo,scope),parent=path.dirname(target);let parentReads=0;
   fs.lstatSync=function(p,...args){
    const full=path.resolve(String(p));
    if(full===parent){
     parentReads++;
     if(mode==='unreadable-parent'||mode==='missing-parent')throw Object.assign(Error('injected parent error'),{code:mode==='missing-parent'?'ENOENT':'EACCES'});
     const stat=before.call(this,p,...args);
     if(mode==='ambiguous-parent')return new Proxy(stat,{get:(s,k)=>k==='isSymbolicLink'?()=>true:Reflect.get(s,k)});
     if(mode==='changed-parent'&&parentReads%2===0)return new Proxy(stat,{get:(s,k)=>k==='ino'?s.ino+1n:Reflect.get(s,k)});
     return stat;
    }
    if(full===target){
     if(mode==='unreadable')throw Object.assign(Error('injected metadata error'),{code:'EACCES'});
     if(mode==='present'||mode==='dangling-link')return {isFile:()=>mode==='present',isSymbolicLink:()=>mode==='dangling-link'};
    }
    return before.call(this,p,...args);
   };
   try{
    assert.throws(()=>fixture.captureClosure(repo));
    assert.throws(()=>fixture.verifyClosure(repo,Buffer.from(capture.json)));
    // Forged absence data cannot suppress live filesystem checks.
    const forged=clone(e);forged.packageScopes=[];
    assert.throws(()=>fixture.verifyClosure(repo,encode(forged)));
   }finally{fs.lstatSync=before;}
  });
  const changes=[
   ['entrypoint',x=>x.entrypoint='node_modules/fast-xml-parser/src/cli/cli.js'],
   ['fast-xml-parser version',x=>x.versions['fast-xml-parser']='4.5.8'],['strnum version',x=>x.versions.strnum='1.1.3'],
   ['missing file',x=>x.snapshots.pop()],['extra file',x=>x.snapshots.push({path:'unreviewed.js',text:''})],
   ['changed source with self-consistent hash',x=>{const s=x.snapshots[1];s.text+='\nrequire("node:fs")';const o=x.observations.find(o=>o.path===s.path);o.size=Buffer.byteLength(s.text);o.sha256=sha(s.text);}],
   ['added edge',x=>x.edges.push(clone(x.edges[0]))],['removed edge',x=>x.edges.pop()],['redirected edge',x=>x.edges[0].to='node_modules/strnum/strnum.js'],
   ['computed request',x=>x.edges[0].request='variable'],['dynamic request',x=>x.edges[0].request='import("node:fs")'],
   ['reordered edges',x=>x.edges.reverse()],['stale coordinates',x=>x.edges[0].byteStart++],['stale line',x=>x.edges[0].line++],
   ['missing measurement',x=>x.observations.pop()],['substituted digest',x=>x.observations[0].sha256='0'.repeat(64)],
   ['substituted length',x=>x.observations[0].size++],['substituted identity',x=>x.observations[0].identity.ino='0'],
   ['absolute user path',x=>x.observations[0].path=repo],['duplicate observation',x=>x.observations.push(clone(x.observations[0]))],
   ['omitted eager builder',x=>x.eagerBuilder=false],['omitted external dependency',x=>x.externalStrnum=false],
   ['historical admission reuse',x=>x.historicalAdmissionReused=true],['historical admission field',x=>x.admission={admitted:x.reviewedPaths}],
   ['staging asserted',x=>x.stagedSelection='VERIFIED'],['consumption asserted',x=>x.loadedByteConsumption='VERIFIED'],
   ['closed obligation',x=>x.remainingCallerObligations=28],['baseline altered',x=>x.authoritativeBaseline=824],['ceiling altered',x=>x.ceiling=65],
   ['limits relaxed',x=>x.limits.record++],['warnings removed',x=>x.limitations=[]],['review membership substituted',x=>x.reviewedPaths[0]='unreviewed.js'],
   ['omitted scope evidence',x=>delete x.packageScopes],['substituted scope evidence',x=>x.packageScopes[0].path='unmeasured/package.json'],
   ['scope status substitution',x=>x.packageScopes[0].status='IGNORED'],['duplicated scope evidence',x=>x.packageScopes[1]=clone(x.packageScopes[0])],
   ['runtime linking asserted',x=>x.runtimeLinking='VERIFIED'],['production admission asserted',x=>x.productionAdmission='VERIFIED'],
  ];
  for(const flag of fixture.FLAGS)changes.push(['authority '+flag,x=>x[flag]=true]);
  for(const [name,mutate]of changes)await t.test('reject '+name,()=>{const changed=clone(e);mutate(changed);assert.throws(()=>fixture.verifyClosure(repo,encode(changed)),/Static closure rejected/);});
  for(const [name,text]of [
   ['computed require','const a = require(name);'],['dynamic import','import("a")'],['conditional require','if (true) { const a = require("a"); }'],
   ['function-contained request','function f(){\nconst a = require("a");\n}'],['redirected assignment','const a = require("a");\nconst r = require;'],['eval','eval("code")'],
   ['constructor evaluation','Function("code")'],['overflow','x'.repeat(fixture.CAPS.file+1)],
  ])await t.test('recognizer rejects '+name,()=>assert.throws(()=>fixture.inspectRequests(text),/Static closure rejected/));
  await t.test('LF, CRLF and UTF-8 header byte positions',()=>{
   const text='// é\r\nconst x = require("./x");\r\n';const row=fixture.inspectRequests(text)[0];assert.equal(row.byteStart,Buffer.byteLength(text.slice(0,text.indexOf('require'))));assert.equal(row.line,2);
   assert.equal(fixture.inspectRequests(text.replaceAll('\r\n','\n'))[0].byteStart,row.byteStart-1);
  });
  await t.test('unexpected bare dependency rejected',()=>assert.throws(()=>fixture.resolveEdge(repo,'node_modules/fast-xml-parser/src/fxp.js','node:fs'),/unexpected dependency/));
  for(const [name,mode]of [['missing relative file','missing'],['extensionless shadow','shadow'],['nested strnum shadow','strnum']])await t.test('resolver rejects '+name,()=>{
   const before=fs.existsSync;fs.existsSync=function(p){const normal=String(p).replaceAll('\\','/');if(mode==='missing'&&normal.endsWith('/src/validator.js'))return false;if(mode==='shadow'&&normal.endsWith('/src/validator'))return true;if(mode==='strnum'&&normal.endsWith('/src/xmlparser/node_modules/strnum'))return true;return before.call(this,p);};
   try{assert.throws(()=>fixture.resolveEdge(repo,mode==='strnum'?'node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js':'node_modules/fast-xml-parser/src/fxp.js',mode==='strnum'?'strnum':'./validator'),/missing|shadowed/);}finally{fs.existsSync=before;}
  });
  await t.test('changed current pinned file rejected before evidence creation',()=>{
   const before=fs.readSync;let altered=false;fs.readSync=function(fd,buffer,...args){const count=before.call(this,fd,buffer,...args);if(!altered&&count){buffer[0]^=1;altered=true;}return count;};
   try{assert.throws(()=>fixture.captureClosure(repo),/changed pinned measurement/);}finally{fs.readSync=before;}
  });
  for(const [name,target]of [['sibling strnum file','/node_modules/strnum.js'],['sibling entrypoint file','/node_modules/fast-xml-parser.js']])await t.test('reject '+name,()=>{
   const before=fs.existsSync;fs.existsSync=function(p){return String(p).replaceAll('\\','/').endsWith(target)||before.call(this,p);};
   try{assert.throws(()=>fixture.captureClosure(repo),/shadowed/);}finally{fs.existsSync=before;}
  });
  await t.test('record overflow rejected without truncation',()=>assert.throws(()=>fixture.verifyClosure(repo,Buffer.alloc(fixture.CAPS.record+1)),/overflow/));
  await t.test('capture complete-record overflow rejected',()=>assert.throws(()=>fixture.bounded({text:'x'.repeat(fixture.CAPS.record)}),/overflow/));
  await t.test('noncanonical JSON rejected',()=>assert.throws(()=>fixture.verifyClosure(repo,Buffer.from(capture.json+' ')),/noncanonical/));
  await t.test('malformed UTF-8 rejected',()=>assert.throws(()=>fixture.verifyClosure(repo,Buffer.from([0xff])),/UTF-8/));
  await t.test('input preservation and deterministic replay',()=>assert.equal(fixture.captureClosure(repo).json,capture.json));
  await t.test('no forbidden activity, environment mutation or package loading',()=>{assert.equal(denied,0);assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);});
 }finally{for(const undo of restore.reverse())undo();}
 await t.test('retained evidence is bounded data outside repository; temporary record cleaned',()=>{
  const root=path.join(os.homedir(),'.codex','artifacts','phase18c7t-fast-xml-parser-closure');fs.mkdirSync(root,{recursive:true});
  const bytes=Buffer.from(capture.json),file=path.join(root,sha(bytes)+'.json');
  // Retain exactly the reviewed canonical JSON; no executable extension or absolute paths in its contents.
  assert.ok(!capture.json.includes(repo));fs.writeFileSync(file,bytes,{flag:'w'});
  assert.equal(fixture.verifyClosure(repo,fs.readFileSync(file)).verified,true);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-closure-'));const scratch=path.join(temp,'record.json');
  try{fs.writeFileSync(scratch,bytes);assert.equal(fixture.verifyClosure(repo,fs.readFileSync(scratch)).verified,true);}finally{fs.rmSync(scratch);fs.rmdirSync(temp);}
  assert.equal(fs.existsSync(temp),false);console.log(JSON.stringify({evidence:file,...fixture.verifyClosure(repo,bytes)}));
 });
});
