// Opt-in compiler observation only. Never imports or writes emitted application code.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const net=require('node:net'),dgram=require('node:dgram'),cp=require('node:child_process');
const {createRequire,syncBuiltinESMExports}=require('node:module'),{pathToFileURL,fileURLToPath}=require('node:url');
const caller=require('./application_caller_mapping.cjs');
const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const failureReceipts=new WeakMap();
const counterKeys=['outsideWrites','network','unexpectedChildren','compilerChildren','refusedWindowsHelper'];
const rollupProbeProfile='rollup-4.63.1-windows-report-unavailable-v1';
const rollupNativeSha256='8f91208795ce224b196754fff229bbc108c10746a24ba5acda84fc0d550cb919';
const rollupReportScript="const r=require('node:process').report;r.excludeNetwork=true;console.log(JSON.stringify(r.getReport().header));";
function ownValue(value,key){try{const descriptor=value&&Object.getOwnPropertyDescriptor(value,key);return descriptor&&'value' in descriptor?descriptor.value:undefined;}catch{return undefined;}}
function activityEvidence(activity){
  const counters={},missing=[],invalid=[];
  for(const key of counterKeys){const value=ownValue(activity,key);
    if(value===undefined){counters[key]=null;missing.push(key);}
    else if(!Number.isSafeInteger(value)||value<0){counters[key]=null;invalid.push(key);}
    else counters[key]=value;
  }
  return {counters,missing,invalid};
}
const processApis=['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'];
const processReasons=['process-api-not-authorized','compiler-executable-mismatch','compiler-arguments-mismatch','compiler-already-started'];
const diagnosticPhases=['fixture','fixture-setup','tool-load','build','post-build-shape','post-build-inputs','post-build-guard','report'];
const safePrograms=new Set(['git','cmd','powershell','pwsh','node','net','where','npm','npx','esbuild','reg','wmic','whoami','hostname']);
const safeArguments=new Set(['--version','-v','--help','-h','--ping','--short','--always','--dirty','--show-toplevel','--porcelain','--no-optional-locks','-NoProfile','-NonInteractive','-Command','/c','/d','rev-parse','describe','status','use','query','HEAD']);
function describeDeniedProcess(api,request,reason,phase){
  // Never copy options, environment, arbitrary values, URLs or complete shell commands.
  const command=ownValue(request,'0'),shell=api==='exec'||api==='execSync';let program=command,argv,argumentCount=null,argumentBasis='unavailable',commandTruncated=typeof command==='string'?command.length>1024:null;
  if(shell&&typeof command==='string'){
    commandTruncated=command.length>1024;const tokens=command.slice(0,1024).match(/"[^"]*"|'[^']*'|\S+/g)??[];
    const unquote=value=>value.replace(/^(["'])(.*)\1$/,'$2');program=tokens.length?unquote(tokens[0]):null;
    argv=tokens.slice(1,9).map(unquote);argumentBasis='bounded-shell-tokens';if(!commandTruncated)argumentCount=Math.max(0,tokens.length-1);
  }else if(!shell){
    if(commandTruncated)program=null;
    const values=ownValue(request,'1');if(Array.isArray(values)){const length=ownValue(values,'length');if(Number.isSafeInteger(length)&&length>=0){argumentCount=length;argumentBasis='explicit-argument-array';argv=Array.from({length:Math.min(length,8)},(_,i)=>ownValue(values,String(i)));}}
  }
  const basename=typeof program==='string'?path.win32.basename(program.replaceAll('/','\\')).toLowerCase().replace(/\.(exe|cmd|bat)$/,''):null;
  const executable=basename&&safePrograms.has(basename)?basename:typeof program==='string'?'[redacted-unrecognized]':null;
  let redactNext=false;
  const argumentsSummary=argv?.map(value=>{
    if(redactNext){redactNext=false;return '[redacted]';}
    if(typeof value!=='string')return '[unavailable]';
    if(/^--?(?:password|passwd|token|secret|credential|authorization|api-key)(?:=|$)/i.test(value)){redactNext=!value.includes('=');return '[sensitive-option]';}
    if(value.startsWith('--service='))return '--service=[redacted]';
    if(['-Command','/c'].includes(value))redactNext=true;
    if(!safeArguments.has(value)&&/^[-/]/.test(value)&&!value.includes('='))redactNext=true;
    return safeArguments.has(value)?value:'[redacted]';
  })??null;
  return freeze({api,reason,phase:diagnosticPhases.includes(phase)?phase:'unknown',kind:shell?'shell-command':api==='fork'?'module':'executable',
    executable,pathKind:typeof program!=='string'?'unknown':path.win32.isAbsolute(program)?'absolute':/[\\/]/.test(program)?'relative':'bare',
    argumentCount,argumentBasis,argumentsSummary,argumentsTruncated:argumentCount===null?null:argumentCount>8,commandTruncated});
}
function processDenialEvidence(value){
  const requests=ownValue(value,'requests'),omittedRequests=ownValue(value,'omittedRequests');
  if(!Array.isArray(requests)||requests.length>8||!Number.isSafeInteger(omittedRequests)||omittedRequests<0)return {status:'unavailable',requests:null,omittedRequests:null};
  const safe=[];
  for(const row of requests){
    const api=ownValue(row,'api'),reason=ownValue(row,'reason'),phase=ownValue(row,'phase'),kind=ownValue(row,'kind'),executable=ownValue(row,'executable'),pathKind=ownValue(row,'pathKind');
    const argumentCount=ownValue(row,'argumentCount'),argumentBasis=ownValue(row,'argumentBasis'),summary=ownValue(row,'argumentsSummary'),argumentsTruncated=ownValue(row,'argumentsTruncated'),commandTruncated=ownValue(row,'commandTruncated');
    if(!processApis.includes(api)||!processReasons.includes(reason)||![...diagnosticPhases,'unknown'].includes(phase)||!['shell-command','module','executable'].includes(kind)||
      !(executable===null||executable==='[redacted-unrecognized]'||safePrograms.has(executable))||!['bare','absolute','relative','unknown'].includes(pathKind)||
      !(argumentCount===null||Number.isSafeInteger(argumentCount)&&argumentCount>=0)||!(summary===null||Array.isArray(summary)&&summary.length<=8&&summary.every(s=>safeArguments.has(s)||['[redacted]','[unavailable]','[sensitive-option]','--service=[redacted]'].includes(s)))||
      !['unavailable','bounded-shell-tokens','explicit-argument-array'].includes(argumentBasis)||!(argumentsTruncated===null||typeof argumentsTruncated==='boolean')||!(commandTruncated===null||typeof commandTruncated==='boolean'))return {status:'unavailable',requests:null,omittedRequests:null};
    safe.push({api,reason,phase,kind,executable,pathKind,argumentCount,argumentBasis,argumentsSummary:summary===null?null:[...summary],argumentsTruncated,commandTruncated});
  }
  return {status:'observed',requests:safe,omittedRequests};
}
function readEmissionFailureDiagnostics(error){return error&&typeof error==='object'?failureReceipts.get(error)??null:null;}
function createRollupProbeBinding(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Unsupported Rollup probe fixture platform');
  const root=path.resolve(__dirname,'../../..'),roots=[{id:'rollup-probe',path:root}];
  const references=['node_modules/rollup/package.json','node_modules/rollup/dist/native.js'].map(path=>({root:'rollup-probe',path}));
  const observations=observeCatalogFiles(roots,references);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,references[0].path),'utf8'));
  if(pkg.name!=='rollup'||pkg.version!=='4.63.1'||observations[1].sha256!==rollupNativeSha256)throw Error('Unreviewed Rollup diagnostic probe source');
  if(hash(observations)!==hash(observeCatalogFiles(roots,references)))throw Error('Rollup probe source changed during measurement');
  return freeze({profile:rollupProbeProfile,version:'4.63.1',nodeExecutable:process.execPath,observations,
    arguments:['-p',rollupReportScript],options:{encoding:'utf8',timeout:3000,windowsHide:true}});
}
function matchesRollupProbe(binding,request,phase){
  try{
    if(!binding||phase!=='tool-load'||request.length!==3||request[0]!==process.execPath||hash(binding)!==hash(createRollupProbeBinding()))return false;
    const args=request[1],options=request[2];
    if(!Array.isArray(args)||Object.getPrototypeOf(args)!==Array.prototype||hash(Reflect.ownKeys(args))!==hash(['0','1','length'])||ownValue(args,'0')!=='-p'||ownValue(args,'1')!==rollupReportScript)return false;
    if(!options||Object.getPrototypeOf(options)!==Object.prototype||hash(Reflect.ownKeys(options).sort())!==hash(['encoding','timeout','windowsHide']))return false;
    return ownValue(options,'encoding')==='utf8'&&ownValue(options,'timeout')===3000&&ownValue(options,'windowsHide')===true;
  }catch{return false;}
}
async function withEmissionFailureDiagnostics(work,{readActivity,readProcessDenials,readRollupProbeRefusal,cleanup,steps,phase=()=> 'fixture'}){
  let result,original,failed=false,cleanupError,cleanupFailed=false;const cleanupFailures=[];
  try{result=await work();}catch(error){original=error;failed=true;}
  // One cleanup failure must not suppress restoration or replace an earlier failure.
  for(const [name,operation]of steps){try{await operation();}catch(error){cleanupFailures.push(name);if(!cleanupFailed)cleanupError=error;cleanupFailed=true;}}
  if(!failed&&!cleanupFailed)return result;
  const error=failed?original:cleanupError;let activity,at,processDenials,rollupProbeRefusalCount;
  try{activity=readActivity();}catch{activity=undefined;}
  try{at=phase();}catch{at='unknown';}
  try{processDenials=processDenialEvidence(readProcessDenials?.());}catch{processDenials={status:'unavailable',requests:null,omittedRequests:null};}
  try{const count=readRollupProbeRefusal?.();rollupProbeRefusalCount=Number.isSafeInteger(count)&&count>=0?count:null;}catch{rollupProbeRefusalCount=null;}
  const observed=activityEvidence(activity),outcomes={};
  for(const name of ['rootRemoved','childrenClosed','instrumentationRestored','environmentRestored','compilerStopped']){
    const value=ownValue(cleanup,name);outcomes[name]=typeof value==='boolean'?value:null;
  }
  for(const name of ['childCount','closedChildCount']){const value=ownValue(cleanup,name);outcomes[name]=Number.isSafeInteger(value)&&value>=0?value:null;}
  const allowedPhases=['fixture','fixture-setup','tool-load','build','post-build-shape','post-build-inputs','post-build-guard','report'];
  const allowedCleanup=['compiler-stop','children-close','instrumentation-restore','environment-restore','root-cleanup'];
  const receipt=freeze({version:1,phase:allowedPhases.includes(at)?at:'unknown',activity:observed.counters,
    missingCounters:observed.missing,invalidCounters:observed.invalid,expectedRefusalCount:1,rollupProbeRefusalCount,expectedRollupProbeRefusalCount:1,deniedProcesses:processDenials,cleanup:outcomes,
    cleanupFailureStages:cleanupFailures.slice(0,5).map(name=>allowedCleanup.includes(name)?name:'unknown'),
    executionAuthority:false,productionAuthority:false});
  if(error&&typeof error==='object'){
    failureReceipts.set(error,receipt);
    try{if(!Object.prototype.hasOwnProperty.call(error,'emissionFailureDiagnostics'))Object.defineProperty(error,'emissionFailureDiagnostics',{value:receipt,enumerable:true});}catch{/* Frozen exceptions retain the receipt through the accessor. */}
  }
  throw error;
}
const targets=[...caller.sourceScopeRefs().map(r=>r.path).filter(p=>[
  'src/shared/device_sort.ts','src/shared/pair_adapter.ts','src/ui/App.tsx','src/ui/components/DeviceRemovalDialog.tsx',
  'src/ui/components/LegacyOnboardModal.tsx','src/shared/address_validation.ts','src/shared/identity_policy.ts'].includes(p))];
function checked(full){if(fs.realpathSync(full)!==full)throw Error('Noncanonical fixture path');for(let p=full;;p=path.dirname(p)){if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked fixture ancestry');if(path.dirname(p)===p)break;}}
function tool(name,resolve){
  const entry=resolve(name);let dir=path.dirname(entry);
  for(;;){const candidate=path.join(dir,'package.json');if(fs.existsSync(candidate)){const pkg=JSON.parse(fs.readFileSync(candidate,'utf8'));if(pkg.name===name)return {name,version:pkg.version,entry,package:candidate};}const next=path.dirname(dir);if(next===dir)throw Error('Missing tool metadata: '+name);dir=next;}
}
function createNetUseRefusal(activity,deny){
  return function(...args){
    if(args.length!==2||args[0]!=='net use'||typeof args[1]!=='function')return deny();
    activity.refusedWindowsHelper++;
    queueMicrotask(()=>args[1](Object.assign(Error('Fixture Windows helper unavailable'),{code:'FIXTURE_HELPER_UNAVAILABLE'}),'',''));
    // Vite ignores exec's return value. No ChildProcess or successful mapping is fabricated.
    return undefined;
  };
}
function installGuards(root,compiler,version,onChild,getPhase=()=> 'fixture',rollupProbeBinding){
  const restore=[],activity={outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:0,refusedWindowsHelper:0};
  const deniedProcesses=[];let omittedRequests=0,refusedRollupProbe=0;
  const patch=(owner,key,value)=>{const original=owner[key];owner[key]=value;restore.push(()=>{owner[key]=original;});return original;};
  const owned=value=>{
    const full=path.resolve(value instanceof URL?fileURLToPath(value):String(value)),relative=path.relative(root,full);
    if(relative.startsWith('..')||path.isAbsolute(relative)){activity.outsideWrites++;throw Error('Write outside owned emission root');}
    for(let p=full;;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked output path');if(p===root)break;}
  };
  const denyNetwork=()=>{activity.network++;throw Error('Forbidden emission network/server activity');};
  for(const [owner,key]of [[net.Socket.prototype,'connect'],[net.Server.prototype,'listen'],[dgram,'createSocket'],[globalThis,'fetch']])patch(owner,key,denyNetwork);
  const denyChild=(api,request,reason='process-api-not-authorized',message='Unapproved emission child')=>{
    activity.unexpectedChildren++;
    if(deniedProcesses.length<8){let phase;try{phase=getPhase();}catch{phase='unknown';}
      try{deniedProcesses.push(describeDeniedProcess(api,request,reason,phase));}
      catch{deniedProcesses.push(freeze({api,reason,phase:diagnosticPhases.includes(phase)?phase:'unknown',kind:api==='exec'||api==='execSync'?'shell-command':api==='fork'?'module':'executable',executable:null,pathKind:'unknown',argumentCount:null,argumentBasis:'unavailable',argumentsSummary:null,argumentsTruncated:null,commandTruncated:null}));}
    }else omittedRequests++;
    throw Error(message);
  };
  for(const key of ['execSync','execFile','execFileSync','fork'])patch(cp,key,function(...args){return denyChild(key,args);});
  patch(cp,'spawnSync',function(...args){
    let phase;try{phase=getPhase();}catch{phase='unknown';}
    if(matchesRollupProbe(rollupProbeBinding,args,phase)){
      refusedRollupProbe++;
      throw Object.assign(Error('Fixture Rollup diagnostic probe unavailable'),{code:'FIXTURE_ROLLUP_REPORT_UNAVAILABLE'});
    }
    return denyChild('spawnSync',args);
  });
  patch(cp,'exec',function(...args){return createNetUseRefusal(activity,()=>denyChild('exec',args))(...args);});
  const spawn=cp.spawn;
  patch(cp,'spawn',function(executable,args,options){
    if(path.resolve(String(executable))!==compiler||JSON.stringify(args)!==JSON.stringify(['--service='+version,'--ping'])||activity.compilerChildren){
      const reason=path.resolve(String(executable))!==compiler?'compiler-executable-mismatch':JSON.stringify(args)!==JSON.stringify(['--service='+version,'--ping'])?'compiler-arguments-mismatch':'compiler-already-started';
      return denyChild('spawn',[executable,args,options],reason,'Unapproved emission compiler');
    }
    checked(compiler);activity.compilerChildren++;const child=spawn.call(this,executable,args,options);onChild(child);return child;
  });
  for(const owner of [fs,fsp])for(const name of ['writeFile','appendFile','mkdir','rm','rmdir','unlink','rename','copyFile','chmod','chown','truncate']){
    if(typeof owner[name]!=='function')continue;const original=owner[name];
    patch(owner,name,function(...args){owned(args[name==='copyFile'?1:0]);if(name==='rename')owned(args[1]);return original.apply(this,args);});
  }
  for(const name of ['writeFileSync','appendFileSync','mkdirSync','rmSync','rmdirSync','unlinkSync','renameSync','copyFileSync','chmodSync','chownSync','truncateSync','createWriteStream']){
    const original=fs[name];if(!original)continue;patch(fs,name,function(...args){owned(args[name==='copyFileSync'?1:0]);if(name==='renameSync')owned(args[1]);return original.apply(this,args);});
  }
  for(const owner of [fs,fsp])for(const name of ['open',...(owner===fs?['openSync']:[])]){
    const original=owner[name];patch(owner,name,function(file,flags,...rest){if(typeof flags==='number'?Boolean(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)):/[wa+]/.test(flags))owned(file);return original.call(this,file,flags,...rest);});
  }
  for(const owner of [fs,fsp])for(const name of ['link','symlink',...(owner===fs?['linkSync','symlinkSync']:[])])patch(owner,name,()=>{activity.outsideWrites++;throw Error('Fixture links prohibited');});
  syncBuiltinESMExports();return {activity,readRollupProbeRefusal:()=>refusedRollupProbe,readProcessDenials:()=>freeze({requests:[...deniedProcesses],omittedRequests}),restore(){for(const undo of restore.reverse())undo();syncBuiltinESMExports();}};
}
async function observeFrontendEmission(repo,optIn){
  if(optIn!==true)throw Error('Explicit frontend emission opt-in required');checked(repo);
  const roots=[{id:'source-scope',path:repo}],scopeInput={scopeProfile:caller.sourceScopeProfile,roots};
  scopeInput.scopeObservations=observeCatalogFiles(roots,caller.sourceScopeRefs());scopeInput.scopeContract=caller.deriveSourceScope(scopeInput);
  if(caller.createSourceScopeAssessment(scopeInput).assess().status!=='blocked')throw Error('Source scope unavailable');
  const sourceRefs=[...caller.sourceScopeRefs(),...['package-lock.json','postcss.config.js','tailwind.config.js','src/ui/index.css'].map(path=>({root:'source-scope',path}))];
  const sources=observeCatalogFiles(roots,sourceRefs);
  const requireFromVite=createRequire(require.resolve('vite/package.json'));
  const tools=['vite','@vitejs/plugin-react','rollup','esbuild','postcss','tailwindcss','autoprefixer'].map(name=>tool(name,requireFromVite.resolve));
  const rollupProbeBinding=createRollupProbeBinding();
  if(tools.find(t=>t.name==='rollup').package!==path.join(repo,'node_modules','rollup','package.json'))throw Error('Unexpected Rollup installation');
  const esbuild=tools.find(t=>t.name==='esbuild'),compiler=createRequire(esbuild.package).resolve('@esbuild/win32-x64/esbuild.exe');checked(compiler);
  const toolFiles=[...new Set([...tools.flatMap(t=>[t.entry,t.package]),compiler,path.join(repo,'node_modules','rollup','dist','native.js')])];
  const toolRoots=[{id:'toolchain',path:repo}];
  const toolRefs=toolFiles.map(file=>{const relative=path.relative(repo,file).replaceAll('\\','/');if(!relative.startsWith('node_modules/')||relative.split('/').includes('..'))throw Error('Tool outside installed checkout');return {root:'toolchain',path:relative};});
  const toolObservations=observeCatalogFiles(toolRoots,toolRefs);
  const root=fs.mkdtempSync(path.join(repo,'.frontend-emission-'));checked(root);
  const configCopy=path.join(root,'vite.config.ts');
  const envNames=['TEMP','TMP','JITI_CACHE','BABEL_DISABLE_CACHE','NODE_ENV'],environment=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
  for(const k of ['TEMP','TMP'])process.env[k]=root;process.env.JITI_CACHE=path.join(root,'cache','jiti');process.env.BABEL_DISABLE_CACHE='1';
  const children=[];let buildSettled=false,hookCapture,configObserved,report,esbuildApi,guards;
  let cleanup={root,rootRemoved:null,childrenClosed:null,instrumentationRestored:null,environmentRestored:null,compilerStopped:null},phase='fixture-setup';
  await withEmissionFailureDiagnostics(async()=>{
    fs.writeFileSync(configCopy,fs.readFileSync(path.join(repo,'vite.config.ts')),{flag:'wx'});
    if(digest(fs.readFileSync(configCopy))!==sources.find(s=>s.path==='vite.config.ts').sha256)throw Error('Config copy mismatch');
    guards=installGuards(root,compiler,esbuild.version,child=>{
      const record={child,closed:false,exitCode:null,signal:null};record.done=new Promise(resolve=>child.once('close',(code,signal)=>{record.closed=true;record.exitCode=code;record.signal=signal;resolve();}));children.push(record);
    },()=>phase,rollupProbeBinding);
    phase='tool-load';const viteEntry=path.join(path.dirname(tools.find(t=>t.name==='vite').package),'dist/node/index.js');
    const vite=await import(pathToFileURL(viteEntry).href);esbuildApi=await import(pathToFileURL(esbuild.entry).href);
    const observer={name:'fixture-only-emission-correspondence',enforce:'post',
      configResolved(config){
        if(path.resolve(config.root)!==repo||path.resolve(config.cacheDir)!==path.join(root,'cache','vite')||config.build.write!==false||config.build.watch||config.build.ssr||config.envFile!==false||path.resolve(config.configFile)!==configCopy)throw Error('Emission config isolation mismatch');
        configObserved={root:repo,configSource:'vite.config.ts',configCopySameBytes:true,command:config.command,mode:config.mode,
          envFile:false,write:false,watch:false,cacheOwned:true,outputOwned:true,postBuildScriptExecuted:false,
          plugins:config.plugins.map(p=>p.name),overrides:['root','configFile-copy','envFile:false','cacheDir-owned','build.outDir-owned','build.write:false','build.emptyOutDir:false','logLevel:silent','observation-plugin']};
      },
      generateBundle(_options,bundle){if(hookCapture)throw Error('Multiple emission bundles');hookCapture=Object.fromEntries(Object.values(bundle).filter(row=>row.type==='chunk').map(row=>[row.fileName,clone(row.modules)]));},
    };
    phase='build';let output;try{output=await vite.build({root:repo,configFile:configCopy,envFile:false,cacheDir:path.join(root,'cache','vite'),logLevel:'silent',plugins:[observer],build:{outDir:path.join(root,'output'),write:false,emptyOutDir:false}});}finally{buildSettled=true;}
    phase='post-build-shape';
    if(!output||Array.isArray(output)||!Array.isArray(output.output)||!hookCapture||!configObserved)throw Error('Unsupported Vite emission shape');
    const emitted=output.output.map(row=>{
      if(!row.fileName||row.fileName.startsWith('/')||row.fileName.includes('\\')||row.fileName.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe emission filename');
      const bytes=Buffer.from(row.type==='chunk'?row.code:row.source);
      if(row.type==='chunk'&&hash(hookCapture[row.fileName])!==hash(row.modules))throw Error('Hook/result module mismatch');
      return {fileName:row.fileName,type:row.type,size:bytes.length,sha256:digest(bytes)};
    });
    const records=targets.map(source=>{
      const id=path.join(repo,source).replaceAll('\\','/'),chunks=[];
      for(const row of output.output.filter(row=>row.type==='chunk'))for(const [moduleId,value]of Object.entries(row.modules))if(moduleId.replaceAll('\\','/')===id){
        if(!Number.isSafeInteger(value.renderedLength)||value.renderedLength<0||!Number.isSafeInteger(value.originalLength)||value.originalLength<0)throw Error('Unsupported Rollup contribution');
        chunks.push({fileName:row.fileName,moduleId,renderedLength:value.renderedLength,originalLength:value.originalLength,renderedExports:[...value.renderedExports],removedExports:[...value.removedExports]});
      }
      return {source,measurement:sources.find(s=>s.path===source),chunks,status:chunks.some(c=>c.renderedLength>0)?'observed-rendered-contribution':'unresolved-absent-or-zero',removable:false};
    });
    phase='post-build-inputs';
    if(hash(sources)!==hash(observeCatalogFiles(roots,sourceRefs))||hash(toolObservations)!==hash(observeCatalogFiles(toolRoots,toolRefs)))throw Error('Emission inputs changed');
    phase='post-build-guard';
    if(guards.activity.outsideWrites||guards.activity.network||guards.activity.unexpectedChildren||guards.activity.refusedWindowsHelper!==1||guards.readRollupProbeRefusal()!==1)throw Error('Emission boundary violation');
    phase='report';
    report=freeze({version:1,profile:'frontend-emission-correspondence-v1',sourceScopeSha256:hash(scopeInput.scopeContract),sources,tools,toolObservations,
      configuration:configObserved,outputs:emitted,records,
      observationVariant:'helper-unavailable, Rollup-native-selection-fallback evidence',
      windowsHelper:{command:'net use',refusalCount:guards.activity.refusedWindowsHelper,callback:'asynchronous-controlled-error',executed:false,successfulMappingsFabricated:false},
      rollupNativeProbe:{binding:rollupProbeBinding,refusalCount:guards.readRollupProbeRefusal(),executed:false,reportDataFabricated:false,nativeSelection:'diagnostic-header-unavailable-fallback-not-equivalence-verified'},
      limits:{scope:'one-current-frontend-compiler-observation',allBuildInputsMeasured:false,toolAuthenticity:'not-established',environmentEquivalence:'not-established-env-files-disabled',publicDirectoryClosure:'not-established',
        completeDependencyClosure:false,runtimeEquivalence:false,backendFacadeRemovability:false,pinnedConsumption:false,authoritativeBaseline:825,ceiling:64,ceilingMet:false},
      executionAuthority:false,stagingAdmission:false,runtimeTrust:false,signingApproval:false,productionAuthority:false,productionReady:false});
  },{readActivity:()=>guards?.activity,readProcessDenials:()=>guards?.readProcessDenials(),readRollupProbeRefusal:()=>guards?.readRollupProbeRefusal(),cleanup,phase:()=>phase,steps:[
    ['compiler-stop',()=>{if(esbuildApi){cleanup.compilerStopped=false;esbuildApi.stop();cleanup.compilerStopped=true;}}],
    ['children-close',async()=>{cleanup.childCount=children.length;await Promise.all(children.map(c=>c.done));cleanup.closedChildCount=children.filter(c=>c.closed).length;cleanup.childrenClosed=children.every(c=>c.closed);}],
    ['instrumentation-restore',()=>{cleanup.activity=activityEvidence(guards?.activity).counters;cleanup.rollupProbeRefusalCount=guards?.readRollupProbeRefusal()??null;if(guards){cleanup.instrumentationRestored=false;guards.restore();cleanup.instrumentationRestored=true;}}],
    ['environment-restore',()=>{cleanup.environmentRestored=false;for(const k of envNames)if(environment[k]===undefined)delete process.env[k];else process.env[k]=environment[k];cleanup.environmentRestored=true;}],
    ['root-cleanup',()=>{
      if((buildSettled||!children.length)&&cleanup.childrenClosed){checked(root);if(path.dirname(root)!==repo||!/^\.frontend-emission-/.test(path.basename(root)))throw Error('Unsafe cleanup root');
        const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);checked(full);if(entry.isDirectory())walk(full);else if(!entry.isFile())throw Error('Unexpected fixture resource');}};walk(root);
        fs.rmSync(root,{recursive:true});cleanup.rootRemoved=!fs.existsSync(root);
      }else {cleanup.rootRemoved=false;console.error('STOP; preserve owned emission root: '+root);}
    }],
  ]});
  const captured=hash(report);
  return Object.freeze({report,cleanup:freeze(cleanup),assess(candidate){
    if(hash(candidate)!==captured)throw Error('Emission report differs from captured tool observation');
    if(hash(sources)!==hash(observeCatalogFiles(roots,sourceRefs))||hash(toolObservations)!==hash(observeCatalogFiles(toolRoots,toolRefs)))throw Error('Stale emission input measurement');
    return freeze({status:'blocked',observation:candidate,executionAuthority:false,stagingAdmission:false,productionAuthority:false,productionReady:false});
  }});
}
module.exports={observeFrontendEmission,createNetUseRefusal,withEmissionFailureDiagnostics,readEmissionFailureDiagnostics,installGuards,createRollupProbeBinding};
