// In-memory negative descriptions only. No fixture roots, copies or inspected-code execution.
const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path');
const {verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {loadEvidence,derive,createAssessment,members,caller}=require('./support/service_route_static.cjs');
const root=process.env.DISCOVERY_SERVICE_ROUTE_BASELINE;
if(!root)throw Error('Explicit authorized recovery root required.');
const repo=path.resolve(__dirname,'../..');
const evidence=loadEvidence(root,repo),model=derive(evidence),clone=x=>JSON.parse(JSON.stringify(x));
test('exact recovered route graph remains non-authorizing with positive arithmetic',()=>{
  const r=createAssessment(evidence,clone(model)).assess();
  assert.equal(r.status,'blocked');assert.equal(r.investigationDecision,'GO-COMPILE-ONLY');
  assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);assert.equal(r.productionAuthority,false);
  assert.equal(r.candidateNetSaved,3);assert.equal(r.globalPayloadCount,null);assert.equal(r.authoritativeFiles,825);
  assert.equal(r.model.sourceCorrespondence.length,13);assert.equal(r.model.external.length,7);
  assert.equal(r.model.sourceCorrespondence.filter(x=>!x.emitted.length).length,6);
  assert.equal(r.model.incoming.length,4);assert.equal(r.model.exports.length,5);
  assert.deepEqual(r.model.incoming.map(x=>x.slot),[0,10,50,51]);
  assert.equal(r.model.uncertainty.length,4);
  assert.equal(r.model.order.runtimeEquivalence,'unproven');assert.ok(Object.isFrozen(r.model));
  assert.equal(r.model.output.identity,null);assert.equal(r.model.output.sha256,null);
  assert.equal(r.model.generatedDescription.productionAuthority,false);
});
const negatives=[
  ['missing caller occurrence',m=>m.incoming.pop()],
  ['caller alias substitution',m=>m.incoming[0].named[0].local='alternateRouter'],
  ['missing required export',m=>m.exports.pop()],
  ['duplicate export origin',m=>m.exports[1]=clone(m.exports[0])],
  ['missing emitted dependency',m=>m.external.pop()],
  ['substituted relative dependency',m=>m.external.find(x=>x.specifier.startsWith('.')).resolved='src/core/storage/vault.js'],
  ['changed recorded file hash',m=>m.inputs[0].provenance.outputSha256='0'.repeat(64)],
  ['hidden support overhead',m=>m.physical.additionalShippedFiles=['a.js','b.js','c.js']],
  ['retained originals hidden from arithmetic',m=>m.physical.retainedOriginals=members.slice()],
  ['facade overhead',m=>m.physical.mandatoryFacades=members.slice(0,3)],
  ['overlapping generated destination',m=>m.output.path=members[0]],
  ['caller evaluation order conflict',m=>m.order.originalCallerSequence.reverse()],
  ['invented runtime equivalence',m=>m.order.runtimeEquivalence='proven'],
  ['merged caller import declarations',m=>m.order.mergeCallerImports=true],
  ['factory invocation order conflict',m=>m.order.originalFactoryCalls.reverse()],
  ['lost global unresolved evidence',m=>m.globalUncertainty.stagingSha256='0'.repeat(64)],
  ['false generated admission',m=>m.output.status='admitted'],
  ['lost tooling path consumer',m=>m.toolConsumers.pop()],
  ['false execution authority',m=>m.executionAuthority=true],
  ['lost source-only record',m=>m.sourceCorrespondence.pop()],
];
for(const [name,change]of negatives)test(name,()=>{
  const changed=clone(model);change(changed);
  const owner=createAssessment(evidence,changed),r=owner.assess();
  assert.equal(r.status,'denied');assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);
  assert.equal(owner.assess().reason,'sticky-denial');
});
test('altered recovered emitted text cannot use old provenance',()=>{
  const e={...evidence,text:{...evidence.text,[members[0]]:evidence.text[members[0]]+'\n// changed'}};
  assert.equal(createAssessment(e,clone(model)).assess().reason,'emitted-hash');
});
test('missing emitted caller cannot be inferred from TypeScript',()=>{
  const e={...evidence,text:{...evidence.text}};delete e.text[caller];
  assert.equal(createAssessment(e,clone(model)).assess().reason,'emitted-coverage');
});
test('post-reservation mutation and model reuse deny',()=>{
  const m=clone(model),owner=createAssessment(evidence,m);m.incoming.pop();
  assert.equal(owner.assess().reason,'post-reservation-mutation');
  assert.throws(()=>createAssessment(evidence,m),e=>e.reason==='owner-reuse');
});
test('historical bytes remain matched; no test roots or cleanup capabilities created',()=>{
  const r=verifyCatalog(evidence.baseline.catalog,[{id:'stage',path:path.join(root,'before')}]);
  assert.equal(r.files,827);assert.equal(r.totalBytes,17152182);assert.equal(r.matchedBytes,true);
});
