// Explicit opt-in: executes installed compiler/plugins, never emitted application code.
const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs');
const {observeFrontendEmission,createNetUseRefusal}=require('./support/frontend_emission_fixture.cjs');
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
test('isolated observed frontend emission correspondence',{skip:!enabled,timeout:120000},async t=>{
  const fixture=await observeFrontendEmission(repo,true),report=fixture.report;
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
    assert.equal(report.observationVariant,'helper-unavailable fallback observations');
    assert.deepEqual(report.windowsHelper,{command:'net use',refusalCount:1,callback:'asynchronous-controlled-error',executed:false,successfulMappingsFabricated:false});
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
    ...['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','productionAuthority','productionReady'].map(key=>[key+' claim',r=>{r[key]=true;}]),
  ];
  for(const [name,mutate]of negatives)await t.test(name+' denies',()=>{const candidate=clone(report);mutate(candidate);assert.throws(()=>fixture.assess(candidate),/differs from captured/);});
  await t.test('owned compiler/cache/config resources are closed and removed',()=>{
    assert.equal(fixture.cleanup.rootRemoved,true);assert.equal(fs.existsSync(fixture.cleanup.root),false);assert.equal(fixture.cleanup.childrenClosed,true);assert.equal(fixture.cleanup.instrumentationRestored,true);
    assert.deepEqual(fixture.cleanup.activity,{outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:1,refusedWindowsHelper:1});
  });
  console.log(JSON.stringify({observationVariant:report.observationVariant,windowsHelper:report.windowsHelper,tools:report.tools.map(t=>({name:t.name,version:t.version})),outputs:report.outputs,records:report.records.map(r=>({source:r.source,status:r.status,chunks:r.chunks})),cleanup:fixture.cleanup,generatedApplicationExecuted:false,productionAuthority:false}));
});
