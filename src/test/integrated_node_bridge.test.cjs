const assert=require('node:assert/strict');
const {test,before}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const ts=require('typescript');
const {stageBackend}=require('../../scripts/stage-backend.cjs');
const {fixtureRuntimePreflight}=require('../../scripts/fixture-runtime-preflight.cjs');
const root=path.resolve(__dirname,'../..');
const runtime='C:\\Program Files\\nodejs\\node.exe';
const checkoutOwner=path.join(root,'native/ApplicationCompanion/bin/Release/net10.0-windows/ApplicationCompanion.exe');
let owner=checkoutOwner;
let evidence,stage,manifest,provenance;
before(()=>{
  assert.equal(process.version,'v24.19.0');assert.equal(process.execPath,runtime);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(runtime)).digest('hex'),'3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237');
  const build=process.env.DISCOVERY_NODE_BRIDGE_BUILD;assert.ok(build,'Set the external, provenance-recorded addon build directory.');
  provenance=JSON.parse(fs.readFileSync(path.join(build,'build-input-provenance.json'),'utf8'));
  assert.equal(provenance.command.exitCode,0);assert.equal(provenance.productionAuthority,false);
  const ownerNames=['ApplicationCompanion.exe','ApplicationCompanion.dll','ApplicationCompanion.deps.json','ApplicationCompanion.runtimeconfig.json'];
  assert.deepEqual(provenance.ownerMeasurements.map(file=>path.basename(file.path)),ownerNames);
  owner=provenance.ownerMeasurements[0].path;
  assert.equal(fs.realpathSync(owner),owner);
  for(const file of provenance.ownerMeasurements)assert.equal(path.dirname(file.path),path.dirname(owner));
  if(provenance.ownerRoot)assert.equal(provenance.ownerRoot,path.dirname(owner));
  for(const file of provenance.ownerMeasurements)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex'),file.sha256,'Rebuild addon: owner measurement changed.');
  const addon=path.join(build,'node-owner-bridge.node');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(addon)).digest('hex'),provenance.output.sha256);
  evidence=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-integrated-bridge-'));stage=path.join(evidence,'stage');console.log('Integrated evidence: '+evidence);
  const template=process.env.DISCOVERY_NODE_BRIDGE_STAGE_TEMPLATE;
  if(template){ manifest=JSON.parse(fs.readFileSync(path.join(template,'stage-manifest.json'),'utf8'));
    // A startup-only template omits the handoff graph required by this native fixture.
    for(const entry of ['src/server/index.ts','src/server/backend_identity_handoff.ts'])
      assert.ok(manifest.entrypoints.some(e=>e.path===entry),'Integrated template lacks explicit root: '+entry);
    assert.ok(fs.existsSync(path.join(template,'src/server/backend_identity_handoff.js')),'Integrated handoff output missing.');
    fs.cpSync(template,stage,{recursive:true,filter:file=>path.basename(file)!=='node-launch-result.json'}); }
  else manifest=stageBackend(root,stage,{entrypoints:['src/server/index.ts','src/server/backend_identity_handoff.ts']});
  for(const fixture of ['src/test/support/synthetic_tls_binding.ts','src/test/support/backend_tls_binding.ts','src/server/backend_application.ts']) {
  const input=path.join(root,fixture);
  const output=ts.transpileModule(fs.readFileSync(input,'utf8'),{fileName:input,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,rewriteRelativeImportExtensions:true}});
  assert.ok(!output.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error));
  const target=path.join(stage,fixture.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output.outputText);
  }
  fs.copyFileSync(path.join(root,'scripts/integrated-node-driver.cjs'),path.join(stage,'node-launch-driver.cjs'));
  fs.copyFileSync(path.join(root,'scripts/staged-fixture-entrypoint.cjs'),path.join(stage,'node-launch-entry.cjs'));
  fs.copyFileSync(path.join(root,'scripts/staged-backend-review.cjs'),path.join(stage,'node-launch-review.cjs'));
  fs.copyFileSync(addon,path.join(stage,'node-owner-bridge.node'));
  const preflight=fixtureRuntimePreflight({stage,buildDirectory:build});
  fs.writeFileSync(path.join(evidence,'runtime-preflight.json'),JSON.stringify(preflight,null,2));
  fs.writeFileSync(path.join(evidence,'stage-summary.json'),JSON.stringify({entrypoints:manifest.entrypoints,unresolved:manifest.unresolved.length,
    completeClosure:false,productionAuthority:false,signedNodeManifestFiles:9,ownerManifestFiles:4,buildDirectory:build,stageTemplate:template??null},null,2));
});
test('fixture owner-root relocation denials',{timeout:65000},()=>{
  if(owner===checkoutOwner)return; // Default compatibility is exercised by normal mode.
  const runDenied=(image,label)=>{
    fs.rmSync(path.join(stage,'node-launch-result.json'),{force:true});
    const result=spawnSync(image,['--node-bridge-fixture',stage,'normal'],{encoding:'utf8',windowsHide:true,shell:false,timeout:20000,
      env:{SystemRoot:process.env.SystemRoot}});
    fs.writeFileSync(path.join(evidence,label+'-native.json'),JSON.stringify({status:result.status,error:result.error?.message,stdout:result.stdout,stderr:result.stderr}));
    assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr).passed,false);
    const driver=JSON.parse(fs.readFileSync(path.join(stage,'node-launch-result.json'),'utf8'));
    fs.renameSync(path.join(stage,'node-launch-result.json'),path.join(evidence,label+'-driver.json'));
    assert.equal(driver.denial,'owner-image');assert.equal(driver.productionAuthority,false);
    assert.equal(driver.native.ended,true);assert.equal(driver.native.handlesClosed,true);
    assert.equal(driver.native.referencesReleased,true);assert.equal(driver.listenerStopped,true);
  };
  runDenied(checkoutOwner,'checkout-owner');
  const metadata=path.join(path.dirname(owner),'ApplicationCompanion.deps.json');
  const original=fs.readFileSync(metadata);
  try {fs.appendFileSync(metadata,' ');runDenied(owner,'modified-owner');}finally{fs.writeFileSync(metadata,original);}
  const substitute=path.join(evidence,'substitute-owner');fs.cpSync(path.dirname(owner),substitute,{recursive:true});
  runDenied(path.join(substitute,'ApplicationCompanion.exe'),'substituted-owner');
});
const resourceModes=['owner-wire-oversized','owner-wire-zero','owner-wire-limit','owner-wire-type','owner-wire-short','owner-tls-malformed',
  'node-wire-oversized','node-wire-zero','duplicate-load','cancel-load','port-wrap','port-fraction'];
const compositionModes=['composition-normal','composition-object-swap','composition-endpoint-swap','composition-ws-failure','composition-bind-cancel','composition-listener-loss','composition-ws-loss','composition-pipe-loss','composition-expiry'];
const modes=['normal','wrong-owner','foreign-owner','foreign-node','bad-nonce','replay','wrong-pin','object-swap','bind-replay','bind-queue-failure','pipe-loss','listener-loss','ws-loss','cancel','expiry','node-exit','owner-exit','addon-tamper',...resourceModes,...compositionModes];
for(const mode of modes)test('owned Node/native bridge: '+mode,{timeout:25000},()=>{
  const args=['--node-bridge-fixture',stage,mode];
  const result=spawnSync(owner,args,{encoding:'utf8',windowsHide:true,shell:false,timeout:20000,
    env:{SystemRoot:process.env.SystemRoot,NODE_OPTIONS:'--require=DO_NOT_LOAD',PATH:'DO_NOT_LOAD',
      ...(mode==='composition-normal'?{DOTNET_HOST_TRACE:'1',DOTNET_HOST_TRACE_VERBOSITY:'4',
        DOTNET_HOST_TRACEFILE:path.join(evidence,mode+'-host-trace.log')}:{})}});
  const data={args,exitCode:result.status,signal:result.signal,error:result.error?.message??null,stdout:result.stdout,stderr:result.stderr};
  fs.writeFileSync(path.join(evidence,mode+'-native.json'),JSON.stringify(data,null,2));
  let driver;
  if(fs.existsSync(path.join(stage,'node-launch-result.json'))){driver=JSON.parse(fs.readFileSync(path.join(stage,'node-launch-result.json'),'utf8'));
    fs.renameSync(path.join(stage,'node-launch-result.json'),path.join(evidence,mode+'-driver.json'));}
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);assert.equal(report.passed,true);assert.equal(report.productionAuthority,false);
  if(mode==='addon-tamper'){ assert.equal(report.denied,'measurement');assert.equal(report.launched,false);return; }
  if(mode==='owner-exit') {
    const live=spawnSync('powershell.exe',['-NoProfile','-Command',`@(Get-Process -Id ${report.pid} -ErrorAction SilentlyContinue).Count`],{encoding:'utf8',windowsHide:true});
    assert.equal(live.status,0);assert.equal(live.stdout.trim(),'0','Owner death must close the Job and owned Node.');return;
  }
  assert.equal(report.residualProcesses,0);
  if(compositionModes.includes(mode)) {
    assert.equal(driver.compositionEvidence.serverCreated,true);assert.equal(driver.compositionEvidence.stopped,true);
    assert.equal(driver.compositionEvidence.recoveryInspected,false);assert.equal(driver.compositionEvidence.initializationAborted,true);
    assert.equal(driver.compositionEvidence.connections,0);
    assert.equal(driver.compositionEvidence.lateCallbacksExercised,true);
    assert.equal(driver.native.handlesClosed,true);assert.equal(driver.native.referencesReleased,true);assert.equal(driver.native.activeWork,false);
    if(['composition-endpoint-swap','composition-ws-failure','composition-bind-cancel'].includes(mode)) {
      assert.equal(report.bound,false);assert.equal(report.outcome,mode==='composition-endpoint-swap'?'listener-owner':'composition-denied');assert.equal(driver.listenerStopped,true);
      if(mode==='composition-ws-failure')assert.equal(driver.compositionEvidence.wsFailureInjected,true);
      else assert.equal(driver.compositionEvidence.bindingAttempted,true);
      if(mode==='composition-bind-cancel'){assert.equal(driver.native.queuedWork,1);assert.equal(driver.native.peakReferences,3);}
    } else {
      assert.equal(report.bound,true);assert.equal(driver.passed,true,JSON.stringify(driver));assert.equal(driver.fixture.shutdownComplete,true);
      assert.equal(driver.fixture.connections,0);assert.equal(driver.fixture.pendingClients,0);assert.equal(driver.fixture.listening,false);
      assert.equal(driver.fixture.recoveryInspected,false);assert.equal(driver.fixture.productionAuthority,false);
      assert.ok(driver.loadedModules.includes('src/server/backend_application.js'));assert.ok(!driver.loadedModules.includes('src/server/index.js'));
      assert.deepEqual(driver.blockedOperations,[]);
      if(mode==='composition-object-swap')assert.equal(driver.denial,'object');
    }
    return;
  }
  if(resourceModes.includes(mode)) {
    assert.equal(report.bound,false);assert.equal(report.outcome,'resource-denied');
    assert.equal(driver.native.ended,true);assert.equal(driver.native.handlesClosed,true);assert.equal(driver.native.referencesReleased,true);
    assert.equal(driver.native.activeWork,false);assert.equal(driver.listenerStopped,true);
    assert.ok(driver.native.maxFrameBytes<=16384);assert.ok(driver.native.queuedWork<=1);assert.ok(driver.native.peakReferences<=3);
    assert.equal(driver.native.observerThreads,0);assert.equal(driver.native.connectionAttempts,1);
    assert.ok(driver.resourceElapsedMs<3000,JSON.stringify(driver));
    const expected={'owner-wire-oversized':'frame','owner-wire-zero':'frame','owner-wire-limit':'challenge','owner-wire-type':'protocol','owner-wire-short':'challenge',
      'owner-tls-malformed':'tls-material','node-wire-oversized':'channel','node-wire-zero':'channel','port-wrap':null,'port-fraction':null,'duplicate-load':null,'cancel-load':null};
    assert.equal(driver.denial,expected[mode]);
    if(mode.endsWith('-load')) {assert.equal(driver.loadRequests,64);assert.equal(driver.native.queuedWork,1);assert.equal(driver.native.peakReferences,3);}
    if(mode==='duplicate-load')assert.equal(driver.replayDenials,64);
    if(mode==='port-wrap'||mode==='port-fraction') {assert.equal(driver.native.queuedWork,0);assert.equal(driver.native.peakReferences,0);}
    if(mode==='owner-wire-oversized'||mode==='owner-wire-zero')assert.equal(driver.native.maxFrameBytes,0);
    if(mode==='owner-wire-limit')assert.equal(driver.native.maxFrameBytes,16384);
    return;
  }
  if(['wrong-owner','foreign-owner','foreign-node','bad-nonce','replay','wrong-pin','bind-queue-failure'].includes(mode)){
    assert.equal(report.bound,false);
    assert.equal(report.outcome,{'wrong-owner':'owner-rejected','foreign-owner':'owner-peer','foreign-node':'node-peer','bad-nonce':'challenge','replay':'protocol','wrong-pin':'pin-denied','bind-queue-failure':'queue-denied'}[mode]);
    if(mode==='bind-queue-failure') {
      assert.equal(driver.native.ended,true);assert.equal(driver.native.handlesClosed,true);
      assert.equal(driver.native.referencesReleased,true);assert.equal(driver.denial,null); // Composition masks native errors.
    }
    if(['wrong-owner','foreign-owner','foreign-node','bad-nonce'].includes(mode))assert.equal(report.materialSent,false);
    if(mode==='foreign-owner')assert.equal(driver.denial,'owner-peer');
    if(mode==='wrong-owner')assert.equal(driver.denial,'owner-handle');
  } else {
    assert.equal(report.authenticated,true);assert.equal(report.bound,true);
    if(!['cancel','expiry','node-exit'].includes(mode)) {
      assert.equal(driver.passed,true,JSON.stringify(driver));assert.equal(driver.native.handlesClosed,true);
      assert.equal(driver.native.referencesReleased,true);assert.equal(driver.fixture.shutdownComplete,true);
      assert.equal(driver.fixture.listening,false);assert.equal(driver.fixture.connections,0);
      assert.deepEqual(driver.blockedOperations,[]);assert.ok(!driver.loadedModules.includes('src/server/index.js'));
      if(mode==='normal') {assert.equal(driver.native.queuedWork,1);assert.equal(driver.native.peakReferences,3);
        assert.equal(driver.native.observerThreads,1);assert.equal(driver.native.connectionAttempts,1);
        assert.equal(driver.native.activeWork,false);assert.ok(driver.native.maxFrameBytes<=16384);}
    }
    if(mode==='object-swap')assert.equal(driver.denial,'object');if(mode==='bind-replay')assert.equal(driver.denial,'replay');
  }
});
