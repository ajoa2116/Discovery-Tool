const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
test('unauthorized staged entrypoint denies before imports or initialization',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-entry-denial-'));
  try{
    const entry=path.join(root,'node-launch-entry.cjs');fs.copyFileSync(path.resolve(__dirname,'../../scripts/staged-fixture-entrypoint.cjs'),entry);
    // No packages, addon or backend exist: denial must precede their resolution.
    const result=spawnSync(process.execPath,['--permission','--allow-fs-read='+root,'--no-addons','--no-experimental-strip-types',entry],{
      cwd:root,env:{SystemRoot:process.env.SystemRoot},encoding:'utf8',windowsHide:true,timeout:5000,shell:false});
    assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.deepEqual(JSON.parse(result.stderr),{passed:false,code:'FIXTURE_AUTH_REQUIRED',productionAuthority:false});
    const code=`const {startStagedBackendFixture}=require(${JSON.stringify(entry)});startStagedBackendFixture('fake',0,'composition-normal',new AbortController(),{}).catch(e=>{console.log(e.code);process.exitCode=1;});`;
    const invoked=spawnSync(process.execPath,['--permission','--allow-fs-read='+root,'--no-addons','-e',code],{cwd:root,env:{SystemRoot:process.env.SystemRoot},encoding:'utf8',windowsHide:true,timeout:5000,shell:false});
    assert.equal(invoked.error,undefined);assert.equal(invoked.status,1);assert.equal(invoked.stdout.trim(),'FIXTURE_AUTH_REQUIRED');assert.equal(invoked.stderr,'');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
