// Opt-in: exactly one harmless compiler invocation, no package/backend execution.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {fixture}=require('./support/iconv_artifact_fixture.cjs');
const {missingSourceEdge,incorrectCompilerOptions}=require('./support/iconv_artifact_negative_controls.cjs');
const layout=require('./support/iconv_artifact_metadata.cjs');
const {observeCatalogFiles,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');
const evidence=process.env.DISCOVERY_ICONV_METADATA_EVIDENCE;
const enabled=process.env.DISCOVERY_ICONV_FRESH_BUILD==='1';
const repo=path.resolve(__dirname,'../..');
const expected={
  [layout.facade]:{size:73,sha256:'6f337c46a421eb2e3ca175624f6ffc81ab55cb04bee0a77b95af5ceb873fc7c5'},
  [layout.bundle]:{size:126517,sha256:'6880817d8741d1e77cf89dced6c4eaba6b0c7413f7800d4a400b18ae75116669'},
};
const compilerDigest='c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef';
function checked(directory){
  const absolute=path.resolve(directory);assert.equal(fs.realpathSync(absolute),absolute);
  for(let current=absolute;;current=path.dirname(current)){
    const stat=fs.lstatSync(current);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'No redirected ancestor');
    if(path.dirname(current)===current)break;
  }
  return absolute;
}
const denied=run=>assert.throws(run,e=>e.code==='GENERATED_ARTIFACT_DENIED');
test('fresh iconv outputs bind to independently fixed archival expectations', {skip:!enabled},()=>{
  assert.ok(evidence&&path.isAbsolute(evidence));checked(evidence);
  const parent=checked(os.tmpdir());
  // Parent must be explicitly allocated for this invocation, not the general temp root.
  assert.match(path.basename(parent),/^discovery-iconv-fresh-validation-[a-f0-9]{32}$/);
  assert.equal(fs.readdirSync(parent).length,0,'No previous build or retry in this session');
  const journal=path.join(parent,'fresh-build-accounting.json');
  let invocations=0,base,summary;
  const persist=value=>fs.writeFileSync(journal,JSON.stringify(value,null,2),{flag:fs.existsSync(journal)?'w':'wx'});
  const freshBuild=f=>{
    base=checked(f.base);checked(f.full('sources',''));checked(f.full('build',''));checked(f.full('payload',''));
    const stage=f.full('sources',''),binary=path.join(repo,'node_modules/@esbuild/win32-x64/esbuild.exe');
    const binaryRef={root:'repository',path:'node_modules/@esbuild/win32-x64/esbuild.exe'};
    const repository=[{id:'repository',path:repo}];
    const compilerBefore=observeCatalogFiles(repository,[binaryRef])[0];
    assert.equal(compilerBefore.sha256,compilerDigest);assert.equal(compilerBefore.size,11694592);
    assert.equal(f.intent.toolIdentity.sha256,compilerDigest);
    const refs=[...f.originals,...layout.contexts,'package.json','package-lock.json','tsconfig.json','src/resolution-contexts.cjs'].map(path=>({root:'sources',path}));
    refs.push(...f.intent.tools.map(t=>({root:'build',path:t.path})),{root:'build',path:'esbuild.exe'});
    const before=observeCatalogFiles(f.roots,refs);
    // Review the archive before spawning. These fixed expectations are not obtained
    // from compiler output or the generated admission record.
    for(const name of Object.keys(expected)){
      const archived=f.archived.sourceMap.find(r=>r.path===name).copied;
      assert.equal(archived.sha256,expected[name].sha256);assert.equal(Number(archived.identity.size),expected[name].size);
      const copied=f.measure('payload',name);assert.equal(copied.sha256,expected[name].sha256);
    }
    const compile=path.join(base,'compile'),output=path.join(compile,layout.bundle),meta=path.join(base,'esbuild-metafile.json');
    fs.mkdirSync(path.dirname(output),{recursive:true});checked(path.dirname(output));
    const args=[layout.facade,'--bundle','--platform=node','--format=cjs','--target=node24','--tree-shaking=false',
      '--external:safer-buffer','--external:./tables/*.json','--outfile='+output,'--metafile='+meta,'--log-level=warning'];
    const asMeasurement=({identity,sha256})=>({identity,sha256});
    const originalRefs=f.originals.map(path=>({root:'repository',path}));
    const originalMeasurements=observeCatalogFiles(repository,originalRefs);
    const sourceInputs=f.originals.map(name=>({path:name,
      source:asMeasurement(originalMeasurements.find(r=>r.path===name)),
      staged:asMeasurement(before.find(r=>r.root==='sources'&&r.path===name))}));
    const intent={...f.intent,binary,workingDirectory:stage,args,toolIdentity:asMeasurement(compilerBefore),sourceInputs,
      tools:f.intent.tools.map(t=>({...t,measurement:asMeasurement(before.find(r=>r.root==='build'&&r.path===t.path))}))};
    fs.writeFileSync(f.full('build','compile-intent.json'),JSON.stringify(intent,null,2));
    const intentBefore=observeCatalogFiles(f.roots,[{root:'build',path:'compile-intent.json'}]);
    persist({state:'prepared',invocations,root:base,compilerBefore,inputs:before,intent,independentOutputExpectations:expected});
    assert.equal(invocations++,0);
    persist({state:'compiler-starting',invocations,root:base,compilerBefore,inputs:before,intent,independentOutputExpectations:expected});
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.NODE_ENV='production';
    const child=spawnSync(binary,args,{cwd:stage,env,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    summary={state:'compiler-returned-not-yet-validated',invocations,root:base,compilerBefore,inputs:before,intent,
      child:{pid:child.pid,status:child.status,signal:child.signal,error:child.error?.message??null,stdout:child.stdout,stderr:child.stderr},
      independentOutputExpectations:expected};persist(summary);
    assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
    assert.deepEqual(observeCatalogFiles(repository,[binaryRef])[0],compilerBefore);
    assert.deepEqual(observeCatalogFiles(repository,originalRefs),originalMeasurements);
    assert.deepEqual(observeCatalogFiles(f.roots,refs),before);
    assert.deepEqual(observeCatalogFiles(f.roots,[{root:'build',path:'compile-intent.json'}]),intentBefore);
    // Validate actual emitted bytes before putting them in the independently reviewed selection.
    const generatedRoots=[{id:'generated',path:compile}];
    assert.deepEqual(fs.readdirSync(path.dirname(output)),['consolidated.cjs']);
    const measured=observeCatalogFiles(generatedRoots,[{root:'generated',path:layout.bundle}])[0];
    assert.equal(measured.size,expected[layout.bundle].size);assert.equal(measured.sha256,expected[layout.bundle].sha256);
    assert.notEqual(measured.identity.ino,f.archived.sourceMap.find(r=>r.path===layout.bundle).copied.identity.ino);
    const graph=JSON.parse(fs.readFileSync(meta,'utf8'));
    const archivedGraph=JSON.parse(fs.readFileSync(path.join(evidence,'esbuild-metafile.json'),'utf8'));
    assert.deepEqual(graph,archivedGraph,'Only parsed JSON key order/whitespace is normalized; every metadata value must match');
    fs.writeFileSync(f.full('payload',layout.bundle),fs.readFileSync(output));
    fs.writeFileSync(f.full('payload',layout.facade),"'use strict';\nmodule.exports = require('../encodings/consolidated.cjs');\n");
    fs.writeFileSync(f.full('build','esbuild-metafile.json'),fs.readFileSync(meta));
    for(const name of Object.keys(expected)){
      const m=f.measure('payload',name);assert.equal(m.sha256,expected[name].sha256);assert.equal(m.size,expected[name].size);
    }
    summary.generated=measured;summary.metafileValuesEqual=true;persist(summary);
  };
  fixture(f=>{
    assert.equal(invocations,1);const session=f.session(),report=session.admit();
    assert.equal(report.physicalFiles,22);assert.equal(report.admitted.length,13);assert.equal(report.retainedUnknown.length,9);
    assert.equal(report.incorporatedBuildFiles,13);assert.equal(f.content.sourceEdges.length,38);assert.equal(f.content.transformedEdges.length,38);assert.equal(report.runtimeEdges.length,16);
    assert.equal(report.executionAuthority,false);assert.equal(report.productionAuthority,false);assert.equal(report.atomicMeasuredHandleBinding,false);
    for(const o of f.selection.reviews){assert.equal(o.sha256,expected[o.path].sha256);assert.equal(o.size,expected[o.path].size);}
    assert.equal(verifyCatalog(f.catalog,f.roots).matchedBytes,true);
    const issuedManifests=new Set([f.manifest]),issuedSelections=new Set([f.selection]);
    const nextCase=()=>{
      f.refresh(); // Issues new record/manifest/review objects; never resets an owner.
      assert.equal(issuedManifests.has(f.manifest),false);assert.equal(issuedSelections.has(f.selection),false);
      issuedManifests.add(f.manifest);issuedSelections.add(f.selection);
    };
    nextCase();const outputCase=f.session();outputCase.admit();
    const bundle=f.full('payload',layout.bundle),bytes=fs.readFileSync(bundle);
    bytes[0]^=1;fs.writeFileSync(bundle,bytes);denied(()=>outputCase.admit());bytes[0]^=1;fs.writeFileSync(bundle,bytes);denied(()=>outputCase.admit());
    // Expected negative admissions are isolated sessions; no new compilation.
    nextCase();f.selection.reviews.find(r=>r.path===layout.bundle).sha256='0'.repeat(64);denied(()=>f.session().admit());
    const edge=f.content.transformedEdges[1];f.content.transformedEdges[1]={...f.content.transformedEdges[0]};nextCase();denied(()=>f.session().admit());
    f.content.transformedEdges[1]=edge;nextCase();
    const dependency=f.full('payload',layout.safer),original=fs.readFileSync(dependency);const changed=Buffer.from(original);changed[0]^=1;
    const external=f.session();fs.writeFileSync(dependency,changed);denied(()=>external.admit());fs.writeFileSync(dependency,original);denied(()=>external.admit());
    assert.throws(()=>f.session(),e=>e.code==='GENERATED_ARTIFACT_DENIED'&&e.reason==='selection-owner');
    const newDenials=[missingSourceEdge(f,nextCase),incorrectCompilerOptions(f,nextCase)];
    nextCase();
    const fallback=f.session();fallback.admit();delete f.manifest.generatedArtifact;
    const facade=f.manifest.candidates.find(c=>c.output===layout.facade);facade.source=facade.output;facade.status='copied-candidate';
    denied(()=>fallback.admit());denied(()=>buildPackageAdmission(f.manifest,[{path:layout.facade,reason:'Original pathname cannot authorize fresh output.'}]));
    assert.equal(issuedManifests.size,8);assert.equal(issuedSelections.size,8); // Positive selection plus seven independent negatives.
    assert.equal(verifyCatalog(f.catalog,f.roots).matchedBytes,true);
    summary={...summary,state:'validated-cleanup-pending',selected:22,admitted:13,retainedUnknown:9,catalogFiles:f.catalog.entries.length,
      incorporated:13,sourceOccurrences:38,runtimeTuples:16,negativeControls:7,newDenials,compilerReturned:true,
      aclOwnersCreated:0,ownedConsumerProcesses:0,additionalReferenceAuthority:false,
      productionAuthority:false,compilerAuthenticity:false,reproducibilityClaim:'one fresh build matches archived bytes; not universal reproducibility',
      differences:['Fresh filesystem identities and compile-intent absolute paths/measurements differ; content is compared separately.']};persist(summary);
  },{evidence,freshBuild});
  assert.equal(fs.existsSync(base),false);assert.deepEqual(fs.readdirSync(parent),['fresh-build-accounting.json']);
  persist({...summary,state:'completed',temporaryRootsRemaining:0,compilerInvocations:invocations,cleanupConfirmed:true});
});
