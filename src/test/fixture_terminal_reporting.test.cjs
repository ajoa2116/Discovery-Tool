const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {publishFixtureRecord}=require('../../scripts/staged-fixture-entrypoint.cjs');
test('publication faults preserve primary failure; intermediate files can be replaced truthfully',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-terminal-publication-'));try{
    const file=path.join(root,'result.json'),primary={passed:false,terminal:true,productionAuthority:false,code:'PRIMARY_OPERATION_FAILED'};
    for(const code of ['EIO','ENOENT']){
      const outcome=publishFixtureRecord(file,primary,()=>{throw Object.assign(Error('publication'),{code});});
      assert.deepEqual(outcome,{written:false,code});assert.equal(primary.code,'PRIMARY_OPERATION_FAILED');assert.equal(primary.passed,false);
    }
    assert.equal(publishFixtureRecord(file,{terminal:false,entryPhase:'bound'}).written,true);
    assert.equal(publishFixtureRecord(file,primary).written,true);assert.deepEqual(JSON.parse(fs.readFileSync(file)),primary);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('native completion denies bad exits, intermediate/missing records and missing cleanup',()=>{
  const owner=path.resolve(__dirname,'../../native/ApplicationCompanion/bin/Release/net10.0-windows/ApplicationCompanion.exe');
  const result=spawnSync(owner,['--fixture-completion-self-test'],{encoding:'utf8',windowsHide:true,shell:false,timeout:5000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.deepEqual(report,{passed:true,denials:59,validReports:5,directDuplicateDenials:26,
    readDuplicateDenials:26,readHandlesReleased:26,productionAuthority:false});
});
