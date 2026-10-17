// Opt-in isolated Express library evidence; never imports the production server.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {inventory}=require('../../scripts/dependency-inventory.cjs');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');
const iconv=require('./support/iconv_lazy_probe.cjs');
const evidence=process.env.DISCOVERY_EXPRESS_STAGE_EVIDENCE,repo=path.resolve(__dirname,'../..');
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('Express cold library resolution, computed engine and denial contract',{skip:!evidence},()=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);assert.match(path.basename(parent),/^discovery-express-validation-[a-f0-9]{32}$/);
  assert.deepEqual(fs.readdirSync(parent),[]);assert.ok(path.isAbsolute(evidence));checked(evidence);
  const base=fs.mkdtempSync(path.join(parent,'express-contract-'));checked(base);console.log('Express isolated root: '+base);
  const stage=path.join(base,'stage'),harness=path.join(base,'harness');fs.mkdirSync(stage);fs.mkdirSync(harness);
  const roots=[{id:'stage',path:stage},{id:'harness',path:harness}];
  const originalRoots=[{id:'repository',path:repo},{id:'archive',path:evidence}];
  const put=(name,bytes)=>{const full=path.join(stage,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes,{flag:'wx'});};
  const write=(name,value)=>fs.writeFileSync(path.join(base,name),JSON.stringify(value,null,2),{flag:'wx'});
  let completed=false;
  try{
    const archived=JSON.parse(fs.readFileSync(path.join(evidence,'stage-manifest.json'),'utf8'));
    const inv=JSON.parse(fs.readFileSync(path.join(evidence,'inventory.json'),'utf8'));
    assert.equal(archived.unresolved.length,4736);
    const historic=buildPackageAdmission(archived);assert.equal(historic.admitted.length,165);
    const reach=new Set(['node_modules/express/index.js']);
    for(let count=-1;count!==reach.size;){count=reach.size;for(const edge of inv.references)
      if(reach.has(edge.source)&&!edge.typeOnly&&edge.resolvedPath?.startsWith('node_modules/'))reach.add(edge.resolvedPath);}
    // Reachability is selection evidence only. Unreviewed browser alternatives
    // stay physically retained and unadmitted, never inferred unnecessary.
    const executableReviews=new Set([...historic.admitted.map(r=>r.path),...iconv.reviews.map(r=>r.path)]);
    const packageRoots=[...new Set([...reach].map(p=>p.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/)[1]))].sort();
    const names=[...new Set([...reach,...packageRoots.map(p=>p+'/package.json')])].sort();
    const provenance=[];
    for(const name of names){
      const candidates=archived.candidates.filter(c=>c.output===name);assert.equal(candidates.length,1,name);
      assert.equal(candidates[0].status,'copied-candidate');assert.equal(candidates[0].source,name);
      const original=observeCatalogFiles(originalRoots,[{root:'repository',path:name},{root:'archive',path:name}]);
      assert.equal(original[0].sha256,original[1].sha256,'Installed/archive disagreement: '+name);
      put(name,fs.readFileSync(path.join(repo,name)));provenance.push({path:name,source:original[0],archived:original[1],selection:candidates[0]});
    }
    const engine='node_modules/fixture-view-engine/index.js',unreviewed='node_modules/fixture-unreviewed-engine/index.js';
    put(engine,"exports.__express=(file,options,callback)=>callback(null,'fixture:'+options.value);\n");
    put(unreviewed,"throw Error('Unreviewed fixture engine must never execute');\n");
    put('node_modules/fixture-view-engine/package.json','{"name":"fixture-view-engine","version":"0.0.0-fixture","main":"index.js"}');
    put('node_modules/fixture-unreviewed-engine/package.json','{"name":"fixture-unreviewed-engine","version":"0.0.0-fixture","main":"index.js"}');
    put('views/hello.fixture-view-engine','INERT FIXTURE VIEW');
    put('package.json','{"private":true,"type":"commonjs","dependencies":{"express":"4.22.2"}}');
    put('package-lock.json',fs.readFileSync(path.join(repo,'package-lock.json')));put('tsconfig.json','{}');
    put('src/contract.cjs',"require('express');");
    const synthetic=[engine,unreviewed,'node_modules/fixture-view-engine/package.json','node_modules/fixture-unreviewed-engine/package.json'];
    const manifest={informationalOnly:true,productionAuthority:false,completeClosure:false,runtimeValidated:false,
      candidates:[...provenance.map(p=>p.selection),...synthetic.map(p=>({source:p,output:p,status:'copied-candidate',selectionReasons:['Explicit harmless synthetic engine fixture.']})),
        ...['package.json','package-lock.json','tsconfig.json','src/contract.cjs','views/hello.fixture-view-engine'].map(p=>({source:p,output:p,status:'copied-candidate',selectionReasons:['Explicit fixture configuration/data; not production input.']}))],
      unresolved:archived.unresolved};
    const reviews=[...names.filter(p=>executableReviews.has(p)||p.endsWith('/package.json')),engine,'node_modules/fixture-view-engine/package.json']
      .map(path=>({path,reason:'Explicit existing import review/iconv contract or resolution metadata; separate harmless library fixture only.'}));
    const admission=buildPackageAdmission(manifest,reviews);assert.equal(admission.admitted.length,reviews.length);
    assert.ok(admission.denied.every(r=>r.reason==='unreviewed-package-file'&&!reviews.some(v=>v.path===r.path)));
    const missing=JSON.parse(JSON.stringify(manifest));missing.candidates=missing.candidates.filter(c=>c.output!=='node_modules/express/index.js');
    assert.ok(buildPackageAdmission(missing,reviews).denied.some(r=>r.path==='node_modules/express/index.js'));
    assert.ok(!admission.admitted.some(r=>r.path===unreviewed));
    const scoped=inventory(stage,{entrypoints:[{role:'backend-stage',path:'src/contract.cjs'}]});
    assert.ok(scoped.references.some(r=>r.source==='node_modules/express/lib/view.js'&&r.kind==='require'&&r.specifier==='<computed>'));
    put('inventory.json',JSON.stringify(scoped));put('stage-manifest.json',JSON.stringify(manifest));
    put('.express-resolution-probe.cjs',fs.readFileSync(path.join(__dirname,'support/express_resolution_probe.cjs')));
    fs.writeFileSync(path.join(harness,'review.cjs'),fs.readFileSync(path.join(repo,'scripts/staged-backend-review.cjs')),{flag:'wx'});
    const files=observeCatalogFiles(roots,[...names,...synthetic].map(path=>({root:'stage',path})));
    for(const p of provenance)assert.equal(files.find(f=>f.path===p.path).sha256,p.source.sha256,'Copied source bytes must match');
    const packageMetadata=packageRoots.map(location=>{
      const value=JSON.parse(fs.readFileSync(path.join(stage,location,'package.json'),'utf8'));
      const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8')).packages[location];
      assert.ok(lock&&lock.version===value.version);return {location,name:value.name,version:value.version,main:value.main??null,dependencies:value.dependencies??{},lock,upstreamIntegrityVerified:false};
    });
    assert.equal(packageMetadata.find(p=>p.name==='express').version,'4.22.2');
    const config={stage,files,reviews,edges:inv.references.filter(r=>reach.has(r.source)&&r.kind==='require'&&!r.typeOnly)
      .map(({source,line,specifier,resolvedPath,resolution})=>({source,line,specifier,resolvedPath,resolution})),
      builtins:[...new Set(inv.references.filter(r=>reach.has(r.source)&&r.resolution==='node-builtin').map(r=>'node:'+r.specifier.replace(/^node:/,'')))]};
    const configPath=path.join(harness,'config.json');fs.writeFileSync(configPath,JSON.stringify(config),{flag:'wx'});
    const catalog=createCatalog({roots,staging:{root:'stage',manifest},overlays:[['stage','inventory.json'],['stage','stage-manifest.json'],['stage','.express-resolution-probe.cjs'],['harness','review.cjs'],['harness','config.json']]
      .map(([root,path])=>({root,path,reason:'Explicit fixture evidence, no production authority.'}))});
    assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);write('byte-catalog.json',catalog);
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.NODE_ENV='production';
    const results=[];
    for(const mode of ['core','computed','missing','unexpected']){
      const args=['--permission','--allow-fs-read='+base,'--no-addons','--no-experimental-strip-types',path.join(stage,'.express-resolution-probe.cjs'),configPath,mode];
      const child=spawnSync(process.execPath,args,{cwd:stage,env,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
      const owner={mode,pid:child.pid,status:child.status,signal:child.signal,error:child.error?.message??null,stderr:child.stderr,args};
      write(mode+'-owner.json',owner);fs.writeFileSync(path.join(base,mode+'-stdout.json'),child.stdout||'',{flag:'wx'});
      assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);assert.equal(child.signal,null);assert.equal(child.stderr,'');
      const result=JSON.parse(child.stdout);assert.equal(result.passed,true);assert.equal(result.productionAuthority,false);
      results.push({...result,owner});
    }
    for(const p of provenance){assert.deepEqual(observeCatalogFiles(originalRoots,[{root:'repository',path:p.path}])[0],p.source);
      assert.deepEqual(observeCatalogFiles(originalRoots,[{root:'archive',path:p.path}])[0],p.archived);}
    assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);
    const loaded=new Set(results.flatMap(r=>r.loads.map(l=>l.path)));
    const report={observationKind:'original-package-cold-process-fixture',productionAuthority:false,completeClosure:false,atomicMeasuredHandleBinding:false,version:'4.22.2',
      originalBackend:{selected:825,unresolved:archived.unresolved.length,historicalAdmission:historic.admitted.length,unchanged:true},
      base,sourceProvenance:provenance,packageMetadata,sourceEdges:config.edges,unresolved:archived.unresolved,scopedUnresolved:scoped.unresolved,
      selectedPackageFiles:names.length+synthetic.length,admitted:reviews.length,catalogFiles:catalog.entries.length,
      retainedUnadmitted:names.filter(p=>!reviews.some(r=>r.path===p)).concat(unreviewed,'node_modules/fixture-unreviewed-engine/package.json'),
      unobservedAdmitted:reviews.filter(r=>!loaded.has(r.path)).map(r=>r.path),results,
      resources:{children:results.length,compilerInvocations:0,aclOwnersCreated:0,jobsCreated:0,realListeners:0,cleanupConfirmed:false},
      limitations:['Computed view engine is a synthetic control, not a production engine admission.',
        'No real body-stream decoding, sendFile/static transfer, finalhandler exhaustion, compression or browser/Electron branch was executed.',
        'Unobserved files remain selected; subprocess-like scanner matches are unresolved diagnostics, not demonstrated subprocesses.',
        'Node internal metadata access is not exhaustively exposed by hooks; matching hashes/paths do not prove atomic loader binding.']};
    if(process.env.DISCOVERY_EXPRESS_COMPILER_RECORD){
      const {plan}=require('./support/express_behavior_contract.cjs');
      report.behaviorContract=plan({baseline:report,compilerRecord:JSON.parse(fs.readFileSync(process.env.DISCOVERY_EXPRESS_COMPILER_RECORD,'utf8'))});
      assert.equal(report.behaviorContract.executionAuthority,false);
      assert.equal(report.behaviorContract.generated.behaviorStatus,'unexecuted');
      assert.equal(report.behaviorContract.generated.observedBehavior,null);
    }
    checked(base);fs.rmSync(base,{recursive:true,force:true});assert.equal(fs.existsSync(base),false);
    report.resources.cleanupConfirmed=true;report.resources.temporaryRootsRemaining=0;
    fs.writeFileSync(path.join(parent,'express-contract-summary.json'),JSON.stringify(report,null,2),{flag:'wx'});
    completed=true;console.log(JSON.stringify({children:4,checks:results.reduce((n,r)=>n+r.checks.length,0),selectedPackageFiles:report.selectedPackageFiles,admitted:reviews.length,catalogFiles:catalog.entries.length,loaded:loaded.size,cleanupConfirmed:true}));
  }finally{if(!completed)console.error('STOP; preserve only this new Express session: '+base);}
});
