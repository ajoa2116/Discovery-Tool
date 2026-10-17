// Inert synthetic bytes and source parsing only. Never imports generated code.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {inventory}=require('../../scripts/dependency-inventory.cjs');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord,createGeneratedArtifactManifest}=require('../../scripts/stage-backend.cjs');
const {observeCatalogFiles,createCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission,installPackageAdmissionHooks}=require('../../scripts/staged-backend-review.cjs');
const {createAssessment,observeOwnershipContracts,profile,lifetime}=require('./support/generated_execution_eligibility.cjs');
const {specs}=require('./support/dependency_guard_descriptors.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),output='node_modules/inert/bundle.cjs';
function checked(full){for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}assert.equal(fs.realpathSync(full),full);}
test('generated execution eligibility is opt-in, one-use and denial-only',async t=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);
  assert.match(path.basename(parent),/^discovery-eligibility-validation-[a-f0-9]{32}$/);assert.deepEqual(fs.readdirSync(parent),[]);
  let failed=false,cases=0,removedFiles=0;
  const sub=async(name,run,extra=0)=>t.test(name,{skip:failed},()=>{
    const base=fs.mkdtempSync(path.join(parent,'eligibility-'));checked(base);let complete=false;
    const roots=['payload','sources','build'].map(id=>({id,path:path.join(base,id)}));for(const r of roots)fs.mkdirSync(r.path);
    const names=[];const put=(root,name,bytes)=>{const full=path.join(roots.find(r=>r.id===root).path,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes,{flag:'wx'});names.push(full);};
    const measure=(root,name)=>{const {identity,...f}=observeCatalogFiles(roots,[{root,path:name}])[0];return f;};
    try {
      put('sources','package.json','{"dependencies":{}}');put('sources','package-lock.json','{"packages":{}}');put('sources','tsconfig.json','{}');
      put('sources','src/a.cjs',"require('./b.cjs');");put('sources','src/b.cjs','module.exports=1;');
      for(const root of ['sources','payload'])put(root,'node_modules/inert/package.json','{"name":"inert","main":"bundle.cjs"}');
      put('payload',output,'INERT OUTPUT; NOT EXECUTABLE JAVASCRIPT');
      put('build','generator.txt','INERT GENERATOR DESCRIPTION');put('build','options.json','{}');
      // Inventory deliberately reports absent scan roots. Seed those directories
      // explicitly; never discard its unresolved diagnostics to manufacture closure.
      for(const name of ['native','scripts'])fs.mkdirSync(path.join(roots[1].path,name));
      const inv=inventory(roots[1].path,{entrypoints:[{role:'backend-stage',path:'src/a.cjs'}]});
      const sourceEdges=inv.references.filter(r=>r.kind==='require').map((r,occurrence)=>({occurrence,source:{root:'sources',path:r.source},line:r.line,kind:r.kind,specifier:r.specifier,target:{root:'sources',path:r.resolvedPath}}));
      assert.equal(sourceEdges.length,1);assert.deepEqual(inv.unresolved,[]);
      const transformedEdges=sourceEdges.map(e=>({occurrence:e.occurrence,output:{root:'payload',path:output},disposition:'internal-wrapper',target:e.target}));
      const derivation={sourceEdges,transformedEdges,runtimeEdges:[]};put('build','derivation.json',JSON.stringify(derivation));
      const content={outputs:[{...measure('payload',output),role:'generated-code'}],sources:['src/a.cjs','src/b.cjs'].map(p=>measure('sources',p)),
        derivation:{generator:{...measure('build','generator.txt'),version:'synthetic-1'},options:{},entrypoint:{root:'sources',path:'src/a.cjs'},
          configuration:['package.json','package-lock.json','tsconfig.json'].map(p=>measure('sources',p)).concat(measure('build','options.json')),evidence:[measure('build','derivation.json')]},
        inventorySha256:hash(inv),...derivation,generatedEdges:[],externals:[{...measure('payload','node_modules/inert/package.json'),role:'metadata',origin:measure('sources','node_modules/inert/package.json')}],runtimeDependencies:[],unresolved:[]};
      const d=content.derivation,inputs=[...content.sources,...content.outputs,...content.externals,...content.externals.map(e=>e.origin),d.generator,...d.configuration,...d.evidence];
      const observations=observeCatalogFiles(roots,inputs.map(({root,path})=>({root,path})));
      const record=createGeneratedArtifactRecord(content,observations);
      const original={candidates:[{source:'node_modules/inert/package.json',output:'node_modules/inert/package.json',status:'copied-candidate',selectionReasons:['Explicit inert metadata.']}],unresolved:[]};
      const manifest=createGeneratedArtifactManifest(original,record);
      const overlays=inputs.filter(f=>f.root!=='payload').map(f=>({root:f.root,path:f.path,reason:'Source/build evidence only.'}));
      for(let i=0;i<extra;i++){const name='node_modules/inert/extra-'+i+'.txt';put('payload',name,'INERT EXTRA');overlays.push({root:'payload',path:name,reason:'Attempted split/hidden selection control.'});}
      const catalog=createCatalog({roots,staging:{root:'payload',manifest},overlays,experimentalGenerated:true});
      const selection={variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:content.outputs.map(o=>({path:o.path,role:o.role,size:o.size,sha256:o.sha256,provenanceRef:record.contentSha256,reason:'Independent inert generated-byte review.'})),
        externalReviews:[{path:'node_modules/inert/package.json',reason:'Independent inert metadata review.'}],observations};
      const design={version:1,kind:'design-description-not-live-evidence',scope:'entire-requested-payload',
        ownerReference:{contentSha256:record.contentSha256,sourceRoot:'sources',payloadRoot:'payload',selectionSha256:hash(selection),inputsSha256:hash(observations.filter(f=>f.root==='payload'))},
        contracts:observeOwnershipContracts(),lifetime:[...lifetime],incorporatedReviews:content.sources.map(s=>({file:observations.find(f=>f.root===s.root&&f.path===s.path),disposition:'reviewed-source-evidence-only',reason:'Independent synthetic source review; never runtime admission.'}))};
      const input={profile,roots,payloadRoot:'payload',sourceRoot:'sources',manifest,inventory:inv,catalog,selection,design};
      const rebind=()=>{manifest.generatedArtifact.contentSha256=hash(manifest.generatedArtifact.content);selection.contentSha256=manifest.generatedArtifact.contentSha256;};
      run({input,base,record,content,observations,original,rebind});
      checked(base);assert.ok(path.relative(parent,base)&&path.dirname(base)===parent);
      const actual=[];const visit=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);checked(f);if(e.isDirectory())visit(f);else actual.push(f);}};visit(base);
      assert.deepEqual(actual.sort(),names.sort(),'Only exact owned files may be cleaned');
      fs.rmSync(base,{recursive:true});assert.equal(fs.existsSync(base),false);removedFiles+=names.length;cases++;complete=true;
    }catch(e){failed=true;throw e;}finally{if(!complete)console.error('STOP; preserve new eligibility case: '+base);}
  });
  const blocked=(f,reason)=>{const r=createAssessment(f.input).assess();assert.ok(r.blockers.includes(reason),JSON.stringify(r.blockers));assert.equal(r.executionAuthority,false);assert.equal(r.productionAuthority,false);assert.equal(r.status,'blocked');return r;};
  await sub('complete synthetic structure stays non-authorizing and cannot install hooks',f=>{
    const before=hash(f.input),owner=createAssessment(f.input),r=owner.assess();assert.equal(hash(f.input),before);
    assert.equal(r.structuralRequirements,'complete-description-only');assert.equal(r.physicalSelectedFiles,2);assert.equal(r.incorporatedFiles,2);
    assert.deepEqual(r.blockers,['fixture-execution-policy-not-authorized','live-owned-consumer-binding-not-demonstrated']);
    assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);assert.ok(Object.isFrozen(r));
    assert.equal(r.selectionAndAdmissionChanged,false);assert.throws(()=>installPackageAdmissionHooks(f.base,r),/Missing package admission evidence/);
    assert.ok(owner.assess().blockers.includes('eligibility-sticky-denial'));
    assert.throws(()=>createAssessment(f.input),e=>e.reason==='eligibility-owner-reuse');
    assert.throws(()=>createAssessment({...f.input}),e=>e.reason==='eligibility-owner-reuse');
    assert.throws(()=>createAssessment(clone(f.input)),e=>e.reason==='eligibility-selection-replay');
    assert.equal(buildPackageAdmission(f.original,f.input.selection.externalReviews).admitted.length,1);
  });
  await sub('explicit opt-in is mandatory',f=>{delete f.input.profile;assert.throws(()=>createAssessment(f.input),e=>e.reason==='eligibility-opt-in');});
  await sub('missing independent output review denies',f=>{f.input.selection.reviews=[];blocked(f,'output-review-count');});
  await sub('wrong independent output digest denies',f=>{f.input.selection.reviews[0].sha256='0'.repeat(64);blocked(f,'output-review');});
  await sub('current output tampering denies',f=>{fs.appendFileSync(path.join(f.base,'payload',output),'ALTERED');const r=createAssessment(f.input).assess();assert.equal(r.structuralRequirements,'incomplete-or-denied');assert.ok(r.blockers.length>2);});
  await sub('missing provenance cannot use copied candidate',f=>{delete f.input.manifest.generatedArtifact;f.input.manifest.candidates[1].status='copied-candidate';f.input.manifest.candidates[1].source=output;blocked(f,'eligibility-provenance-required');});
  await sub('provenance removal after reservation stays denied',f=>{const owner=createAssessment(f.input);delete f.input.manifest.generatedArtifact;assert.ok(owner.assess().blockers.includes('eligibility-record-changed'));assert.ok(owner.assess().blockers.includes('eligibility-sticky-denial'));});
  await sub('changed source identity snapshot denies',f=>{f.input.manifest.generatedArtifact.observations[0].identity.ino='0';blocked(f,'local-observations');});
  await sub('unselected external dependency denies',f=>{f.input.manifest.candidates.shift();blocked(f,'eligibility-entire-physical-selection');});
  await sub('omitted incorporated disposition denies',f=>{f.input.design.incorporatedReviews.pop();blocked(f,'eligibility-incorporated-disposition');});
  await sub('duplicate incorporated disposition denies',f=>{f.input.design.incorporatedReviews[1]=clone(f.input.design.incorporatedReviews[0]);blocked(f,'eligibility-incorporated-disposition');});
  await sub('guard conditions never grant incorporated source admission',f=>{f.input.design.incorporatedReviews[0].disposition='admitted-by-guard';blocked(f,'eligibility-incorporated-disposition');});
  await sub('incorrect selection owner reference denies',f=>{f.input.design.ownerReference.selectionSha256='0'.repeat(64);blocked(f,'eligibility-owner-reference');});
  await sub('PID or simulated receipt cannot replace binding design',f=>{f.input.design={pid:123,simulatedReceipt:true};blocked(f,'eligibility-shape');});
  await sub('missing birth-specific exit/cleanup ordering denies',f=>{f.input.design.lifetime=f.input.design.lifetime.filter(x=>x!=='confirm-exact-birth-handle-exit');blocked(f,'eligibility-lifetime-design');});
  await sub('stale ownership contract measurement denies',f=>{f.input.design.contracts[0].sha256='0'.repeat(64);blocked(f,'eligibility-lifetime-design');});
  await sub('unresolved computed request remains a blocker',f=>{f.input.manifest.generatedArtifact.content.sourceEdges[0].target=null;f.input.manifest.generatedArtifact.content.sourceEdges[0].specifier='<computed>';f.rebind();blocked(f,'eligibility-unresolved-computed');});
  await sub('incomplete closure remains a blocker',f=>{f.input.manifest.generatedArtifact.content.unresolved.push({reason:'unknown-runtime'});f.rebind();blocked(f,'eligibility-incomplete-closure');});
  await sub('split selection schema cannot bypass whole-payload accounting',f=>{f.input.selections=[];blocked(f,'eligibility-shape');});
  await sub('payload files hidden as provenance overlays are counted and denied',f=>{const r=blocked(f,'eligibility-entire-physical-selection');assert.equal(r.physicalSelectedFiles,3);},1);
  await sub('65 physical files deny despite a two-file manifest',f=>{const r=blocked(f,'eligibility-physical-manifest-ceiling');assert.equal(r.physicalSelectedFiles,65);},63);
  await sub('five distinct Express conditional descriptors cannot become authority',f=>{
    f.input.manifest.generatedArtifact.content.conditionalGuards={descriptors:specs.map(s=>({source:{root:'sources',path:s.importer},target:s.target?{root:'sources',path:s.target}:null,guard:{expression:s.expression},runtimeAdmission:'unadmitted'}))};
    f.rebind();const r=blocked(f,'eligibility-incorporated-conditional-unadmitted');assert.equal(r.conditionalFiles,5);assert.ok(r.blockers.includes('conditional-guard-opt-in'));
    assert.equal(new Set(specs.filter(s=>s.target).map(s=>s.target)).size,5);
  });
  if(!failed){assert.deepEqual(fs.readdirSync(parent),[]);console.log(JSON.stringify({cases,removedFiles,temporaryCaseRootsRemaining:0,compilerChildren:0,consumerChildren:0,jobs:0,aclOwners:0}));}
});
