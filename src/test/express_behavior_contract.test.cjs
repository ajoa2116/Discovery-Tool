// Pure data/assertion tests. No compiler, Express import, generated code or child.
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),crypto=require('node:crypto');
const {plan,expected}=require('./support/express_behavior_contract.cjs');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord,createGeneratedArtifactManifest}=require('../../scripts/stage-backend.cjs');
const {createGeneratedArtifactSelection,buildPackageAdmission,installPackageAdmissionHooks}=require('../../scripts/staged-backend-review.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const baselineFile=process.env.DISCOVERY_EXPRESS_BASELINE_RECORD,compilerFile=process.env.DISCOVERY_EXPRESS_COMPILER_RECORD;
test('Express behavior planning from successful archival metadata, never execution authority',{skip:!baselineFile||!compilerFile},async t=>{
  const archived=JSON.parse(fs.readFileSync(baselineFile,'utf8')),capture=JSON.parse(fs.readFileSync(compilerFile,'utf8'));
  // Model new observations for pure negative testing only. The separate cold
  // original-package fixture must obtain these observations independently.
  const modeled=clone(archived);modeled.observationKind='synthetic-unit-model-not-fresh-observation';
  for(const r of modeled.results)r.behavior=clone(expected[r.mode]);
  let stopped=false;
  const sub=async(name,run)=>t.test(name,{skip:stopped},()=>{try{run();}catch(e){stopped=true;throw e;}});
  const denied=(run,reason)=>assert.throws(run,e=>e.code==='EXPRESS_BEHAVIOR_CONTRACT_DENIED'&&e.reason===reason);
  await sub('metadata correspondence produces only an immutable unexecuted comparison plan',()=>{
    const p=plan({baseline:modeled,compilerRecord:capture});
    assert.equal(p.executionAuthority,false);assert.equal(p.productionAuthority,false);assert.equal(p.completeClosure,false);
    assert.equal(p.generated.behaviorStatus,'unexecuted');assert.equal(p.generated.observedBehavior,null);
    assert.equal(p.generated.equivalence,'not-established');assert.equal(p.generated.independentAdmission,'missing');
    assert.equal(p.generated.sourceOccurrences,347);assert.equal(p.generated.transformedOccurrences,307);
    assert.equal(p.generated.conditionalFiles,5);assert.equal(p.generated.computedEdges,1);
    assert.equal(p.generated.conditionalAdmission,'unadmitted');assert.equal(p.missingExecutionPrerequisites.length,8);
    assert.ok(Object.isFrozen(p.generated.expectedBehavior.core));
    assert.equal(p.original.observationKind,'synthetic-unit-model-not-fresh-observation');
    assert.throws(()=>installPackageAdmissionHooks('unused-no-filesystem-access',p),/Missing package admission evidence/);
  });
  await sub('cache topology stays diagnostic rather than fabricated',()=>{
    const b=clone(modeled);b.results[0].phases=[{phase:'diagnostic-only',cache:['not-an-original-module-layout']}];
    assert.deepEqual(plan({baseline:b,compilerRecord:capture}).generated.expectedBehavior,expected);
    assert.deepEqual(b.results[0].phases[0].cache,['not-an-original-module-layout']);
  });
  for(const [name,mode,change] of [
    ['missing original observation','core',b=>delete b.app],
    ['changed middleware ordering','core',b=>b.ordering.reverse()],
    ['changed response bytes','core',b=>b.response.body='{}'],
    ['changed error dispatch','core',b=>b.error.order.reverse()],
    ['invented computed engine target','computed',b=>b.engineTarget='node_modules/production-engine/index.js'],
  ])await sub(name+' denies',()=>{
    const b=clone(modeled);change(b.results.find(r=>r.mode===mode).behavior);
    denied(()=>plan({baseline:b,compilerRecord:capture}),'behavior-observation:'+mode);
  });
  await sub('caught unexpected load remains a security failure independently of results',()=>{
    const b=clone(modeled);b.results[0].violations.push({reason:'unexpected-import'});
    denied(()=>plan({baseline:b,compilerRecord:capture}),'behavior-unexpected-load');
  });
  await sub('altered generated output measurement denies',()=>{
    const c=clone(capture);c.actual.output.sha256='0'.repeat(64);
    denied(()=>plan({baseline:modeled,compilerRecord:c}),'behavior-output-measurement');
  });
  await sub('changed original source bytes deny',()=>{
    const b=clone(modeled);b.sourceProvenance[0].source.sha256='0'.repeat(64);
    denied(()=>plan({baseline:b,compilerRecord:capture}),'behavior-source-bytes');
  });
  await sub('guard mismatch denies even with a recomputed descriptor digest',()=>{
    const c=clone(capture);c.descriptors.descriptors[0].guard.expression='true';
    c.compilerEvidence.descriptorSha256=hash(c.descriptors);
    denied(()=>plan({baseline:modeled,compilerRecord:c}),'behavior-guard-mismatch');
  });
  await sub('unexpected compiler external dependency denies despite self-consistent metadata digest',()=>{
    const c=clone(capture),graph=JSON.parse(c.rawMetafile);
    Object.values(graph.outputs)[0].imports.push({path:'unreviewed-engine',kind:'require-call',external:true});
    c.rawMetafile=JSON.stringify(graph);c.compilerEvidence.metafile.sha256=crypto.createHash('sha256').update(c.rawMetafile).digest('hex');
    denied(()=>plan({baseline:modeled,compilerRecord:c}),'actual-compiler-external-occurrences');
  });
  await sub('existing generated owner denies missing admission, sticky fallback and cross-case reuse',()=>{
    const record=createGeneratedArtifactRecord({outputs:[{...capture.actual.output,role:'generated-code'}],conditionalGuards:capture.descriptors},capture.observations);
    const manifest=createGeneratedArtifactManifest({candidates:[],unresolved:[]},record);
    const args={roots:[],payloadRoot:'output',sourceRoot:'sources',manifest,inventory:{},catalog:{},
      selection:{variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:[],externalReviews:[],observations:capture.observations}};
    const rejects=(run,reason)=>assert.throws(run,e=>e.code==='GENERATED_ARTIFACT_DENIED'&&(!reason||e.reason===reason));
    rejects(()=>buildPackageAdmission(manifest));
    const owner=createGeneratedArtifactSelection(args);rejects(()=>owner.admit(),'conditional-guard-opt-in');
    assert.equal(owner.denied,true);
    delete manifest.generatedArtifact;
    manifest.candidates=manifest.candidates.map(c=>({...c,source:c.output,status:'copied-candidate'}));
    rejects(()=>owner.admit(),'sticky-denial');
    rejects(()=>buildPackageAdmission(manifest,[{path:capture.actual.output.path,reason:'Source review cannot grant generated authority.'}]));
    rejects(()=>createGeneratedArtifactSelection(args),'selection-owner');
  });
});
