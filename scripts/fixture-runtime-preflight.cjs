// Fixture orchestration diagnostics only. No launch, receipt, signing or authority.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const NODE='C:\\Program Files\\nodejs\\node.exe';
const NODE_HASH='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
const OWNER=['ApplicationCompanion.exe','ApplicationCompanion.dll','ApplicationCompanion.deps.json','ApplicationCompanion.runtimeconfig.json'];
const FRAMEWORKS={
  'Microsoft.NETCore.App':['Microsoft.NETCore.App.deps.json','System.Private.CoreLib.dll','hostpolicy.dll','coreclr.dll'],
  'Microsoft.WindowsDesktop.App':['Microsoft.WindowsDesktop.App.deps.json','System.Windows.Forms.dll'],
};
function fail(code){throw Object.assign(Error('Fixture runtime preflight: '+code),{code});}
function canonical(file){
  const absolute=path.resolve(file);
  if(absolute!==file)fail('PREFLIGHT_PATH');
  for(let item=absolute;;item=path.dirname(item)){
    if(fs.lstatSync(item).isSymbolicLink())fail('PREFLIGHT_REPARSE');
    if(path.dirname(item)===item)break;
  }
  if(fs.realpathSync(absolute)!==absolute)fail('PREFLIGHT_PATH');
  return absolute;
}
function fixtureRuntimePreflight({stage,buildDirectory,frameworkRoot='C:\\Program Files\\dotnet\\shared',nodeExecutable=process.execPath}){
  let total=0;
  const verified=[];
  function file(input,expected,hash=true){
    canonical(input);const fd=fs.openSync(input,'r');
    try{
      const stat=fs.fstatSync(fd);total+=stat.size;
      if(!stat.isFile()||stat.size<=0||stat.size>128*1024*1024||total>256*1024*1024)fail('PREFLIGHT_BYTE_LIMIT');
      let sha256;
      if(hash){const digest=crypto.createHash('sha256'),buffer=Buffer.alloc(65536);let remaining=stat.size;
        while(remaining>0){const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,remaining),null);if(!count)fail('PREFLIGHT_CHANGED');digest.update(buffer.subarray(0,count));remaining-=count;}
        const after=fs.fstatSync(fd);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)fail('PREFLIGHT_CHANGED');
        sha256=digest.digest('hex');if(expected!==undefined&&sha256!==expected)fail('PREFLIGHT_MEASUREMENT');}
      verified.push({path:input,bytes:stat.size,sha256,expectation:expected===undefined?'presence-only':'byte-match'});
      return stat.size;
    }finally{fs.closeSync(fd);}
  }
  function json(input,limit){const size=file(input,undefined,false);if(size>limit)fail('PREFLIGHT_JSON_LIMIT');
    const fd=fs.openSync(input,'r');try{if(fs.fstatSync(fd).size!==size)fail('PREFLIGHT_CHANGED');const bytes=Buffer.alloc(size);let offset=0;
      while(offset<size){const count=fs.readSync(fd,bytes,offset,size-offset,offset);if(!count)fail('PREFLIGHT_CHANGED');offset+=count;}
      return JSON.parse(bytes.toString('utf8'));}finally{fs.closeSync(fd);}}
  try{
    if(process.version!=='v24.19.0'||process.arch!=='x64'||nodeExecutable!==NODE||process.execPath!==NODE)fail('PREFLIGHT_NODE_IDENTITY');
    file(NODE,NODE_HASH);
    canonical(stage);canonical(buildDirectory);canonical(frameworkRoot);
    const provenance=json(path.join(buildDirectory,'build-input-provenance.json'),2*1024*1024);
    if(provenance.purpose!=='test-only-native-node-bridge'||provenance.productionAuthority!==false||provenance.command?.exitCode!==0)fail('PREFLIGHT_PROVENANCE');
    const owners=provenance.ownerMeasurements;
    if(!Array.isArray(owners)||owners.length!==4||owners.some((row,i)=>path.basename(row.path)!==OWNER[i]||!/^[a-f0-9]{64}$/.test(row.sha256)))fail('PREFLIGHT_OWNER_EVIDENCE');
    const ownerRoot=path.dirname(owners[0].path);
    if(provenance.ownerRoot!==ownerRoot||owners.some(row=>path.dirname(row.path)!==ownerRoot))fail('PREFLIGHT_OWNER_EVIDENCE');
    for(const row of owners)file(row.path,row.sha256);
    if(!/^[a-f0-9]{64}$/.test(provenance.output?.sha256)||provenance.output.path!==path.join(buildDirectory,'node-owner-bridge.node'))fail('PREFLIGHT_ADDON_EVIDENCE');
    file(path.join(stage,'node-owner-bridge.node'),provenance.output.sha256);
    for(const relative of ['node-launch-entry.cjs','node-launch-driver.cjs','node-launch-review.cjs','src/test/support/backend_tls_binding.js','src/server/backend_application.js','package.json'])file(path.join(stage,relative));
    const manifest=json(path.join(stage,'stage-manifest.json'),8*1024*1024);
    if(manifest.productionAuthority!==false||!Array.isArray(manifest.candidates)||manifest.candidates.length>20000||
      !manifest.candidates.some(row=>row.source==='src/server/backend_application.ts'&&row.output==='src/server/backend_application.js'))fail('PREFLIGHT_STAGE_SELECTION');
    const config=json(owners[3].path,1024*1024),deps=json(owners[2].path,1024*1024);
    if(config.runtimeOptions?.tfm!=='net10.0'||deps.runtimeTarget?.name!=='.NETCoreApp,Version=v10.0')fail('PREFLIGHT_OWNER_METADATA');
    const declarations=config.runtimeOptions.frameworks;
    if(!Array.isArray(declarations)||declarations.length!==2||new Set(declarations.map(row=>row.name)).size!==2)fail('PREFLIGHT_FRAMEWORK_METADATA');
    const frameworks=[];
    for(const declaration of declarations){
      if(!FRAMEWORKS[declaration.name]||declaration.version!=='10.0.0')fail('PREFLIGHT_FRAMEWORK_METADATA');
      const directory=path.join(frameworkRoot,declaration.name);canonical(directory);
      const entries=[],scan=fs.opendirSync(directory);
      try{let entry;while((entry=scan.readSync())!==null){if(entries.length===64)fail('PREFLIGHT_FRAMEWORK_LIMIT');entries.push(entry);}}finally{scan.closeSync();}
      const candidates=entries.filter(row=>row.isDirectory()&&/^10\.0\.(0|[1-9][0-9]*)$/.test(row.name)).map(row=>row.name).sort((a,b)=>Number(b.split('.')[2])-Number(a.split('.')[2]));
      if(!candidates.length)fail('PREFLIGHT_FRAMEWORK_MISSING');
      // Presence evidence only: the .NET host remains responsible for actual selection.
      const candidate=path.join(directory,candidates[0]);
      for(const name of FRAMEWORKS[declaration.name])file(path.join(candidate,name),undefined,false);
      frameworks.push({name:declaration.name,requested:declaration.version,localCandidate:candidate,hostSelectionVerified:false});
    }
    return {passed:true,productionAuthority:false,completeClosure:false,authenticated:false,verified,frameworks,
      ownerEvidence:'Build-time provenance comparison only; compiled addon live authentication remains mandatory.',
      stageUnresolvedCount:Array.isArray(manifest.unresolved)?manifest.unresolved.length:null,
      unresolved:['Transitive packages, computed imports and native DLL loading are not verified by presence.',
        'WebView2 external provider availability is not probed; it is not required by this synthetic composition.',
        'Framework host selection, Windows DLL/provider resolution and deployment policy remain unverified.']};
  }catch(error){if(error.code?.startsWith('PREFLIGHT_'))throw error;fail(error.code==='ENOENT'?'PREFLIGHT_MISSING':error instanceof SyntaxError?'PREFLIGHT_JSON':'PREFLIGHT_LOCAL_INPUT');}
}
module.exports={fixtureRuntimePreflight};
