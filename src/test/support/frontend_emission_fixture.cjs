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
function installGuards(root,compiler,version,onChild){
  const restore=[],activity={outsideWrites:0,network:0,unexpectedChildren:0,compilerChildren:0,refusedWindowsHelper:0};
  const patch=(owner,key,value)=>{const original=owner[key];owner[key]=value;restore.push(()=>{owner[key]=original;});return original;};
  const owned=value=>{
    const full=path.resolve(value instanceof URL?fileURLToPath(value):String(value)),relative=path.relative(root,full);
    if(relative.startsWith('..')||path.isAbsolute(relative)){activity.outsideWrites++;throw Error('Write outside owned emission root');}
    for(let p=full;;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked output path');if(p===root)break;}
  };
  const denyNetwork=()=>{activity.network++;throw Error('Forbidden emission network/server activity');};
  for(const [owner,key]of [[net.Socket.prototype,'connect'],[net.Server.prototype,'listen'],[dgram,'createSocket'],[globalThis,'fetch']])patch(owner,key,denyNetwork);
  const denyChild=()=>{activity.unexpectedChildren++;throw Error('Unapproved emission child');};
  for(const key of ['execSync','execFile','execFileSync','spawnSync','fork'])patch(cp,key,denyChild);
  patch(cp,'exec',createNetUseRefusal(activity,denyChild));
  const spawn=cp.spawn;
  patch(cp,'spawn',function(executable,args,options){
    if(path.resolve(String(executable))!==compiler||JSON.stringify(args)!==JSON.stringify(['--service='+version,'--ping'])||activity.compilerChildren){activity.unexpectedChildren++;throw Error('Unapproved emission compiler');}
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
  syncBuiltinESMExports();return {activity,restore(){for(const undo of restore.reverse())undo();syncBuiltinESMExports();}};
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
  const esbuild=tools.find(t=>t.name==='esbuild'),compiler=createRequire(esbuild.package).resolve('@esbuild/win32-x64/esbuild.exe');checked(compiler);
  const toolFiles=[...new Set([...tools.flatMap(t=>[t.entry,t.package]),compiler])];
  const toolRoots=[{id:'toolchain',path:repo}];
  const toolRefs=toolFiles.map(file=>{const relative=path.relative(repo,file).replaceAll('\\','/');if(!relative.startsWith('node_modules/')||relative.split('/').includes('..'))throw Error('Tool outside installed checkout');return {root:'toolchain',path:relative};});
  const toolObservations=observeCatalogFiles(toolRoots,toolRefs);
  const root=fs.mkdtempSync(path.join(repo,'.frontend-emission-'));checked(root);
  const configCopy=path.join(root,'vite.config.ts');fs.writeFileSync(configCopy,fs.readFileSync(path.join(repo,'vite.config.ts')),{flag:'wx'});
  if(digest(fs.readFileSync(configCopy))!==sources.find(s=>s.path==='vite.config.ts').sha256)throw Error('Config copy mismatch');
  const envNames=['TEMP','TMP','JITI_CACHE','BABEL_DISABLE_CACHE','NODE_ENV'],environment=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
  for(const k of ['TEMP','TMP'])process.env[k]=root;process.env.JITI_CACHE=path.join(root,'cache','jiti');process.env.BABEL_DISABLE_CACHE='1';
  const children=[];let buildSettled=false,hookCapture,configObserved,report,esbuildApi,guards;
  let cleanup={root,rootRemoved:false,childrenClosed:false,instrumentationRestored:false};
  try{
    guards=installGuards(root,compiler,esbuild.version,child=>{
      const record={child,closed:false,exitCode:null,signal:null};record.done=new Promise(resolve=>child.once('close',(code,signal)=>{record.closed=true;record.exitCode=code;record.signal=signal;resolve();}));children.push(record);
    });
    const viteEntry=path.join(path.dirname(tools.find(t=>t.name==='vite').package),'dist/node/index.js');
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
    let output;try{output=await vite.build({root:repo,configFile:configCopy,envFile:false,cacheDir:path.join(root,'cache','vite'),logLevel:'silent',plugins:[observer],build:{outDir:path.join(root,'output'),write:false,emptyOutDir:false}});}finally{buildSettled=true;}
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
    if(hash(sources)!==hash(observeCatalogFiles(roots,sourceRefs))||hash(toolObservations)!==hash(observeCatalogFiles(toolRoots,toolRefs)))throw Error('Emission inputs changed');
    if(guards.activity.outsideWrites||guards.activity.network||guards.activity.unexpectedChildren||guards.activity.refusedWindowsHelper!==1)throw Error('Emission boundary violation');
    report=freeze({version:1,profile:'frontend-emission-correspondence-v1',sourceScopeSha256:hash(scopeInput.scopeContract),sources,tools,toolObservations,
      configuration:configObserved,outputs:emitted,records,
      observationVariant:'helper-unavailable fallback observations',
      windowsHelper:{command:'net use',refusalCount:guards.activity.refusedWindowsHelper,callback:'asynchronous-controlled-error',executed:false,successfulMappingsFabricated:false},
      limits:{scope:'one-current-frontend-compiler-observation',allBuildInputsMeasured:false,toolAuthenticity:'not-established',environmentEquivalence:'not-established-env-files-disabled',publicDirectoryClosure:'not-established',
        completeDependencyClosure:false,runtimeEquivalence:false,backendFacadeRemovability:false,pinnedConsumption:false,authoritativeBaseline:825,ceiling:64,ceilingMet:false},
      executionAuthority:false,stagingAdmission:false,runtimeTrust:false,signingApproval:false,productionAuthority:false,productionReady:false});
  }finally{
    if(esbuildApi)esbuildApi.stop();
    await Promise.all(children.map(c=>c.done));cleanup.childrenClosed=children.every(c=>c.closed);
    if(guards){cleanup.activity=clone(guards.activity);guards.restore();}cleanup.instrumentationRestored=true;
    for(const k of envNames)if(environment[k]===undefined)delete process.env[k];else process.env[k]=environment[k];
    if((buildSettled||!children.length)&&cleanup.childrenClosed){checked(root);if(path.dirname(root)!==repo||!/^\.frontend-emission-/.test(path.basename(root)))throw Error('Unsafe cleanup root');
      const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);checked(full);if(entry.isDirectory())walk(full);else if(!entry.isFile())throw Error('Unexpected fixture resource');}};walk(root);
      fs.rmSync(root,{recursive:true});cleanup.rootRemoved=!fs.existsSync(root);
    }else console.error('STOP; preserve owned emission root: '+root);
  }
  const captured=hash(report);
  return Object.freeze({report,cleanup:freeze(cleanup),assess(candidate){
    if(hash(candidate)!==captured)throw Error('Emission report differs from captured tool observation');
    if(hash(sources)!==hash(observeCatalogFiles(roots,sourceRefs))||hash(toolObservations)!==hash(observeCatalogFiles(toolRoots,toolRefs)))throw Error('Stale emission input measurement');
    return freeze({status:'blocked',observation:candidate,executionAuthority:false,stagingAdmission:false,productionAuthority:false,productionReady:false});
  }});
}
module.exports={observeFrontendEmission,createNetUseRefusal};
