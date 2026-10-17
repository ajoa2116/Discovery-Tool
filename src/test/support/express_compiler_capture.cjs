// Single-compile evidence capture used only by the opt-in feasibility fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inventory}=require('../../../scripts/dependency-inventory.cjs');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../../scripts/payload-byte-catalog.cjs');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord,createGeneratedArtifactManifest,normalizeDependencyGuardCompilerCorrespondence:normalize}=require('../../../scripts/stage-backend.cjs');
const {createGeneratedArtifactSelection,buildPackageAdmission}=require('../../../scripts/staged-backend-review.cjs');
const {specs,matchActualCompilerGraph}=require('./dependency_guard_descriptors.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
function prepare({base,stage,roots,prior,tools,toolPaths,repo,manifest}){
  const evidenceRoot=path.join(base,'compiler-evidence');fs.mkdirSync(evidenceRoot);roots.push({id:'compiler-evidence',path:evidenceRoot});
  const put=(name,bytes)=>{const full=path.join(evidenceRoot,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes,{flag:'wx'});};
  for(const name of toolPaths.slice(0,3)){
    const bytes=fs.readFileSync(path.join(repo,name));put(name,bytes);
    assert.equal(observeCatalogFiles(roots,[{root:'compiler-evidence',path:name}])[0].sha256,tools.find(f=>f.path===name).sha256);
  }
  const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
  put('compiler-lock.json',JSON.stringify({lockfileVersion:3,packages:Object.fromEntries(toolPaths.slice(1,3).map(p=>[path.posix.dirname(p),lock.packages[path.posix.dirname(p)]]))}));
  const names=[...toolPaths.slice(0,3),'compiler-lock.json','reviewed-invocation.json'];
  let before;
  return {
    binary:path.join(evidenceRoot,toolPaths[0]),metafile:path.join(evidenceRoot,'esbuild-metafile.json'),
    recordIntent(intent){
      put('reviewed-invocation.json',JSON.stringify({productionAuthority:false,binary:intent.binary,args:intent.args,options:intent.options,workingDirectory:stage}));
      before=observeCatalogFiles(roots,names.map(path=>({root:'compiler-evidence',path})));
    },
    recordOwner(owner){put('compile-owner.json',JSON.stringify(owner));},
    complete({graph,generated,report}){
      assert.deepEqual(observeCatalogFiles(roots,names.map(path=>({root:'compiler-evidence',path}))),before);
      const inv=inventory(stage,{entrypoints:[{role:'backend-stage',path:'node_modules/express/index.js'}]});
      put('inventory.json',JSON.stringify(inv));
      const sourceEdges=prior.sourceEdges.map((e,occurrence)=>({occurrence,source:{root:'sources',path:e.source},line:e.line,kind:'require',specifier:e.specifier,
        target:e.resolution==='node-builtin'?'node:'+e.specifier.replace(/^node:/,''):e.resolvedPath?{root:'sources',path:e.resolvedPath}:null}));
      const tuple=r=>JSON.stringify([r.source,r.line,r.specifier,r.resolvedPath??null,r.resolution==='node-builtin']);
      const selectedNames=new Set(prior.sourceProvenance.map(f=>f.path));
      assert.deepEqual(inv.references.filter(r=>r.kind==='require'&&!r.typeOnly&&selectedNames.has(r.source)).map(tuple).sort(),prior.sourceEdges.map(tuple).sort());
      const evidenceNames=[...names,'esbuild-metafile.json','compile-owner.json','inventory.json'];
      const refs=[...manifest.candidates.map(c=>({root:'sources',path:c.output})),{root:'output',path:generated.path},...evidenceNames.map(path=>({root:'compiler-evidence',path}))];
      const observations=observeCatalogFiles(roots,refs);
      const catalog=createCatalog({roots,staging:{root:'sources',manifest},overlays:refs.filter(f=>f.root!=='sources').map(f=>({...f,reason:'Explicit fresh compiler evidence, no loading authority.'}))});
      assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);
      const ref=path=>({root:'sources',path}),required=[...new Set(specs.flatMap(s=>[s.importer,s.metadata,...(s.target?[s.target]:[])]))].sort();
      const extension={version:1,profile:'express-guards-v1',inventorySha256:hash(inv),sourceEdgesSha256:hash(sourceEdges),
        files:required.map(path=>observations.find(f=>f.root==='sources'&&f.path===path)),descriptors:specs.map(s=>({
          occurrence:sourceEdges.find(e=>e.source.path===s.importer&&e.specifier===s.specifier).occurrence,source:ref(s.importer),specifier:s.specifier,target:s.target?ref(s.target):null,
          guard:{category:s.category,expression:s.expression},evidence:[ref(s.importer),ref(s.metadata),...(s.target?[ref(s.target)]:[])],
          reachability:s.target?'conditional':'unresolved',observedLoad:'not-asserted',compilerIncorporation:'not-asserted',runtimeAdmission:'unadmitted',closure:'unresolved',possibleTargets:null,
          derivation:s.target?null:'extension-or-default-engine -> this.ext -> this.ext.slice(1) -> require(mod)'}))};
      const measured=(root,path)=>observations.find(f=>f.root===root&&f.path===path);
      const compilerEvidence={version:1,profile:'express-guard-actual-v1',kind:'fresh-esbuild-0.28.2',descriptorSha256:hash(extension),sourceEdgesSha256:hash(sourceEdges),
        output:measured('output',generated.path),metafile:measured('compiler-evidence','esbuild-metafile.json'),intent:measured('compiler-evidence','reviewed-invocation.json'),
        invocation:measured('compiler-evidence','compile-owner.json'),generator:measured('compiler-evidence',toolPaths[0]),
        packageMetadata:toolPaths.slice(1,3).map(p=>measured('compiler-evidence',p)),lock:measured('compiler-evidence','compiler-lock.json')};
      const input={profile:'express-guards-v1',roots,catalog,inventory:inv,sourceEdges,observations,extension,sourceRoot:'sources',compilerEvidence};
      const actual=normalize(input);assert.equal(actual.actualMetafileCorrespondence,true);assert.equal(actual.executionAuthority,false);
      assert.deepEqual([...report.incorporatedUnknown].sort(),specs.filter(s=>s.target).map(s=>s.target).sort());
      const checks=['exact measured source/compiler/output/metafile/options','five conditional identities and guards','347 = 307 transformed + 39 outside + one unresolved computed'];
      const deny=(run,reason)=>assert.throws(run,e=>e.code==='GENERATED_ARTIFACT_DENIED'&&(!reason||e.reason===reason));
      const strict=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'GENERATED_ARTIFACT_DENIED',reason});};
      for(const [label,mutate] of [
        ['missing conditional edge',g=>g.inputs[specs[0].importer].imports=g.inputs[specs[0].importer].imports.filter(e=>e.path!==specs[0].target)],
        ['duplicate conditional edge',g=>g.inputs[specs[0].importer].imports.push(clone(g.inputs[specs[0].importer].imports.find(e=>e.path===specs[0].target)))],
        ['substituted equal-byte target',g=>{g.inputs[specs[0].importer].imports.find(e=>e.path===specs[0].target).path=specs[1].target;}],
        ['case-aliased target',g=>{g.inputs[specs[0].target.toUpperCase()]=g.inputs[specs[0].target];delete g.inputs[specs[0].target];}],
        ['redirected output',g=>{const key=Object.keys(g.outputs)[0];g.outputs['../other/consolidated.cjs']=g.outputs[key];delete g.outputs[key];}],
        ['invented engine import',g=>g.inputs[specs[5].importer].imports.push({path:'ejs',kind:'require-call',external:true})],
      ]){
        const altered=clone(graph);mutate(altered);deny(()=>matchActualCompilerGraph({graph:altered,sourceEdges,measurements:observations,descriptors:{descriptors:extension.descriptors},sourceRoot:'sources',output:generated},strict));checks.push(label+' denied');
      }
      const changed=clone(input);changed.compilerEvidence.metafile.sha256='0'.repeat(64);deny(()=>normalize(changed),'actual-compiler-observation');checks.push('metadata measurement substitution denied');
      const record=createGeneratedArtifactRecord({outputs:[{root:'output',path:generated.path,size:generated.size,sha256:generated.sha256,role:'generated-code'}],
        sourceEdges,inventorySha256:hash(inv),conditionalGuards:extension,guardCompilerEvidence:compilerEvidence},observations);
      const m=createGeneratedArtifactManifest(manifest,record),args={roots,payloadRoot:'output',sourceRoot:'sources',manifest:m,inventory:inv,catalog,
        selection:{variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:[],externalReviews:[],observations},conditionalGuardProfile:'express-guards-v1'};
      const owner=createGeneratedArtifactSelection(args);deny(()=>owner.admit(),'conditional-descriptors-not-admission');
      deny(()=>createGeneratedArtifactSelection(args),'selection-owner');delete m.generatedArtifact;deny(()=>owner.admit(),'sticky-denial');deny(()=>buildPackageAdmission(m,[]));
      checks.push('no admission, one owner, sticky denial and no copied fallback');
      assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);
      assert.deepEqual(observeCatalogFiles(roots,refs),observations);
      return {productionAuthority:false,executionAuthority:false,completeClosure:false,actual,checks,compilerEvidence,descriptors:extension,
        rawMetafile:fs.readFileSync(path.join(evidenceRoot,'esbuild-metafile.json'),'utf8'),catalog,observations,inventorySha256:hash(inv),
        resources:{compilerChildren:1,consumerChildren:0,jobs:0,aclOwners:0,compilerReturned:true,cleanupConfirmed:false}};
    },
  };
}
module.exports={prepare};
