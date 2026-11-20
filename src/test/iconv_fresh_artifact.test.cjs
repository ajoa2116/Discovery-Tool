// Opt-in: exactly one harmless compiler invocation, no package/backend execution.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {fixture,captureLocalInputs}=require('./support/iconv_artifact_fixture.cjs');
const {missingSourceEdge,incorrectCompilerOptions}=require('./support/iconv_artifact_negative_controls.cjs');
const layout=require('./support/iconv_artifact_metadata.cjs');
const {observeCatalogFiles,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');
const enabled=process.env.DISCOVERY_ICONV_FRESH_BUILD==='1';
const repo=path.resolve(__dirname,'../..');
const expected={
  [layout.facade]:{size:73,sha256:'6f337c46a421eb2e3ca175624f6ffc81ab55cb04bee0a77b95af5ceb873fc7c5'},
  [layout.bundle]:{size:126517,sha256:'6880817d8741d1e77cf89dced6c4eaba6b0c7413f7800d4a400b18ae75116669'},
};
const compilerDigest='c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef';
// Current measured selections; not historical staged/output identities.
const localPins=[["node_modules/iconv-lite/lib/index.js",5123,"77d20e2fd5bcd9e324fb6cfdb909cd06fdaf6a91769adffcf4d7c4c066cce4c3"],["node_modules/iconv-lite/lib/bom-handling.js",1109,"c230d25d8e7fbb50960c634b636b71327c409e9a77e67fe9446b566bdcea362d"],["node_modules/iconv-lite/lib/streams.js",3387,"25a423eaf41f8dc6bc40cb28189a24e2d63b990ed72c824940bed55d0264ea6d"],["node_modules/iconv-lite/lib/extend-node.js",8701,"7b86aebd7175d940c50f60eac1981490962855d9723bf971981ddd703ba6af43"],["node_modules/iconv-lite/encodings/index.js",710,"69607a9ee51b63333d0e7ee20a38b52e1e96652a4bbc09c701d70835fbbfe10a"],["node_modules/iconv-lite/encodings/internal.js",6115,"39d9dd0568708a23c5999fcd6c417ec64f35ecbecd37205f91c7c6b59d14d773"],["node_modules/iconv-lite/encodings/utf16.js",5011,"baf708be438edf0fef70a3e34619c6be94cd53d963acb9b2542419d5fc3bb8c8"],["node_modules/iconv-lite/encodings/utf7.js",9215,"c814ad268d19265ccafc9f7bba2e8dfcdd2afdea62698bb24b7284b3f2ea18a0"],["node_modules/iconv-lite/encodings/sbcs-codec.js",2191,"fb511c4c70a6cb0e2a06d03e67ca88dca9f4da6266b909c7338e453d2ecc9fdb"],["node_modules/iconv-lite/encodings/sbcs-data.js",4686,"3116c986bff5d0b3a0d9ee1700d97ac466965a7b30d353300d408b41622604c2"],["node_modules/iconv-lite/encodings/sbcs-data-generated.js",32034,"2cf44b3f70c61c9cdd59fda7ec085bc3180809638f208c7239688ccb90a48866"],["node_modules/iconv-lite/encodings/dbcs-codec.js",21415,"d39bc17f93fc56af631b00e36542488923378cce5ad9e7db48252ce7a1e7b1ed"],["node_modules/iconv-lite/encodings/dbcs-data.js",8291,"e213f77e926605c30649ea48bcea851d1ec063bb17fa4c2ab6d3b64853b481ac"],["node_modules/safer-buffer/safer.js",2110,"37f9716144105051ab302f6a0c30a52ff5de7269b9e1173ac22be798fc11ccad"],["node_modules/iconv-lite/encodings/tables/shiftjis.json",23782,"02b0b120f697c48133e8b547e8dc594bc5b9f1c1799b50c2c5ff917298548558"],["node_modules/iconv-lite/encodings/tables/eucjp.json",41064,"7c4fe279000f7e99fc7cd59afb1da21725dcebdc1babd9e3b883253a77abb042"],["node_modules/iconv-lite/encodings/tables/cp936.json",47320,"8225bb693efd380279ed7280b8f8419fd069c5f018d20d5946bf187ad92c0cf7"],["node_modules/iconv-lite/encodings/tables/gbk-added.json",1227,"7e6e8c23d37d5819481909e4d972fbf0f35e120dda3498dd3a0cd6b5e4932fe6"],["node_modules/iconv-lite/encodings/tables/gb18030-ranges.json",2216,"5a3cc11e38f05a0908442acbf1c921d0b73f2a304fb6a9e4484e26eb1ca07d76"],["node_modules/iconv-lite/encodings/tables/cp949.json",38122,"77a56ea83d0d94d1dc620042ad3c897f0e40814bb05c0085d3aeed0018e8a3e8"],["node_modules/iconv-lite/encodings/tables/cp950.json",42356,"99e2114dc4b39092617967c763f9eaeb4d8e70551afc5884baa3fb92827f3420"],["node_modules/iconv-lite/encodings/tables/big5-added.json",17717,"db94db5e5d3ab696ddb0025685cfa85da1864839a4a26aab2f8f86f6b8382288"],["node_modules/iconv-lite/package.json",1227,"6f7c96c32f7d6e0498be71b0ccedaf298bb00ab4dd40c1d63655ec53477db384"],["node_modules/safer-buffer/package.json",822,"4247a3a63c45a6a7ced1557fe4dd9d2a163af4915d594b95e5867b69a53edb52"],["node_modules/iconv-lite/Changelog.md",4342,"0c7c66f8f39354e7b15c4431a95c2bcd40941f9ae8d666efa8f17afb97b87c82"],["node_modules/iconv-lite/LICENSE",1064,"ac779f7314c74f232ef847ea86e714abe25cf6eeb5cc97b69451b74e2af6492d"],["node_modules/iconv-lite/README.md",6534,"a417c996ceb04e8dbaca5d18187820afe34ce5105ffd4b7c3ef3c5beae298eba"],["node_modules/iconv-lite/lib/index.d.ts",982,"73aaee6a7a9cf41fb2c67158f4bc218f9da27545ea55648b2c10ca2a9600ae15"],["node_modules/safer-buffer/LICENSE",1094,"4bc935e71be198c67ddf3c2b5fddb195f6edc182bfc155a96a6db61b44b494b9"],["node_modules/safer-buffer/Porting-Buffer.md",12794,"134523d05b39e177135c2a2070a426eb319657dfc77589e38ef7cf13cd50e730"],["node_modules/safer-buffer/Readme.md",8261,"d4331b7c5af9c02161150daf9451ee6bc7a73ece3ec0312603fae09f46a817d8"],["node_modules/safer-buffer/dangerous.js",1483,"1dc2900bcc8ffc375af0d2fc99a03ecad2dcbb85d278fbf26982e87707bea53f"],["node_modules/safer-buffer/tests.js",15735,"511906fdf6a233c84a9216065d1701dbfd84f380fbd495ae1cf5a002370b9885"],["node_modules/body-parser/lib/read.js",4325,"1e9e274755366c39ae70e8b9a7a42fc12219566e67efaf9b7ebc2a8b337f5b6b"],["node_modules/raw-body/index.js",7171,"e1c1ff9152ec1f5cf1ef1c2b853d6723e93ba13e4e9f1f15f9c6b2026a39a1cb"],["node_modules/esbuild/package.json",3980,"9d0bc453f4e791553c4cc2298ba023b409241fd9801e494741666eb0f6051490"],["node_modules/@esbuild/win32-x64/package.json",374,"89382df45735edcd917c492a810ab514920fa07d36c653cdc122bdfd8f526964"]];
test('fresh local context preserves exact partition and versions',()=>{
  const s=captureLocalInputs(localPins);assert.equal(s.originals.length,33);assert.equal(s.observations.length,37);s.verify();
  assert.equal(layout.incorporated.length+1,14);assert.equal(layout.tables.length,8);assert.equal(layout.metadata.length,2);assert.equal(layout.unknown.length,9);
});
for(const [name,change]of [
  ['missing input',p=>p.pop()],['duplicate input',p=>{p[1]=p[0];}],['case alias',p=>{p[0][0]=p[0][0].toUpperCase();}],
  ['substituted hash',p=>{p[0][2]='0'.repeat(64);}],['wrong size',p=>{p[0][1]++;}],
])test('fresh local rejects '+name,()=>{const pins=JSON.parse(JSON.stringify(localPins));change(pins);assert.throws(()=>captureLocalInputs(pins));});
test('fresh local identity drift rejects without disk mutation',()=>{
  const s=captureLocalInputs(localPins),original=fs.fstatSync;
  try{fs.fstatSync=function(fd,options){const v=original.call(this,fd,options);return options?.bigint?Object.assign(v,{ino:v.ino+1n}):v;};assert.throws(()=>s.verify(),/changed-during-read|changed/);}
  finally{fs.fstatSync=original;}s.verify();
});
test('fresh local consumed-byte substitution rejects',()=>{
  const s=captureLocalInputs(localPins),original=fs.readFileSync;
  try{fs.readFileSync=function(file,...args){const b=original.call(this,file,...args);return file===path.join(repo,layout.incorporated[0])?Buffer.concat([b,Buffer.from(' ')]):b;};assert.throws(()=>s.bytes(layout.incorporated[0]));}
  finally{fs.readFileSync=original;}s.verify();
});
function checked(directory){
  const absolute=path.resolve(directory);assert.equal(fs.realpathSync(absolute),absolute);
  for(let current=absolute;;current=path.dirname(current)){
    const stat=fs.lstatSync(current);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'No redirected ancestor');
    if(path.dirname(current)===current)break;
  }
  return absolute;
}
const denied=run=>assert.throws(run,e=>e.code==='GENERATED_ARTIFACT_DENIED');
test('fresh local iconv outputs bind to independently fixed output expectations', {skip:!enabled},()=>{
  assert.equal(process.env.DISCOVERY_ICONV_METADATA_EVIDENCE,undefined,'No historical archive accepted by fresh mode');
  for(const name of ['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'])assert.ok(!process.env[name],'Inherited override '+name);
  const environment={...process.env},cache=Object.keys(require.cache).sort();
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
    // Fixed output pins are independent of this compiler/admission result.
    // Historical output/metafile identities are unavailable, not reconstructed.
    for(const name of Object.keys(expected)){
      assert.equal(fs.existsSync(f.full('payload',name)),false);assert.equal(f.archived,undefined);
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
    const graph=JSON.parse(fs.readFileSync(meta,'utf8'));
    assert.deepEqual(Object.keys(graph.inputs).sort(),[...layout.incorporated].sort());
    assert.deepEqual(Object.keys(graph.outputs),['../compile/'+layout.bundle]);
    assert.equal(graph.outputs['../compile/'+layout.bundle].bytes,expected[layout.bundle].size);
    fs.writeFileSync(f.full('payload',layout.bundle),fs.readFileSync(output));
    fs.writeFileSync(f.full('payload',layout.facade),"'use strict';\nmodule.exports = require('../encodings/consolidated.cjs');\n");
    fs.writeFileSync(f.full('build','esbuild-metafile.json'),fs.readFileSync(meta));
    for(const name of Object.keys(expected)){
      const m=f.measure('payload',name);assert.equal(m.sha256,expected[name].sha256);assert.equal(m.size,expected[name].size);
    }
    summary.generated=measured;summary.freshMetafileMeasured=true;summary.historicalMetafileCorrespondence='UNVERIFIED';persist(summary);
  };
  fixture(f=>{
    assert.equal(invocations,1);
    const report=f.session().admit();
    assert.equal(report.physicalFiles,22);assert.equal(report.admitted.length,13);assert.equal(report.retainedUnknown.length,9);
    assert.equal(report.incorporatedBuildFiles,13);assert.equal(f.content.sourceEdges.length,38);assert.equal(f.content.transformedEdges.length,38);assert.equal(report.runtimeEdges.length,16);
    assert.equal(report.executionAuthority,false);assert.equal(report.productionAuthority,false);assert.equal(report.atomicMeasuredHandleBinding,false);
    assert.equal(report.basis,'fixture-generated-artifact-evidence-only');
    assert.throws(()=>require('../../scripts/staged-backend-review.cjs').installPackageAdmissionHooks(f.full('payload',''),report),/Missing package admission evidence/);
    assert.ok(layout.unknown.every(p=>f.manifest.candidates.some(c=>c.output===p)&&!report.admitted.some(a=>a.path===p)));
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
      productionAuthority:false,compilerAuthenticity:false,reproducibilityClaim:'one fresh build matches independent output pins; historical file/metafile correspondence UNVERIFIED',
      remainingCallerObligations:29,authoritativeBaseline:825,ceiling:64,
      blockedChecks:['generated/dependency runtime equivalence','actual loader consumption','production admission'],
      historicalOutputIdentity:'UNVERIFIED',runtimeEquivalence:false,executionAuthority:false,stagingAdmission:false,runtimeTrust:false,
      signingApproval:false,releaseAuthority:false,productionReady:false,facadeRemovability:false,completeClosure:false,
      differences:['Fresh local identities only; no historical stage, capture or 4736-record manifest was reconstructed.']};persist(summary);
  },{localFresh:true,pins:localPins,freshBuild});
  assert.equal(fs.existsSync(base),false);assert.deepEqual(fs.readdirSync(parent),['fresh-build-accounting.json']);
  persist({...summary,state:'completed',temporaryRootsRemaining:0,compilerInvocations:invocations,cleanupConfirmed:true});
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
});
