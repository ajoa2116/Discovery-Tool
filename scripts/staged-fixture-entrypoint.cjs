// Non-production entry, copied and measured by the owned-Node fixture only.
// Routing arguments are not authority: authenticate() must verify the native owner.
const path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
function denied(){return Object.assign(Error('Authenticated isolated fixture required.'),{code:'FIXTURE_AUTH_REQUIRED'});}
function publishFixtureRecord(file,value,write=fs.writeFileSync){
  try{write(file,JSON.stringify(value),{flag:'w'});return{written:true};}
  catch(error){return{written:false,code:String(error.code??error.name).slice(0,64)};}
}
async function startStagedBackendFixture(pipe,ownerHandle,mode,ended,evidence,loadingDiagnostics){
  if(!process.permission || process.permission.has('child') || process.permission.has('worker') ||
    !process.execArgv.includes('--allow-addons') || !mode.startsWith('composition-'))throw denied();
  // Addon admission is a process restriction, never authority. Native authentication below is mandatory.
  for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_PRELOAD','NODE_LOADER','PATH'])if(process.env[name]!==undefined)throw denied();
  const root=fs.realpathSync(__dirname);
  if(process.cwd()!==root)throw denied();
  const addonPath=path.join(root,'node-owner-bridge.node');
  if(fs.realpathSync(addonPath)!==addonPath)throw denied();
  const addon=require(addonPath); // Existing measured loading guard must admit this exact image.
  let material;
  let phase='authenticate';
  const started=performance.now(),phases=[];
  const record=()=>{if(phases.length<8)phases.push({phase,elapsedMs:performance.now()-started});evidence.entryPhases=phases;const publication=publishFixtureRecord(path.join(root,'node-launch-result.json'),{passed:false,terminal:false,productionAuthority:false,entryPhase:phase,entryPhases:phases,loadingDiagnostics,compositionEvidence:evidence});if(!publication.written)evidence.diagnosticFailureCode=publication.code;};
  try{
    record();
    material=addon.authenticate(BigInt(ownerHandle),pipe,()=>ended.abort(),mode);
    // No backend/helper import or initialization before native bilateral authentication.
    const helper=path.join(root,'src/test/support/backend_tls_binding.js');
    phase='load-composition';record();
    if(fs.realpathSync(helper)!==helper)throw denied();
    const {actualBackendTlsFixture}=await import(pathToFileURL(helper).href);
    const bridge={ended:ended.signal,
      acquireTLS(){if(!material)throw denied();const value=material;material=undefined;return value;},
      bind:(server,ws,session,port)=>addon.bind(server,ws,session,port),
      assert:(server,ws,session)=>addon.assert(server,ws,session),revoke:()=>addon.revoke()};
    phase='construct-start';record();
    const fixture=await actualBackendTlsFixture(bridge,mode,evidence);
    phase='bound';record();return fixture;
  }catch(error){evidence.entryFailureCode=String(error.code??error.name).slice(0,64);try{record();}finally{if(material)material.key='';try{addon.revoke();}catch(cleanup){evidence.cleanupFailureCode=String(cleanup.code??cleanup.name).slice(0,64);}}throw error;}
}
module.exports={startStagedBackendFixture,publishFixtureRecord};
if(require.main===module){console.error(JSON.stringify({passed:false,code:'FIXTURE_AUTH_REQUIRED',productionAuthority:false}));process.exitCode=1;}
