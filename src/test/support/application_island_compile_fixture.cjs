// Opt-in compiler observation. Never loads emitted code or historical fixture roots.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),ts=require('typescript');
const {createRequire}=require('node:module');
const {members}=require('./application_island_model.cjs');
const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord}=require('../../../scripts/stage-backend.cjs');
const {installGuards}=require('./frontend_emission_fixture.cjs');
const sources=['src/shared/address_validation.ts','src/shared/identity_policy.ts'];
const expectedExports=[
  ['addressRelationship','ipv4Number','normalizeIPv4','normalizeManualMac','prefixMask'],
  ['canonicalAnchor','canonicalMac','conflicts','hasIdentity','mergeAnchors','sameIdentity','selectIdentity','sharesAnchor'],
];
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const check=(value,reason)=>{if(!value)throw Error('Island compile denied: '+reason);};
const failureReceipts=new WeakMap();
// Private capture capability: compile-only callers never receive/retain emitted bytes.
const behaviorCapture=Symbol('synthetic-behavior-capture'),capturedVariants=new WeakMap();
async function bounded(work,milliseconds,label){
  let timer;
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
const readCompileFailure=error=>error&&typeof error==='object'?failureReceipts.get(error)??null:null;
async function withCompileCleanup(work,{steps,cleanup,phase}){
  let result,error,primary=null,failed=false;const cleanupFailures=[],cleanupErrors=[];
  try{result=await work();}catch(original){error=original;primary={name:original?.name||typeof original,message:String(original?.message??original)};failed=true;}
  for(const [name,run]of steps)try{await run();}catch(original){cleanupFailures.push(name);cleanupErrors.push({step:name,error:{name:original?.name||typeof original,message:String(original?.message??original)}});if(!failed){error=original;failed=true;}}
  if(failed){
    if(error&&typeof error==='object')failureReceipts.set(error,freeze({phase:phase(),cleanup:clone(cleanup),cleanupFailures,primary,cleanupErrors,
      expected:{compilerChildren:1,refusedWindowsHelper:0,rollupProbeRefusals:0},productionAuthority:false}));
    throw error;
  }
  return result;
}
function checked(file){
  for(let current=path.resolve(file);;current=path.dirname(current)){
    if(fs.existsSync(current))check(!fs.lstatSync(current).isSymbolicLink(),'linked path');
    if(path.dirname(current)===current)break;
  }
}
function exportContract(repo){
  check(hash(members.map(p=>p+'.ts'))===hash(sources),'island members');
  return sources.map((source,index)=>{
    const tree=ts.createSourceFile(source,fs.readFileSync(path.join(repo,source),'utf8'),ts.ScriptTarget.Latest,true);
    check(tree.parseDiagnostics.length===0,'source syntax');const names=[];
    for(const node of tree.statements){
      check(!ts.isExportDeclaration(node)&&!ts.isExportAssignment(node),'unsupported export');
      if(!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
      if(ts.isFunctionDeclaration(node)&&node.name)names.push(node.name.text);
      else if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations){check(ts.isIdentifier(declaration.name),'export binding');names.push(declaration.name.text);}
      else check(false,'unsupported declaration');
    }
    names.sort();check(hash(names)===hash(expectedExports[index]),'complete export contract');return {source,exports:names};
  });
}
function validateCandidate(report,expected){
  check(report.profile==='address-identity-compile-only-v1','profile');
  check(hash(report.sources)===hash(expected.sources)&&hash(report.configuration)===hash(expected.configuration)&&hash(report.tool)===hash(expected.tool),'input measurements/configuration');
  check(hash(report.exportContract)===hash(expected.exportContract),'source exports');
  const graph=report.graph;check(graph&&hash(Object.keys(graph.inputs).sort())===hash([...sources,'island-entry.ts'].sort()),'incorporated inputs');
  for(const source of sources){
    const row=graph.inputs[source];check(row.bytes===expected.sourceBytes[source],'input bytes');
    const imports=source===sources[0]?[{path:sources[1],kind:'import-statement',original:'./identity_policy.ts'}]:[{path:'../types/index.ts',kind:'import-statement',external:true}];
    check(hash(row.imports)===hash(imports),'unexpected input edge');
  }
  check(hash(graph.inputs['island-entry.ts'].imports.map(i=>({path:i.path,kind:i.kind,external:!!i.external})))===hash(sources.map(path=>({path,kind:'import-statement',external:false}))),'entry edges');
  const outputs=Object.entries(graph.outputs);check(outputs.length===1,'output count');
  const [outputPath,output]=outputs[0];check(outputPath===expected.outputKey&&output.entryPoint==='island-entry.ts','output identity');
  check(output.imports.length===0,'output imports');
  check(hash(Object.keys(output.inputs).sort())===hash([...sources,'island-entry.ts'].sort()),'output membership');
  check(sources.every(s=>output.inputs[s].bytesInOutput>0),'source contribution');
  check(hash([...output.exports].sort())===hash(expected.exportContract.flatMap(r=>r.exports).sort()),'output exports');
  check(report.output.path==='address-identity.generated.js'&&report.output.bytes===output.bytes&&report.output.bytes===expected.output.bytes&&report.output.sha256===expected.output.sha256,'output bytes/digest');
  check(hash(report.graph)===hash(expected.graph),'captured compiler graph');
  check(report.observation==='compile-only; emitted code never executed','observation label');
  check(report.sourceOnlyReference==='identity_policy.ts -> ../types/index.ts: reported external in input metadata; absent from output imports; not incorporated; not reclassified','source-only reference');
  for(const name of ['runtimeEquivalence','facadeRemovability','stagingAdmission','executionAuthority','signingApproval','productionAuthority','productionReady'])check(report[name]===false,'unsupported '+name);
  check(report.authoritativeBaseline===825&&report.ceiling===64&&report.achievedPayloadCount===null&&report.callerOutputReviews==='29 unresolved; historical evidence not renewed','accounting/obligations');
  return {status:'blocked',productionAuthority:false,runtimeEquivalence:false};
}
async function observeIslandCompile(repo,optIn,capture){
  check(capture===undefined||capture===behaviorCapture,'private capture capability');
  check(optIn===true,'explicit opt-in required');repo=path.resolve(repo);checked(repo);
  const req=createRequire(path.join(repo,'package.json')),pkg=req.resolve('esbuild/package.json'),api=req.resolve('esbuild');
  const compiler=createRequire(pkg).resolve('@esbuild/win32-x64/esbuild.exe');
  check(process.platform==='win32'&&process.arch==='x64','platform');
  check(!require.cache[api],'compiler API already loaded');
  const version=JSON.parse(fs.readFileSync(pkg,'utf8')).version;check(version==='0.28.2','compiler version');
  const binaryPkg=createRequire(pkg).resolve('@esbuild/win32-x64/package.json');
  check(JSON.parse(fs.readFileSync(binaryPkg,'utf8')).version===version,'binary package version');
  const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
  check(lock.packages['node_modules/esbuild']?.version===version&&lock.packages['node_modules/@esbuild/win32-x64']?.version===version,'lock versions');
  const configuration={format:'esm',platform:'node',target:'es2022',bundle:true,treeShaking:false,write:false,metafile:true,legalComments:'inline',tsconfig:'tsconfig.json'};
  const rootSpec=[{id:'repository',path:repo}];
  const paths=[...sources,'package.json','package-lock.json','tsconfig.json',...new Set([pkg,api,compiler,binaryPkg,req.resolve('typescript'),req.resolve('typescript/package.json')].map(p=>path.relative(repo,p).replaceAll('\\','/')))];
  check(paths.slice(5).every(p=>!p.split('/').includes('..')),'tool outside checkout');
  const refs=paths.map(path=>({root:'repository',path})),before=observeCatalogFiles(rootSpec,refs),contract=exportContract(repo);
  const config=JSON.parse(fs.readFileSync(path.join(repo,'tsconfig.json'),'utf8'));
  check(config.compilerOptions.target==='ES2022'&&config.compilerOptions.module==='ESNext'&&config.compilerOptions.noEmit===true&&!config.extends,'compiler configuration');
  const parent=fs.realpathSync(os.tmpdir());checked(parent);const root=fs.mkdtempSync(path.join(parent,'discovery-island-compile-'));checked(root);
  const environment=Object.fromEntries(['TEMP','TMP','ESBUILD_BINARY_PATH'].map(k=>[k,process.env[k]]));
  const children=[],cleanup={root,compilerStopped:null,childrenClosed:null,childCount:null,closedChildCount:null,activity:null,
    instrumentationRestored:null,environmentRestored:null,rootRemoved:null,deniedProcesses:null,rollupProbeRefusals:null},entry=sources.map(s=>`export * from './${s}';`).join('\n');
  let guards,esbuild,result,report,expected,bytes,original,phase='fixture-setup';
  await withCompileCleanup(async()=>{
    process.env.TEMP=root;process.env.TMP=root;process.env.ESBUILD_BINARY_PATH=compiler;
    guards=installGuards(root,compiler,version,child=>{
      const record={closed:false,child};record.done=new Promise(resolve=>child.once('close',()=>{record.closed=true;resolve();}));children.push(record);
    },()=>phase);
    if(capture===behaviorCapture){phase='original-transpile';original=originalModules(repo);}
    phase='tool-load';esbuild=req('esbuild');phase='build';
    const building=esbuild.build({...configuration,tsconfig:path.join(repo,'tsconfig.json'),absWorkingDir:repo,
      stdin:{contents:entry,sourcefile:'island-entry.ts',resolveDir:repo,loader:'ts'},outfile:path.join(root,'address-identity.generated.js'),logLevel:'silent'});
    result=capture===behaviorCapture?await bounded(building,30000,'behavior compiler'):await building;
    phase='post-build-shape';check(result.outputFiles.length===1,'actual output count');
    const output=result.outputFiles[0];check(output.path===path.join(root,'address-identity.generated.js'),'actual output path');
    const measured={path:'address-identity.generated.js',bytes:output.contents.byteLength,sha256:sha(output.contents)};
    if(capture===behaviorCapture)bytes=Buffer.from(output.contents);
    // AST parsing is data inspection, not import/evaluation of the candidate.
    const parsed=ts.createSourceFile(measured.path,output.text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);check(parsed.parseDiagnostics.length===0,'emitted syntax');
    const exportStatements=parsed.statements.filter(ts.isExportDeclaration);
    check(exportStatements.length===1&&!exportStatements[0].moduleSpecifier&&ts.isNamedExports(exportStatements[0].exportClause),'emitted ESM export form');
    check(hash(exportStatements[0].exportClause.elements.map(e=>e.name.text).sort())===hash(contract.flatMap(r=>r.exports).sort()),'actual emitted export surface');
    check(fs.readdirSync(root).length===0,'write:false output isolation');
    phase='post-build-inputs';check(hash(before)===hash(observeCatalogFiles(rootSpec,refs)),'inputs changed');
    expected={sources:before,configuration,tool:{version,node:process.version,compiler:path.relative(repo,compiler).replaceAll('\\','/')},exportContract:contract,
      sourceBytes:Object.fromEntries(sources.map(s=>[s,before.find(r=>r.path===s).size])),graph:clone(result.metafile),outputKey:Object.keys(result.metafile.outputs)[0],output:measured};
    report={profile:'address-identity-compile-only-v1',sources:before,configuration,tool:expected.tool,exportContract:contract,graph:clone(result.metafile),output:measured,
      observation:'compile-only; emitted code never executed',runtimeEquivalence:false,facadeRemovability:false,stagingAdmission:false,executionAuthority:false,signingApproval:false,productionAuthority:false,productionReady:false,
      sourceOnlyReference:'identity_policy.ts -> ../types/index.ts: reported external in input metadata; absent from output imports; not incorporated; not reclassified',
      authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,callerOutputReviews:'29 unresolved; historical evidence not renewed'};
    validateCandidate(report,expected);phase='post-build-guard';
    check(guards.activity.compilerChildren===1&&guards.activity.unexpectedChildren===0&&guards.activity.network===0&&guards.activity.outsideWrites===0&&guards.activity.refusedWindowsHelper===0,'activity counters');
  },{cleanup,phase:()=>phase,steps:[
    ['compiler-stop',()=>{if(esbuild){esbuild.stop();cleanup.compilerStopped=true;}}],
    ['children-close',async()=>{
      const closing=Promise.all(children.map(c=>c.done));
      try{
        if(capture===behaviorCapture){
          try{await bounded(closing,5000,'behavior compiler close');}
          catch(error){for(const c of children)if(!c.closed)c.child.kill();await bounded(closing,5000,'behavior compiler forced close');throw error;}
        }else await closing;
      }finally{cleanup.childCount=children.length;cleanup.closedChildCount=children.filter(c=>c.closed).length;cleanup.childrenClosed=children.every(c=>c.closed);}
    }],
    ['instrumentation-restore',()=>{if(guards){cleanup.activity=clone(guards.activity);cleanup.deniedProcesses=guards.readProcessDenials();cleanup.rollupProbeRefusals=guards.readRollupProbeRefusal();guards.restore();cleanup.instrumentationRestored=true;}}],
    ['environment-restore',()=>{for(const [key,value]of Object.entries(environment))if(value===undefined)delete process.env[key];else process.env[key]=value;cleanup.environmentRestored=true;}],
    ['root-cleanup',()=>{checked(root);check(path.dirname(root)===parent&&/^discovery-island-compile-/.test(path.basename(root))&&cleanup.childrenClosed,'cleanup ownership');check(fs.readdirSync(root).length===0,'unexpected scratch output');fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);}],
  ]});
  // No generated JS is persisted. The generic record is explicitly synthetic/non-admitted metadata.
  const record=createGeneratedArtifactRecord({profile:report.profile,outputs:[report.output],sources:report.sources,compiler:report.tool},[]);
  const captured=hash(report);freeze(report);freeze(expected);
  const fixture={report,record:freeze(record),cleanup:freeze(cleanup),assess(candidate){check(hash(candidate)===captured,'captured evidence changed');check(hash(before)===hash(observeCatalogFiles(rootSpec,refs)),'current inputs changed');return validateCandidate(candidate,expected);}};
  if(capture===behaviorCapture)capturedVariants.set(fixture,{bytes,original});
  return fixture;
}
// Separate synthetic behavior path. None of these functions is called by compile-only.
const behavior=require('./application_island_behavior_loader.cjs');
const behaviorFailures=new WeakMap();
const readBehaviorFailure=error=>error&&typeof error==='object'?behaviorFailures.get(error)??null:null;
const describeError=error=>({name:error?.name||typeof error,message:String(error?.message??error)});
async function withBehaviorCleanup(work,steps){
  let result,primary,failed=false;const cleanupErrors=[];
  try{result=await work();}catch(error){primary=error;failed=true;}
  for(const [step,run]of steps)try{await run();}catch(error){cleanupErrors.push({step,error:describeError(error)});}
  if(failed||cleanupErrors.length){
    const error=Error('Synthetic island behavior failed');
    if(failed)error.cause=primary;
    behaviorFailures.set(error,freeze({primary:failed?describeError(primary):null,cleanupErrors,productionAuthority:false}));
    throw error;
  }
  return result;
}
// Fixed checkpoint content, not an approval of upstream tools. Fixture files below are
// intentionally measured per invocation, since this change edits them.
const behaviorPins=[
  ...behavior.SOURCE_PINS.map(row=>[row.path,row.size,row.sha256]),
  ['package.json',1377,'22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f'],
  ['package-lock.json',162554,'b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32'],
  ['tsconfig.json',530,'3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7'],
  ['src/types/index.ts',14131,'d927701de585f24a11af932822db67349dd209240e4f21e0100a560bcab9bb32'],
  ['scripts/stage-backend.cjs',24741,'1776a2e8483f179c6b91270ddaa7ccd170f99eb9f3c6b8634b0f50bcb85b27ab'],
  ['scripts/payload-byte-catalog.cjs',14803,'016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d'],
  ['scripts/dependency-inventory.cjs',25611,'153ef544e8773859544a23a427457fb6128cbd97b8a1a897a2858e005400e6c7'],
  ['src/test/support/application_island_model.cjs',11752,'6081163e70bc1ad40ceb541b2f72cbe5420b952892ab9ef2ae2dcdc928fc9349'],
  ['src/test/support/application_caller_mapping.cjs',22827,'dd6a2e5ff894fb5123953053c250ae5e8ad011e2b2190a955b4d92f609a94d8f'],
  ['src/test/support/frontend_emission_fixture.cjs',28296,'0f36d691280e8409763ab5addb2ce42ccb1a7aac27dc7d3bf89437f69ec0fcf7'],
  ['node_modules/typescript/lib/typescript.js',9112572,'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'],
  ['node_modules/typescript/package.json',3620,'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6'],
  ['node_modules/esbuild/lib/main.js',97463,'61ec0ba144ff93f4bf0e96ad6fab6f430ede0aa13e27ace8063ed63ba416b3cd'],
  ['node_modules/esbuild/package.json',3980,'9d0bc453f4e791553c4cc2298ba023b409241fd9801e494741666eb0f6051490'],
  ['node_modules/@esbuild/win32-x64/esbuild.exe',11694592,'c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef'],
  ['node_modules/@esbuild/win32-x64/package.json',374,'89382df45735edcd917c492a810ab514920fa07d36c653cdc122bdfd8f526964'],
];
const fixturePaths=['src/test/support/application_island_compile_fixture.cjs','src/test/support/application_island_behavior_loader.cjs','src/test/application_island_compile.test.cjs'];
function behaviorInputs(repo){
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}];
  const refs=[...behaviorPins.map(([path])=>({root:'repository',path})),...fixturePaths.map(path=>({root:'repository',path})),
    {root:'node-runtime',path:path.basename(process.execPath)}];
  const read=()=>observeCatalogFiles(roots,refs),observations=read();
  for(const [file,size,digest]of behaviorPins){
    const row=observations.find(row=>row.root==='repository'&&row.path===file);
    check(row?.size===size&&row.sha256===digest,'behavior checkpoint dependency '+file);
  }
  const req=createRequire(path.join(repo,'package.json'));
  check(process.platform==='win32'&&process.arch==='x64'&&process.version==='v24.19.0','behavior Node platform/version');
  check(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.ESBUILD_BINARY_PATH,'behavior inherited tool overrides');
  validateLauncherParent();
  for(const [specifier,file]of [['typescript','node_modules/typescript/lib/typescript.js'],['esbuild','node_modules/esbuild/lib/main.js']]){
    check(req.resolve(specifier)===path.join(repo,file),'behavior tool resolution');
  }
  check(req('typescript')===ts&&ts.version==='5.9.3','behavior TypeScript instance/version');
  const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
  check(lock.packages['node_modules/typescript'].version===ts.version&&lock.packages['node_modules/esbuild'].version==='0.28.2'&&
    lock.packages['node_modules/@esbuild/win32-x64'].version==='0.28.2','behavior lock versions');
  const captured=hash(observations);
  return {observations,verify(){check(hash(read())===captured,'behavior current input identities/bytes changed');}};
}
function originalModules(repo){
  return sources.map((source,index)=>{
    const input=fs.readFileSync(path.join(repo,source),'utf8');
    const emit=()=>ts.transpileModule(input,{fileName:path.join(repo,source),reportDiagnostics:true,compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,rewriteRelativeImportExtensions:true,
    }});
    const result=emit();check(!result.diagnostics?.some(row=>row.category===ts.DiagnosticCategory.Error),'original transpile diagnostics');
    check(result.outputText===emit().outputText,'original deterministic emission');
    const text=result.outputText,tree=ts.createSourceFile(source.replace(/\.ts$/,'.js'),text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    check(tree.parseDiagnostics.length===0,'original output syntax');
    const imports=tree.statements.filter(ts.isImportDeclaration);
    check(imports.length===(index===0?1:0)&&imports.every(node=>ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text==='./identity_policy.js'),'original output edges');
    const names=[];
    for(const node of tree.statements){
      check(!ts.isExportDeclaration(node)&&!ts.isExportAssignment(node),'original unexpected export');
      if(node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)){
        if(ts.isFunctionDeclaration(node)&&node.name)names.push(node.name.text);
        else if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations){check(ts.isIdentifier(declaration.name),'original export binding');names.push(declaration.name.text);}
        else check(false,'original unsupported export');
      }
    }
    check(hash(names.sort())===hash(expectedExports[index]),'original complete exports');
    const visit=node=>{
      check(!ts.isMetaProperty(node),'original module metadata');
      if(ts.isCallExpression(node))check(node.expression.kind!==ts.SyntaxKind.ImportKeyword,'original dynamic import');
      ts.forEachChild(node,visit);
    };visit(tree);
    return {id:'original/'+path.basename(source,'.ts')+'.js',text,bytes:Buffer.byteLength(text),sha256:sha(text)};
  });
}
async function prepareIslandBehavior(repo,optIn){
  check(optIn===true,'behavior compiler opt-in required');repo=path.resolve(repo);checked(repo);
  let compiler;
  try{
  const inputs=behaviorInputs(repo);inputs.verify();
  try{compiler=await observeIslandCompile(repo,true,behaviorCapture);}
  catch(error){
    const failure=Error('Synthetic behavior compiler failed');failure.cause=error;
    behaviorFailures.set(failure,freeze({primary:describeError(error),compilerFailure:readCompileFailure(error),cleanupErrors:[],productionAuthority:false}));throw failure;
  }
  let candidate,original;
  try{const variants=capturedVariants.get(compiler);candidate=variants?.bytes.toString('utf8');original=variants?.original;}
  finally{capturedVariants.delete(compiler);}
  check(typeof candidate==='string'&&original?.length===2,'private compiler variants');inputs.verify();compiler.assess(compiler.report);
  const candidateRow={id:'candidate/address-identity.generated.js',text:candidate,bytes:Buffer.byteLength(candidate),sha256:sha(candidate)};
  const envelope={profile:behavior.PROFILE,nonce:crypto.randomBytes(16).toString('hex'),
    bindings:{observations:inputs.observations,compileReport:compiler.report,
      originalConfiguration:{target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true},
      node:{version:process.version,path:process.execPath}},modules:[...original,candidateRow],
    productionAuthority:false,runtimeEquivalence:false,stagingAdmission:false,authoritativeBaseline:825,ceiling:64,
    achievedPayloadCount:null,callerOutputReviews:'29 unresolved; historical evidence not renewed'};
  const seal=behavior.envelopeDigest(envelope);behavior.validateEnvelope(envelope,seal);freeze(envelope);
  const record=freeze(createGeneratedArtifactRecord({profile:behavior.PROFILE,
    outputs:envelope.modules.map(({id,bytes,sha256})=>({path:id,bytes,sha256})),sources:inputs.observations,
    compiler:{candidate:compiler.report.tool,original:'typescript-5.9.3',originalConfiguration:envelope.bindings.originalConfiguration}},[]));
  let consumed=false;
  const assess=candidate=>{inputs.verify();behavior.validateEnvelope(candidate,seal);return {status:'blocked',productionAuthority:false,runtimeEquivalence:false};};
  return {evidence:envelope,record,compilerCleanup:compiler.cleanup,assess,async compare(executionOptIn){
    check(executionOptIn===true,'generated execution opt-in required');check(!consumed,'behavior loader already consumed');
    assess(envelope);consumed=true;
    return launchBehaviorChild(repo,envelope,seal,inputs.verify);
  }};
  }catch(error){
    if(readBehaviorFailure(error))throw error;
    const failure=Error('Synthetic behavior preparation failed');failure.cause=error;
    behaviorFailures.set(failure,freeze({primary:describeError(error),cleanupErrors:[],compilerCleanup:compiler?.cleanup??null,productionAuthority:false}));throw failure;
  }
}
async function launchBehaviorChild(repo,envelope,seal,verify){
  const loader=path.join(repo,fixturePaths[1]);checked(loader);validateLauncherParent();
  return launchFixedChild({verify:()=>{verify();behavior.validateEnvelope(envelope,seal);},
    args:['--experimental-vm-modules','--no-warnings',loader,'--island-behavior-child',envelope.nonce,seal],
    request:JSON.stringify(envelope),milliseconds:15000,limit:262144,
    consume(output){
      const receipt=JSON.parse(output);check(receipt.nonce===envelope.nonce&&receipt.seal===seal,'behavior response binding');
      const recomputed=behavior.compareResults(receipt.report.runs);
      check(hash(recomputed)===hash(receipt.report),'behavior result/claims');return freeze(recomputed);
    }});
}
// Empty or exact focused node:test runner flags only; unknown flags fail closed.
function validateLauncherParent(argv=process.execArgv,environment=process.env){
  const allowed=new Set(['--test','--test-isolation=none','--test-name-pattern=launcher preflight','--test-reporter=tap']);
  check(Array.isArray(argv)&&Array.from(argv).every(arg=>allowed.has(arg))&&new Set(argv).size===argv.length,'launcher parent flags');
  check(['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(key=>!environment[key]),'launcher inherited overrides');
}
// No executable, script, argv, environment, cwd or callback supplied by a caller.
async function launcherPreflight(scenario){
  validateLauncherParent();
  check(process.platform==='win32'&&process.arch==='x64'&&process.version==='v24.19.0','launcher Windows Node identity');
  check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION,'generated execution must remain disabled');
  check(['complete','spawn-failure','timeout','overflow','primary-and-cleanup','cleanup-only'].includes(scenario),'launcher preflight scenario');
  return launchFixedChild({verify:validateLauncherParent,
    args:['--permission','--no-addons','--no-global-search-paths','--disable-proto=throw','--max-old-space-size=32','--stack-size=256','-e',behavior.launcherPreflightProgram(scenario)],
    request:'',milliseconds:scenario==='timeout'?1000:5000,limit:8192,
    spawnFailure:scenario==='spawn-failure',cleanupFailure:scenario==='primary-and-cleanup'||scenario==='cleanup-only',
    consume(output){check(output==='launcher-preflight-complete\n','preflight fixed response');
      return {generatedExecution:false,productionAuthority:false,authoritativeBaseline:825,ceiling:64,
        limits:['Direct child closure only; no Windows Job Object or descendant termination guarantee.',
          'Node permissions and V8 limits are not OS-enforced CPU, memory, process, network or filesystem confinement.',
          'Executable identity is reobserved, not native mapped-image attestation; path races remain for external review.']};}});
}
// Shared lifecycle implementation, private to the two fixed wrappers above.
async function launchFixedChild({verify,args,request,milliseconds,limit,consume,spawnFailure=false,cleanupFailure=false}){
  const cp=require('node:child_process');verify();checked(process.execPath);
  const executable=process.execPath;
  const identity=()=>{checked(executable);const stat=fs.statSync(executable,{bigint:true});
    return {path:fs.realpathSync(executable),dev:String(stat.dev),ino:String(stat.ino),size:String(stat.size),sha256:sha(fs.readFileSync(executable))};};
  const nodeIdentity=identity();check(nodeIdentity.path===executable,'launcher exact executable path');
  const verifyInputs=()=>{verify();check(hash(identity())===hash(nodeIdentity),'launcher executable identity changed');};
  const parent=fs.realpathSync(os.tmpdir());checked(parent);
  const environment=Object.fromEntries(Object.entries(process.env));
  let child,closed=false,closePromise,report,rootIdentity;
  const root=fs.mkdtempSync(path.join(parent,'discovery-island-behavior-'));
  const cleanup={root,childClosed:false,rootRemoved:false,environmentUnchanged:false,parentInstrumentationUnchanged:false,
    spawnObserved:false,closeObserved:false,exit:null,terminationAttempted:false,retainedOutputBytes:0,executableIdentity:nodeIdentity};
  const parentApis={spawn:cp.spawn,exec:cp.exec,connect:require('node:net').Socket.prototype.connect,write:fs.writeFileSync};
  rootIdentity=fs.lstatSync(root,{bigint:true});
  await withBehaviorCleanup(async()=>{
    checked(root);verifyInputs();
    const childEnvironment={TEMP:root,TMP:root};
    // Windows runtime discovery only; NODE_OPTIONS/PATH and application credentials are not inherited.
    for(const key of ['SystemRoot','WINDIR'])if(process.env[key])childEnvironment[key]=process.env[key];
    child=cp.spawn(executable,args,
      {cwd:spawnFailure?path.join(root,'absent-cwd'):root,env:childEnvironment,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output=[],errors=[],totalBytes=0,rejectActivity;
    const activityFailure=new Promise((_,reject)=>{rejectActivity=reject;});
    closePromise=new Promise(resolve=>child.once('close',(code,signal)=>{
      closed=true;cleanup.childClosed=true;cleanup.closeObserved=true;cleanup.exit={code,signal};resolve({code,signal});
    }));
    child.once('spawn',()=>{cleanup.spawnObserved=true;});
    child.on('error',rejectActivity);child.stdin.on('error',rejectActivity);
    child.stdout.on('error',rejectActivity);child.stderr.on('error',rejectActivity);
    const receive=(target,chunk)=>{
      const remaining=Math.max(0,limit-totalBytes);totalBytes+=chunk.length;
      if(remaining){const retained=Buffer.from(chunk.subarray(0,remaining));target.push(retained);cleanup.retainedOutputBytes+=retained.length;}
      if(totalBytes>limit)rejectActivity(Error('Launcher child output limit'));
    };
    child.stdout.on('data',chunk=>receive(output,chunk));child.stderr.on('data',chunk=>receive(errors,chunk));
    check(Buffer.byteLength(request)<=262144,'behavior request limit');child.stdin.end(request);
    const exit=await bounded(Promise.race([closePromise,activityFailure]),milliseconds,'launcher child');
    check(exit.code===0&&exit.signal===null&&errors.length===0,'behavior child exit/streams');
    report=consume(Buffer.concat(output).toString('utf8'));verifyInputs();
  },[
    ['loader-close',async()=>{
      if(child&&!closed){
        // Failed spawns have no PID but still emit close. A false kill result may
        // also mean exit raced termination; closure must still be awaited.
        if(child.pid){cleanup.terminationAttempted=true;child.kill('SIGKILL');}
        await bounded(closePromise,5000,'behavior forced child close');
      }
      check(!child||closed,'behavior child still open');
    }],
    ['parent-state',()=>{
      check(hash(Object.fromEntries(Object.entries(process.env)))===hash(environment),'behavior parent environment changed');cleanup.environmentUnchanged=true;
      check(cp.spawn===parentApis.spawn&&cp.exec===parentApis.exec&&require('node:net').Socket.prototype.connect===parentApis.connect&&fs.writeFileSync===parentApis.write,'behavior parent instrumentation changed');cleanup.parentInstrumentationUnchanged=true;
      if(cleanupFailure)throw Error('Preflight cleanup acknowledgment failure');
    }],
    ['inputs-reobserve',verifyInputs],
    ['root-cleanup',()=>{
      check(!child||closed,'cannot remove live child root');checked(root);
      const current=fs.lstatSync(root,{bigint:true});check(rootIdentity&&current.dev===rootIdentity.dev&&current.ino===rootIdentity.ino&&
        fs.realpathSync(root)===root&&path.dirname(root)===parent&&/^discovery-island-behavior-/.test(path.basename(root)),'behavior root ownership');
      check(fs.readdirSync(root).length===0,'unexpected behavior scratch output');fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);
    }],
  ]).catch(error=>{
    const receipt=readBehaviorFailure(error);behaviorFailures.set(error,freeze({...receipt,cleanup:clone(cleanup)}));throw error;
  });
  return {report,cleanup:freeze(cleanup)};
}
module.exports={observeIslandCompile,validateCandidate,exportContract,withCompileCleanup,readCompileFailure,
  prepareIslandBehavior,withBehaviorCleanup,readBehaviorFailure,boundedBehaviorWait:bounded,launcherPreflight,validateLauncherParent};
