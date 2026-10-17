// Static parsing only. No selected TS/JS body, compiler or provider executes.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {generatedArtifactContentHash:hash,createGeneratedArtifactManifest}=require('../../scripts/stage-backend.cjs');
const {createCatalog,observeCatalogFiles}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission,createGeneratedArtifactSelection,installPackageAdmissionHooks}=require('../../scripts/staged-backend-review.cjs');
const {profile:globalProfile,createPlanAssessment}=require('./support/backend_consolidation_plan.cjs');
const {loadReviewedPlan}=require('./support/reviewed_backend_plan_fixture.cjs');
const {profile,members,refs,derive,createIslandAssessment}=require('./support/application_island_model.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),enabled=process.env.DISCOVERY_CONSOLIDATION_ARCHIVES,repo=path.resolve(__dirname,'../..');
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('one production-used address/identity application island stays an unbuilt proposal',{skip:!enabled},async t=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);assert.match(path.basename(parent),/^discovery-island-validation-[a-f0-9]{32}$/);assert.deepEqual(fs.readdirSync(parent),[]);
  const archive=JSON.parse(enabled);for(const p of Object.values(archive))checked(p);
  const {baseline,proposals,plan}=loadReviewedPlan(archive),baseHash=hash({baseline,proposals,plan});
  const globalRoot=fs.mkdtempSync(path.join(parent,'global-evidence-'));checked(globalRoot);
  let complete=false,failed=false,cases=0,removed=0,positive;
  try{
    const globalRoots=[{id:'evidence',path:globalRoot}];
    for(const [name,value]of [['baseline.json',baseline],['proposals.json',proposals]])fs.writeFileSync(path.join(globalRoot,name),JSON.stringify(value),{flag:'wx'});
    const gm={candidates:['baseline.json','proposals.json'].map(output=>({source:output,output,status:'copied-candidate',selectionReasons:['Reviewed archival JSON only.']})),unresolved:[]};
    const globalCatalog=createCatalog({roots:globalRoots,staging:{root:'evidence',manifest:gm}});
    const wholeBackendReport=createPlanAssessment({profile:globalProfile,baseline,proposals,plan,evidence:{roots:globalRoots,catalog:globalCatalog,
      observations:observeCatalogFiles(globalRoots,['baseline.json','proposals.json'].map(path=>({root:'evidence',path})))}}).assess();
    assert.equal(wholeBackendReport.status,'blocked');assert.equal(wholeBackendReport.baselineCount,825);
    const originals=observeCatalogFiles([{id:'repository',path:repo},{id:'archive',path:path.join(archive.backend,'before')}],
      [...members.map(p=>({root:'repository',path:p+'.ts'})),{root:'repository',path:'src/types/index.ts'},...members.map(p=>({root:'archive',path:p+'.js'})),{root:'archive',path:'package.json'}]);
    for(const o of originals){const p=baseline.provenance.files.find(p=>o.root==='repository'?p.source===o.path:p.output===o.path);
      assert.ok(p);const identity=o.root==='repository'?p.sourceIdentity:p.outputIdentity;
      assert.equal(o.sha256,o.root==='repository'?p.sourceSha256:p.outputSha256);assert.equal(o.identity.dev,String(identity.device));assert.equal(o.identity.ino,String(identity.file));assert.equal(o.size,identity.bytes);
    }
    const sub=async(name,run)=>t.test(name,{skip:failed},()=>{
      const base=fs.mkdtempSync(path.join(parent,'island-'));checked(base);let cleaned=false;const files=[];
      const roots=['typescript','javascript'].map(id=>({id,path:path.join(base,id)}));for(const r of roots)fs.mkdirSync(r.path);
      const put=(root,name,bytes)=>{const f=path.join(roots.find(r=>r.id===root).path,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes,{flag:'wx'});files.push(f);};
      try{
        for(const p of members){put('typescript',p+'.ts',fs.readFileSync(path.join(repo,p+'.ts')));put('javascript',p+'.js',fs.readFileSync(path.join(archive.backend,'before',p+'.js')));}
        put('typescript','src/types/index.ts',fs.readFileSync(path.join(repo,'src/types/index.ts')));
        put('javascript','package.json',fs.readFileSync(path.join(archive.backend,'before/package.json')));
        for(const [name,bytes]of [['package.json','{"dependencies":{}}'],['package-lock.json','{"lockfileVersion":3,"packages":{}}'],['tsconfig.json','{}']])put('typescript',name,bytes);
        for(const name of ['scripts','native'])fs.mkdirSync(path.join(roots[0].path,name));
        const selected=files.map(f=>{const r=roots.find(r=>f.startsWith(r.path+path.sep));return {root:r.id,path:path.relative(r.path,f).split(path.sep).join('/')};});
        const manifest={candidates:selected.filter(f=>f.root==='javascript').map(f=>({source:f.path,output:f.path,status:'copied-candidate',selectionReasons:['Exact static source/output copy, never admission.']})),unresolved:[]};
        const catalog=createCatalog({roots,staging:{root:'javascript',manifest},overlays:selected.filter(f=>f.root!=='javascript').map(f=>({...f,reason:'Static source/configuration evidence only.'}))});
        const input={profile,roots,catalog,observations:observeCatalogFiles(roots,refs()),baseline,proposals:clone(proposals),wholeBackendReport:clone(wholeBackendReport)};
        input.model=derive(input);run({input,base});
        assert.equal(hash({baseline,proposals,plan}),baseHash);
        checked(base);const current=[];const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);checked(f);if(e.isDirectory())walk(f);else current.push(f);}};walk(base);
        assert.deepEqual(current.sort(),files.sort());assert.equal(path.dirname(base),parent);fs.rmSync(base,{recursive:true});assert.equal(fs.existsSync(base),false);cases++;removed+=files.length;cleaned=true;
      }catch(e){failed=true;throw e;}finally{if(!cleaned)console.error('STOP; preserve new island case: '+base);}
    });
    const denied=(f,reason)=>{const owner=createIslandAssessment(f.input),r=owner.assess();assert.equal(r.status,'denied',JSON.stringify(r));assert.equal(r.reason,reason);assert.equal(r.executionAuthority,false);assert.equal(owner.assess().reason,'island-sticky-denial');};
    await sub('exact TS/JS identities, literal occurrence, incoming paths and facade cost',f=>{
      const before=hash(f.input),owner=createIslandAssessment(f.input),r=owner.assess();assert.equal(r.status,'blocked',JSON.stringify(r));assert.equal(hash(f.input),before);
      assert.equal(r.model.files.length,2);assert.equal(r.model.sourceEdges.length,2);assert.equal(r.model.emittedEdges.length,1);assert.equal(r.model.sourceOnlyEdges.length,1);
      assert.equal(r.model.sourceOnlyEdges[0].edge.specifier,'../types/index.ts');assert.equal(r.model.sourceOnlyEdges[0].edge.typeOnly,false);
      assert.equal(r.model.witnesses.length,2);assert.ok(r.model.incoming.length>1);assert.equal(r.model.assets.moduleRelativeData.length,0);
      assert.deepEqual(r.model.uncertainty.staging,[]);assert.deepEqual(r.model.uncertainty.inventory,[]);assert.deepEqual(r.model.uncertainty.scoped,[]);
      assert.equal(r.physical.islandBaseline,2);assert.equal(r.physical.projectedIslandOnly,3);assert.equal(r.physical.delta,1);assert.equal(r.physical.globalPayloadCount,null);
      assert.ok(r.model.outputs.every(o=>o.sha256===null&&o.identity===null&&o.status==='unbuilt-unadmitted'));
      assert.equal(r.executionAuthority,false);assert.equal(r.productionReady,false);assert.equal(r.generatedDescription.content.outputs.length,0);
      assert.throws(()=>installPackageAdmissionHooks(f.base,r),/Missing package admission evidence/);
      assert.equal(buildPackageAdmission(baseline.manifest).admitted.length,165);
      assert.equal(owner.assess().reason,'island-sticky-denial');assert.throws(()=>createIslandAssessment(f.input),e=>e.code==='APPLICATION_ISLAND_DENIED');positive=r;
    });
    await sub('missing source occurrence denies',f=>{f.input.model.sourceEdges.pop();denied(f,'island-source-edges');});
    await sub('duplicated emitted edge denies',f=>{f.input.model.emittedEdges.push(clone(f.input.model.emittedEdges[0]));denied(f,'island-emitted-edges');});
    await sub('missing emitted edge denies',f=>{f.input.model.emittedEdges=[];denied(f,'island-emitted-edges');});
    await sub('changed input hash denies',f=>{f.input.model.files[0].javascriptObservation.sha256='0'.repeat(64);denied(f,'island-file-measurement');});
    await sub('same bytes with substituted identity denies',f=>{f.input.model.files[0].sourceObservation.identity.ino='0';denied(f,'island-file-measurement');});
    await sub('invented or suppressed asset disposition denies',f=>{f.input.model.assets.disposition='assets-excluded-as-unobserved';denied(f,'island-asset-disposition');});
    await sub('changed shared package metadata claim denies',f=>{f.input.model.assets.sharedMetadata.sha256='0'.repeat(64);denied(f,'island-asset-disposition');});
    await sub('lost incoming boundary denies',f=>{f.input.model.incoming.pop();denied(f,'island-incoming-boundary');});
    await sub('false type-only reclassification denies',f=>{f.input.model.sourceOnlyEdges[0].edge.typeOnly=true;denied(f,'island-source-only-correspondence');});
    await sub('omitted global uncertainty reference denies',f=>{delete f.input.model.uncertainty.globalStagingSha256;denied(f,'island-uncertainty');});
    await sub('overlapping incorporation ownership denies',f=>{f.input.proposals[0].record.actual.incorporated.push(members[0]+'.js');f.input.wholeBackendReport.proposalSha256=hash(f.input.proposals);denied(f,'island-overlap');});
    await sub('duplicate proposed output denies',f=>{f.input.model.outputs.push(clone(f.input.model.outputs[0]));denied(f,'island-unbuilt-output');});
    await sub('invented generated output digest cannot become admission',f=>{f.input.model.outputs[0].sha256='1'.repeat(64);denied(f,'island-unbuilt-output');});
    await sub('post-reservation model mutation is terminal',f=>{const owner=createIslandAssessment(f.input);f.input.model.admission='approved';assert.equal(owner.assess().reason,'island-record-changed');assert.equal(owner.assess().reason,'island-sticky-denial');});
    await sub('incomplete generated description cannot use existing admission or copied fallback',f=>{
      const r=createIslandAssessment(f.input).assess();assert.equal(r.status,'blocked');
      const manifest=createGeneratedArtifactManifest({candidates:[],unresolved:[]},r.generatedDescription);
      const args={roots:f.input.roots,payloadRoot:'javascript',sourceRoot:'typescript',manifest,inventory:baseline.inventory,catalog:f.input.catalog,
        selection:{variant:'synthetic-generated-v1',contentSha256:r.generatedDescription.contentSha256,reviews:[],externalReviews:[],observations:f.input.observations}};
      const owner=createGeneratedArtifactSelection(args);assert.throws(()=>owner.admit(),e=>e.code==='GENERATED_ARTIFACT_DENIED');assert.equal(owner.denied,true);
      delete manifest.generatedArtifact;assert.throws(()=>buildPackageAdmission(manifest),e=>e.code==='GENERATED_ARTIFACT_DENIED');
    });
    if(failed)return;
    assert.deepEqual(observeCatalogFiles([{id:'repository',path:repo},{id:'archive',path:path.join(archive.backend,'before')}],originals.map(({root,path})=>({root,path}))),originals);
    assert.deepEqual(fs.readdirSync(globalRoot).sort(),['baseline.json','proposals.json']);fs.rmSync(globalRoot,{recursive:true});removed+=2;
    assert.deepEqual(fs.readdirSync(parent),[]);complete=true;
    console.log(JSON.stringify({cases,filesRemoved:removed,temporaryCaseRootsRemaining:0,compilerChildren:0,consumerChildren:0,sourceEdges:2,emittedEdges:1,
      incoming:positive.model.incoming.length,witnesses:positive.model.witnesses,files:positive.model.files.map(f=>({source:f.provenance.source,javascript:f.provenance.output,sourceSha256:f.provenance.sourceSha256,javascriptSha256:f.provenance.outputSha256})),
      affectedStaging:positive.model.uncertainty.staging.length,affectedInventory:positive.model.uncertainty.inventory.length,islandProjectedPhysical:3,globalPayloadCount:null}));
  }finally{if(!complete)console.error('STOP; preserve new island parent: '+parent);}
});
