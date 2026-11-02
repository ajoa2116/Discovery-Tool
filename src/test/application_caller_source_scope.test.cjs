// Current source/configuration bytes only. No historical archive, build or application import.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const net=require('node:net'),dgram=require('node:dgram'),cp=require('node:child_process');
const caller=require('./support/application_caller_mapping.cjs');
const {observeCatalogFiles}=require('../../scripts/payload-byte-catalog.cjs');
const repo=path.resolve(__dirname,'../..'),clone=v=>JSON.parse(JSON.stringify(v)),refs=caller.sourceScopeRefs();
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('five outside-backend callers have a non-executing source/build scope',{timeout:60000},async t=>{
  const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,spawn:cp.spawn,exec:cp.execFileSync,fetch:globalThis.fetch};
  let forbidden=0,cases=0,root;
  const deny=()=>{forbidden++;throw Error('Forbidden source-scope transport/process execution');};
  net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;cp.spawn=deny;cp.execFileSync=deny;globalThis.fetch=deny;
  const originalRoots=[{id:'source-scope',path:repo}];
  const inputFor=location=>{const input={scopeProfile:caller.sourceScopeProfile,roots:[{id:'source-scope',path:location}]};input.scopeObservations=observeCatalogFiles(input.roots,refs);input.scopeContract=caller.deriveSourceScope(input);return input;};
  try{
    const originalsObserved=observeCatalogFiles(originalRoots,refs);
    const input=inputFor(repo),result=caller.createSourceScopeAssessment(input).assess();
    assert.equal(result.status,'blocked');assert.equal(result.contract.records.length,5);
    const parent=fs.realpathSync(os.tmpdir());checked(parent);root=fs.mkdtempSync(path.join(parent,'discovery-caller-scope-'));checked(root);
    const sub=async(name,run)=>t.test(name,()=>{
      const base=fs.mkdtempSync(path.join(root,'case-'));checked(base);let completed=false;
      try{
        for(const ref of refs){const full=path.join(base,ref.path);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,fs.readFileSync(path.join(repo,ref.path)),{flag:'wx'});}
        run(inputFor(base),base);completed=true;cases++;
      }finally{
        if(completed){
          checked(base);assert.equal(path.dirname(base),root);assert.match(path.basename(base),/^case-/);
          const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);checked(full);if(entry.isDirectory())walk(full);else assert.ok(refs.some(r=>r.path===path.relative(base,full).replaceAll('\\','/')),'Unexpected owned file');}};walk(base);
          fs.rmSync(base,{recursive:true});assert.equal(fs.existsSync(base),false);
        }else console.error('STOP; preserve new source-scope case: '+base);
      }
    });
    const rejected=(input,reason)=>{const owner=caller.createSourceScopeAssessment(input),result=owner.assess();assert.equal(result.status,'denied',JSON.stringify(result));if(reason)assert.equal(result.reason,reason);assert.equal(result.executionAuthority,false);assert.equal(result.productionAuthority,false);assert.equal(owner.assess().reason,'scope-sticky-denial');};
    await sub('all five exact callers retain source imports, consumer chains and unknown destinations',input=>{
      const owner=caller.createSourceScopeAssessment(input),r=owner.assess();assert.equal(r.status,'blocked');assert.ok(Object.isFrozen(r.contract.records));
      assert.deepEqual(r.contract.records.map(row=>row.source),['src/shared/device_sort.ts','src/shared/pair_adapter.ts','src/ui/App.tsx','src/ui/components/DeviceRemovalDialog.tsx','src/ui/components/LegacyOnboardModal.tsx']);
      assert.deepEqual(r.contract.records.map(row=>row.consumerChain.length),[3,2,1,3,2]);
      for(const row of r.contract.records){assert.equal(row.generatedDestination,null);assert.equal(row.backendDestination,null);assert.equal(row.requiredFacade,null);assert.equal(row.consumerChain[0].source,'src/ui/main.tsx');assert.equal(row.consumerChain.at(-1).target,row.source);assert.ok(row.sourceMeasurement.identity.ino);}
      assert.equal(r.contract.build.typecheck.noEmit,true);assert.equal(r.contract.build.command,'tsc && vite build && node scripts/build-identity.cjs');
      assert.deepEqual(r.contract.physical,{authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,ceilingMet:false});
      for(const name of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','productionAuthority','productionReady']){assert.equal(r[name],false);assert.equal(r.contract[name],false);}
      assert.equal(owner.assess().reason,'scope-sticky-denial');assert.throws(()=>caller.createSourceScopeAssessment(input),e=>e.code==='CALLER_MAPPING_DENIED');
    });
    const contractCases=[
      ['missing caller',c=>c.records.pop(),'scope-five-callers'],
      ['duplicate caller',c=>{c.records[1]=clone(c.records[0]);}],
      ['substituted caller',c=>{c.records[0].source='src/server/index.ts';}],
      ['changed source measurement',c=>{c.records[0].sourceMeasurement.sha256='0'.repeat(64);}],
      ['changed original import',c=>{c.records[0].originalImport.specifier='./other.ts';}],
      ['changed target identity',c=>{c.records[0].targetMeasurement.identity.ino='0';}],
      ['missing consumer link',c=>c.records[0].consumerChain.pop()],
      ['substituted consumer binding',c=>{c.records[0].consumerChain[0].local='Other';}],
      ['invented backend destination',c=>{c.records[0].backendDestination='src/shared/device_sort.js';}],
      ['invented frontend chunk',c=>{c.records[0].generatedDestination='dist/assets/sort.js';}],
      ['invented facade requirement',c=>{c.records[0].requiredFacade=false;}],
      ['invented bundler output mapping',c=>{c.build.bundler.outputMapping='proven';}],
      ['invented post-build execution',c=>{c.build.postBuild.executed=true;}],
      ['invented runtime equivalence',c=>{c.boundaries.runtimeEquivalence='proven';}],
      ['omitted unresolved boundary',c=>{delete c.boundaries.transitiveClosure;}],
      ['historical backend admission reuse',c=>{c.boundaries.historicalBackendMapping='admitted';}],
      ['false reduced payload count',c=>{c.physical.achievedPayloadCount=64;c.physical.ceilingMet=true;}],
      ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','productionAuthority','productionReady'].map(name=>['false '+name,c=>{c[name]=true;}]),
    ];
    for(const [name,change,reason] of contractCases)await sub(name+' denies',input=>{change(input.scopeContract);rejected(input,reason??'scope-contract-correspondence');});
    for(const file of ['src/ui/App.tsx','src/ui/main.tsx','src/shared/address_validation.ts','vite.config.ts','scripts/build-identity.cjs'])await sub('changed measured '+file+' denies',(input,base)=>{fs.appendFileSync(path.join(base,file),'\n// changed source observation\n');rejected(input,'scope-current-identity');});
    await sub('missing actual caller denies',(input,base)=>{fs.unlinkSync(path.join(base,'src/shared/device_sort.ts'));rejected(input);});
    const sourceCases=[
      ['wrong HTML entry','index.html',s=>s.replace('/src/ui/main.tsx','/src/ui/other.tsx'),'scope-html-entry'],
      ['commented-out HTML entry','index.html',s=>s.replace('<script type="module" src="/src/ui/main.tsx"></script>','<!-- <script type="module" src="/src/ui/main.tsx"></script> -->'),'scope-html-entry'],
      ['duplicate HTML entry attribute','index.html',s=>s.replace('type="module" src=','type="module" type="text/plain" src='),'scope-html-entry'],
      ['changed build command','package.json',s=>{const v=JSON.parse(s);v.scripts.build='vite build';return JSON.stringify(v);},'scope-build-command'],
      ['TypeScript emission claim','tsconfig.json',s=>{const v=JSON.parse(s);v.compilerOptions.noEmit=false;return JSON.stringify(v);},'scope-typescript-build'],
      ['changed TypeScript source scope','tsconfig.json',s=>{const v=JSON.parse(s);v.include=['src/ui'];return JSON.stringify(v);},'scope-typescript-build'],
      ['invented Vite backend entry','vite.config.ts',s=>s.replace('plugins: [react()],',"plugins: [react()], build: {rollupOptions: {input: 'src/server/index.ts'}},"),'scope-vite-config'],
      ['changed Vite plugin','vite.config.ts',s=>s.replace('plugins: [react()]','plugins: []'),'scope-vite-plugins'],
      ['substituted source binding','src/shared/device_sort.ts',s=>s.replace("import { ipv4Number }",'import { normalizeIPv4 }'),'scope-caller-binding'],
      ['missing mounted App consumer','src/ui/main.tsx',s=>s.replace('<App />','<div />'),'scope-consumer-use'],
    ];
    for(const [name,file,change,reason] of sourceCases)await sub(name+' denies even with refreshed measurements',(input,base)=>{const full=path.join(base,file);fs.writeFileSync(full,change(fs.readFileSync(full,'utf8')));input.scopeObservations=observeCatalogFiles(input.roots,refs);rejected(input,reason);});
    await sub('post-reservation mutation remains terminal after repair',input=>{const owner=caller.createSourceScopeAssessment(input);input.scopeContract.productionReady=true;assert.equal(owner.assess().reason,'scope-record-changed');input.scopeContract.productionReady=false;assert.equal(owner.assess().reason,'scope-sticky-denial');});
    await sub('inspected source is never executed',(input,base)=>{fs.appendFileSync(path.join(base,'src/shared/address_validation.ts'),'\nthrow Error("INSPECTED_SOURCE_MUST_NOT_RUN");\n');const fresh=inputFor(base);assert.equal(caller.createSourceScopeAssessment(fresh).assess().status,'blocked');});
    assert.deepEqual(observeCatalogFiles(originalRoots,refs),originalsObserved);assert.equal(forbidden,0);assert.deepEqual(fs.readdirSync(root),[]);
    checked(root);assert.equal(path.dirname(root),parent);assert.match(path.basename(root),/^discovery-caller-scope-/);fs.rmdirSync(root);assert.equal(fs.existsSync(root),false);
    console.log(JSON.stringify({cases,observedSourceBuildFiles:refs.length,remainingFixtureRoots:0,forbiddenActivity:forbidden,applicationImports:0,compilers:0,generatedExecution:0,executionAuthority:false}));root=undefined;
  }finally{
    net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;dgram.createSocket=originals.udp;cp.spawn=originals.spawn;cp.execFileSync=originals.exec;globalThis.fetch=originals.fetch;
    if(root)console.error('STOP; preserve new source-scope parent: '+root);
  }
});
