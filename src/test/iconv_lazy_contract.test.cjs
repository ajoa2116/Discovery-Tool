const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { stageBackend } = require('../../scripts/stage-backend.cjs');
const { createCatalog, verifyCatalog } = require('../../scripts/payload-byte-catalog.cjs');
const { buildPackageAdmission } = require('../../scripts/staged-backend-review.cjs');
const { javascript, tables, metadata, modes, reviews } = require('./support/iconv_lazy_probe.cjs');
let baseline;
// Reuse this exact completed stage/control evidence in the opt-in consolidation
// experiment. Ordinary execution of this test never builds a prototype.
module.exports.getBaseline = () => baseline;

function checked(full) {
  assert.equal(fs.realpathSync(full),full);
  for (let part=full;;part=path.dirname(part)) {
    assert.equal(fs.lstatSync(part).isSymbolicLink(),false);
    if(path.dirname(part)===part)break;
  }
}
function measure(full) {
  checked(full); const fd=fs.openSync(full,'r');
  try {
    const before=fs.fstatSync(fd,{bigint:true}), bytes=fs.readFileSync(fd), after=fs.fstatSync(fd,{bigint:true});
    assert.equal(before.nlink,1n); assert.ok(before.isFile()); assert.ok(before.size<=128n*1024n*1024n);
    for(const key of ['dev','ino','size','mtimeNs','ctimeNs'])assert.equal(before[key],after[key]);
    const identity=Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(before[k])]));
    return {identity,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  } finally {fs.closeSync(fd);}
}
test('isolated iconv lazy registry, tables, aliases and cache contract', () => {
  const repo=path.resolve(__dirname,'../..'), parent=fs.realpathSync(os.tmpdir()); checked(parent);
  const out=fs.mkdtempSync(path.join(parent,'discovery-iconv-contract-')); checked(out);
  console.log('Iconv contract evidence: '+out);
  const stage=path.join(out,'stage'), harness=path.join(out,'harness'); fs.mkdirSync(harness);
  const manifest=stageBackend(repo,stage); checked(stage);
  assert.equal(manifest.candidates.some(c=>c.status==='failed'),false);
  const inventory=JSON.parse(fs.readFileSync(path.join(stage,'inventory.json'),'utf8'));
  const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
  const packages=[['node_modules/iconv-lite','0.4.24'],['node_modules/safer-buffer','2.1.2']].map(([location,version])=>{
    const installed=JSON.parse(fs.readFileSync(path.join(stage,location,'package.json'),'utf8'));
    assert.equal(installed.version,version); assert.equal(lock.packages[location].version,version);
    assert.ok(/^sha512-/.test(lock.packages[location].integrity));
    assert.equal(installed.main,location.endsWith('iconv-lite')?'./lib/index.js':'safer.js');
    return {location,version,installed,lock:lock.packages[location],upstreamIntegrityVerified:false};
  });
  const packageFiles=manifest.candidates.filter(c=>packages.some(p=>c.source.startsWith(p.location+'/')));
  assert.ok(packageFiles.length>reviews.length);
  const provenance=packageFiles.map(c=>{
    assert.equal(c.status,'copied-candidate'); assert.equal(c.output,c.source);
    const original=measure(path.join(repo,c.source)), copy=measure(path.join(stage,c.output));
    assert.equal(original.sha256,copy.sha256);
    return {path:c.output,selectionReasons:c.selectionReasons,source:original,staged:copy};
  });
  const admission=buildPackageAdmission(manifest,reviews);
  assert.equal(admission.admitted.length,reviews.length);
  assert.ok(reviews.every(r=>admission.admitted.some(a=>a.path===r.path)));
  // Preserve the historical review's meaning; exercising this library must not
  // silently expand the existing 165-path import-only admission used elsewhere.
  const existingAdmission=buildPackageAdmission(manifest);
  fs.copyFileSync(path.join(__dirname,'support/iconv_lazy_probe.cjs'),path.join(stage,'.iconv-lazy-probe.cjs'),fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(repo,'scripts/staged-backend-review.cjs'),path.join(harness,'review.cjs'),fs.constants.COPYFILE_EXCL);
  const configPath=path.join(harness,'config.json');
  const files=provenance.map(f=>({path:f.path,...f.staged}));
  fs.writeFileSync(configPath,JSON.stringify({stage,files},null,2),{flag:'wx'});
  const roots=[{id:'stage',path:stage},{id:'harness',path:harness}];
  const overlays=[['stage','inventory.json'],['stage','stage-manifest.json'],['stage','.iconv-lazy-probe.cjs'],
    ['harness','review.cjs'],['harness','config.json']].map(([root,path])=>({root,path,reason:'Explicit diagnostic/test-only input; no production authority'}));
  const catalog=createCatalog({roots,staging:{root:'stage',manifest},overlays,externalUnresolved:[
    ...manifest.loadingSummary.pending.map(reason=>({source:'existing-staging',reason})),
    {source:'Windows image section',reason:'exact-mapped-image-backing-identity-unproven-release-blocker'}]});
  fs.writeFileSync(path.join(out,'byte-catalog.json'),JSON.stringify(catalog,null,2),{flag:'wx'});
  assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);
  fs.writeFileSync(path.join(out,'package-provenance.json'),JSON.stringify({productionAuthority:false,atomicSnapshot:false,packages,files:provenance},null,2),{flag:'wx'});
  const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]));
  env.NODE_ENV='production';
  const results=[];
  for(const mode of modes) {
    const args=['--permission','--allow-fs-read='+out,'--no-addons','--no-experimental-strip-types',path.join(stage,'.iconv-lazy-probe.cjs'),configPath,mode];
    const child=spawnSync(process.execPath,args,{cwd:stage,env,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    const evidence={mode,pid:child.pid,status:child.status,signal:child.signal,error:child.error?.message??null,stderr:child.stderr,args};
    fs.writeFileSync(path.join(out,mode+'-owner.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
    fs.writeFileSync(path.join(out,mode+'-stdout.json'),child.stdout||'',{flag:'wx'});
    // Stop immediately; no next mode, automatic retry or evidence cleanup.
    assert.equal(child.error,undefined,JSON.stringify(evidence)); assert.equal(child.status,0,child.stderr);
    assert.equal(child.signal,null);
    const result=JSON.parse(child.stdout); assert.equal(result.passed,true); assert.deepEqual(result.violations,[]);
    assert.equal(result.productionAuthority,false); assert.equal(result.completeClosure,false);
    assert.ok(javascript.every(p=>result.loaded.includes(p)));
    results.push({...result,owner:evidence});
  }
  const observed=[...new Set(results.flatMap(r=>r.loaded))].sort();
  assert.deepEqual(observed,[...javascript,...tables].sort());
  assert.equal(new Set(results.map(r=>r.runtime.node)).size,1);
  // Reverify complete payload/test inputs and original package files after every
  // owned cold process has returned. This is byte/identity correspondence, not
  // a Windows measured consumption lease or production process-exit authority.
  const verified=verifyCatalog(catalog,roots);
  for(const entry of provenance) {
    assert.deepEqual(measure(path.join(repo,entry.path)),entry.source);
    assert.deepEqual(measure(path.join(stage,entry.path)),entry.staged);
  }
  fs.writeFileSync(path.join(out,'byte-verification.json'),JSON.stringify(verified,null,2),{flag:'wx'});
  const consumers=['node_modules/body-parser/lib/read.js','node_modules/raw-body/index.js'];
  const evidenceSources=['src/server/backend_application.ts','node_modules/body-parser/lib/types/json.js',...consumers];
  const report={passed:true,purpose:'non-authorizing-iconv-lazy-encoding-contract',productionAuthority:false,completeClosure:false,
    runtime:{path:process.execPath,node:process.version,architecture:process.arch,platform:process.platform,measurement:measure(process.execPath),approved:false,includedInPayload:false},
    runtimeApproved:false,selectedPayloadChanged:false,manifestCeiling:64,stageSelected:manifest.candidates.filter(c=>['transpiled','copied-candidate','generated-metadata'].includes(c.status)).length,
    existingPackageAdmissionCount:existingAdmission.admitted.length,fixtureAdmission:admission,packages,observed,results,
    classification:provenance.map(f=>({path:f.path,sourceSha256:f.source.sha256,stagedSha256:f.staged.sha256,
      status:observed.includes(f.path)?(tables.includes(f.path)?'observed-conditional-table':'observed-entry-or-first-lookup-module'):
        metadata.includes(f.path)?'resolution-metadata-measured-not-module-load-evidence':'selected-unexercised-not-excluded'})),
    consumerEvidence:evidenceSources.map(p=>({path:p,measurement:measure(path.join(repo,p)),staticOnly:true})),
    dependencyAncestry:manifest.dependencies.filter(d=>['iconv-lite','safer-buffer'].includes(d.name)),
    dependencyEdges:inventory.references.filter(r=>packages.some(p=>r.source.startsWith(p.location+'/'))||consumers.includes(r.source)),
    retainedUnresolved:{total:manifest.unresolved.length,records:manifest.unresolved.filter(r=>packages.some(p=>r.source.startsWith(p.location))||consumers.includes(r.source))},
    selectedUnobserved:packageFiles.filter(c=>!observed.includes(c.output)).map(c=>c.output),
    handles:{fixtureFileDescriptorsClosed:true,childProcessesReturned:results.length,aclOwnersCreated:0,processLeaseAuthority:false},
    limitations:['Observed library controls are not execution of backend registration/body-parser/raw-body.',
      'Metadata reads internal to Node resolution are not exhaustively exposed by module hooks.',
      'All eight known table files exercised; all names/options/characters/errors and streaming/legacy branches are not exhaustive.',
      'No pruning or bundling; selected but unobserved files remain unknown, not unnecessary.',
      'Current fixture Node version, builtins and installed package bytes are not approved production provenance.',
      'Exact mapped-image backing identity remains an independent release blocker.']};
  fs.writeFileSync(path.join(out,'iconv-contract.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({coldChildren:results.length,checks:results.reduce((n,r)=>n+r.checks.length,0),observed:observed.length,
    tableFiles:tables.length,packageFiles:packageFiles.length,stageSelected:report.stageSelected,unresolved:manifest.unresolved.length,
    catalogFiles:verified.files,productionAuthority:false}));
  baseline={repo,out,stage,harness,manifest,provenance,catalog,roots,report,measure,checked,env};
});
