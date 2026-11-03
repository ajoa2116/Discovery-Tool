// Explicit opt-in: executes installed compiler/plugins, never emitted application code.
const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const net=require('node:net'),cp=require('node:child_process');
const {observeFrontendEmission,createNetUseRefusal,withEmissionFailureDiagnostics,readEmissionFailureDiagnostics,installGuards,createRollupProbeBinding}=require('./support/frontend_emission_fixture.cjs');
const enabled=process.env.DISCOVERY_FRONTEND_EMISSION==='1',repo=path.resolve(__dirname,'../..'),clone=v=>JSON.parse(JSON.stringify(v));
test('Windows helper refusal is exact and asynchronous',async t=>{
  await t.test('exact command receives an asynchronous error without a child or mappings',async()=>{
    const activity={refusedWindowsHelper:0};let returned=false;
    const refuse=createNetUseRefusal(activity,()=>assert.fail('Exact invocation rejected'));
    await new Promise(resolve=>{assert.equal(refuse('net use',(error,stdout,stderr)=>{
      assert.equal(returned,true);assert.equal(error.code,'FIXTURE_HELPER_UNAVAILABLE');assert.equal(stdout,'');assert.equal(stderr,'');resolve();
    }),undefined);returned=true;});assert.equal(activity.refusedWindowsHelper,1);
  });
  const invalid=[['net use ',()=>{}],['NET USE',()=>{}],['net use /delete',()=>{}],['net use',{shell:false},()=>{}],['net use'],['net use','callback'],['cmd /c net use',()=>{}],['net use',()=>{},'extra']];
  for(let i=0;i<invalid.length;i++)await t.test('different invocation '+i+' stays denied',()=>{
    const activity={refusedWindowsHelper:0};let denied=0;
    const refuse=createNetUseRefusal(activity,()=>{denied++;throw Error('Unapproved emission child');});
    assert.throws(()=>refuse(...invalid[i]),/Unapproved emission child/);assert.equal(denied,1);assert.equal(activity.refusedWindowsHelper,0);
  });
});
test('synthetic emission failure diagnostics preserve evidence and cleanup',async t=>{
  const complete={outsideWrites:2,network:3,unexpectedChildren:4,compilerChildren:1,refusedWindowsHelper:2};
  const cases=[
    ['complete observed counters',()=>({...complete}),false],
    ['missing activity',()=>undefined,false],
    ['partial counters',()=>({refusedWindowsHelper:3}),false],
    ['invalid values stay unknown',()=>({outsideWrites:-1,network:'0',unexpectedChildren:NaN,compilerChildren:null,refusedWindowsHelper:0}),false],
    ['frozen original exception',()=>({...complete}),true],
    ['cleanup error does not mask guard error',()=>({...complete}),false,'compiler-stop'],
    ['restoration acknowledgment error does not mask guard error',()=>({...complete}),false,'instrumentation-restore'],
    ['root cleanup acknowledgment error does not mask guard error',()=>({...complete}),false,'root-cleanup'],
    ['success remains success',()=>({outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:0,refusedWindowsHelper:1}),false,null,true],
  ];
  for(const [name,makeActivity,frozen,cleanupFailure,success]of cases)await t.test(name,async()=>{
    const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'discovery-emission-diagnostics-'));
    assert.equal(fs.realpathSync(root),root);assert.equal(path.dirname(root),parent);
    fs.writeFileSync(path.join(root,'marker.txt'),'Synthetic cleanup evidence only',{flag:'wx'});
    const before={exec:cp.exec,connect:net.Socket.prototype.connect,write:fs.writeFileSync,rm:fs.promises.rm};
    const guards=installGuards(root,path.join(root,'never-run.exe'),'synthetic',()=>assert.fail('Synthetic case must not spawn'));
    const cleanup={rootRemoved:null,childrenClosed:null,instrumentationRestored:null,environmentRestored:null,compilerStopped:null};
    const events=[],activity=makeActivity(),original=Object.assign(new Error('Emission boundary violation'),{code:'SYNTHETIC_GUARD'}),stack=original.stack;
    if(frozen)Object.freeze(original);
    let captured;
    const operation=(stage,run)=>[stage,async()=>{events.push(stage);await run();if(cleanupFailure===stage)throw Error('Synthetic cleanup acknowledgment failure');}];
    try{
      try{
        const result=await withEmissionFailureDiagnostics(async()=>{if(!success)throw original;return 'synthetic-success';},{
          readActivity:()=>activity,cleanup,phase:()=> 'post-build-guard',steps:[
            operation('compiler-stop',()=>{cleanup.compilerStopped=false;if(cleanupFailure==='compiler-stop')throw Error('Synthetic compiler-stop failure');cleanup.compilerStopped=true;}),
            operation('children-close',()=>{cleanup.childCount=0;cleanup.closedChildCount=0;cleanup.childrenClosed=true;}),
            operation('instrumentation-restore',()=>{guards.restore();cleanup.instrumentationRestored=true;}),
            operation('environment-restore',()=>{cleanup.environmentRestored=true;}),
            operation('root-cleanup',()=>{
              assert.equal(fs.realpathSync(root),root);assert.equal(path.dirname(root),parent);assert.match(path.basename(root),/^discovery-emission-diagnostics-/);
              assert.deepEqual(fs.readdirSync(root),['marker.txt']);fs.unlinkSync(path.join(root,'marker.txt'));fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);
            }),
          ],
        });assert.equal(success,true);assert.equal(result,'synthetic-success');
      }catch(error){captured=error;}
      assert.deepEqual(events,['compiler-stop','children-close','instrumentation-restore','environment-restore','root-cleanup']);
      assert.equal(fs.existsSync(root),false);assert.equal(cleanup.rootRemoved,true);assert.equal(cleanup.instrumentationRestored,true);
      assert.equal(cp.exec,before.exec);assert.equal(net.Socket.prototype.connect,before.connect);assert.equal(fs.writeFileSync,before.write);assert.equal(fs.promises.rm,before.rm);
      assert.deepEqual(guards.activity,{outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:0,refusedWindowsHelper:0});
      if(success){assert.equal(captured,undefined);return;}
      assert.equal(captured,original);assert.equal(captured.message,'Emission boundary violation');assert.equal(captured.code,'SYNTHETIC_GUARD');assert.equal(captured.stack,stack);
      const receipt=readEmissionFailureDiagnostics(captured);assert.equal(receipt.phase,'post-build-guard');assert.equal(receipt.expectedRefusalCount,1);
      assert.deepEqual(receipt.cleanup,{rootRemoved:true,childrenClosed:true,instrumentationRestored:true,environmentRestored:true,compilerStopped:cleanupFailure!=='compiler-stop',childCount:0,closedChildCount:0});
      assert.deepEqual(receipt.cleanupFailureStages,cleanupFailure?[cleanupFailure]:[]);assert.ok(Object.isFrozen(receipt.activity));
      const keys=['outsideWrites','network','unexpectedChildren','compilerChildren','refusedWindowsHelper'];
      for(const key of keys){const value=activity?.[key];assert.equal(receipt.activity[key],Number.isSafeInteger(value)&&value>=0?value:null);}
      if(activity===undefined)assert.deepEqual(receipt.missingCounters,keys);
      if(name==='partial counters')assert.deepEqual(receipt.missingCounters,keys.slice(0,4));
      if(name==='invalid values stay unknown')assert.deepEqual(receipt.invalidCounters,keys.slice(0,4));
      if(activity)activity.refusedWindowsHelper=999;assert.notEqual(receipt.activity.refusedWindowsHelper,999);
      assert.equal(receipt.executionAuthority,false);assert.equal(receipt.productionAuthority,false);
      if(!frozen)assert.equal(captured.emissionFailureDiagnostics,receipt);
    }finally{
      // Every tested path above must have completed shared cleanup; no global cleanup fallback.
      assert.equal(cleanup.instrumentationRestored,true);assert.equal(fs.existsSync(root),false);
    }
  });
  await t.test('missing cleanup evidence is unknown and unreadable counters are not zero',async()=>{
    const original=Error('Emission boundary violation');
    await assert.rejects(withEmissionFailureDiagnostics(async()=>{throw original;},{readActivity:()=>{throw Error('Unavailable synthetic evidence');},cleanup:{},steps:[],phase:()=> 'post-build-guard'}),error=>error===original);
    const receipt=readEmissionFailureDiagnostics(original);
    assert.ok(Object.values(receipt.activity).every(value=>value===null));assert.equal(receipt.missingCounters.length,5);
    assert.ok(Object.values(receipt.cleanup).every(value=>value===null));
  });
  await t.test('a cleanup-only failure keeps its own classification and receipt',async()=>{
    const original=Object.assign(Error('Synthetic cleanup-only failure'),{code:'SYNTHETIC_CLEANUP'});
    await assert.rejects(withEmissionFailureDiagnostics(async()=> 'synthetic-success',{readActivity:()=>({refusedWindowsHelper:1}),cleanup:{},phase:()=> 'report',steps:[['compiler-stop',()=>{throw original;}]]}),error=>error===original&&error.code==='SYNTHETIC_CLEANUP');
    assert.deepEqual(readEmissionFailureDiagnostics(original).cleanupFailureStages,['compiler-stop']);
  });
  await t.test('a null cleanup exception cannot become a successful result',async()=>{
    let completed=false,caught=false;
    try{await withEmissionFailureDiagnostics(async()=> 'synthetic-success',{readActivity:()=>undefined,cleanup:{},steps:[['compiler-stop',()=>{throw null;}],['environment-restore',()=>{completed=true;}]]});}
    catch(error){caught=true;assert.equal(error,null);}
    assert.equal(caught,true);assert.equal(completed,true);assert.equal(readEmissionFailureDiagnostics(null),null);
  });
});
test('synthetic denied process diagnostics are bounded and redacted',async t=>{
  let rootsRemoved=0;
  const run=async exercise=>{
    const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'discovery-process-diagnostics-'));
    assert.equal(fs.realpathSync(root),root);assert.equal(path.dirname(root),parent);
    const before={exec:cp.exec,spawn:cp.spawn,connect:net.Socket.prototype.connect},compiler=path.join(root,'never-run.exe');
    const guards=installGuards(root,compiler,'synthetic',()=>assert.fail('No synthetic request may execute'),()=> 'build');
    const original=Object.assign(Error('Emission boundary violation'),{code:'SYNTHETIC_GUARD'}),cleanup={};let caught;
    try{
      try{await withEmissionFailureDiagnostics(async()=>{await exercise(guards,compiler);throw original;},{
        readActivity:()=>guards.activity,readProcessDenials:()=>guards.readProcessDenials(),cleanup,phase:()=> 'post-build-guard',steps:[
          ['children-close',()=>{cleanup.childCount=0;cleanup.closedChildCount=0;cleanup.childrenClosed=true;}],
          ['instrumentation-restore',()=>{guards.restore();cleanup.instrumentationRestored=true;}],
          ['root-cleanup',()=>{assert.equal(fs.realpathSync(root),root);assert.equal(path.dirname(root),parent);assert.match(path.basename(root),/^discovery-process-diagnostics-/);assert.deepEqual(fs.readdirSync(root),[]);fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);}],
        ],
      });}catch(error){caught=error;}
      assert.equal(caught,original);assert.equal(caught.code,'SYNTHETIC_GUARD');
      assert.equal(cleanup.rootRemoved,true);assert.equal(cleanup.instrumentationRestored,true);assert.equal(fs.existsSync(root),false);
      assert.equal(cp.exec,before.exec);assert.equal(cp.spawn,before.spawn);assert.equal(net.Socket.prototype.connect,before.connect);
      const receipt=readEmissionFailureDiagnostics(caught);assert.equal(receipt.deniedProcesses.status,'observed');
      assert.equal(receipt.cleanup.rootRemoved,true);assert.equal(receipt.cleanup.childrenClosed,true);assert.equal(receipt.cleanup.instrumentationRestored,true);
      rootsRemoved++;return receipt;
    }finally{assert.equal(cleanup.instrumentationRestored,true);assert.equal(fs.existsSync(root),false);}
  };
  for(const api of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])await t.test(api+' denial identifies only safe request details',async()=>{
    const receipt=await run(()=>{
      if(api==='exec'||api==='execSync')assert.throws(()=>cp[api]('git rev-parse HEAD --token=DO_NOT_LOG'),/Unapproved emission child/);
      else assert.throws(()=>cp[api]('git',['rev-parse','HEAD','--token=DO_NOT_LOG'],{env:{TOKEN:'ENV_DO_NOT_LOG'}}),api==='spawn'?/Unapproved emission compiler/:/Unapproved emission child/);
    });
    const row=receipt.deniedProcesses.requests[0];assert.equal(row.api,api);assert.equal(row.executable,'git');assert.equal(row.phase,'build');
    assert.equal(row.reason,api==='spawn'?'compiler-executable-mismatch':'process-api-not-authorized');
    assert.equal(receipt.activity.unexpectedChildren,1);assert.equal(receipt.deniedProcesses.omittedRequests,0);
    assert.equal(JSON.stringify(receipt).includes('DO_NOT_LOG'),false);assert.ok(Object.isFrozen(row));
  });
  await t.test('shell secrets and sensitive-option values are redacted',async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.execSync('powershell -NoProfile -Command "SECRET_BODY" --password HEAD --token=SECRET_TOKEN https://user:password@example.test/PRIVATE'),/Unapproved emission child/));
    const row=receipt.deniedProcesses.requests[0],json=JSON.stringify(receipt);
    assert.equal(row.executable,'powershell');assert.equal(row.argumentBasis,'bounded-shell-tokens');
    for(const secret of ['SECRET_BODY','HEAD','SECRET_TOKEN','user:password','PRIVATE'])assert.equal(json.includes(secret),false);
    assert.ok(row.argumentsSummary.includes('[sensitive-option]'));
  });
  await t.test('options and argument accessors are never read for diagnostics',async()=>{
    let reads=0;const args=[];Object.defineProperty(args,'0',{get(){reads++;throw Error('Private argument getter');},configurable:true});
    const options={get env(){reads++;throw Error('Private environment getter');}};
    const receipt=await run(()=>assert.throws(()=>cp.execFileSync('node',args,options),/Unapproved emission child/));
    assert.equal(reads,0);assert.deepEqual(receipt.deniedProcesses.requests[0].argumentsSummary,['[unavailable]']);
  });
  await t.test('unknown short options cannot expose allowlisted-looking credential values',async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.execFileSync('node',['-p','HEAD','--custom-secret','--version']),/Unapproved emission child/));
    assert.deepEqual(receipt.deniedProcesses.requests[0].argumentsSummary,['[redacted]','[redacted]','[redacted]','[redacted]']);
  });
  await t.test('unrecognized executable paths disclose no private path text',async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.fork('C:\\PRIVATE_DIRECTORY\\OPAQUE_CREDENTIAL.exe',['SECRET_VALUE']),/Unapproved emission child/));
    const row=receipt.deniedProcesses.requests[0];assert.equal(row.executable,'[redacted-unrecognized]');assert.equal(row.pathKind,'absolute');
    for(const secret of ['PRIVATE_DIRECTORY','OPAQUE_CREDENTIAL','SECRET_VALUE'])assert.equal(JSON.stringify(receipt).includes(secret),false);
  });
  await t.test('long command and argument arrays remain bounded',async()=>{
    const receipt=await run(()=>{
      assert.throws(()=>cp.execSync('git '+('SECRET '.repeat(500))),/Unapproved emission child/);
      assert.throws(()=>cp.spawnSync('git',Array(100).fill('SECRET')),/Unapproved emission child/);
    });
    const [shell,array]=receipt.deniedProcesses.requests;assert.equal(shell.commandTruncated,true);assert.equal(shell.argumentCount,null);
    assert.equal(array.argumentCount,100);assert.equal(array.argumentsTruncated,true);assert.equal(array.argumentsSummary.length,8);
    assert.equal(JSON.stringify(receipt).includes('SECRET'),false);assert.ok(JSON.stringify(receipt).length<5000);
  });
  await t.test('denial list truncation retains actual total counter',async()=>{
    const receipt=await run(()=>{for(let i=0;i<12;i++)assert.throws(()=>cp.execSync('git --version'),/Unapproved emission child/);});
    assert.equal(receipt.activity.unexpectedChildren,12);assert.equal(receipt.deniedProcesses.requests.length,8);assert.equal(receipt.deniedProcesses.omittedRequests,4);
  });
  await t.test('missing command or arguments remain unknown',async()=>{
    const receipt=await run(()=>{assert.throws(()=>cp.exec(undefined),/Unapproved emission child/);assert.throws(()=>cp.execFileSync('git'),/Unapproved emission child/);});
    const [command,args]=receipt.deniedProcesses.requests;assert.equal(command.executable,null);assert.equal(command.argumentCount,null);assert.equal(command.argumentsSummary,null);
    assert.equal(args.argumentCount,null);assert.equal(args.argumentsSummary,null);
  });
  await t.test('compiler argument mismatch remains denied',async()=>{
    const receipt=await run((_guards,compiler)=>assert.throws(()=>cp.spawn(compiler,['--version']),/Unapproved emission compiler/));
    assert.equal(receipt.deniedProcesses.requests[0].reason,'compiler-arguments-mismatch');assert.equal(receipt.activity.compilerChildren,0);
  });
  await t.test('additional compiler service remains denied',async()=>{
    const receipt=await run((guards,compiler)=>{guards.activity.compilerChildren=1;assert.throws(()=>cp.spawn(compiler,['--service=synthetic','--ping']),/Unapproved emission compiler/);});
    assert.equal(receipt.deniedProcesses.requests[0].reason,'compiler-already-started');assert.equal(receipt.activity.unexpectedChildren,1);
  });
  await t.test('exact helper refusal never becomes a denied process entry',async()=>{
    const receipt=await run(()=>new Promise(resolve=>cp.exec('net use',(error,stdout,stderr)=>{assert.equal(error.code,'FIXTURE_HELPER_UNAVAILABLE');assert.equal(stdout,'');assert.equal(stderr,'');resolve();})));
    assert.deepEqual(receipt.deniedProcesses,{status:'observed',requests:[],omittedRequests:0});assert.equal(receipt.activity.refusedWindowsHelper,1);assert.equal(receipt.activity.unexpectedChildren,0);
  });
  await t.test('missing or substituted denial evidence cannot leak arbitrary records',async()=>{
    for(const readProcessDenials of [undefined,()=>({requests:[{api:'exec',command:'SECRET_COMMAND'}],omittedRequests:0}),()=>{throw Error('Unavailable synthetic ledger');}]){
      const original=Error('Emission boundary violation');await assert.rejects(withEmissionFailureDiagnostics(async()=>{throw original;},{readActivity:()=>undefined,readProcessDenials,cleanup:{},steps:[]}),error=>error===original);
      const receipt=readEmissionFailureDiagnostics(original);assert.deepEqual(receipt.deniedProcesses,{status:'unavailable',requests:null,omittedRequests:null});assert.equal(JSON.stringify(receipt).includes('SECRET_COMMAND'),false);
    }
  });
  console.log(JSON.stringify({syntheticProcessRootsRemoved:rootsRemoved,processesExecuted:0,networkActivity:0}));
});
test('synthetic source-bound Rollup report probe refusal',async t=>{
  const binding=createRollupProbeBinding();let rootsRemoved=0;
  assert.equal(binding.version,'4.63.1');assert.equal(binding.nodeExecutable,process.execPath);
  assert.equal(binding.observations[1].path,'node_modules/rollup/dist/native.js');
  const run=async(exercise,{source=binding,phase='tool-load'}={})=>{
    const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'discovery-rollup-refusal-'));
    assert.equal(fs.realpathSync(root),root);assert.equal(path.dirname(root),parent);
    const before={spawnSync:cp.spawnSync,exec:cp.exec,write:fs.writeFileSync},cleanup={};
    const guards=installGuards(root,path.join(root,'never-run.exe'),'synthetic',()=>assert.fail('No synthetic child may execute'),()=>phase,source);
    const original=Error('Emission boundary violation');let caught;
    try{
      try{await withEmissionFailureDiagnostics(async()=>{await exercise(guards);throw original;},{
        readActivity:()=>guards.activity,readProcessDenials:()=>guards.readProcessDenials(),readRollupProbeRefusal:()=>guards.readRollupProbeRefusal(),cleanup,phase:()=> 'post-build-guard',steps:[
          ['children-close',()=>{cleanup.childCount=0;cleanup.closedChildCount=0;cleanup.childrenClosed=true;}],
          ['instrumentation-restore',()=>{guards.restore();cleanup.instrumentationRestored=true;}],
          ['root-cleanup',()=>{assert.equal(fs.realpathSync(root),root);assert.equal(path.dirname(root),parent);assert.match(path.basename(root),/^discovery-rollup-refusal-/);assert.deepEqual(fs.readdirSync(root),[]);fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);}],
        ],
      });}catch(error){caught=error;}
      assert.equal(caught,original);assert.equal(cp.spawnSync,before.spawnSync);assert.equal(cp.exec,before.exec);assert.equal(fs.writeFileSync,before.write);
      assert.equal(fs.existsSync(root),false);assert.equal(cleanup.rootRemoved,true);assert.equal(cleanup.instrumentationRestored,true);rootsRemoved++;
      return readEmissionFailureDiagnostics(caught);
    }finally{assert.equal(cleanup.instrumentationRestored,true);assert.equal(fs.existsSync(root),false);}
  };
  await t.test('exact measured probe throws unavailable error without data or subprocess',async()=>{
    const receipt=await run(()=>{
      let result,unavailable;
      try{result=cp.spawnSync(binding.nodeExecutable,[...binding.arguments],{...binding.options});}catch(error){unavailable=error;}
      assert.equal(result,undefined);assert.equal(unavailable.code,'FIXTURE_ROLLUP_REPORT_UNAVAILABLE');assert.equal('stdout' in unavailable,false);
      // Rollup's inspected catch returns null; no actual getReport() call occurs here.
      const fallback=unavailable?null:result;assert.equal(fallback,null);
    });
    assert.equal(receipt.rollupProbeRefusalCount,1);assert.equal(receipt.expectedRollupProbeRefusalCount,1);
    assert.equal(receipt.activity.unexpectedChildren,0);assert.equal(receipt.activity.compilerChildren,0);
    assert.deepEqual(receipt.deniedProcesses,{status:'observed',requests:[],omittedRequests:0});
  });
  await t.test('repeat exact requests are counted, not silently collapsed',async()=>{
    const receipt=await run(()=>{for(let i=0;i<2;i++)assert.throws(()=>cp.spawnSync(binding.nodeExecutable,[...binding.arguments],{...binding.options}),{code:'FIXTURE_ROLLUP_REPORT_UNAVAILABLE'});});
    assert.equal(receipt.rollupProbeRefusalCount,2);assert.equal(receipt.expectedRollupProbeRefusalCount,1);assert.equal(receipt.activity.unexpectedChildren,0);
  });
  await t.test('Vite helper and Rollup probe refusals stay separate',async()=>{
    const receipt=await run(async()=>{
      await new Promise(resolve=>cp.exec('net use',error=>{assert.equal(error.code,'FIXTURE_HELPER_UNAVAILABLE');resolve();}));
      assert.throws(()=>cp.spawnSync(binding.nodeExecutable,[...binding.arguments],{...binding.options}),{code:'FIXTURE_ROLLUP_REPORT_UNAVAILABLE'});
    });
    assert.equal(receipt.activity.refusedWindowsHelper,1);assert.equal(receipt.rollupProbeRefusalCount,1);assert.equal(receipt.activity.unexpectedChildren,0);
  });
  const negativeBindings=[
    ['changed native source digest',b=>{b.observations[1].sha256='0'.repeat(64);}],
    ['substituted native file identity',b=>{b.observations[1].identity.ino='0';}],
    ['substituted source path',b=>{b.observations[1].path='node_modules/rollup/dist/other.js';}],
    ['different Rollup version',b=>{b.version='4.63.2';}],
    ['different binding executable',b=>{b.nodeExecutable='node';}],
  ];
  for(const [name,change]of negativeBindings)await t.test(name+' stays denied',async()=>{
    const source=clone(binding);change(source);
    const receipt=await run(()=>assert.throws(()=>cp.spawnSync(binding.nodeExecutable,[...binding.arguments],{...binding.options}),/Unapproved emission child/),{source});
    assert.equal(receipt.rollupProbeRefusalCount,0);assert.equal(receipt.activity.unexpectedChildren,1);
  });
  const requests=[
    ['executable alias',()=>['node',[...binding.arguments],{...binding.options}]],
    ['changed first literal',()=>[binding.nodeExecutable,['--print',binding.arguments[1]],{...binding.options}]],
    ['changed report script',()=>[binding.nodeExecutable,['-p',binding.arguments[1]+';'],{...binding.options}]],
    ['extra argument',()=>[binding.nodeExecutable,[...binding.arguments,'extra'],{...binding.options}]],
    ['missing argument',()=>[binding.nodeExecutable,['-p'],{...binding.options}]],
    ['changed encoding',()=>[binding.nodeExecutable,[...binding.arguments],{...binding.options,encoding:'utf16le'}]],
    ['changed timeout',()=>[binding.nodeExecutable,[...binding.arguments],{...binding.options,timeout:4000}]],
    ['visible window option',()=>[binding.nodeExecutable,[...binding.arguments],{...binding.options,windowsHide:false}]],
    ['extra environment option',()=>[binding.nodeExecutable,[...binding.arguments],{...binding.options,env:{TOKEN:'DO_NOT_LOG'}}]],
    ['missing options',()=>[binding.nodeExecutable,[...binding.arguments]]],
    ['extra parameter',()=>[binding.nodeExecutable,[...binding.arguments],{...binding.options},'extra']],
  ];
  for(const [name,request]of requests)await t.test(name+' stays denied',async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.spawnSync(...request()),/Unapproved emission child/));
    assert.equal(receipt.rollupProbeRefusalCount,0);assert.equal(receipt.activity.unexpectedChildren,1);assert.equal(JSON.stringify(receipt).includes('DO_NOT_LOG'),false);
  });
  for(const phase of ['build','unknown'])await t.test('exact probe outside tool-load stays denied: '+phase,async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.spawnSync(binding.nodeExecutable,[...binding.arguments],{...binding.options}),/Unapproved emission child/),{phase});
    assert.equal(receipt.rollupProbeRefusalCount,0);assert.equal(receipt.activity.unexpectedChildren,1);
  });
  await t.test('unbound guard does not recognize the probe',async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.spawnSync(binding.nodeExecutable,[...binding.arguments],{...binding.options}),/Unapproved emission child/),{source:null});
    assert.equal(receipt.rollupProbeRefusalCount,0);assert.equal(receipt.activity.unexpectedChildren,1);
  });
  await t.test('option accessors are denied without reading them',async()=>{
    let reads=0;const options={...binding.options};Object.defineProperty(options,'timeout',{enumerable:true,get(){reads++;throw Error('Private getter');}});
    const receipt=await run(()=>assert.throws(()=>cp.spawnSync(binding.nodeExecutable,[...binding.arguments],options),/Unapproved emission child/));
    assert.equal(reads,0);assert.equal(receipt.rollupProbeRefusalCount,0);assert.equal(receipt.activity.unexpectedChildren,1);
  });
  await t.test('another process API never receives probe recognition',async()=>{
    const receipt=await run(()=>assert.throws(()=>cp.execFileSync(binding.nodeExecutable,[...binding.arguments],{...binding.options}),/Unapproved emission child/));
    assert.equal(receipt.rollupProbeRefusalCount,0);assert.equal(receipt.activity.unexpectedChildren,1);
  });
  console.log(JSON.stringify({rollupProfile:binding.profile,nativeSourceSha256:binding.observations[1].sha256,syntheticRootsRemoved:rootsRemoved,probeChildrenExecuted:0,reportDataFabricated:false}));
});
test('isolated observed frontend emission correspondence',{skip:!enabled,timeout:120000},async t=>{
  let fixture;
  try{fixture=await observeFrontendEmission(repo,true);}
  catch(error){console.error(JSON.stringify({emissionFailureDiagnostics:readEmissionFailureDiagnostics(error)}));throw error;}
  const report=fixture.report;
  await t.test('seven source contributions bind actual compiler output and remain blocked',()=>{
    assert.equal(report.records.length,7);assert.equal(new Set(report.records.map(r=>r.source)).size,7);
    for(const row of report.records){assert.ok(row.measurement.identity.ino);assert.match(row.measurement.sha256,/^[a-f0-9]{64}$/);
      assert.equal(row.removable,false);assert.ok(['observed-rendered-contribution','unresolved-absent-or-zero'].includes(row.status));
      if(!row.chunks.length||row.chunks.every(c=>c.renderedLength===0))assert.equal(row.status,'unresolved-absent-or-zero');
      for(const chunk of row.chunks){assert.ok(report.outputs.some(o=>o.type==='chunk'&&o.fileName===chunk.fileName));assert.ok(chunk.renderedLength>=0);}
    }
    for(const output of report.outputs){assert.ok(output.size>=0);assert.match(output.sha256,/^[a-f0-9]{64}$/);}
    assert.equal(fixture.assess(report).status,'blocked');assert.equal(report.limits.authoritativeBaseline,825);assert.equal(report.limits.ceiling,64);
    for(const key of ['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','productionAuthority','productionReady'])assert.equal(report[key],false);
    assert.equal(report.configuration.write,false);assert.equal(report.configuration.envFile,false);assert.equal(report.configuration.postBuildScriptExecuted,false);
    assert.equal(report.observationVariant,'helper-unavailable, Rollup-native-selection-fallback evidence');
    assert.deepEqual(report.windowsHelper,{command:'net use',refusalCount:1,callback:'asynchronous-controlled-error',executed:false,successfulMappingsFabricated:false});
    assert.equal(report.rollupNativeProbe.refusalCount,1);assert.equal(report.rollupNativeProbe.executed,false);assert.equal(report.rollupNativeProbe.reportDataFabricated,false);
  });
  const negatives=[
    ['substituted source identity',r=>{r.records[0].measurement.identity.ino='0';}],
    ['changed source digest',r=>{r.records[0].measurement.sha256='0'.repeat(64);}],
    ['invented chunk mapping',r=>{r.records[0].chunks.push({fileName:'invented.js',renderedLength:100});}],
    ['fabricated rendered contribution',r=>{r.records[0].chunks=[{fileName:r.outputs[0].fileName,renderedLength:99999999}];}],
    ['omitted target',r=>r.records.pop()],
    ['substituted output digest',r=>{r.outputs[0].sha256='0'.repeat(64);}],
    ['substituted tool version',r=>{r.tools[0].version='invented';}],
    ['unsupported build configuration claim',r=>{r.configuration.write=true;}],
    ['absent module treated as removable',r=>{r.records[0].chunks=[];r.records[0].removable=true;}],
    ['runtime equivalence claim',r=>{r.limits.runtimeEquivalence=true;}],
    ['full closure claim',r=>{r.limits.completeDependencyClosure=true;}],
    ['facade removal claim',r=>{r.limits.backendFacadeRemovability=true;}],
    ['ceiling-met claim',r=>{r.limits.ceilingMet=true;}],
    ['false helper refusal count',r=>{r.windowsHelper.refusalCount=0;}],
    ['helper execution claim',r=>{r.windowsHelper.executed=true;}],
    ['normal-build equivalence label',r=>{r.observationVariant='normal-build equivalent';}],
    ['false Rollup refusal count',r=>{r.rollupNativeProbe.refusalCount=0;}],
    ['fabricated Rollup report claim',r=>{r.rollupNativeProbe.reportDataFabricated=true;}],
    ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','productionAuthority','productionReady'].map(key=>[key+' claim',r=>{r[key]=true;}]),
  ];
  for(const [name,mutate]of negatives)await t.test(name+' denies',()=>{const candidate=clone(report);mutate(candidate);assert.throws(()=>fixture.assess(candidate),/differs from captured/);});
  await t.test('owned compiler/cache/config resources are closed and removed',()=>{
    assert.equal(fixture.cleanup.rootRemoved,true);assert.equal(fs.existsSync(fixture.cleanup.root),false);assert.equal(fixture.cleanup.childrenClosed,true);assert.equal(fixture.cleanup.instrumentationRestored,true);
    assert.deepEqual(fixture.cleanup.activity,{outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:1,refusedWindowsHelper:1});
    assert.equal(fixture.cleanup.rollupProbeRefusalCount,1);
  });
  console.log(JSON.stringify({observationVariant:report.observationVariant,windowsHelper:report.windowsHelper,rollupNativeProbe:report.rollupNativeProbe,tools:report.tools.map(t=>({name:t.name,version:t.version})),outputs:report.outputs,records:report.records.map(r=>({source:r.source,status:r.status,chunks:r.chunks})),cleanup:fixture.cleanup,generatedApplicationExecuted:false,productionAuthority:false}));
});
