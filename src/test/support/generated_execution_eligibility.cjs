// Opt-in advisory/denial assessment only. No launcher, hook, token or live receipt.
const path=require('node:path');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {createGeneratedArtifactSelection}=require('../../../scripts/staged-backend-review.cjs');
const {observeCatalogFiles,verifyCatalog}=require('../../../scripts/payload-byte-catalog.cjs');
const profile='generated-execution-eligibility-v1',reserved=new WeakSet(),consumedObjects=new Set();
const contractPaths=['src/test/support/measured_input_lifetime.cs','src/test/support/owned_input_process.cs','native/ApplicationCompanion/OwnedChild.cs'];
const lifetime=['exact-selection','one-use-handoff','register-suspended-birth-handle-and-job','terminal-denial-blocks-use',
  'bounded-owned-shutdown','confirm-exact-birth-handle-exit','close-input-streams','close-namespace-pins',
  'invalidate-observation-wrapper','exactly-once-addref-release','confirm-process-job-pipe-closure','complete-monitors','restore-owned-acls'];
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function observeOwnershipContracts(){
  return observeCatalogFiles([{id:'contracts',path:path.resolve(__dirname,'../../..')}],contractPaths.map(path=>({root:'contracts',path})));
}
function createAssessment(input){
  // Reserve original object identity, never a caller-supplied GUID or receipt.
  const fail=reason=>{throw Object.assign(Error(reason),{code:'EXECUTION_ELIGIBILITY_DENIED',reason});};
  if(input?.profile!==profile)fail('eligibility-opt-in');
  if(!input.manifest||reserved.has(input.manifest))fail('eligibility-owner-reuse');
  reserved.add(input.manifest);
  const objects=input.manifest.generatedArtifact?.observations?.filter(f=>f.root===input.payloadRoot)
    .map(f=>f.identity&&typeof f.identity.dev==='string'&&typeof f.identity.ino==='string'?f.identity.dev+':'+f.identity.ino:null)??[];
  if(objects.some(id=>id!==null&&consumedObjects.has(id)))fail('eligibility-selection-replay');
  for(const id of objects)if(id!==null)consumedObjects.add(id); // denial-only, never released/reusable authority
  const {profile:unused,design,...args}=input;
  let baseline,owner,setupError,used=false;
  try {baseline=hash(input);owner=createGeneratedArtifactSelection(args);}
  catch(e){setupError=e.reason??e.code??'invalid-metadata';}
  return Object.freeze({assess(){
    const blockers=[];const add=reason=>{if(!blockers.includes(reason))blockers.push(reason);};
    const check=(ok,reason)=>{if(!ok)fail(reason);};
    let structureComplete=false,physicalSelectedFiles=null,incorporatedFiles=null,conditionalFiles=null;
    if(used)add('eligibility-sticky-denial');
    used=true; // every assessment is denial-only and one-use, even structural success
    if(setupError)add(setupError);
    if(!blockers.length)try {
      check(hash(input)===baseline,'eligibility-record-changed');
      const keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&hash(Object.keys(v).sort())===hash(n.split(' ').sort()),'eligibility-shape');
      keys(input,'profile roots payloadRoot sourceRoot manifest inventory catalog selection design'+(input.conditionalGuardProfile!==undefined?' conditionalGuardProfile':''));
      const record=input.manifest.generatedArtifact,c=record?.content;
      check(!!record&&Array.isArray(c?.outputs)&&Array.isArray(c?.sources)&&Array.isArray(c?.externals),'eligibility-provenance-required');
      check(record.contentSha256===hash(c),'eligibility-provenance-digest');
      incorporatedFiles=c.sources.length;
      conditionalFiles=c.conditionalGuards?.descriptors?.filter(d=>d.target!==null).length??0;
      verifyCatalog(input.catalog,input.roots);
      const selected=input.catalog.entries.filter(e=>e.root===input.payloadRoot);
      physicalSelectedFiles=selected.length;
      check(selected.length>0&&selected.length<=64,'eligibility-physical-manifest-ceiling');
      const candidates=input.manifest.candidates;
      check(Array.isArray(candidates)&&selected.length===candidates.length&&selected.length===c.outputs.length+c.externals.length&&
        selected.every(f=>candidates.filter(v=>v.output===f.path).length===1),'eligibility-entire-physical-selection');
      check(new Set(selected.map(f=>f.path.toLowerCase())).size===selected.length,'eligibility-duplicate-selection');
      if(c.conditionalGuards){
        // Existing normalizer validates occurrence/guard/package/file identity;
        // it deliberately stops admission. Preserve that denial below.
        add('eligibility-incorporated-conditional-unadmitted');
      }
      if(c.sourceEdges.some(e=>e.target===null||e.specifier==='<computed>'))add('eligibility-unresolved-computed');
      if(c.unresolved.length||input.manifest.unresolved.length||input.inventory.unresolved.length||
        c.runtimeDependencies.some(d=>d.status==='unresolved'))add('eligibility-incomplete-closure');
      // Always invoke the real provenance/admission path; no forged receipt is accepted.
      try {owner.admit();}catch(e){add(e.reason??e.code??'provenance-validation-failed');}
      keys(design,'version kind scope ownerReference contracts lifetime incorporatedReviews');
      check(design.version===1&&design.kind==='design-description-not-live-evidence'&&design.scope==='entire-requested-payload','eligibility-owned-design');
      const observations=record.observations.filter(f=>f.root===input.payloadRoot);
      check(hash(design.ownerReference)===hash({contentSha256:record.contentSha256,sourceRoot:input.sourceRoot,payloadRoot:input.payloadRoot,
        selectionSha256:hash(input.selection),inputsSha256:hash(observations)}),'eligibility-owner-reference');
      check(hash(design.contracts)===hash(observeOwnershipContracts())&&hash(design.lifetime)===hash(lifetime),'eligibility-lifetime-design');
      check(Array.isArray(design.incorporatedReviews)&&design.incorporatedReviews.length===c.sources.length,'eligibility-incorporated-disposition');
      for(const source of c.sources){
        const reviews=design.incorporatedReviews.filter(r=>r.file?.root===source.root&&r.file?.path===source.path);
        check(reviews.length===1,'eligibility-incorporated-disposition');
        const r=reviews[0];keys(r,'file disposition reason');
        const measured=record.observations.filter(f=>f.root===source.root&&f.path===source.path);
        check(measured.length===1&&hash(r.file)===hash(measured[0])&&r.disposition==='reviewed-source-evidence-only'&&typeof r.reason==='string'&&r.reason.trim().length>0,
          'eligibility-incorporated-disposition');
      }
      check(hash(input)===baseline,'eligibility-record-changed');
      structureComplete=blockers.length===0;
    }catch(e){add(e.reason??e.code??'eligibility-invalid-metadata');}
    // These can NEVER be cleared by metadata or caller-supplied booleans.
    add('fixture-execution-policy-not-authorized');add('live-owned-consumer-binding-not-demonstrated');
    return freeze({version:1,profile,advisoryOnly:true,status:'blocked',executionAuthority:false,productionAuthority:false,
      productionReady:false,structuralRequirements:structureComplete?'complete-description-only':'incomplete-or-denied',
      physicalSelectedFiles,incorporatedFiles,conditionalFiles,blockers,
      limitations:['No live lease, process handle, Job, handoff or termination evidence is issued or verified by this assessment.',
        'Current catalog observations are sequential snapshots, not retained executable pins or file-to-image binding.',
        'Compiler authenticity and reproducibility remain unproven; production runtime/version/signing/installation policy is unresolved.',
        'Source review and guard conditions never admit incorporated executable code.'],selectionAndAdmissionChanged:false});
  }});
}
module.exports={createAssessment,observeOwnershipContracts,profile,lifetime:Object.freeze([...lifetime])};
