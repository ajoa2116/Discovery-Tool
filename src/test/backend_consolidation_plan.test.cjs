// Historical successful records and fresh inert JSON snapshots only.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {generatedArtifactContentHash:hash}=require('../../scripts/stage-backend.cjs');
const {observeCatalogFiles,createCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission,installPackageAdmissionHooks}=require('../../scripts/staged-backend-review.cjs');
const {profile,createPlanAssessment}=require('./support/backend_consolidation_plan.cjs');
const iconv=require('./support/iconv_artifact_metadata.cjs'),{specs}=require('./support/dependency_guard_descriptors.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),enabled=process.env.DISCOVERY_CONSOLIDATION_ARCHIVES;
const {loadReviewedPlan}=require('./support/reviewed_backend_plan_fixture.cjs');
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('whole-backend archival plan accounting and fail-closed projections',{skip:!enabled},async t=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);assert.match(path.basename(parent),/^discovery-plan-validation-[a-f0-9]{32}$/);assert.deepEqual(fs.readdirSync(parent),[]);
  const archive=JSON.parse(enabled); // Explicit successful roots only; no search of Temp.
  const {baseline,proposals,plan}=loadReviewedPlan(archive);
  const originalsHash=hash({baseline,proposals,plan});let failed=false,cases=0,filesRemoved=0,positive;
  const sub=async(name,run)=>t.test(name,{skip:failed},()=>{
    const base=fs.mkdtempSync(path.join(parent,'plan-'));checked(base);const roots=[{id:'evidence',path:base}];let completed=false;
    try{
      const input={profile,baseline:clone(baseline),proposals:clone(proposals),plan:clone(plan)};
      const refresh=()=>{
        for(const [name,value] of [['baseline.json',input.baseline],['proposals.json',input.proposals]])fs.writeFileSync(path.join(base,name),JSON.stringify(value));
        const manifest={productionAuthority:false,candidates:['baseline.json','proposals.json'].map(output=>({source:output,output,status:'copied-candidate',selectionReasons:['Explicit archival fixture snapshot; no execution.']})),unresolved:[]};
        const catalog=createCatalog({roots,staging:{root:'evidence',manifest}});
        input.evidence={roots,catalog,observations:observeCatalogFiles(roots,['baseline.json','proposals.json'].map(path=>({root:'evidence',path})))};
      };
      refresh();run({input,refresh,base});
      assert.equal(hash({baseline,proposals,plan}),originalsHash,'No shared archival records may change');
      checked(base);assert.equal(path.dirname(base),parent);assert.deepEqual(fs.readdirSync(base).sort(),['baseline.json','proposals.json']);
      fs.rmSync(base,{recursive:true});assert.equal(fs.existsSync(base),false);cases++;filesRemoved+=2;completed=true;
    }catch(e){failed=true;throw e;}finally{if(!completed)console.error('STOP; preserve only this new planner case: '+base);}
  });
  const denied=(f,reason)=>{const owner=createPlanAssessment(f.input),r=owner.assess();assert.equal(r.status,'denied',JSON.stringify(r));assert.equal(r.reason,reason);assert.equal(r.executionAuthority,false);assert.equal(owner.assess().reason,'plan-sticky-denial');return r;};
  await sub('all 825 dispositions, original uncertainty and overlap accounted; no combined payload claim',f=>{
    const before=hash(f.input),owner=createPlanAssessment(f.input),r=owner.assess();assert.equal(hash(f.input),before);assert.equal(r.status,'blocked',JSON.stringify(r));
    assert.equal(r.baselineCount,825);assert.equal(r.unresolvedRecords,4736);assert.equal(r.inventoryUnresolvedRecords,882);
    assert.deepEqual(r.unresolved,f.input.plan.unresolved);assert.deepEqual(r.inventoryUnresolved,f.input.baseline.inventory.unresolved);
    assert.equal(r.retainedPhysical+r.incorporatedSourceOnly,825);assert.equal(r.generatedPhysicalOutputs,3);
    assert.equal(r.conditionalArithmeticCount,r.retainedPhysical+3);assert.equal(r.proposedPhysicalCount,null);
    assert.equal(r.countAboveCeilingUnderAssumptions,r.conditionalArithmeticCount-64);assert.equal(r.ceilingMet,false);
    assert.equal(r.graphCounts.express.incorporated,135);assert.equal(r.graphCounts.express.transformed,307);assert.equal(r.graphCounts.express.sourceOccurrences,347);
    assert.equal(r.graphCounts.iconv.incorporated,13);assert.equal(r.graphCounts.iconv.sourceOccurrences,38);assert.equal(r.graphCounts.iconv.runtimeTuples,16);
    assert.equal(r.overlappingProposalSelections.length,24);assert.deepEqual(r.overlappingIncorporation,[]);assert.deepEqual(r.conflictingReplacements,[]);
    assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);assert.ok(Object.isFrozen(r));
    assert.throws(()=>installPackageAdmissionHooks(f.base,r),/Missing package admission evidence/);
    assert.equal(buildPackageAdmission(f.input.baseline.manifest).admitted.length,165);
    assert.equal(owner.assess().reason,'plan-sticky-denial');assert.throws(()=>createPlanAssessment(f.input),e=>e.reason==='plan-owner-reuse');
    positive=r;
  });
  await sub('opt-in required',f=>{f.input.profile='default';assert.throws(()=>createPlanAssessment(f.input),e=>e.reason==='plan-opt-in');});
  await sub('missing disposition denies',f=>{f.input.plan.dispositions.pop();denied(f,'plan-disposition-count');});
  await sub('duplicate baseline disposition denies',f=>{f.input.plan.dispositions[1]=clone(f.input.plan.dispositions[0]);denied(f,'plan-disposition-alias');});
  await sub('case-aliased disposition denies',f=>{f.input.plan.dispositions[0].path=f.input.plan.dispositions[0].path.toUpperCase();denied(f,'plan-disposition-alias');});
  await sub('unsupported exclusion denies',f=>{f.input.plan.dispositions[0].disposition='unobserved-drop';denied(f,'plan-unsupported-exclusion');});
  await sub('uncertainty removal denies',f=>{f.input.plan.unresolved.pop();denied(f,'plan-unresolved-preservation');});
  await sub('uncertainty reordering/reclassification denies',f=>{f.input.plan.unresolved.reverse();denied(f,'plan-unresolved-preservation');});
  await sub('output substitution denies',f=>{f.input.plan.outputs[0].file.sha256='0'.repeat(64);denied(f,'plan-output-substitution');});
  await sub('double-counted generated output denies',f=>{f.input.plan.outputs.push(clone(f.input.plan.outputs[0]));denied(f,'plan-output-substitution');});
  await sub('copied candidate cannot relabel generated output as original source',f=>{f.input.plan.outputs[0].file.role='copied-candidate';denied(f,'plan-output-substitution');});
  await sub('source measurement changed denies',f=>{f.input.plan.dispositions[0].file.outputIdentity.file=0;denied(f,'plan-disposition-measurement');});
  await sub('missing incorporation correspondence denies',f=>{f.input.plan.dispositions.find(d=>d.proposals.length).proposals=[];denied(f,'plan-incorporation-claims');});
  await sub('conflicting replacement claims deny',f=>{f.input.plan.dispositions.find(d=>d.proposals.length).proposals=['express','iconv'];denied(f,'plan-incorporation-claims');});
  await sub('conditional source omission denies',f=>{f.input.plan.dispositions.find(d=>d.path===specs[0].target).disposition='incorporated-source-only';denied(f,'plan-protected-dependency');});
  await sub('unknown ancillary file cannot disappear',f=>{f.input.plan.dispositions.find(d=>d.path===iconv.unknown[0]).disposition='retained';denied(f,'plan-protected-disposition');});
  await sub('split selection cannot bypass ceiling',f=>{f.input.plan.selections=[{manifestCeiling:64}];denied(f,'plan-shape');});
  await sub('altered ceiling cannot bypass policy',f=>{f.input.plan.manifestCeiling=1024;denied(f,'plan-shape');});
  await sub('unreviewed derivation denies',f=>{f.input.proposals[0].review.recordSha256='0'.repeat(64);f.refresh();denied(f,'plan-independent-proposal-review');});
  await sub('missing actual source occurrence denies even after evidence rebinding',f=>{const p=f.input.proposals[0];p.record.sourceEdges.pop();p.review.recordSha256=hash(p.record);f.refresh();denied(f,'plan-source-edge-provenance');});
  await sub('conditional guard tampering denies',f=>{const p=f.input.proposals[0];p.record.descriptors.descriptors[0].guard.expression='true';p.record.compilerEvidence.descriptorSha256=hash(p.record.descriptors);p.review.recordSha256=hash(p.record);f.refresh();denied(f,'plan-conditional-or-computed-change');});
  await sub('current evidence byte substitution denies',f=>{fs.appendFileSync(path.join(f.base,'proposals.json'),' ');const r=createPlanAssessment(f.input).assess();assert.equal(r.status,'denied');assert.equal(r.executionAuthority,false);});
  if(!failed){assert.deepEqual(fs.readdirSync(parent),[]);console.log(JSON.stringify({cases,filesRemoved,temporaryCaseRootsRemaining:0,compilerChildren:0,consumerChildren:0,
    accounting:{baseline:positive.baselineCount,retained:positive.retainedPhysical,sourceOnly:positive.incorporatedSourceOnly,outputs:3,conditionalArithmetic:positive.conditionalArithmeticCount,
      defensibleCombinedPhysicalCount:null,selectionOverlap:positive.overlappingProposalSelections.length,incorporationOverlap:positive.overlappingIncorporation.length,
      unresolvedPhysical:positive.retainedUnresolvedConditionalUnknown,aboveCeiling:positive.countAboveCeilingUnderAssumptions}}));}
});
