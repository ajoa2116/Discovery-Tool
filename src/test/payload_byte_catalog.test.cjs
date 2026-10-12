const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createCatalog,verifyCatalog,LIMITS}=require('../../scripts/payload-byte-catalog.cjs');
function fixture(run){const base=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-byte-catalog-'));const payload=path.join(base,'payload');fs.mkdirSync(payload);
  const put=(name,value='fixture')=>{const file=path.join(payload,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
  put('src/backend.js','export const inert=true;');put('package.json','{"type":"module"}');
  const roots=[{id:'stage',path:payload}];
  const manifest={candidates:[{source:'src/backend.ts',output:'src/backend.js',status:'transpiled',selectionReasons:['explicit-entrypoint']},
    {output:'package.json',status:'generated-metadata',selectionReasons:['esm-resolution']},{source:'unknown.wasm',output:null,status:'unselected-unresolved'}],unresolved:[{source:'unknown.wasm',reason:'unknown-reachability-not-excluded'}]};
  const input={roots,staging:{root:'stage',manifest},overlays:[],externalUnresolved:[{source:'Windows DLLs',reason:'loading-unverified'}]};
  try{return run({base,payload,put,roots,manifest,input});}finally{fs.rmSync(base,{recursive:true,force:true});}}
const rejected=(run,code)=>assert.throws(run,error=>error.code===code);
test('deterministic byte catalog preserves selection and unresolved evidence without authority',()=>fixture(({input,roots})=>{
  const catalog=createCatalog(input);assert.deepEqual(createCatalog(input),catalog);
  assert.equal(catalog.entries.length,2);assert.equal(catalog.entries.find(e=>e.path==='src/backend.js').evidence[0].source,'src/backend.ts');
  assert.deepEqual(catalog.unresolved.staging,input.staging.manifest.unresolved);assert.equal(catalog.unresolved.candidates.length,1);
  const result=verifyCatalog(catalog,roots);assert.equal(result.matchedBytes,true);
  for(const flag of ['productionAuthority','completeClosure','runtimeVerified'])assert.equal(result[flag],false);
  assert.deepEqual(result.unresolved.external,input.externalUnresolved);assert.ok(result.analysisLimits.length);
}));
test('explicit replacement overlays preserve original evidence; external executable root covers only that file',()=>fixture(({input,base,put,roots})=>{
  put('src/backend.js','current overlay');put('bridge.node','NOT_LOADED');
  const external=path.join(base,'runtime');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'node.exe'),'NOT_EXECUTED');fs.writeFileSync(path.join(external,'outside.dll'),'uncataloged external');
  roots.push({id:'node',path:path.join(external,'node.exe')});
  input.overlays=[{root:'stage',path:'src/backend.js',reason:'current compilation',replacesStaged:true},{root:'stage',path:'bridge.node',reason:'measured fixture addon'},
    {root:'node',path:'node.exe',reason:'explicit runtime image only'}];
  const catalog=createCatalog(input);assert.equal(catalog.entries.length,4);assert.equal(catalog.entries.find(e=>e.path==='src/backend.js').evidence.length,2);
  assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);assert.equal(catalog.completeClosure,false);
}));
test('reject missing, same-size changed and unexpected payload files',()=>{
  fixture(({input,roots,payload})=>{const c=createCatalog(input);fs.unlinkSync(path.join(payload,'src/backend.js'));rejected(()=>verifyCatalog(c,roots),'missing');});
  fixture(({input,roots,payload})=>{const c=createCatalog(input);fs.writeFileSync(path.join(payload,'src/backend.js'),'export const inert=fail;');rejected(()=>verifyCatalog(c,roots),'changed');});
  fixture(({input,roots,put})=>{const c=createCatalog(input);put('extra.dll');rejected(()=>verifyCatalog(c,roots),'unexpected');rejected(()=>createCatalog(input),'unexpected');});
});
test('reject file mutation during digest read and incomplete unresolved metadata',()=>fixture(({input,roots,payload})=>{
  const catalog=createCatalog(input),original=fs.readSync;let mutated=false;
  fs.readSync=function(...args){const count=original.apply(this,args);if(!mutated&&count){mutated=true;fs.appendFileSync(path.join(payload,'package.json'),'changed');}return count;};
  try{rejected(()=>verifyCatalog(catalog,roots),'changed-during-read');}finally{fs.readSync=original;}
  const altered=structuredClone(catalog);delete altered.unresolved;rejected(()=>verifyCatalog(altered,roots),'catalog');
}));
test('reject duplicate and case-alias records, overlays and overlapping physical roots',()=>fixture(({input,roots})=>{
  const c=createCatalog(input);c.entries.push({...c.entries[0]});rejected(()=>verifyCatalog(c,roots),'duplicate-path');
  c.entries[c.entries.length-1].path=c.entries[0].path.toUpperCase();rejected(()=>verifyCatalog(c,roots),'duplicate-path');
  input.staging.manifest.candidates.push({...input.staging.manifest.candidates[0]});rejected(()=>createCatalog(input),'duplicate-path');input.staging.manifest.candidates.pop();
  input.overlays=[{root:'stage',path:'package.json',reason:'unapproved duplicate'}];rejected(()=>createCatalog(input),'duplicate-path');
  input.overlays[0].replacesStaged=true;input.overlays.push({...input.overlays[0]});rejected(()=>createCatalog(input),'duplicate-path');
  rejected(()=>verifyCatalog(createCatalog({...input,overlays:[]}),[...roots,{id:'alias',path:roots[0].path}]),'overlapping-roots');
}));
test('reject traversal, absolute, ADS, alternate separator and reserved paths before reads',()=>fixture(({input,roots})=>{
  const c=createCatalog(input);
  for(const unsafe of ['../escape','/absolute','C:/Windows/file','src\\backend.js','src//backend.js','./file','file:stream','dir/../file','NUL','file.','file ']){
    const altered=structuredClone(c);altered.entries[0].path=unsafe;rejected(()=>verifyCatalog(altered,roots),'path');
    rejected(()=>createCatalog({...input,overlays:[{root:'stage',path:unsafe,reason:'denied'}]}),'path');
  }
}));
test('reject junction/symlink escapes, linked roots and linked ancestors',()=>fixture(({input,base,payload,roots})=>{
  const c=createCatalog(input),external=path.join(base,'external');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'hidden'),'external');
  const link=path.join(payload,'escape');fs.symlinkSync(external,link,process.platform==='win32'?'junction':'dir');
  rejected(()=>verifyCatalog(c,roots),'reparse');rejected(()=>createCatalog(input),'reparse');fs.unlinkSync(link);
  const alias=path.join(base,'alias');fs.symlinkSync(payload,alias,process.platform==='win32'?'junction':'dir');
  rejected(()=>verifyCatalog(c,[{id:'stage',path:alias}]),'reparse');
  rejected(()=>verifyCatalog(c,[{id:'stage',path:path.join(alias,'src')}]),'reparse');
}));
test('reject hard-link aliases, oversized files and whole system directory roots',()=>{
  fixture(({input,payload})=>{fs.linkSync(path.join(payload,'package.json'),path.join(payload,'alias.json'));input.overlays=[{root:'stage',path:'alias.json',reason:'alias'}];rejected(()=>createCatalog(input),'hardlink');});
  fixture(({input,payload})=>{const fd=fs.openSync(path.join(payload,'package.json'),'r+');try{fs.ftruncateSync(fd,LIMITS.fileBytes+1);}finally{fs.closeSync(fd);}rejected(()=>createCatalog(input),'file-size');});
  fixture(({input})=>{input.roots=[{id:'stage',path:path.parse(process.cwd()).root}];rejected(()=>createCatalog(input),'system-root');});
});
test('invalid catalog digest, flags, size and root bindings deny; CLI never overwrites or writes into payload',()=>fixture(({input,roots,base,payload})=>{
  const c=createCatalog(input);for(const change of [x=>x.entries[0].sha256='bad',x=>x.entries[0].size=-1,x=>x.productionAuthority=true,x=>x.entries[0].root='unknown']){
    const altered=structuredClone(c);change(altered);assert.throws(()=>verifyCatalog(altered,roots));}
  const tool=path.resolve(__dirname,'../../scripts/payload-byte-catalog.cjs'),config=path.join(base,'config.json'),out=path.join(base,'catalog.json');fs.writeFileSync(config,JSON.stringify(input));
  const call=(mode,target)=>spawnSync(process.execPath,[tool,mode,config,target],{encoding:'utf8',windowsHide:true});
  assert.equal(call('create',out).status,0);assert.equal(JSON.parse(call('verify',out).stdout).matchedBytes,true);
  assert.equal(call('create',out).status,1);assert.equal(call('create',path.join(payload,'catalog.json')).status,1);
  assert.equal(fs.existsSync(path.join(payload,'catalog.json')),false);
}));
