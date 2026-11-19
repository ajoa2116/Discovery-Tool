'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Module=require('node:module'),vm=require('node:vm'),cp=require('node:child_process'),net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const fixture=require('./support/catalog_source_hook_fixture.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const attributes=()=>({importAttributes:{}}),loadContext=format=>({format,importAttributes:{}});
const forbiddenNext=()=>{throw Error('next loader must never run');};
test('catalog-bound CommonJS/ESM source callbacks without execution',async t=>{
 const environment={...process.env},cache=Object.keys(require.cache).sort(),restore=[],instrumentation=[];let forbidden=0;
 const inputs=['src/test/support/catalog_source_hook_fixture.cjs','src/test/catalog_source_hook.test.cjs','scripts/staged-backend-review.cjs','scripts/payload-byte-catalog.cjs'].map(p=>({p,hash:sha(fs.readFileSync(p))}));
 const roots=()=>fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('discovery-source-hook-')).sort(),beforeRoots=roots();
 const patch=(owner,key,value)=>{const old=owner[key];instrumentation.push({owner,key,old});owner[key]=value;restore.push(()=>{owner[key]=old;});};
 const deny=()=>{forbidden++;throw Error('Unapproved execution/network/registration');};
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,key,deny);
 patch(net.Socket.prototype,'connect',deny);patch(net.Server.prototype,'listen',deny);patch(dgram,'createSocket',deny);patch(globalThis,'fetch',deny);
 for(const owner of [http,https])for(const key of ['get','request'])patch(owner,key,deny);
 for(const key of ['Script','SourceTextModule','SyntheticModule','runInThisContext','runInNewContext','runInContext','compileFunction'])if(vm[key])patch(vm,key,deny);
 patch(Module,'registerHooks',deny);patch(Module,'register',deny);
 const load=Module._load;patch(Module,'_load',function(request,...args){if(!Module.isBuiltin(request))return deny();return load.call(this,request,...args);});
 function using(run){const p=fixture.createSourceHookPrototype(true);try{return run(p);}finally{p.dispose();assert.equal(fs.existsSync(p.root),false);assert.equal(p.evidence().state,'disposed');assert.equal(p.evidence().openDescriptors,0);p.dispose();}}
 function resolve(p,entry){return p.hooks.resolve(entry.url,attributes(),forbiddenNext);}
 try{
  await t.test('default deny and exact opt-in',()=>{for(const value of [undefined,false,{},'true',1])assert.throws(()=>fixture.createSourceHookPrototype(value),/opt-in/);assert.throws(()=>fixture.createSourceHookPrototype(true,{}),/opt-in/);});
  await t.test('private catalog pins fixed original source lengths and hashes',()=>using(p=>{
   const expected=[['sample.cjs','commonjs',68,'1466fc8f7080131b02c77ac0b929e9481cdb3856c611127914aeaa88275a93ef'],['sample.mjs','module',46,'f0004e0a09450688e346d91ea293c9c7721daed3b10279ba817dc482d20a31e6']];
   assert.deepEqual(fixture.sampleCatalog().map(r=>[r.name,r.format,r.size,r.sha256]),expected);
   for(const row of fixture.sampleCatalog()){const b=fs.readFileSync(path.join(p.root,row.name));assert.equal(b.length,row.size);assert.equal(sha(b),row.sha256);}
   p.prepare();assert.equal(p.evidence().openDescriptors,0);
  }));
  for(const format of ['commonjs','module'])await t.test(format+' handoff matches verified bytes without nextLoad or second content read',()=>using(p=>{
   const entry=p.entries().find(r=>r.format===format),catalog=fixture.sampleCatalog().find(r=>r.format===format),original=fs.readFileSync(path.join(p.root,entry.name),'utf8');
   p.prepare();const resolved=resolve(p,entry);assert.deepEqual(resolved,{url:entry.url,format,shortCircuit:true});
   fs.writeFileSync(path.join(p.root,entry.name),format==='commonjs'?"module.exports = 'disk-only-mutated';\n":"export const marker = 'disk-only-mutated';\n");
   const oldOpen=fs.openSync,oldRead=fs.readSync,oldReadFile=fs.readFileSync;
   fs.openSync=fs.readSync=fs.readFileSync=()=>{throw Error('second content read');};
   let result;try{result=p.hooks.load(entry.url,loadContext(format),forbiddenNext);}finally{fs.openSync=oldOpen;fs.readSync=oldRead;fs.readFileSync=oldReadFile;}
   assert.deepEqual(result,{format,source:original,shortCircuit:true});assert.equal(Buffer.byteLength(result.source),catalog.size);assert.equal(sha(result.source),catalog.sha256);
   assert.notEqual(fs.readFileSync(path.join(p.root,entry.name),'utf8'),result.source);assert.equal(p.evidence().handedSources,1);
  }));
  await t.test('both source handoffs are observed, evaluation and registration remain unobserved',()=>using(p=>{
   p.prepare();for(const entry of p.entries()){resolve(p,entry);p.hooks.load(entry.url,loadContext(entry.format),forbiddenNext);}
   const e=p.evidence();assert.equal(e.handedSources,2);assert.deepEqual(e.journal.map(r=>r.phase),['resolve','source-handoff','resolve','source-handoff']);
   assert.equal(e.hookRegistration,'NOT_INSTALLED');for(const key of ['nodeEvaluation','esmCacheCoverage','actualHookChainOrdering'])assert.equal(e[key],'UNOBSERVED');
   assert.equal(e.remainingCallerObligations,29);for(const key of fixture.FLAGS)assert.equal(e[key],false);
  }));
  const mutations=[['missing entry',x=>x.pop()],['extra entry',x=>x.push(clone(x[0]))],['substituted digest',x=>x[0].sha256='0'.repeat(64)],['substituted length',x=>x[1].size++],['swapped format',x=>x[0].format='module'],['unsupported format',x=>x[1].format='json'],['unexpected target',x=>x[0].name='../other.cjs'],['reordered entries',x=>x.reverse()],['authority claim',x=>x[0].productionAuthority=true]];
  for(const [name,change]of mutations)await t.test('reject catalog '+name,()=>using(p=>{const value=fixture.sampleCatalog();change(value);assert.throws(()=>p.prepare(value),/catalog/);assert.equal(p.evidence().state,'denied');assert.throws(()=>p.prepare(),/order/);}));
  for(const [name,change]of [['sparse trailing slot',x=>{x.length=3;}],['added array property',x=>{x.extra=true;}],['added array symbol',x=>{x[Symbol('extra')]=true;}]])await t.test('reject exact catalog shape '+name,()=>using(p=>{
   const value=fixture.sampleCatalog();change(value);assert.throws(()=>p.prepare(value),/catalog/);assert.equal(p.evidence().state,'denied');
  }));
  await t.test('catalog accessors and toJSON substitution reject without invoking caller code',()=>{
   let calls=0;const a=fixture.sampleCatalog();a.toJSON=()=>{calls++;return fixture.sampleCatalog();};assert.throws(()=>fixture.checkCatalog(a),/catalog/);
   const b=fixture.sampleCatalog();Object.defineProperty(b[0],'sha256',{get(){calls++;return fixture.sampleCatalog()[0].sha256;},enumerable:true});assert.throws(()=>fixture.checkCatalog(b),/catalog/);assert.equal(calls,0);
  });
  for(const [name,bytes]of [['changed source',Buffer.from('module.exports = null;\n')],['same-length source',Buffer.from('x'.repeat(68))],['new dependency request',Buffer.from("require('node:fs');\n")],['computed import',Buffer.from('import(name);\n')],['invalid UTF-8',Buffer.from([0xff])],['UTF-16',Buffer.from('module.exports = null;','utf16le')],['UTF-8 BOM',Buffer.from('\ufeffmodule.exports = null;')],['overflow',Buffer.alloc(fixture.CAP+1)]])await t.test('reject '+name,()=>using(p=>{fs.writeFileSync(path.join(p.root,'sample.cjs'),bytes);assert.throws(()=>p.prepare(),/source|encoding/);assert.equal(p.evidence().openDescriptors,0);}));
  await t.test('missing source rejects',()=>using(p=>{fs.unlinkSync(path.join(p.root,'sample.mjs'));assert.throws(()=>p.prepare(),/unexpected file/);}));
  await t.test('unexpected package metadata rejects',()=>using(p=>{fs.writeFileSync(path.join(p.root,'package.json'),'{}');assert.throws(()=>p.prepare(),/metadata/);}));
  for(const placement of ['before-close','after-close'])await t.test('descriptor close error remains owned or confirmed closed: '+placement,()=>using(p=>{
   const original=fs.closeSync;let armed=true;
   fs.closeSync=function(fd){if(armed){armed=false;if(placement==='after-close')original.call(this,fd);throw Object.assign(Error('injected close error'),{code:'EIO'});}return original.call(this,fd);};
   try{assert.throws(()=>p.prepare(),/close error/);assert.equal(p.evidence().openDescriptors,placement==='before-close'?1:0);}finally{fs.closeSync=original;}
   p.dispose();assert.equal(p.evidence().openDescriptors,0);
  }));
  for(const [name,mutate]of [['query',url=>url+'?x=1'],['fragment',url=>url+'#x'],['raw path',url=>new URL(url).pathname],['encoded filename',url=>url.replace('sample','%73ample')],['traversal alias',url=>url.replace('/sample','/../'+path.basename(new URL(url).pathname)+'/sample')],['data URL',()=> 'data:text/javascript,export{}'],['builtin',()=> 'node:fs'],['relative request',()=> './sample.cjs'],['bare package',()=> 'fast-xml-parser']])await t.test('reject URL/request '+name,()=>using(p=>{p.prepare();assert.throws(()=>p.hooks.resolve(mutate(p.entries()[0].url),attributes(),forbiddenNext),/URL/);}));
  for(const format of ['json','addon','commonjs-typescript',undefined,'module'])await t.test('reject incorrect CommonJS load format '+String(format),()=>using(p=>{p.prepare();const entry=p.entries()[0];resolve(p,entry);assert.throws(()=>p.hooks.load(entry.url,loadContext(format),forbiddenNext),/format/);}));
  await t.test('nested import from even a permitted source rejects',()=>using(p=>{p.prepare();const entry=p.entries()[0];assert.throws(()=>p.hooks.resolve(entry.url,{...attributes(),parentURL:p.entries()[1].url},forbiddenNext),/dependency/);}));
  await t.test('unexpected import attributes reject',()=>using(p=>{p.prepare();assert.throws(()=>p.hooks.resolve(p.entries()[0].url,{importAttributes:{type:'json'}},forbiddenNext),/attributes/);}));
  const attributeCases=[
   ['toJSON with unexpected property',hit=>({type:'json',toJSON(){hit();return {};}})],
   ['toJSON accessor',hit=>Object.defineProperty({},'toJSON',{get(){hit();return ()=>({});}})],
   ['attribute getter',hit=>Object.defineProperty({},'type',{get(){hit();return 'json';},enumerable:true})],
   ['hidden property',()=>Object.defineProperty({},'hidden',{value:true})],
   ['symbol property',()=>({[Symbol('attribute')]:true})],
   ['inherited getter',hit=>Object.create({get type(){hit();return 'json';}})],
   ['null prototype',()=>Object.create(null)],['array',()=>[]],['null',()=>null],['undefined',()=>undefined],['string',()=> '{}'],
   ['proxy',hit=>new Proxy({},{getPrototypeOf(){hit();return Object.prototype;},ownKeys(){hit();return [];}})],
   ['revoked proxy',()=>{const p=Proxy.revocable({},{});p.revoke();return p.proxy;}],
  ];
  for(const phase of ['resolve','load'])for(const [name,make]of attributeCases)await t.test(phase+' rejects attributes '+name+' without callbacks',()=>using(p=>{
   let calls=0;const value=make(()=>{calls++;}),entry=p.entries()[0];p.prepare();if(phase==='load')resolve(p,entry);
   assert.throws(()=>phase==='resolve'?p.hooks.resolve(entry.url,{importAttributes:value},forbiddenNext):p.hooks.load(entry.url,{format:entry.format,importAttributes:value},forbiddenNext),/attributes/);
   assert.equal(calls,0);assert.equal(p.evidence().state,'denied');
  }));
  for(const phase of ['resolve','load'])await t.test(phase+' context getters and prototypes reject without callbacks',()=>using(p=>{
   let calls=0;const entry=p.entries()[0];p.prepare();if(phase==='load')resolve(p,entry);
   const context=Object.defineProperty(phase==='load'?{format:entry.format}:{},'importAttributes',{get(){calls++;return {};},enumerable:true});
   assert.throws(()=>phase==='resolve'?p.hooks.resolve(entry.url,context,forbiddenNext):p.hooks.load(entry.url,context,forbiddenNext),/attributes/);assert.equal(calls,0);
  }));
  for(const [stage,cleanupFails]of [['initial-lstat',false],['initial-lstat',true],['initial-write',false],['initial-write',true]])await t.test('initialization '+stage+' / cleanup failure '+cleanupFails,()=>{
   const savedEnvironment={...process.env},savedCache=Object.keys(require.cache).sort();
   const original={mkdtempSync:fs.mkdtempSync,lstatSync:fs.lstatSync,writeFileSync:fs.writeFileSync,rmdirSync:fs.rmdirSync,rmSync:fs.rmSync};
   const primary=Object.assign(Error('injected initialization error'),{code:'INIT_IO'}),cleanup=Object.assign(Error('injected cleanup error'),{code:'CLEANUP_IO'});let root,armed=true,caught;
   fs.mkdtempSync=function(...args){root=original.mkdtempSync.apply(this,args);return root;};
   fs.lstatSync=function(p,...args){if(stage==='initial-lstat'&&armed&&p===root){armed=false;throw primary;}return original.lstatSync.call(this,p,...args);};
   fs.writeFileSync=function(p,...args){if(stage==='initial-write'&&armed&&path.dirname(p)===root){armed=false;throw primary;}return original.writeFileSync.call(this,p,...args);};
   for(const method of ['rmdirSync','rmSync'])fs[method]=function(p,...args){if(cleanupFails&&p===root)throw cleanup;return original[method].call(this,p,...args);};
   try{try{fixture.createSourceHookPrototype(true);}catch(error){caught=error;}}
   finally{for(const [key,value]of Object.entries(original))fs[key]=value;}
   try{
    assert.strictEqual(caught,primary);assert.deepEqual(caught.cleanupErrors,cleanupFails?[cleanup]:[]);
    if(cleanupFails){assert.equal(fs.existsSync(root),true);assert.equal(caught.pendingCleanup.root,root);caught.pendingCleanup.dispose();caught.pendingCleanup.dispose();}
    else assert.equal(caught.pendingCleanup,undefined);
    assert.equal(fs.existsSync(root),false);assert.deepEqual({...process.env},savedEnvironment);assert.deepEqual(Object.keys(require.cache).sort(),savedCache);
    for(const [key,value]of Object.entries(original))assert.equal(fs[key],value);
   }finally{if(caught?.pendingCleanup&&fs.existsSync(root))caught.pendingCleanup.dispose();}
  });
  await t.test('source-read failure preserves primary error and closes owned descriptor',()=>using(p=>{
   const original=fs.readSync,primary=Object.assign(Error('injected source read error'),{code:'EIO'});fs.readSync=()=>{throw primary;};
   try{assert.throws(()=>p.prepare(),error=>error===primary);assert.equal(p.evidence().openDescriptors,0);assert.equal(p.evidence().state,'denied');}finally{fs.readSync=original;}
  }));
  for(const stage of ['before-prepare','before-resolve','repeat-resolve','repeat-load','repeat-prepare','after-denial','after-dispose'])await t.test('callback ordering '+stage,()=>using(p=>{
   const entry=p.entries()[0],call=()=>p.hooks.load(entry.url,loadContext(entry.format),forbiddenNext);
   if(stage==='before-prepare')return assert.throws(call,/order/);
   p.prepare();
   if(stage==='before-resolve')return assert.throws(call,/order/);
   if(stage==='repeat-prepare')return assert.throws(()=>p.prepare(),/order/);
   if(stage==='after-denial'){assert.throws(()=>p.hooks.resolve('node:fs',attributes(),forbiddenNext));return assert.throws(()=>resolve(p,entry),/state/);}
   if(stage==='after-dispose'){p.dispose();return assert.throws(call,/state/);}
   resolve(p,entry);
   if(stage==='repeat-resolve')return assert.throws(()=>resolve(p,entry),/cache/);
   call();assert.throws(call,/cache/);
  }));
  for(const stage of ['prepare','load'])await t.test('reject pre-existing CommonJS cache during '+stage,()=>using(p=>{
   const file=path.join(p.root,'sample.cjs'),old=require.cache[file];if(stage==='load'){p.prepare();resolve(p,p.entries()[0]);}
   require.cache[file]={exports:{marker:'not-observed'},loaded:true};try{assert.throws(()=>stage==='prepare'?p.prepare():p.hooks.load(p.entries()[0].url,loadContext('commonjs'),forbiddenNext),/cache/);}finally{if(old===undefined)delete require.cache[file];else require.cache[file]=old;}
  }));
  await t.test('caller-owned catalog and evidence copies cannot alter private source',()=>using(p=>{
   const supplied=fixture.sampleCatalog();p.prepare(supplied);supplied[0].sha256='0'.repeat(64);const e=p.evidence();e.catalog=[];e.productionAuthority=true;
   const entry=p.entries()[0];resolve(p,entry);const result=p.hooks.load(entry.url,loadContext(entry.format),forbiddenNext);assert.equal(sha(result.source),fixture.sampleCatalog()[0].sha256);assert.equal(p.evidence().productionAuthority,false);
  }));
  await t.test('instrumentation observed no evaluation, dependency loading, hook registration, process or network calls',()=>assert.equal(forbidden,0));
  await t.test('input bytes, environment, module cache and owned roots preserved',()=>{
   for(const row of inputs)assert.equal(sha(fs.readFileSync(row.p)),row.hash);assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);assert.deepEqual(roots(),beforeRoots);
  });
 }finally{for(const undo of restore.reverse())undo();}
 await t.test('instrumentation and environment restored',()=>{for(const {owner,key,old}of instrumentation)assert.equal(owner[key],old);assert.equal(Module._load,load);assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);assert.deepEqual(roots(),beforeRoots);});
});
