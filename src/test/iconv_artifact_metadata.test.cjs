// Opt-in archival metadata checks only. No bundler, package body or backend runs.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const layout=require('./support/iconv_artifact_metadata.cjs');
const {inventory}=require('../../scripts/dependency-inventory.cjs');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {createGeneratedArtifactRecord,createGeneratedArtifactManifest,generatedArtifactContentHash:hash}=require('../../scripts/stage-backend.cjs');
const {createGeneratedArtifactSelection,buildPackageAdmission,installPackageAdmissionHooks}=require('../../scripts/staged-backend-review.cjs');
const {fixture}=require('./support/iconv_artifact_fixture.cjs');
const {missingSourceEdge,incorrectCompilerOptions}=require('./support/iconv_artifact_negative_controls.cjs');
const evidence=process.env.DISCOVERY_ICONV_METADATA_EVIDENCE;
const variant='iconv-esbuild-0.28.2-v1',repo=path.resolve(__dirname,'../..'),clone=v=>JSON.parse(JSON.stringify(v));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let stopped=false;
const tests=(name,run)=>test('iconv artifact metadata: '+name,{skip:!evidence},t=>{
  if(stopped){t.skip('Stopped after unexplained metadata/cleanup failure; evidence preserved.');return;}
  try{return fixture(run,{evidence});}catch(error){stopped=true;throw error;}
});

const denied=run=>assert.throws(run,e=>e.code==='GENERATED_ARTIFACT_DENIED');

for(const [label,control,reason] of [
  ['fresh control missing source occurrence',missingSourceEdge,'iconv-normalized-edges'],
  ['fresh control incorrect compiler target',incorrectCompilerOptions,'iconv-compiler-options'],
])tests(label+' denies with exact reason and sticky ownership',f=>{
  const valid=()=>{
    const report=f.session().admit();assert.equal(report.physicalFiles,22);assert.equal(report.admitted.length,13);
    assert.equal(report.retainedUnknown.length,9);assert.equal(report.incorporatedBuildFiles,13);
    assert.equal(f.content.sourceEdges.length,38);assert.equal(f.content.transformedEdges.length,38);assert.equal(report.runtimeEdges.length,16);
    assert.equal(verifyCatalog(f.catalog,f.roots).matchedBytes,true);
  };
  valid();assert.equal(control(f),reason);f.refresh();valid();
});
tests('actual metadata admits only independently reviewed files; 13/38/16 and 22-file accounting',f=>{
  const report=f.session().admit();assert.equal(report.physicalFiles,22);assert.equal(report.generatedFiles,2);assert.equal(report.incorporatedBuildFiles,13);
  assert.equal(f.content.sourceEdges.length,38);assert.equal(f.content.transformedEdges.length,38);assert.equal(report.runtimeEdges.length,16);
  assert.equal(report.admitted.length,13);assert.deepEqual(report.retainedUnknown.sort(),layout.unknown);
  assert.equal(report.productionAuthority,false);assert.equal(report.executionAuthority,false);assert.equal(report.completeClosure,false);
  assert.equal(report.atomicMeasuredHandleBinding,false);assert.equal(verifyCatalog(f.catalog,f.roots).matchedBytes,true);
  assert.equal(f.catalog.entries.length,67); // 22 payload, 39 original/context/config, six build evidence files
  assert.throws(()=>installPackageAdmissionHooks(f.roots[0].path,report),/Missing package admission evidence/);
  fs.writeFileSync(path.join(os.tmpdir(),'positive-metadata-summary.json'),JSON.stringify({productionAuthority:false,completeClosure:false,executionAuthority:false,
    profile:variant,provenanceRef:report.provenanceRef,generatedOutputs:f.content.outputs,incorporatedFiles:13,sourceOccurrences:38,runtimeTuples:16,
    selectedPayloadFiles:22,admittedFiles:13,retainedUnknown:report.retainedUnknown,catalogPhysicalFiles:67,
    compilerAuthenticity:false,rebuildPerformed:false,atomicMeasuredHandleBinding:false},null,2),{flag:'wx'});
});
for(const [label,root,name] of [['bundle','payload',layout.bundle],['source','sources',layout.incorporated[0]],['metadata','payload',layout.metadata[0]],['external dependency','payload',layout.safer],['metafile','build','esbuild-metafile.json']])
  tests(label+' same-size tampering denies irreversibly',f=>{
    const s=f.session();s.admit();const file=f.full(root,name),bytes=fs.readFileSync(file);bytes[0]^=1;fs.writeFileSync(file,bytes);
    denied(()=>s.admit());assert.equal(s.denied,true);bytes[0]^=1;fs.writeFileSync(file,bytes);denied(()=>s.admit());
  });
for(const [label,mutate] of [
  ['missing compiler input',g=>delete g.inputs[layout.incorporated[0]]],
  ['duplicate source import',g=>{const i=g.inputs[layout.facade].imports;i[1]=clone(i[0]);}],
  ['unexpected external',g=>{g.inputs[layout.facade].imports[0].path='unapproved-provider';}],
  ['ambiguous output key',g=>{const key=Object.keys(g.outputs)[0];g.outputs['../other/'+layout.bundle]=g.outputs[key];delete g.outputs[key];}],
  ['unexpected emitted import',g=>{Object.values(g.outputs)[0].imports.push({path:'unapproved-provider',kind:'require-call',external:true});}],
])tests(label+' rejects even with repinned evidence digest',f=>{
  const file=f.full('build','esbuild-metafile.json'),g=JSON.parse(fs.readFileSync(file,'utf8'));mutate(g);fs.writeFileSync(file,JSON.stringify(g,null,2));f.refresh();denied(()=>f.session().admit());
});
tests('transformed occurrence duplication cannot be hidden by normalized evidence',f=>{
  f.content.transformedEdges[1]=clone(f.content.transformedEdges[0]);f.refresh();denied(()=>f.session().admit());
});
tests('compiler/options changes reject despite owner repinning',f=>{
  f.content.derivation.options.target='node22';f.content.derivation.generator.version='0.28.1';f.refresh();denied(()=>f.session().admit());
});
tests('retained unknown selection is not runtime admission',f=>{
  f.selection.externalReviews.push({path:layout.unknown[0],reason:'Not executable admission.'});denied(()=>f.session().admit());
});
tests('removed provenance and facade status downgrade cannot fall back',f=>{
  const s=f.session();s.admit();delete f.manifest.generatedArtifact;
  const facade=f.manifest.candidates.find(c=>c.output===layout.facade);facade.source=facade.output;facade.status='copied-candidate';
  denied(()=>s.admit());denied(()=>buildPackageAdmission(f.manifest,[{path:layout.facade,reason:'Historical source pathname review.'}]));
});
tests('duplicate JSON input keys reject despite repinned bytes',f=>{
  const file=f.full('build','esbuild-metafile.json'),g=JSON.parse(fs.readFileSync(file,'utf8'));
  fs.writeFileSync(file,'{"inputs":'+JSON.stringify(g.inputs)+',"inputs":'+JSON.stringify(g.inputs)+',"outputs":'+JSON.stringify(g.outputs)+'}');
  f.refresh();denied(()=>f.session().admit());
});
