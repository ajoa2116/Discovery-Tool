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
const readCompileFailure=error=>error&&typeof error==='object'?failureReceipts.get(error)??null:null;
async function withCompileCleanup(work,{steps,cleanup,phase}){
  let result,error,failed=false;const cleanupFailures=[];
  try{result=await work();}catch(original){error=original;failed=true;}
  for(const [name,run]of steps)try{await run();}catch(original){cleanupFailures.push(name);if(!failed){error=original;failed=true;}}
  if(failed){
    if(error&&typeof error==='object')failureReceipts.set(error,freeze({phase:phase(),cleanup:clone(cleanup),cleanupFailures,
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
async function observeIslandCompile(repo,optIn){
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
  let guards,esbuild,result,report,expected,phase='fixture-setup';
  await withCompileCleanup(async()=>{
    process.env.TEMP=root;process.env.TMP=root;process.env.ESBUILD_BINARY_PATH=compiler;
    guards=installGuards(root,compiler,version,child=>{
      const record={closed:false};record.done=new Promise(resolve=>child.once('close',()=>{record.closed=true;resolve();}));children.push(record);
    },()=>phase);
    phase='tool-load';esbuild=req('esbuild');phase='build';
    result=await esbuild.build({...configuration,tsconfig:path.join(repo,'tsconfig.json'),absWorkingDir:repo,
      stdin:{contents:entry,sourcefile:'island-entry.ts',resolveDir:repo,loader:'ts'},outfile:path.join(root,'address-identity.generated.js'),logLevel:'silent'});
    phase='post-build-shape';check(result.outputFiles.length===1,'actual output count');
    const output=result.outputFiles[0];check(output.path===path.join(root,'address-identity.generated.js'),'actual output path');
    const measured={path:'address-identity.generated.js',bytes:output.contents.byteLength,sha256:sha(output.contents)};
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
    ['children-close',async()=>{await Promise.all(children.map(c=>c.done));cleanup.childCount=children.length;cleanup.closedChildCount=children.filter(c=>c.closed).length;cleanup.childrenClosed=children.every(c=>c.closed);}],
    ['instrumentation-restore',()=>{if(guards){cleanup.activity=clone(guards.activity);cleanup.deniedProcesses=guards.readProcessDenials();cleanup.rollupProbeRefusals=guards.readRollupProbeRefusal();guards.restore();cleanup.instrumentationRestored=true;}}],
    ['environment-restore',()=>{for(const [key,value]of Object.entries(environment))if(value===undefined)delete process.env[key];else process.env[key]=value;cleanup.environmentRestored=true;}],
    ['root-cleanup',()=>{checked(root);check(path.dirname(root)===parent&&/^discovery-island-compile-/.test(path.basename(root))&&cleanup.childrenClosed,'cleanup ownership');check(fs.readdirSync(root).length===0,'unexpected scratch output');fs.rmdirSync(root);cleanup.rootRemoved=!fs.existsSync(root);}],
  ]});
  // No generated JS is persisted. The generic record is explicitly synthetic/non-admitted metadata.
  const record=createGeneratedArtifactRecord({profile:report.profile,outputs:[report.output],sources:report.sources,compiler:report.tool},[]);
  const captured=hash(report);freeze(report);freeze(expected);
  return {report,record:freeze(record),cleanup:freeze(cleanup),assess(candidate){check(hash(candidate)===captured,'captured evidence changed');check(hash(before)===hash(observeCatalogFiles(rootSpec,refs)),'current inputs changed');return validateCandidate(candidate,expected);}};
}
module.exports={observeIslandCompile,validateCandidate,exportContract,withCompileCleanup,readCompileFailure};
