// Copies are evidence for AST inspection only; no application imports execute.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {generatedArtifactContentHash:hash}=require('../../scripts/stage-backend.cjs');
const {createCatalog,observeCatalogFiles}=require('../../scripts/payload-byte-catalog.cjs');
const {installPackageAdmissionHooks,buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');
const {profile:globalProfile,createPlanAssessment}=require('./support/backend_consolidation_plan.cjs');
const {loadReviewedPlan}=require('./support/reviewed_backend_plan_fixture.cjs');
const island=require('./support/application_island_model.cjs'),caller=require('./support/application_caller_mapping.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),enabled=process.env.DISCOVERY_CONSOLIDATION_ARCHIVES,repo=path.resolve(__dirname,'../..');
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('all 39 callers have explicit non-authorizing import mappings',{skip:!enabled},async t=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);assert.match(path.basename(parent),/^discovery-caller-validation-[a-f0-9]{32}$/);assert.deepEqual(fs.readdirSync(parent),[]);
  const archive=JSON.parse(enabled);for(const p of Object.values(archive))checked(p);
  const {baseline,proposals,plan}=loadReviewedPlan(archive),baselineHash=hash({baseline,proposals,plan}),stage=path.join(archive.backend,'before');
  const globalRoot=fs.mkdtempSync(path.join(parent,'global-'));checked(globalRoot);let complete=false,failed=false,cases=0,removed=0,positive;
  try{
    for(const [name,value]of [['baseline.json',baseline],['proposals.json',proposals]])fs.writeFileSync(path.join(globalRoot,name),JSON.stringify(value),{flag:'wx'});
    const gr=[{id:'evidence',path:globalRoot}],gm={candidates:['baseline.json','proposals.json'].map(output=>({source:output,output,status:'copied-candidate',selectionReasons:['Archival fixture snapshot only.']})),unresolved:[]};
    const wholeBackendReport=createPlanAssessment({profile:globalProfile,baseline,proposals,plan,evidence:{roots:gr,catalog:createCatalog({roots:gr,staging:{root:'evidence',manifest:gm}}),
      observations:observeCatalogFiles(gr,['baseline.json','proposals.json'].map(path=>({root:'evidence',path})))}}).assess();assert.equal(wholeBackendReport.status,'blocked');
    const cr=caller.callerRefs(baseline);
    const originalRefs=[...island.refs().map(f=>({root:f.root==='typescript'?'repository':'archive',path:f.path})),...cr.map(f=>({root:f.path.startsWith('source/')?'repository':'archive',path:f.path.replace(/^(source|emitted)\//,'')}))];
    const originalRoots=[{id:'repository',path:repo},{id:'archive',path:stage}],originals=observeCatalogFiles(originalRoots,originalRefs);
    for(const f of originals){const p=baseline.provenance.files.find(p=>f.root==='repository'?p.source===f.path:p.output===f.path);
      if(!p){assert.equal(f.root,'repository');continue;}const id=f.root==='repository'?p.sourceIdentity:p.outputIdentity;
      assert.equal(f.sha256,f.root==='repository'?p.sourceSha256:p.outputSha256);assert.equal(f.identity.dev,String(id.device));assert.equal(f.identity.ino,String(id.file));assert.equal(f.size,id.bytes);
    }
    const sub=async(name,run)=>t.test(name,{skip:failed},()=>{
      const base=fs.mkdtempSync(path.join(parent,'caller-'));checked(base);let cleaned=false;const files=[];
      const roots=['typescript','javascript','callers'].map(id=>({id,path:path.join(base,id)}));for(const r of roots)fs.mkdirSync(r.path);
      const put=(root,name,bytes)=>{const f=path.join(roots.find(r=>r.id===root).path,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes,{flag:'wx'});files.push({root,path:name,full:f});};
      try{
        for(const f of island.refs())put(f.root,f.path,fs.readFileSync(path.join(f.root==='typescript'?repo:stage,f.path)));
        for(const f of cr)put(f.root,f.path,fs.readFileSync(path.join(f.path.startsWith('source/')?repo:stage,f.path.replace(/^(source|emitted)\//,''))));
        for(const [name,bytes]of [['package.json','{"dependencies":{}}'],['package-lock.json','{"lockfileVersion":3,"packages":{}}'],['tsconfig.json','{}']])put('typescript',name,bytes);
        for(const name of ['native','scripts'])fs.mkdirSync(path.join(roots[0].path,name));
        const manifest={candidates:files.filter(f=>f.root==='javascript').map(f=>({source:f.path,output:f.path,status:'copied-candidate',selectionReasons:['Exact non-executing fixture copy.']})),unresolved:[]};
        const catalog=createCatalog({roots,staging:{root:'javascript',manifest},overlays:files.filter(f=>f.root!=='javascript').map(({root,path})=>({root,path,reason:'Non-executing source/caller evidence only.'}))});
        const input={profile:island.profile,roots,catalog,baseline,proposals,wholeBackendReport,observations:observeCatalogFiles(roots,island.refs()),callerObservations:observeCatalogFiles(roots,cr),callerProfile:caller.profile};
        input.model=island.derive(input);input.contract=caller.derive(input);run({input,base});
        assert.equal(hash({baseline,proposals,plan}),baselineHash,'Shared original evidence must not change');
        checked(base);const actual=[];const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);checked(f);if(e.isDirectory())walk(f);else actual.push(f);}};walk(base);
        assert.deepEqual(actual.sort(),files.map(f=>f.full).sort());assert.equal(path.dirname(base),parent);fs.rmSync(base,{recursive:true});assert.equal(fs.existsSync(base),false);removed+=files.length;cases++;cleaned=true;
      }catch(e){failed=true;throw e;}finally{if(!cleaned)console.error('STOP; preserve new caller case: '+base);}
    });
    const denied=(f,reason)=>{const owner=caller.createCallerAssessment(f.input),r=owner.assess();assert.equal(r.status,'denied',JSON.stringify(r));assert.equal(r.reason,reason);assert.equal(r.executionAuthority,false);assert.equal(owner.assess().reason,'caller-sticky-denial');};
    const backend=f=>f.input.contract.records.find(r=>r.mapping);
    await sub('39 occurrences, 34 emitted values, five separate-build paths; retain facades',f=>{
      const before=hash(f.input),owner=caller.createCallerAssessment(f.input),r=owner.assess();assert.equal(r.status,'blocked',JSON.stringify(r));assert.equal(hash(f.input),before);
      assert.deepEqual(r.coverage,{sourceOccurrences:39,stagedValueImports:34,outsideBackend:5,distinctSourceFiles:34,distinctStagedCallers:29,declaredTypeOnly:0,defaultImports:0,namespaceImports:0});
      assert.equal(r.staticBackendMappingFeasible,true);assert.equal(r.allCallersRedirectable,false);assert.equal(r.oneOutputDefensible,false);assert.equal(r.facadesRetained,true);
      assert.equal(r.physical.retainedFacadeProposal,3);assert.equal(r.physical.acceptedOneOutputCount,null);assert.equal(r.physical.globalPayloadCount,null);
      assert.ok(r.contract.records.some(r=>r.mapping?.bindings.named.some(n=>n.imported==='conflicts'&&n.local==='conflict')));
      assert.ok(r.contract.records.filter(r=>r.mapping).every(r=>r.mapping.mergeDeclarations===false));
      assert.ok(r.contract.records.filter(r=>r.mapping).every(r=>r.mapping.specifier.startsWith('./')||r.mapping.specifier.startsWith('../')));
      assert.equal(r.contract.records.find(r=>r.edge.source==='src/shared/camera_access.ts').mapping.specifier,'./.consolidation/address-identity.generated.js');
      assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);assert.ok(Object.isFrozen(r.contract));
      assert.equal(buildPackageAdmission(baseline.manifest).admitted.length,165);assert.throws(()=>installPackageAdmissionHooks(f.base,r),/Missing package admission evidence/);
      assert.equal(owner.assess().reason,'caller-sticky-denial');assert.throws(()=>caller.createCallerAssessment(f.input),e=>e.code==='CALLER_MAPPING_DENIED');positive=r;
    });
    await sub('missing caller mapping denies',f=>{f.input.contract.records.pop();denied(f,'caller-missing-mapping');});
    await sub('duplicate occurrence denies',f=>{f.input.contract.records[1]=clone(f.input.contract.records[0]);denied(f,'caller-duplicate-mapping');});
    await sub('wrong original specifier denies',f=>{backend(f).edge.specifier='../aliased/identity_policy.ts';denied(f,'caller-source-edge');});
    await sub('case-aliased source path denies',f=>{backend(f).edge.source=backend(f).edge.source.toUpperCase();denied(f,'caller-source-edge');});
    await sub('caller hash change denies',f=>{backend(f).sourceMeasurement.sha256='0'.repeat(64);denied(f,'caller-identity-or-digest');});
    await sub('substituted target identity denies',f=>{backend(f).originalTarget.javascriptObservation.identity.ino='0';denied(f,'caller-identity-or-digest');});
    await sub('wrong imported export denies',f=>{backend(f).sourceImport.bindings.named[0].imported='missingExport';denied(f,'caller-import-or-export');});
    await sub('invented default import denies',f=>{backend(f).sourceImport.bindings.default='defaultExport';denied(f,'caller-import-or-export');});
    await sub('invented namespace identity denies',f=>{backend(f).sourceImport.bindings.namespace='namespace';denied(f,'caller-import-or-export');});
    await sub('local alias rewrite denies',f=>{backend(f).mapping.bindings.named[0].local='changedLocal';denied(f,'caller-target-or-bindings');});
    await sub('query/alternate target alias denies',f=>{backend(f).mapping.specifier+='?other-instance';denied(f,'caller-target-or-bindings');});
    await sub('silent import-declaration merge denies',f=>{backend(f).mapping.mergeDeclarations=true;denied(f,'caller-target-or-bindings');});
    await sub('changed emitted import sequence denies',f=>{backend(f).emitted.allImports.reverse();denied(f,'caller-import-or-export');});
    await sub('outside-backend source cannot silently acquire backend mapping',f=>{f.input.contract.records.find(r=>!r.mapping).mapping=clone(backend(f).mapping);denied(f,'caller-target-or-bindings');});
    await sub('shared metadata change denies',f=>{f.input.contract.metadata.sha256='0'.repeat(64);denied(f,'caller-metadata');});
    await sub('omitted uncertainty denies',f=>{delete f.input.contract.uncertainty.globalInventorySha256;denied(f,'caller-uncertainty');});
    await sub('dropping unrelated caller dependencies denies',f=>{f.input.contract.uncertainty.otherReferences.pop();denied(f,'caller-uncertainty');});
    await sub('claimed evaluation-order equivalence denies',f=>{f.input.contract.semanticRequirements.evaluationOrder='proven';denied(f,'caller-semantics');});
    await sub('claimed single-output readiness denies',f=>{f.input.contract.oneOutputDefensible=true;denied(f,'caller-contract-correspondence');});
    await sub('record repair cannot revive consumed owner',f=>{const owner=caller.createCallerAssessment(f.input);f.input.contract.runtimeEquivalence='proven';assert.equal(owner.assess().reason,'caller-record-changed');f.input.contract.runtimeEquivalence='not-established';assert.equal(owner.assess().reason,'caller-sticky-denial');});
    if(failed)return;
    assert.deepEqual(observeCatalogFiles(originalRoots,originalRefs),originals);
    assert.deepEqual(fs.readdirSync(globalRoot).sort(),['baseline.json','proposals.json']);fs.rmSync(globalRoot,{recursive:true});removed+=2;assert.deepEqual(fs.readdirSync(parent),[]);complete=true;
    console.log(JSON.stringify({cases,filesRemoved:removed,temporaryCaseRootsRemaining:0,compilerChildren:0,consumerChildren:0,coverage:positive.coverage,
      affectedStaging:positive.contract.uncertainty.affectedStaging.length,affectedInventory:positive.contract.uncertainty.affectedInventory.length,
      otherReferences:positive.contract.uncertainty.otherReferences.length,unknownRequests:positive.contract.uncertainty.unknownRequests.length,
      physical:positive.physical,callerOccurrences:positive.contract.records.map(r=>({occurrence:r.occurrence,source:r.edge.source,sourceHash:r.sourceMeasurement.sha256,
        target:r.edge.resolvedPath,bindings:r.sourceImport.bindings.named,emitted:r.emitted?.file??null,mappedSpecifier:r.mapping?.specifier??null}))}));
  }finally{if(!complete)console.error('STOP; preserve new caller parent: '+parent);}
});
