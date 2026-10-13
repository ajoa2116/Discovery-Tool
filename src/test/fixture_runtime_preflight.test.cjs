const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {fixtureRuntimePreflight}=require('../../scripts/fixture-runtime-preflight.cjs');
let root,stage,buildDirectory,frameworkRoot,provenance;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeEvidence=()=>fs.writeFileSync(path.join(buildDirectory,'build-input-provenance.json'),JSON.stringify(provenance));
const run=()=>fixtureRuntimePreflight({stage,buildDirectory,frameworkRoot});
before(()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-runtime-preflight-'));stage=path.join(root,'stage');buildDirectory=path.join(root,'build');frameworkRoot=path.join(root,'shared');
  const owner=path.join(root,'owner');for(const folder of [stage,buildDirectory,frameworkRoot,owner])fs.mkdirSync(folder);
  const source=path.resolve(__dirname,'../../native/ApplicationCompanion/bin/Release/net10.0-windows');
  const names=['ApplicationCompanion.exe','ApplicationCompanion.dll','ApplicationCompanion.deps.json','ApplicationCompanion.runtimeconfig.json'];
  for(const name of names)fs.copyFileSync(path.join(source,name),path.join(owner,name));
  for(const file of ['node-launch-entry.cjs','node-launch-driver.cjs','node-launch-review.cjs','src/test/support/backend_tls_binding.js','src/server/backend_application.js','package.json','node-owner-bridge.node']){
    fs.mkdirSync(path.dirname(path.join(stage,file)),{recursive:true});fs.writeFileSync(path.join(stage,file),'fixture test bytes');
  }
  fs.writeFileSync(path.join(stage,'stage-manifest.json'),JSON.stringify({productionAuthority:false,candidates:[{source:'src/server/backend_application.ts',output:'src/server/backend_application.js'}],unresolved:[{reason:'computed-import'}]}));
  provenance={purpose:'test-only-native-node-bridge',productionAuthority:false,command:{exitCode:0},ownerRoot:owner,
    ownerMeasurements:names.map(name=>({path:path.join(owner,name),sha256:hash(path.join(owner,name))})),
    output:{path:path.join(buildDirectory,'node-owner-bridge.node'),sha256:hash(path.join(stage,'node-owner-bridge.node'))}};
  writeEvidence();
  for(const [name,files] of Object.entries({'Microsoft.NETCore.App':['Microsoft.NETCore.App.deps.json','System.Private.CoreLib.dll','hostpolicy.dll','coreclr.dll'],
    'Microsoft.WindowsDesktop.App':['Microsoft.WindowsDesktop.App.deps.json','System.Windows.Forms.dll']})){
    const folder=path.join(frameworkRoot,name,'10.0.12');fs.mkdirSync(folder,{recursive:true});for(const file of files)fs.writeFileSync(path.join(folder,file),'synthetic presence only');
  }
});
after(()=>{if(root)fs.rmSync(root,{recursive:true,force:true});});
test('valid local evidence remains informational, with dynamic/provider gaps',()=>{
  const report=run();assert.equal(report.passed,true);assert.equal(report.productionAuthority,false);assert.equal(report.authenticated,false);assert.equal(report.completeClosure,false);
  assert.equal(report.stageUnresolvedCount,1);assert.equal(report.frameworks.length,2);assert.ok(report.frameworks.every(row=>row.hostSelectionVerified===false));
  assert.equal(report.verified[0].expectation,'byte-match');assert.ok(report.unresolved.length>=3);
});
test('missing staged entrypoint fails closed',()=>{
  const file=path.join(stage,'node-launch-entry.cjs'),bytes=fs.readFileSync(file);fs.unlinkSync(file);
  try{assert.throws(run,{code:'PREFLIGHT_MISSING'});}finally{fs.writeFileSync(file,bytes);}
});
test('missing and mismatched addon fail closed',()=>{
  const file=path.join(stage,'node-owner-bridge.node'),bytes=fs.readFileSync(file);fs.unlinkSync(file);
  try{assert.throws(run,{code:'PREFLIGHT_MISSING'});fs.writeFileSync(file,'substituted');assert.throws(run,{code:'PREFLIGHT_MEASUREMENT'});}finally{fs.writeFileSync(file,bytes);}
});
test('modified measured owner fails closed',()=>{
  const file=provenance.ownerMeasurements[1].path,bytes=fs.readFileSync(file);fs.writeFileSync(file,'modified');
  try{assert.throws(run,{code:'PREFLIGHT_MEASUREMENT'});}finally{fs.writeFileSync(file,bytes);}
});
test('substituted Node path is never admitted',()=>{assert.throws(()=>fixtureRuntimePreflight({stage,buildDirectory,frameworkRoot,nodeExecutable:path.join(root,'node.exe')}),{code:'PREFLIGHT_NODE_IDENTITY'});});
test('substituted owner root evidence fails closed',()=>{
  const original=provenance.ownerRoot;provenance.ownerRoot=stage;writeEvidence();
  try{assert.throws(run,{code:'PREFLIGHT_OWNER_EVIDENCE'});}finally{provenance.ownerRoot=original;writeEvidence();}
});
test('missing explicitly required local framework input fails closed',()=>{
  const file=path.join(frameworkRoot,'Microsoft.NETCore.App','10.0.12','coreclr.dll'),bytes=fs.readFileSync(file);fs.unlinkSync(file);
  try{assert.throws(run,{code:'PREFLIGHT_MISSING'});}finally{fs.writeFileSync(file,bytes);}
});
test('measured but incompatible owner runtime metadata fails closed',()=>{
  const row=provenance.ownerMeasurements[3],bytes=fs.readFileSync(row.path),digest=row.sha256;
  fs.writeFileSync(row.path,JSON.stringify({runtimeOptions:{tfm:'net11.0'}}));row.sha256=hash(row.path);writeEvidence();
  try{assert.throws(run,{code:'PREFLIGHT_OWNER_METADATA'});}finally{fs.writeFileSync(row.path,bytes);row.sha256=digest;writeEvidence();}
});
test('missing staging selection evidence fails closed',()=>{
  const file=path.join(stage,'stage-manifest.json'),bytes=fs.readFileSync(file);fs.writeFileSync(file,JSON.stringify({productionAuthority:false,candidates:[]}));
  try{assert.throws(run,{code:'PREFLIGHT_STAGE_SELECTION'});}finally{fs.writeFileSync(file,bytes);}
});
