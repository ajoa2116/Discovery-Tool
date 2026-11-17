// Compile-only remains independent. A SECOND explicit opt-in is required by behavior tests.
const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net');
const {observeIslandCompile,validateCandidate,exportContract,readCompileFailure,withCompileCleanup}=require('./support/application_island_compile_fixture.cjs');
const {installGuards}=require('./support/frontend_emission_fixture.cjs');
const {prepareIslandBehavior,withBehaviorCleanup,readBehaviorFailure,boundedBehaviorWait}=require('./support/application_island_compile_fixture.cjs');
const behavior=require('./support/application_island_behavior_loader.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
const {launcherPreflight,validateLauncherParent}=require('./support/application_island_compile_fixture.cjs');

test('launcher preflight parent invocation fails closed',()=>{
  validateLauncherParent([],{});
  validateLauncherParent(['--test-name-pattern=launcher preflight'],{});
  assert.throws(()=>validateLauncherParent(Array(1),{}),/launcher parent flags/);
  for(const flags of [['-rhook'],['--require=hook'],['--import=hook'],['--inspect-brk'],['--experimental-loader=hook'],
    ['--eval=1'],['--test-name-pattern=.*'],['--unknown-future-flag'],['--test','--test']]){
    assert.throws(()=>validateLauncherParent(flags,{}),/launcher parent flags/);
  }
  for(const key of ['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'])assert.throws(()=>validateLauncherParent([],{[key]:'override'}),/inherited overrides/);
  assert.throws(()=>behavior.launcherPreflightProgram('arbitrary'),/Unknown inert/);
});

test('launcher preflight fixed Windows lifecycle', {timeout:30000},async t=>{
  assert.equal(process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,undefined);
  const environment={...process.env},cache=Object.keys(require.cache).sort();
  const originals={spawn:cp.spawn,exec:cp.exec,connect:net.Socket.prototype.connect,write:fs.writeFileSync};
  await assert.rejects(launcherPreflight('arbitrary'),/preflight scenario/);
  for(const scenario of ['complete','spawn-failure','timeout','overflow','primary-and-cleanup','cleanup-only'])await t.test(scenario,async()=>{
    let calls=0,root;
    // Observe the only authorized launch. Deny other process, network and file-write probes.
    const restorations=[];
    const patch=(owner,key,value)=>{const original=owner[key];owner[key]=value;restorations.push(()=>{owner[key]=original;});};
    const forbidden=()=>{throw Error('Unintended preflight activity');};
    for(const key of ['exec','execSync','execFile','execFileSync','spawnSync','fork'])patch(cp,key,forbidden);
    patch(net.Socket.prototype,'connect',forbidden);
    patch(fs,'writeFileSync',forbidden);
    patch(cp,'spawn',function(executable,args,options){
      calls++;assert.equal(calls,1);assert.equal(executable,process.execPath);
      assert.deepEqual(args,['--permission','--no-addons','--no-global-search-paths','--disable-proto=throw','--max-old-space-size=32','--stack-size=256','-e',behavior.launcherPreflightProgram(scenario)]);
      assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);
      root=options.env.TEMP;assert.equal(options.env.TMP,root);
      assert.deepEqual(Object.keys(options.env).sort(),['TEMP','TMP',...['SystemRoot','WINDIR'].filter(key=>process.env[key])].sort());
      assert.equal(options.cwd,scenario==='spawn-failure'?path.join(root,'absent-cwd'):root);
      assert.equal(fs.realpathSync(root),root);assert.deepEqual(fs.readdirSync(root),[]);
      return originals.spawn.call(this,executable,args,options);
    });
    let result,error;
    try{result=await launcherPreflight(scenario);}catch(caught){error=caught;}
    finally{for(const restore of restorations.reverse())restore();}
    assert.equal(calls,1);
    const failure=error?readBehaviorFailure(error):null,cleanup=error?failure?.cleanup:result.cleanup;
    assert.ok(cleanup, error?.stack);
    for(const key of ['childClosed','closeObserved','rootRemoved','environmentUnchanged','parentInstrumentationUnchanged'])assert.equal(cleanup[key],true,key);
    assert.equal(cleanup.root,root);assert.equal(fs.existsSync(root),false);
    assert.equal(cleanup.executableIdentity.path,process.execPath);assert.match(cleanup.executableIdentity.sha256,/^[a-f0-9]{64}$/);
    assert.ok(cleanup.retainedOutputBytes<=8192);
    assert.equal(cleanup.spawnObserved,scenario!=='spawn-failure');
    if(scenario==='complete'){
      assert.ifError(error);assert.deepEqual(cleanup.exit,{code:0,signal:null});assert.equal(cleanup.terminationAttempted,false);
      assert.equal(result.report.generatedExecution,false);assert.equal(result.report.productionAuthority,false);
      assert.equal(result.report.authoritativeBaseline,825);assert.equal(result.report.ceiling,64);
    }else{
      assert.ok(error);assert.equal(failure.productionAuthority,false);
      if(scenario==='cleanup-only'){assert.equal(failure.primary,null);assert.deepEqual(cleanup.exit,{code:0,signal:null});}
      else if(scenario==='spawn-failure'){assert.match(failure.primary.message,/ENOENT/);assert.equal(error.cause.code,'ENOENT');}
      else{
        assert.match(failure.primary.message,scenario==='timeout'?/timed out/:/output limit/);
        assert.equal(cleanup.terminationAttempted,true);assert.equal(cleanup.exit.signal,'SIGKILL');
        if(scenario!=='timeout')assert.equal(cleanup.retainedOutputBytes,8192);
      }
      const cleanupFault=scenario==='primary-and-cleanup'||scenario==='cleanup-only';
      assert.equal(failure.cleanupErrors.length,cleanupFault?1:0);
      if(cleanupFault){assert.equal(failure.cleanupErrors[0].step,'parent-state');assert.match(failure.cleanupErrors[0].error.message,/cleanup acknowledgment/);}
    }
    assert.deepEqual({...process.env},environment);
    assert.deepEqual(Object.keys(require.cache).sort(),cache);
    assert.equal(cp.spawn,originals.spawn);assert.equal(cp.exec,originals.exec);assert.equal(net.Socket.prototype.connect,originals.connect);assert.equal(fs.writeFileSync,originals.write);
    console.log(JSON.stringify({launcherPreflight:scenario,spawnObserved:cleanup.spawnObserved,closeObserved:cleanup.closeObserved,
      exit:cleanup.exit,terminationAttempted:cleanup.terminationAttempted,retainedOutputBytes:cleanup.retainedOutputBytes,
      rootRemoved:cleanup.rootRemoved,environmentUnchanged:cleanup.environmentUnchanged,cleanupErrors:failure?.cleanupErrors.length??0}));
  });
});
test('island compile requires explicit opt-in',async()=>{
  await assert.rejects(observeIslandCompile(repo,false),/explicit opt-in/);
});

test('synthetic behavior requires separate compiler authorization',async()=>{
  await assert.rejects(prepareIslandBehavior(repo,false),/behavior compiler opt-in required/);
});

// Pure validator data, never application execution or compiler/loader launch.
function syntheticBehaviorRuns(){
  const rows=behavior.runBehaviorMatrix(Object.create(null)).map(row=>({...row,actual:row.expected,error:null,pass:true}));
  return ['original/address-first','original/identity-first','candidate'].map(label=>{
    const order=label==='candidate'?['candidate/address-identity.generated.js']:label==='original/identity-first'?
      ['original/identity_policy.js','original/address_validation.js']:['original/address_validation.js','original/identity_policy.js'];
    const events=order.flatMap((module,index)=>[
      {module,phase:'before-link',status:label==='original/address-first'&&index===1?'evaluated':'unlinked'},
      {module,phase:'before-evaluate',status:label==='original/address-first'&&index===1?'evaluated':'linked'},
      {module,phase:'after-evaluate',status:'evaluated'},
      {module,phase:'after-repeat-evaluate',status:'evaluated'},
    ]);
    return {label,rows:clone(rows),semantics:{aliasIdentity:true,cacheIdentity:true,namespaceTopology:order.length,events}};
  });
}
test('synthetic behavioral result validator preserves obligations and reports all mismatches',async t=>{
  const runs=syntheticBehaviorRuns(),report=behavior.compareResults(runs);
  assert.equal(report.status,'bounded-synthetic-agreement');assert.deepEqual(report.mismatches,[]);
  for(const flag of ['productionAuthority','runtimeEquivalence','stagingAdmission','facadeRemovability','completeClosure'])assert.equal(report[flag],false);
  assert.equal(report.authoritativeBaseline,825);assert.equal(report.ceiling,64);assert.equal(report.achievedPayloadCount,null);
  assert.equal(report.callerOutputReviews,'29 unresolved; historical evidence not renewed');
  assert.deepEqual([...new Set(runs[0].rows.flatMap(row=>row.exports))].sort(),behavior.EXPORTS);
  const changed=clone(runs);changed[1].rows[0].actual='first mismatch';changed[2].rows[1].actual='second mismatch';
  const mismatches=behavior.compareResults(changed).mismatches;
  assert.equal(mismatches.filter(row=>row.kind==='expected').length,2);
  assert.equal(mismatches.filter(row=>row.kind==='differential').length,2);
  const sharedWrong=clone(runs);for(const run of sharedWrong)run.rows[0].actual='same wrong answer';
  assert.equal(behavior.compareResults(sharedWrong).mismatches.filter(row=>row.kind==='expected').length,3);
  for(const [label,mutate]of [
    ['missing case',r=>r[1].rows.pop()],['reordered case',r=>r[1].rows.reverse()],
    ['changed expected',r=>{for(const run of r)run.rows[0].expected='forged';}],
    ['missing export coverage',r=>{for(const run of r)run.rows[0].exports=[];}],
    ['renamed run',r=>{r[0].label='other';}],
  ])await t.test(label,()=>{const candidate=clone(runs);mutate(candidate);assert.throws(()=>behavior.compareResults(candidate),/Island behavior denied/);});
  for(const key of ['aliasIdentity','cacheIdentity']){
    const changed=clone(runs);changed[2].semantics[key]=false;
    assert.ok(behavior.compareResults(changed).mismatches.some(row=>row.kind==='module-semantics'));
  }
  const timing=clone(runs);timing[0].semantics.events[2].status='evaluating';
  assert.ok(behavior.compareResults(timing).mismatches.some(row=>row.kind==='module-semantics'));
});
test('synthetic loader rejects every request except the exact original internal edge',()=>{
  assert.equal(behavior.resolveModule('./identity_policy.js','original/address_validation.js'),'original/identity_policy.js');
  for(const [specifier,referrer]of [
    ['node:fs','original/address_validation.js'],['../identity_policy.js','original/address_validation.js'],
    ['./identity_policy.js','candidate/address-identity.generated.js'],['file:///other.js','original/address_validation.js'],
    ['./identity_policy.js','original/identity_policy.js'],
  ])assert.throws(()=>behavior.resolveModule(specifier,referrer),/module request/);
  assert.throws(()=>behavior.validateEnvelope({},'0'.repeat(64)),/sealed evidence changed/);
});
test('synthetic behavioral cleanup separates primary and cleanup errors and continues',async t=>{
  for(const phase of ['compile','link','evaluate','compare'])await t.test(phase,async()=>{
    const original=Object.freeze(Error('primary '+phase)),visited=[];
    let caught;
    try{await withBehaviorCleanup(async()=>{throw original;},[
      ['loader-close',()=>{visited.push('close');throw Error('close failure');}],
      ['restore',()=>{visited.push('restore');throw null;}],
      ['root-cleanup',()=>{visited.push('root');}],
    ]);}catch(error){caught=error;}
    assert.equal(caught.cause,original);const receipt=readBehaviorFailure(caught);
    assert.equal(receipt.primary.message,'primary '+phase);assert.equal(receipt.cleanupErrors.length,2);
    assert.deepEqual(receipt.cleanupErrors.map(row=>row.step),['loader-close','restore']);
    assert.deepEqual(visited,['close','restore','root']);assert.equal(receipt.productionAuthority,false);
  });
  await t.test('cleanup-only failure cannot become success',async()=>{
    let caught;try{await withBehaviorCleanup(async()=>42,[['root-cleanup',()=>{throw 'primitive';}]]);}catch(error){caught=error;}
    assert.equal(readBehaviorFailure(caught).primary,null);assert.equal(readBehaviorFailure(caught).cleanupErrors[0].error.message,'primitive');
  });
  await t.test('bounded wait times out and cleanup is still attempted',async()=>{
    let cleaned=false,caught;
    try{await withBehaviorCleanup(()=>boundedBehaviorWait(new Promise(()=>{}),10,'synthetic wait'),[['cleanup',()=>{cleaned=true;}] ]);}catch(error){caught=error;}
    assert.equal(cleaned,true);assert.match(readBehaviorFailure(caught).primary.message,/synthetic wait timed out/);
  });
});

test('isolated address identity synthetic behavioral comparison',{
  skip:process.env.DISCOVERY_ISLAND_BEHAVIOR!=='1'||process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION!=='1',timeout:90000,
},async t=>{
  let fixture;
  try{fixture=await prepareIslandBehavior(repo,true);}
  catch(error){console.error(JSON.stringify({failure:readBehaviorFailure(error)}));throw error;}
  const {evidence,record}=fixture;
  for(let index=0;index<2;index++){
    assert.equal(evidence.modules[index].bytes,behavior.ORIGINALS[index].bytes);
    assert.equal(evidence.modules[index].sha256,behavior.ORIGINALS[index].sha256);
  }
  assert.equal(evidence.modules[2].bytes,behavior.CANDIDATE.bytes);assert.equal(evidence.modules[2].sha256,behavior.CANDIDATE.sha256);
  assert.equal(record.productionAuthority,false);assert.equal(record.completeClosure,false);
  assert.deepEqual(fixture.assess(evidence),{status:'blocked',productionAuthority:false,runtimeEquivalence:false});
  await t.test('generated execution is independently denied before launch',async()=>{
    await assert.rejects(fixture.compare(false),/generated execution opt-in required/);
  });
  for(const [label,mutate]of [
    ['source digest',e=>{e.bindings.observations[0].sha256='0'.repeat(64);}],
    ['source identity',e=>{e.bindings.observations[0].identity.ino='0';}],
    ['missing source',e=>{e.bindings.observations.shift();}],
    ['dependency digest',e=>{e.bindings.observations.find(row=>row.path==='package-lock.json').sha256='0'.repeat(64);}],
    ['compiler binary',e=>{e.bindings.observations.find(row=>row.path.endsWith('esbuild.exe')).sha256='0'.repeat(64);}],
    ['Node identity',e=>{e.bindings.observations.find(row=>row.root==='node-runtime').identity.ino='0';}],
    ['compiler configuration',e=>{e.bindings.compileReport.configuration.treeShaking=true;}],
    ['original configuration',e=>{e.bindings.originalConfiguration.rewriteRelativeImportExtensions=false;}],
    ['loader bytes',e=>{e.bindings.observations.find(row=>row.path.endsWith('application_island_behavior_loader.cjs')).sha256='0'.repeat(64);}],
    ['original text',e=>{e.modules[0].text+='\n';}],['original hash',e=>{e.modules[1].sha256='0'.repeat(64);}],
    ['candidate text',e=>{e.modules[2].text+='\n';}],['candidate length',e=>{e.modules[2].bytes++;}],
    ['candidate hash',e=>{e.modules[2].sha256='0'.repeat(64);}],
    ['extra module',e=>{e.modules.push(e.modules[0]);}],['reordered modules',e=>{e.modules.reverse();}],
    ['execution claim',e=>{e.productionAuthority=true;}],['baseline',e=>{e.authoritativeBaseline=824;}],
    ['ceiling',e=>{e.ceiling=65;}],['discarded caller reviews',e=>{e.callerOutputReviews='complete';}],
  ])await t.test(label+' evidence substitution denied before launch',()=>{
    const candidate=clone(evidence);mutate(candidate);assert.throws(()=>fixture.assess(candidate),/sealed evidence changed/);
  });
  await t.test('self-consistent substituted bytes still fail independent reference pins',()=>{
    for(let index=0;index<3;index++){
      const candidate=clone(evidence),row=candidate.modules[index];row.text+='\n';row.bytes=Buffer.byteLength(row.text);
      row.sha256=require('node:crypto').createHash('sha256').update(row.text).digest('hex');
      assert.throws(()=>behavior.validateEnvelope(candidate,behavior.envelopeDigest(candidate)),/original emission reference bytes|November 2 candidate/);
    }
    const changed=clone(evidence);changed.bindings.observations[0].sha256='0'.repeat(64);
    assert.throws(()=>behavior.validateEnvelope(changed,behavior.envelopeDigest(changed)),/source pin/);
  });
  let result;
  try{result=await fixture.compare(true);}
  catch(error){console.error(JSON.stringify({failure:readBehaviorFailure(error)}));throw error;}
  console.log(JSON.stringify({syntheticBehavior:result,compilerCleanup:fixture.compilerCleanup,outputs:evidence.modules.map(({text,...measurement})=>measurement),productionAuthority:false}));
  assert.deepEqual(result.report.mismatches,[]);assert.equal(result.report.status,'bounded-synthetic-agreement');
  assert.equal(result.report.runtimeEquivalence,false);assert.equal(result.report.productionAuthority,false);
  for(const key of ['childClosed','rootRemoved','environmentUnchanged','parentInstrumentationUnchanged'])assert.equal(result.cleanup[key],true);
  assert.equal(fs.existsSync(result.cleanup.root),false);
  for(const key of ['childrenClosed','compilerStopped','instrumentationRestored','environmentRestored','rootRemoved'])assert.equal(fixture.compilerCleanup[key],true);
  assert.deepEqual(fixture.compilerCleanup.activity,{outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:1,refusedWindowsHelper:0});
  await assert.rejects(fixture.compare(true),/already consumed/);
});
test('synthetic compile failure cleanup preserves original errors',async t=>{
  for(const scenario of ['work failure','stop failure','restore acknowledgment failure','frozen exception'])await t.test(scenario,async()=>{
    const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'discovery-island-cleanup-'));
    assert.equal(fs.realpathSync(root),root);const before={exec:cp.exec,write:fs.writeFileSync};
    const guards=installGuards(root,path.join(root,'never-run.exe'),'synthetic',()=>assert.fail('No synthetic child'));
    const cleanup={rootRemoved:null,instrumentationRestored:null},original=Object.assign(Error('Synthetic compile failure'),{code:'SYNTHETIC_COMPILE'});
    if(scenario==='frozen exception')Object.freeze(original);
    try{
      await assert.rejects(withCompileCleanup(async()=>{throw original;},{phase:()=> 'build',cleanup,steps:[
        ['compiler-stop',()=>{if(scenario==='stop failure')throw Error('Synthetic stop failure');}],
        ['instrumentation-restore',()=>{guards.restore();cleanup.instrumentationRestored=true;if(scenario==='restore acknowledgment failure')throw Error('Synthetic restoration acknowledgment');}],
        ['root-cleanup',()=>{assert.equal(path.dirname(root),parent);assert.match(path.basename(root),/^discovery-island-cleanup-/);assert.equal(fs.realpathSync(root),root);assert.deepEqual(fs.readdirSync(root),[]);fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);}],
      ]}),error=>error===original&&error.code==='SYNTHETIC_COMPILE');
      const receipt=readCompileFailure(original);assert.equal(receipt.cleanup.rootRemoved,true);assert.equal(receipt.cleanup.instrumentationRestored,true);
      assert.equal(receipt.cleanupFailures.length,scenario==='stop failure'||scenario==='restore acknowledgment failure'?1:0);
      assert.equal(receipt.expected.refusedWindowsHelper,0);assert.equal(receipt.expected.rollupProbeRefusals,0);
    }finally{assert.equal(cleanup.instrumentationRestored,true);assert.equal(fs.existsSync(root),false);assert.equal(cp.exec,before.exec);assert.equal(fs.writeFileSync,before.write);}
  });
  await t.test('cleanup-only and primitive errors cannot become success',async()=>{
    const error=Error('Synthetic cleanup failure');
    await assert.rejects(withCompileCleanup(async()=>42,{phase:()=> 'report',cleanup:{},steps:[['compiler-stop',()=>{throw error;}]]}),e=>e===error);
    let caught=false,restored=false;
    try{await withCompileCleanup(async()=>42,{phase:()=> 'report',cleanup:{},steps:[['compiler-stop',()=>{throw null;}],['instrumentation-restore',()=>{restored=true;}]]});}
    catch(error){caught=true;assert.equal(error,null);}assert.equal(caught,true);assert.equal(restored,true);
  });
});
test('isolated address identity compile-only correspondence',{skip:process.env.DISCOVERY_ISLAND_COMPILE!=='1',timeout:120000},async t=>{
  const original={spawn:cp.spawn,exec:cp.exec,connect:net.Socket.prototype.connect,write:fs.writeFileSync};
  const env=Object.fromEntries(['TEMP','TMP','ESBUILD_BINARY_PATH'].map(k=>[k,process.env[k]]));
  let fixture;
  try{fixture=await observeIslandCompile(repo,true);}
  catch(error){console.error(JSON.stringify({failure:readCompileFailure(error)}));throw error;}
  const {report,cleanup,record}=fixture,outputKey=Object.keys(report.graph.outputs)[0];
  const expected={sources:report.sources,configuration:report.configuration,tool:report.tool,exportContract:report.exportContract,
    sourceBytes:Object.fromEntries(report.exportContract.map(r=>[r.source,report.sources.find(s=>s.path===r.source).size])),
    graph:clone(report.graph),outputKey,output:clone(report.output)};
  await t.test('two source modules, complete exports and one measured ESM output',()=>{
    assert.deepEqual(report.exportContract,exportContract(repo));assert.equal(report.exportContract.flatMap(r=>r.exports).length,13);
    assert.deepEqual(Object.keys(report.graph.inputs).sort(),['island-entry.ts','src/shared/address_validation.ts','src/shared/identity_policy.ts']);
    assert.equal(Object.keys(report.graph.outputs).length,1);assert.equal(report.graph.outputs[outputKey].imports.length,0);
    assert.equal(report.configuration.treeShaking,false);assert.equal(report.configuration.write,false);assert.equal(report.configuration.format,'esm');
    assert.ok(report.output.bytes>0);assert.match(report.output.sha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(fixture.assess(report),{status:'blocked',productionAuthority:false,runtimeEquivalence:false});
    assert.equal(record.productionAuthority,false);assert.equal(record.completeClosure,false);assert.deepEqual(record.content.outputs,[report.output]);
  });
  const negatives=[
    ['substituted source identity',r=>{r.sources[0].identity.ino='0';}],
    ['substituted source digest',r=>{r.sources[0].sha256='0'.repeat(64);}],
    ['missing source',r=>{r.sources.shift();}],
    ['changed compiler',r=>{r.tool.version='other';}],
    ['tree shaking',r=>{r.configuration.treeShaking=true;}],
    ['missing source export',r=>{r.exportContract[0].exports.pop();}],
    ['missing emitted export',r=>{r.graph.outputs[outputKey].exports.pop();}],
    ['unexpected incorporated module',r=>{r.graph.inputs['unexpected.ts']={bytes:1,imports:[]};}],
    ['missing incorporated source',r=>{delete r.graph.inputs['src/shared/identity_policy.ts'];}],
    ['external input edge',r=>{r.graph.inputs['src/shared/address_validation.ts'].imports[0].external=true;}],
    ['changed source-only edge',r=>{r.graph.inputs['src/shared/identity_policy.ts'].imports[0].path='other.ts';}],
    ['promoted source-only evidence',r=>{r.sourceOnlyReference='unnecessary dependency';}],
    ['changed input bytes',r=>{r.graph.inputs['src/shared/address_validation.ts'].bytes++;}],
    ['substituted entry edge',r=>{r.graph.inputs['island-entry.ts'].imports[0].path='other.ts';}],
    ['extra output',r=>{r.graph.outputs['extra.js']=clone(r.graph.outputs[outputKey]);}],
    ['output imports',r=>{r.graph.outputs[outputKey].imports.push({path:'unexpected.js',external:true});}],
    ['zero source contribution',r=>{r.graph.outputs[outputKey].inputs['src/shared/identity_policy.ts'].bytesInOutput=0;}],
    ['changed output length',r=>{r.output.bytes++;}],
    ['changed output digest',r=>{r.output.sha256='0'.repeat(64);}],
    ['claimed reduction',r=>{r.achievedPayloadCount=824;}],
    ['discarded caller reviews',r=>{r.callerOutputReviews='complete';}],
    ['runtime label',r=>{r.observation='runtime-equivalent';}],
    ...['runtimeEquivalence','facadeRemovability','stagingAdmission','executionAuthority','signingApproval','productionAuthority','productionReady'].map(key=>[key+' claim',r=>{r[key]=true;}]),
  ];
  for(const [name,mutate]of negatives)await t.test(name+' is denied',()=>{
    const candidate=clone(report);mutate(candidate);
    assert.throws(()=>validateCandidate(candidate,expected),/Island compile denied/);
    assert.throws(()=>fixture.assess(candidate),/captured evidence changed/);
  });
  await t.test('owned compiler, roots, environment and instrumentation are cleaned up',()=>{
    assert.equal(cleanup.rootRemoved,true);assert.equal(fs.existsSync(cleanup.root),false);
    for(const key of ['childrenClosed','compilerStopped','instrumentationRestored','environmentRestored'])assert.equal(cleanup[key],true);
    assert.equal(cleanup.childCount,1);assert.equal(cleanup.closedChildCount,1);
    assert.deepEqual(cleanup.activity,{outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:1,refusedWindowsHelper:0});
    assert.deepEqual(cleanup.deniedProcesses,{requests:[],omittedRequests:0});assert.equal(cleanup.rollupProbeRefusals,0);
    assert.equal(cp.spawn,original.spawn);assert.equal(cp.exec,original.exec);assert.equal(net.Socket.prototype.connect,original.connect);assert.equal(fs.writeFileSync,original.write);
    for(const [key,value]of Object.entries(env))assert.equal(process.env[key],value);
  });
  console.log(JSON.stringify({observation:report.observation,tool:report.tool,configuration:report.configuration,graph:report.graph,
    exports:report.exportContract,output:report.output,cleanup,productionAuthority:false,runtimeEquivalence:false}));
});
