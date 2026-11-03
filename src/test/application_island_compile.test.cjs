// Only the explicitly opted-in parent invokes the compiler; generated JS is never loaded.
const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net');
const {observeIslandCompile,validateCandidate,exportContract,readCompileFailure,withCompileCleanup}=require('./support/application_island_compile_fixture.cjs');
const {installGuards}=require('./support/frontend_emission_fixture.cjs');
const repo=path.resolve(__dirname,'../..'),clone=value=>JSON.parse(JSON.stringify(value));
test('island compile requires explicit opt-in',async()=>{
  await assert.rejects(observeIslandCompile(repo,false),/explicit opt-in/);
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
