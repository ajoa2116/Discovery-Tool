// Repository-local JSON and source AST only; no recovery root, fixtures or runtime imports.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {profile,loadInput,derive,createAssessment}=require('./support/service_route_candidate_mapping.cjs');
const {generatedArtifactContentHash:hash}=require('../../scripts/stage-backend.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
test('service-route candidate compatibility stays isolated and non-authorizing',async t=>{
  const input=loadInput(path.resolve(__dirname,'../..')),before=hash(input),model=derive(input);let failed=false,cases=0;
  const sub=async(name,run)=>t.test(name,{skip:failed},()=>{try{run();cases++;}catch(e){failed=true;throw e;}});
  const denial=(change,reason)=>{
    const candidate=clone(model);change(candidate);const owner=createAssessment(input,candidate),r=owner.assess();
    assert.equal(r.status,'denied',JSON.stringify(r));assert.equal(r.reason,reason);assert.equal(r.executionAuthority,false);
    assert.equal(r.productionAuthority,false);assert.equal(r.productionReady,false);assert.equal(owner.assess().reason,'mapping-sticky-denial');
  };
  await sub('four caller slots, five exports, seven external occurrences, both tools and nine source fixtures',()=>{
    const r=createAssessment(input,clone(model)).assess();assert.equal(r.status,'blocked',JSON.stringify(r));
    assert.equal(r.profile,profile);assert.equal(r.candidateMapping,'structurally-consistent-only');
    assert.deepEqual(r.coverage,{callers:4,exports:5,externalOccurrences:7,reviewReferences:4,probeReferences:3,sourceTestFiles:9});
    assert.deepEqual(r.candidate.callerMappings.map(r=>r.historicalEmittedImport.slot),[0,10,50,51]);
    assert.ok(r.candidate.callerMappings.every(r=>r.candidate.specifier==='./service_routes.generated.js'&&!r.candidate.mergeDeclarations));
    assert.deepEqual(r.candidate.currentFactoryCalls.map(r=>r.name),['taskHttpIntegration','createCurrentListRouter','createReportSetRouter','createReportRouter']);
    assert.equal(r.candidate.externalOccurrences.filter(r=>r.source.specifier==='express').length,4);
    assert.equal(new Set(r.candidate.externalOccurrences.map(r=>r.compilerImport.index)).size,7);
    assert.deepEqual(r.candidate.externalOccurrences.filter(r=>r.source.specifier==='express').map(r=>r.compilerImport.bindings[0].local),['Router','Router4','Router3','Router2']);
    assert.ok(r.candidate.toolBoundaries.every(r=>r.shipped===false&&r.behaviorChanged===false&&!r.historicalIdentityOrReviewTransferred));
    assert.ok(r.candidate.sourceCompatibility.every(r=>!r.shippedRuntimeFile&&!r.validatesGeneratedCandidate));
    assert.equal(r.candidate.preservedEvidence.sourceCorrespondence.length,13);assert.equal(r.candidate.preservedEvidence.routeUncertainty.length,4);
    assert.equal(r.candidate.preservedEvidence.globalUncertainty.staging,4736);assert.equal(r.candidate.preservedEvidence.globalUncertainty.inventory,882);
    assert.equal(r.candidate.historicalEvidence.liveOutputAvailable,false);assert.equal(r.candidate.historicalEvidence.currentAdmission,false);
    assert.equal(r.candidate.candidateOutput.sha256,null);assert.equal(r.candidate.candidateOutput.identity,null);
    assert.equal(r.physical.authoritativeBaseline,825);assert.equal(r.physical.conditionalCandidate,822);assert.equal(r.physical.netSaved,3);
    assert.deepEqual(r.physical.compatibilityFiles,[]);assert.deepEqual(r.physical.retainedOriginals,[]);assert.deepEqual(r.physical.additionalGeneratedOutputs,[]);
    assert.equal(r.physical.achievedPayload,null);assert.equal(r.physical.admittedPayload,null);assert.equal(r.physical.ceiling,64);assert.equal(r.physical.ceilingMet,false);
    assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);assert.equal(r.selectionAndAdmissionChanged,false);assert.ok(Object.isFrozen(r.candidate));
  });
  const negatives=[
    ['missing caller',c=>c.callerMappings.pop(),'mapping-caller-count'],
    ['duplicate caller occurrence',c=>c.callerMappings[1]=clone(c.callerMappings[0]),'mapping-caller-duplicate'],
    ['caller order changed',c=>c.callerMappings.reverse(),'mapping-caller-correspondence'],
    ['ambiguous caller alternatives',c=>c.callerMappings[0].alternatives=['a.js','b.js'],'mapping-caller-correspondence'],
    ['caller export alias changed',c=>c.callerMappings[0].candidate.named[0].local='otherFactory','mapping-caller-correspondence'],
    ['caller path/query alias substituted',c=>c.callerMappings[0].candidate.specifier+='?alternate','mapping-caller-correspondence'],
    ['caller declarations merged',c=>c.callerMappings[0].candidate.mergeDeclarations=true,'mapping-caller-correspondence'],
    ['factory order changed',c=>c.currentFactoryCalls.reverse(),'mapping-caller-correspondence'],
    ['missing export',c=>c.exports.pop(),'mapping-exports'],
    ['renamed export',c=>c.exports[0].name='otherExport','mapping-exports'],
    ['export origin substituted',c=>c.exports[0].origin=c.exports[1].origin,'mapping-exports'],
    ['dropped external occurrence',c=>c.externalOccurrences.pop(),'mapping-external-occurrences'],
    ['four express occurrences collapsed',c=>{c.externalOccurrences=c.externalOccurrences.filter(r=>r.source.specifier!=='express'||r.occurrence===0);},'mapping-external-occurrences'],
    ['invented external occurrence',c=>c.externalOccurrences.push(clone(c.externalOccurrences[0])),'mapping-external-occurrences'],
    ['external target substituted',c=>c.externalOccurrences[0].source.resolved='node_modules/other/index.js','mapping-external-occurrences'],
    ['compiler occurrence reused',c=>c.externalOccurrences[1].compilerImport=clone(c.externalOccurrences[0].compilerImport),'mapping-external-occurrences'],
    ['missing review-tool mapping',c=>c.toolBoundaries[0].references.pop(),'mapping-tool-boundaries'],
    ['missing probe-tool mapping',c=>c.toolBoundaries[1].references.pop(),'mapping-tool-boundaries'],
    ['review mapping inherits old admission',c=>c.toolBoundaries[0].historicalIdentityOrReviewTransferred=true,'mapping-tool-boundaries'],
    ['probe target aliased',c=>c.toolBoundaries[1].references[0].candidatePath+='?old','mapping-tool-boundaries'],
    ['source test confused with shipped runtime',c=>c.sourceCompatibility[0].shippedRuntimeFile=true,'mapping-source-compatibility'],
    ['source test claimed to test generated behavior',c=>c.sourceCompatibility[0].validatesGeneratedCandidate=true,'mapping-source-compatibility'],
    ['duplicate original implementation shipped',c=>c.physical.retainedOriginals.push(c.physical.replacedOriginals[0]),'mapping-duplicate-shipped-implementation'],
    ['unreported facade overhead',c=>c.physical.compatibilityFiles.push({path:c.physical.replacedOriginals[0],role:'facade'}),'mapping-overhead-or-accounting'],
    ['unreported generated support file',c=>c.physical.additionalGeneratedOutputs.push('src/server/support.generated.js'),'mapping-overhead-or-accounting'],
    ['duplicate generated output hidden',c=>c.physical.generatedOutputs.push(c.physical.generatedOutputs[0]),'mapping-overhead-or-accounting'],
    ['hypothetical 822 relabeled achieved',c=>c.physical.achievedPayload=822,'mapping-overhead-or-accounting'],
    ['manifest ceiling changed',c=>c.physical.ceiling=825,'mapping-overhead-or-accounting'],
    ['archived digest reused as current measurement',c=>c.candidateOutput.sha256=c.historicalEvidence.archivedOutput.sha256,'mapping-no-historical-admission'],
    ['compile receipt relabeled admission',c=>c.historicalEvidence.currentAdmission=true,'mapping-no-historical-admission'],
    ['generated status upgraded',c=>c.candidateOutput.status='admitted','mapping-no-historical-admission'],
    ['execution authority claimed',c=>c.executionAuthority=true,'mapping-authority'],
    ['production readiness claimed',c=>c.productionReady=true,'mapping-authority'],
    ['admission configuration change claimed',c=>c.selectionAndAdmissionChanged=true,'mapping-authority'],
    ['runtime equivalence invented',c=>c.semantics.runtimeEquivalence='proven','mapping-contract-correspondence'],
    ['uncertainty omitted',c=>delete c.preservedEvidence.globalUncertainty,'mapping-contract-correspondence'],
  ];
  for(const [name,change,reason]of negatives)await sub(name,()=>denial(change,reason));
  await sub('phase descriptors distinguish dependency entries, possible advancement and deferred source obligations',()=>{
    const r=createAssessment(input,clone(model)).assess(),p=r.candidate.initializationPhase;
    assert.equal(r.status,'blocked');assert.equal(p.version,1);assert.equal(p.profile,'service-route-initialization-phase-v1');
    assert.deepEqual(p.entries.map(r=>[r.id,r.originalEntry.slot,r.candidateDependencyEntrySlot,r.potentialEarlierEvaluation]),[
      ['express',0,0,false],['operation_tasks',9,0,true],['identity_policy',1,0,true],['report_configuration',8,0,true],
      ['ReportService',51,0,true],['technicianErrorResponse',51,0,true]]);
    assert.ok(p.entries.every(r=>r.necessarilyEarlier===false&&r.evaluationObserved===false));
    assert.equal(p.dependencyEntryIsEvaluationTimeline,false);assert.equal(p.runtimeEvaluationProof,false);assert.equal(p.completeTransitiveClosure,false);
    assert.deepEqual(p.factoryOrder,['taskHttpIntegration','createCurrentListRouter','createReportSetRouter','createReportRouter']);
    assert.deepEqual(p.registrationOrder.map(r=>r.id),['task-middleware','task-router','current-list','report-set','report']);
    assert.deepEqual(p.deferred.requiredObligations,['router-construction','ReportService-construction','task-closure-allocation','handler-activity']);
    assert.equal(p.deferred.sourceFacts.filter(r=>r.obligation==='router-construction').length,4);
    assert.equal(p.deferred.sourceFacts.filter(r=>r.obligation==='handler-registration').length,10);
    assert.ok(p.deferred.sourceFacts.every(r=>r.sourceDesignPhase==='factory-invocation'&&!r.generatedRuntimeVerified));
    assert.equal(p.deferred.handlerActivityPhase,'request-or-callback-invocation-after-factory-registration');
    assert.equal(p.deferred.generatedRuntimeVerified,false);assert.equal(p.unknowns.completeTransitiveCycles,'unresolved');
    assert.equal(Object.keys(p.unknowns).length,7);assert.equal(p.sourceFacts.length,10);
    assert.equal(p.executionAuthority,false);assert.equal(p.admissionAuthority,false);assert.equal(p.productionReady,false);
    assert.equal(r.physical.authoritativeBaseline,825);assert.equal(r.physical.conditionalCandidate,822);assert.equal(r.physical.achievedPayload,null);
  });
  const phaseNegatives=[
    ['missing advanced dependency',p=>p.entries.pop()],
    ['duplicate dependency label',p=>p.entries[1].id=p.entries[2].id],
    ['application dependency mislabeled unchanged',p=>p.entries[1].potentialEarlierEvaluation=false],
    ['incorrect original application entry',p=>p.entries[1].originalEntry.slot=0],
    ['Express necessarily advances',p=>{p.entries[0].potentialEarlierEvaluation=true;p.entries[0].necessarilyEarlier=true;}],
    ['possible advance promoted to necessity',p=>p.entries[1].necessarilyEarlier=true],
    ['declaration ordering promoted to evaluation timeline',p=>p.dependencyEntryIsEvaluationTimeline=true],
    ['runtime evaluation claimed observed',p=>p.runtimeEvaluationProof=true],
    ['missing deferred factory obligation',p=>p.deferred.requiredObligations.pop()],
    ['router construction moved to import phase',p=>p.deferred.sourceFacts[0].sourceDesignPhase='module-evaluation'],
    ['handler activity moved to import phase',p=>p.deferred.handlerActivityPhase='module-evaluation'],
    ['registration order changed',p=>p.registrationOrder.reverse()],
    ['factory invocation order changed',p=>p.factoryOrder.reverse()],
    ['cycle-free closure asserted',p=>{p.completeTransitiveClosure=true;p.unknowns.completeTransitiveCycles='cycle-free';}],
    ['cache identity certified',p=>p.unknowns.canonicalResolutionAndCacheIdentity='proven'],
    ['live binding certified',p=>p.unknowns.liveBindings='proven'],
    ['mutable configuration identity certified',p=>p.unknowns.exportedMutableConfigurationIdentity='proven'],
    ['import and failure equivalence certified',p=>p.unknowns.importLinkEvaluationFailureTiming='equivalent'],
    ['mixed implementation identity certified',p=>p.unknowns.mixedOriginalGeneratedIdentity='proven'],
    ['full behavior certified',p=>p.unknowns.fullBehavioralEquivalence='proven'],
    ['phase description promoted to admission',p=>p.admissionAuthority=true],
    ['phase description promoted to production readiness',p=>p.productionReady=true],
    ['source evidence omitted',p=>p.sourceFacts.pop()],
  ];
  for(const [name,change]of phaseNegatives)await sub('phase denial: '+name,()=>denial(c=>change(c.initializationPhase),'mapping-initialization-phase'));
  await sub('one-use owner, post-reservation mutation and sticky repair rejection',()=>{
    const c=clone(model),owner=createAssessment(input,c);c.callerMappings.reverse();assert.equal(owner.assess().reason,'mapping-post-reservation-mutation');
    c.callerMappings.reverse();assert.equal(owner.assess().reason,'mapping-sticky-denial');
    assert.throws(()=>createAssessment(input,c),e=>e.reason==='mapping-owner-reuse');
    const valid=createAssessment(input,clone(model));assert.equal(valid.assess().status,'blocked');assert.equal(valid.assess().reason,'mapping-sticky-denial');
  });
  await sub('substituted local input text cannot be justified by an old measurement',()=>{
    const changed=clone(input);changed.files['src/server/current_list_routes.ts']+='\n// changed';
    const r=createAssessment(changed,clone(model)).assess();assert.equal(r.status,'denied');assert.equal(r.reason,'mapping-current-bytes');
  });
  await sub('altered historical metadata cannot be laundered through current observations',()=>{
    const changed=clone(input);changed.files['PHASE_18C_7T_SERVICE_ROUTE_COMPILE_EVIDENCE.json']+=' ';
    const r=createAssessment(changed,clone(model)).assess();assert.equal(r.status,'denied');assert.equal(r.reason,'mapping-current-bytes');
  });
  if(failed)return;
  assert.equal(hash(input),before);assert.deepEqual(loadInput(path.resolve(__dirname,'../..')),input);
  console.log(JSON.stringify({cases,observedRepositoryFiles:input.observations.length,callerMappings:4,reviewReferences:4,probeReferences:3,
    historicalExternalOccurrences:7,sourceTestFiles:9,authoritativeBaseline:825,conditionalCandidate:822,achievedPayload:null,
    tempRootsCreated:0,cleanupOwnedFiles:0,compilerChildren:0,consumerChildren:0,executionAuthority:false}));
});
