const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const helper=path.resolve(__dirname,'../../scripts/fixture-owner-measurements.ps1');
const names=['ApplicationCompanion.exe','ApplicationCompanion.dll','ApplicationCompanion.deps.json','ApplicationCompanion.runtimeconfig.json'];
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function measure(root){
  const command=`$ErrorActionPreference='Stop'; . ${quote(helper)}; @(Get-FixtureOwnerMeasurements -OwnerRoot ${quote(root)}) | ConvertTo-Json -Compress`;
  return spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000});
}
test('explicit fixture root: canonical paths and exact bytes; environment cannot select root',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-owner-measurements-'));
  try{
    for(const name of names)fs.writeFileSync(path.join(root,name),name);
    const result=measure(path.join(root,'.'));assert.equal(result.status,0,result.stderr);
    const records=JSON.parse(result.stdout);assert.equal(records.length,4);
    for(let i=0;i<4;i++) {assert.equal(records[i].path,path.join(root,names[i]));assert.equal(records[i].sha256,crypto.createHash('sha256').update(names[i]).digest('hex'));}
    const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/build-node-bridge.ps1'),'utf8');
    assert.match(source,/PSBoundParameters.ContainsKey\('OwnerRoot'\)/);
    assert.doesNotMatch(source,/\$env:[^\s]*OWNER/i);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('deny missing/empty files, relative roots, ADS and linked roots/files',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-owner-denials-'));
  try{
    for(const name of names)fs.writeFileSync(path.join(root,name),name);
    for(const bad of ['relative',root+':stream',path.join(root,'missing')])assert.notEqual(measure(bad).status,0);
    fs.unlinkSync(path.join(root,names[3]));assert.notEqual(measure(root).status,0);
    fs.writeFileSync(path.join(root,names[3]),'');assert.notEqual(measure(root).status,0);
    fs.writeFileSync(path.join(root,names[3]),names[3]);
    const linked=path.join(root,'junction');fs.symlinkSync(root,linked,'junction');assert.notEqual(measure(linked).status,0);
    fs.unlinkSync(linked);
    fs.unlinkSync(path.join(root,names[3]));fs.mkdirSync(path.join(root,names[3]));assert.notEqual(measure(root).status,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
