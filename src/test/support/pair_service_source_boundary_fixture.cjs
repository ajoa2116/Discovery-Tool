// Source-only syntax and byte observations. No program, typecheck, emit or application load.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const SOURCE='src/core/network/pair_service.ts',PROFILE='pair-service-source-boundary-v1';
const CONFIG=Object.freeze({target:'ES2022',module:'ESNext',jsx:'ReactJSX',rewriteRelativeImportExtensions:true,
  newLine:'LineFeed',sourceMap:false,inlineSourceMap:false,declaration:false,removeComments:false,
  verbatimModuleSyntax:true,isolatedModules:true,noEmitHelpers:true,noResolve:true});
const CAPS=Object.freeze({callerSource:65536,dependencySource:131072,prospectiveOutput:65536,sourceRecord:65536,futureOutputRecord:262144});
const FLAGS=['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure'];
const EXPECTED=[
  ['../../shared/match_candidate_preview.ts',['MatchApplyPlan'],true],
  ['../../shared/identity_policy.ts',['canonicalAnchor','sharesAnchor']],
  ['../../shared/collision_state.ts',['isActiveCollision']],
  ['../../shared/address_validation.ts',['addressRelationship']],
  ['../../shared/pair_recovery.ts',['legacyRecoverySession','validRecoverySnapshot','validRecoverySession','sameAdapterConfiguration','samePhysicalAdapter']],
  ['node:crypto',['createHash']],
  ['../readiness/support_bundle.ts',['sanitizeSupportEvidence']],
  ['../../shared/identity_enrichment.ts',['observeNeighbor']],
  ['../../shared/network_match.ts',['NetworkMatchInput','networkMatchError']],
  ['./post_pair_verification.ts',['verifyAfterPair']],
  ['node:fs',[['promises','fs']]],
  ['node:path',['dirname','join']],
  ['node:os',['tmpdir']],
  ['../../types/index.ts',['Device','PairCandidate','PairSessionState','WindowsAdapterSnapshot']],
  ['../storage/project_db.ts',['SiteProjectDatabase','projectDb']],
  ['../storage/app_db.ts',['appStateDb']],
  ['../engine/diagnostic_engine.ts',['DeviceDiagnosticEngine','NodeTcpDiagnosticProvider','WindowsPingProvider','PingProvider']],
  ['../engine/device_enrichment.ts',['WindowsNeighborProvider','NeighborProvider','normalizeMacAddress']],
  ['./windows_adapter_service.ts',['NetworkConfigurationError','PowerShellWindowsNetworkAdapterService','WindowsNetworkAdapterService']],
  ['../../shared/network_relationship.ts',['pairTargetBlock','applyNetworkRelationship']],
  ['../../shared/address_validation.ts',['normalizeIPv4']],
];
const TYPE_USES=[[8,'NetworkMatchInput'],[13,'Device'],[13,'PairCandidate'],[13,'PairSessionState'],[13,'WindowsAdapterSnapshot'],[16,'PingProvider'],[17,'NeighborProvider'],[18,'WindowsNetworkAdapterService']];
const OWN=['src/test/support/pair_service_source_boundary_fixture.cjs','src/test/pair_service_source_boundary.test.cjs'];
const TARGET='../../shared/.consolidation/address-identity.generated.js';
const PINS=[
  [
    "src/core/network/pair_service.ts",
    47120,
    "bca8f42c3c7d62c508882ee2bfb28da1adb26655799a8e6dda569ca326e7d9b4"
  ],
  [
    "src/shared/match_candidate_preview.ts",
    583,
    "4f25127800a0d8ebd2a5a571916c630007daa2d65db0497c747cdd4dd0eebf68"
  ],
  [
    "src/shared/identity_policy.ts",
    3176,
    "b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614"
  ],
  [
    "src/shared/collision_state.ts",
    248,
    "46eea14e613afd6f5d9f8ccdd48b7b6c768cda389a575c95e23a3cbc3e870968"
  ],
  [
    "src/shared/address_validation.ts",
    1168,
    "e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc"
  ],
  [
    "src/shared/pair_recovery.ts",
    8010,
    "ff33dad85f5fd5184f99bb67d51bfef86f7943a905446bfc2cf1dd10c7a4ee28"
  ],
  [
    "src/core/readiness/support_bundle.ts",
    6826,
    "842150afae09dae5f54f1cc3fdc9dd1df657844c6664c9684d317af285ee357d"
  ],
  [
    "src/shared/identity_enrichment.ts",
    3050,
    "eb5689638bded7c1fc9c2f18a52d918e1d9e6256cd4fbc03a14a12b696b73b9d"
  ],
  [
    "src/shared/network_match.ts",
    1384,
    "c19ebe9bf1dbf7efe842dc37a43d2110a04f3fbac09bec41cda992859699ab76"
  ],
  [
    "src/core/network/post_pair_verification.ts",
    2717,
    "a30e3460e79738ee13f833b44be883366dd60e929f9578925be987ef856aa452"
  ],
  [
    "src/types/index.ts",
    14131,
    "d927701de585f24a11af932822db67349dd209240e4f21e0100a560bcab9bb32"
  ],
  [
    "src/core/storage/project_db.ts",
    37896,
    "8335df6f212a148961bb1ee8f3cd45cd8c68fb4cb57a67dba1d84dfa59c27670"
  ],
  [
    "src/core/storage/app_db.ts",
    2862,
    "1bb9de2ae30d27e7d648ddc74ecf702629c1965137c048dbcdf6be507f619926"
  ],
  [
    "src/core/engine/diagnostic_engine.ts",
    15259,
    "e49115f59547c945728169bbfcfc6f203a59d5bd10fb1cdf02d49024eb74609b"
  ],
  [
    "src/core/engine/device_enrichment.ts",
    10196,
    "02bf870a71355514d13f1cd9ab14c4966051e97e7913732cfa3a3f1c5161bfa8"
  ],
  [
    "src/core/network/windows_adapter_service.ts",
    13879,
    "1f9151718f7320321efe60f639c3cc7f72387f1aaa4db2ed2d5036cd3f0ce38b"
  ],
  [
    "src/shared/network_relationship.ts",
    3604,
    "680d79404729f44b135a6774590ac0db70967bf232b3e38bd7515903fce29922"
  ],
  [
    "src/core/network/match_candidate_service.ts",
    9105,
    "381e2b825d347615789131f46bdb48c3d449282fdfb1c57f93e1fd6d206ef4bc"
  ],
  [
    "package.json",
    1377,
    "22e5d98ce20a54d41bb7eb339e7b13f4b4e0061f179debad51ea9d5ce944fd7f"
  ],
  [
    "package-lock.json",
    162554,
    "b45a0f61b1576c259953a72f35987d4deb069d18bbcc34dcac3042ec8b92fa32"
  ],
  [
    "tsconfig.json",
    530,
    "3c29f34843bb9da3138864c44eef5d73fd338c864d8abbfe5ed5910dd3519ea7"
  ],
  [
    "node_modules/typescript/lib/typescript.js",
    9112572,
    "3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675"
  ],
  [
    "node_modules/typescript/package.json",
    3620,
    "822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6"
  ],
  [
    "scripts/payload-byte-catalog.cjs",
    14803,
    "016694a2797f2e20e8b68a5991323b64bcf9f68471e6e7abeec787ec0e02f10d"
  ]
];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const seal=value=>sha(JSON.stringify(value));
const same=(a,b)=>seal(a)===seal(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function check(ok,reason){if(!ok)throw Object.assign(Error('Pair source boundary denied: '+reason),{code:'PAIR_SOURCE_DENIED',reason});}
function checkPairBudget(kind,bytes){check(Object.hasOwn(CAPS,kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=CAPS[kind],'size budget '+kind);return bytes;}
const localTarget=specifier=>path.posix.normalize(path.posix.join(path.posix.dirname(SOURCE),specifier));
function expectedBindings(slot){return EXPECTED[slot][1].map(value=>{const [imported,local]=typeof value==='string'?[value,value]:value;return {imported,local,explicitTypeOnly:false,effectiveTypeOnly:EXPECTED[slot][2]===true};});}
function futureImport(slot){return {status:'UNOBSERVED',disposition:slot===0?'expected-erased-explicit-type-only':'expected-retained-ordinary-import',
  importOrdinal:slot===0?null:slot-1,specifier:slot===0?null:EXPECTED[slot][0].replace(/\.ts$/,'.js'),byteRange:null};}
function span(tree,node){return {byteStart:Buffer.byteLength(tree.text.slice(0,node.getStart(tree))),byteEnd:Buffer.byteLength(tree.text.slice(0,node.end))};}
function parse(ts,text,name,cap){checkPairBudget(cap,Buffer.byteLength(text));const tree=ts.createSourceFile(name,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);check(tree.parseDiagnostics.length===0,'source syntax '+name);return tree;}
function inspectPairSource(ts,text,dependencyTexts){
  const tree=parse(ts,text,SOURCE,'callerSource'),declarations=tree.statements.filter(ts.isImportDeclaration);
  check(declarations.length===21&&declarations.every((node,slot)=>tree.statements[slot]===node),'21 ordered header declarations');
  const imports=declarations.map((node,slot)=>{
    const c=node.importClause;check(ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text===EXPECTED[slot][0],'source specifier slot '+slot);
    check(c&&!c.name&&!node.attributes&&c.namedBindings&&ts.isNamedImports(c.namedBindings),'named import form');
    const clauseTypeOnly=c.isTypeOnly===true;
    const bindings=c.namedBindings.elements.map(n=>({imported:n.propertyName?.text??n.name.text,local:n.name.text,
      explicitTypeOnly:n.isTypeOnly===true,effectiveTypeOnly:clauseTypeOnly||n.isTypeOnly===true}));
    check(clauseTypeOnly===(EXPECTED[slot][2]===true)&&same(bindings,expectedBindings(slot)),'binding/type-only contract slot '+slot);
    return {slot,line:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1,kind:'named-static',specifier:node.moduleSpecifier.text,
      clauseTypeOnly,bindings,rawDeclaration:node.getText(tree),sourceSpan:span(tree,node),literalSpan:span(tree,node.moduleSpecifier),
      target:node.moduleSpecifier.text.startsWith('node:')?{kind:'builtin',path:node.moduleSpecifier.text}:{kind:'selected-source',path:localTarget(node.moduleSpecifier.text)},
      expectedEmission:futureImport(slot)};
  });
  const dynamic=[],typeReferences=new Map();
  const visit=node=>{
    check(!ts.isImportEqualsDeclaration(node)&&!ts.isImportTypeNode(node),'unsupported import syntax');
    if(ts.isExportDeclaration(node))check(!node.moduleSpecifier,'unexpected re-export request');
    if(ts.isTypeReferenceNode(node)&&ts.isIdentifier(node.typeName))typeReferences.set(node.typeName.text,(typeReferences.get(node.typeName.text)||0)+1);
    if(ts.isCallExpression(node)){
      check(!(ts.isIdentifier(node.expression)&&node.expression.text==='require'),'unexpected require request');
      if(node.expression.kind===ts.SyntaxKind.ImportKeyword){
        check(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='./match_candidate_service.ts','exact literal dynamic import');
        let method=node.parent;while(method&&!ts.isMethodDeclaration(method))method=method.parent;
        check(method&&ts.isIdentifier(method.name)&&method.name.text==='recheckMatch'&&ts.isClassDeclaration(method.parent)&&method.parent.name?.text==='PairService','dynamic import owner');
        check(ts.isAwaitExpression(node.parent)&&ts.isParenthesizedExpression(node.parent.parent)&&ts.isPropertyAccessExpression(node.parent.parent.parent)&&node.parent.parent.parent.name.text==='matchCandidateChecker','dynamic import member');
        const member=node.parent.parent.parent,expression=member.parent;
        check(ts.isBinaryExpression(expression)&&expression.operatorToken.kind===ts.SyntaxKind.BarBarToken&&expression.right===member&&expression.left.getText(tree)==='this.verificationOptions.matchCheckerFactory','dynamic fallback contract');
        dynamic.push({kind:'literal-dynamic-import',specifier:node.arguments[0].text,selectedTarget:'src/core/network/match_candidate_service.ts',
          ownerClass:'PairService',ownerMethod:'recheckMatch',fallbackProperty:'matchCheckerFactory',member:'matchCandidateChecker',
          line:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1,rawRequest:node.getText(tree),sourceSpan:span(tree,node),literalSpan:span(tree,node.arguments[0]),
          expectedEmission:{status:'UNOBSERVED',specifier:'./match_candidate_service.js',byteRange:null},runtimeExecution:'UNOBSERVED',resolutionAndClosure:'UNRESOLVED'});
      }
    }
    ts.forEachChild(node,visit);
  };visit(tree);check(dynamic.length===1,'sole dynamic import');
  const dependencyTrees=new Map();
  const typeUseImports=TYPE_USES.map(([slot,binding])=>{
    const target=localTarget(EXPECTED[slot][0]);check(dependencyTexts.has(target),'selected type-use dependency');
    if(!dependencyTrees.has(target))dependencyTrees.set(target,parse(ts,dependencyTexts.get(target),target,'dependencySource'));
    const targetTree=dependencyTrees.get(target),definitions=targetTree.statements.filter(n=>ts.isInterfaceDeclaration(n)&&n.name.text===binding&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
    check(definitions.length===1&&(typeReferences.get(binding)||0)>0,'observed interface/type-use '+binding);
    return {sourceSlot:slot,imported:binding,local:binding,sourceTarget:target,sourceDeclarationKind:'exported-interface',
      declarationSpan:span(targetTree,definitions[0]),typeReferenceOccurrences:typeReferences.get(binding),explicitTypeOnly:false,
      expectedImportDisposition:'retained under verbatimModuleSyntax; not reclassified',runtimeExportValidity:'UNRESOLVED'};
  });
  const islandImports=[1,3,20].map(slot=>({sourceSlot:slot,specifier:imports[slot].specifier,bindings:imports[slot].bindings,
    sourceTarget:imports[slot].target.path,expectedEmittedImportOrdinal:slot-1,expectedOriginalSpecifier:futureImport(slot).specifier,
    proposedSpecifier:TARGET,proposedTarget:'src/shared/.consolidation/address-identity.generated.js',actualOriginalRange:null,actualRedirectedRange:null}));
  return {imports,dynamicImports:dynamic,islandImports,typeUseImports,
    sourceEncoding:{kind:'UTF-8',bytes:Buffer.byteLength(text),crlfCount:(text.match(/\r\n/g)||[]).length,lfCount:(text.match(/\n/g)||[]).length,
      byteCoordinates:'current source bytes only; never emitted coordinates'},
    coverage:{sourceDeclarations:21,distinctStaticSpecifiers:20,builtinOccurrences:4,localOccurrences:17,distinctLocalTargets:16,
      explicitTypeOnlyDeclarations:1,expectedEmittedImports:20,islandOccurrences:3,dynamicImportOccurrences:1,ordinaryInterfaceTypeUseBindings:8},
    duplicateDestinationPolicy:'retain separate source slots 3 and 20; retain all three redirected declarations; never merge'};
}
function unobservedOutput(){return {status:'UNOBSERVED',text:null,bytes:null,sha256:null,importOffsets:null};}
function validateRecordData(e){
  check(e?.profile===PROFILE&&e.status==='blocked'&&FLAGS.every(key=>e[key]===false)&&e.historicalAdmission===null,'authority/profile');
  check(e.authoritativeBaseline===825&&e.ceiling===64&&e.achievedPayloadCount===null&&e.remainingCallerObligations===29,'accounting');
  check(e.budgets&&same(e.budgets.caps,CAPS),'budget claims');
  check(e.emission?.status==='UNOBSERVED'&&e.emission.compilationInvoked===false&&e.emission.expectedSourceDeclarations===21&&e.emission.expectedEmittedImports===20&&
    same(e.emission.original,unobservedOutput())&&same(e.emission.redirected,unobservedOutput()),'emission remains unobserved');
  const b=e.boundary;check(b&&Array.isArray(b.imports)&&b.imports.length===21,'complete import records');
  for(let slot=0;slot<21;slot++){
    const row=b.imports[slot];check(row&&row.slot===slot&&row.kind==='named-static'&&row.specifier===EXPECTED[slot][0]&&row.clauseTypeOnly===(slot===0)&&same(row.bindings,expectedBindings(slot))&&same(row.expectedEmission,futureImport(slot)),'record import correspondence');
  }
  check(Array.isArray(b.islandImports)&&same(b.islandImports.map(r=>r?.sourceSlot),[1,3,20])&&b.islandImports.every(r=>r.proposedSpecifier===TARGET&&r.actualOriginalRange===null&&r.actualRedirectedRange===null),'separate island occurrences');
  check(Array.isArray(b.dynamicImports)&&b.dynamicImports.length===1&&b.dynamicImports[0]?.specifier==='./match_candidate_service.ts'&&same(b.dynamicImports[0].expectedEmission,{status:'UNOBSERVED',specifier:'./match_candidate_service.js',byteRange:null})&&b.dynamicImports[0].runtimeExecution==='UNOBSERVED'&&b.dynamicImports[0].resolutionAndClosure==='UNRESOLVED','dynamic record');
  check(Array.isArray(b.typeUseImports)&&b.typeUseImports.length===8&&b.typeUseImports.every(r=>r&&r.explicitTypeOnly===false&&r.runtimeExportValidity==='UNRESOLVED'),'type-use uncertainties');
}
function preparePairSourceBoundary(repo,optIn){
  check(optIn===true,'explicit source-only opt-in');
  check(!process.env.DISCOVERY_ISLAND_GENERATED_EXECUTION&&['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].every(key=>!process.env[key]),'inherited overrides/execution');
  check(process.execArgv.every(arg=>['--test','--test-isolation=none','--test-reporter=tap'].includes(arg)),'parent flags');
  repo=path.resolve(repo);check(repo===path.resolve(__dirname,'../../..'),'fixed checkout');
  const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
  const roots=[{id:'repository',path:repo},{id:'node-runtime',path:process.execPath}];
  const refs=[...PINS.map(([path])=>({root:'repository',path})),...OWN.map(path=>({root:'repository',path})),{root:'node-runtime',path:path.basename(process.execPath)}];
  const read=()=>observeCatalogFiles(roots,refs),observations=read();check(observations.length===27,'27 selected observations');
  for(const [file,size,digest]of PINS){const row=observations.find(r=>r.root==='repository'&&r.path===file);check(row?.size===size&&row.sha256===digest,'checkpoint input '+file);}
  const verifyInputs=()=>check(same(read(),observations),'current input measurements');
  const req=createRequire(path.join(repo,'package.json')),entry=req.resolve('typescript');
  check(entry===path.join(repo,'node_modules/typescript/lib/typescript.js')&&req.resolve('typescript/package.json')===path.join(repo,'node_modules/typescript/package.json'),'parser resolution');
  check(!require.cache[entry],'parser already loaded');const cached=new Set(Object.keys(require.cache));
  try{
    const ts=req('typescript');check(ts.version==='5.9.3','parser version');
    check(Object.keys(require.cache).filter(key=>!cached.has(key)).every(key=>key===entry),'unexpected parser dependency');
    const packageBytes=fs.readFileSync(path.join(repo,'package-lock.json'),'utf8');
    check(JSON.parse(packageBytes).packages['node_modules/typescript'].version===ts.version&&JSON.parse(fs.readFileSync(path.join(repo,'node_modules/typescript/package.json'),'utf8')).version===ts.version,'parser package/lock');
    const texts=new Map();
    for(const [file,size,digest]of PINS.filter(([file])=>file.endsWith('.ts'))){
      const bytes=fs.readFileSync(path.join(repo,file));checkPairBudget(file===SOURCE?'callerSource':'dependencySource',bytes.length);
      check(bytes.length===size&&sha(bytes)===digest&&Buffer.from(bytes.toString('utf8')).equals(bytes),'consumed source bytes '+file);texts.set(file,bytes.toString('utf8'));
    }
    const boundary=inspectPairSource(ts,texts.get(SOURCE),texts),repositoryConfig=JSON.parse(fs.readFileSync(path.join(repo,'tsconfig.json'),'utf8'));
    check(repositoryConfig.compilerOptions.noEmit===true,'repository noEmit');
    const evidence=freeze({profile:PROFILE,status:'blocked',source:SOURCE,observations,selectedDependencySources:[...texts.keys()].filter(file=>file!==SOURCE),
      parser:{entry:'node_modules/typescript/lib/typescript.js',version:ts.version,purpose:'createSourceFile syntax only; no program, typecheck, transpilation or emit',node:{executable:path.basename(process.execPath),version:process.version}},
      configuration:{repository:repositoryConfig,expectedFutureEmitProfile:CONFIG,appliedEmitProfile:null},boundary,
      emission:{status:'UNOBSERVED',compilationInvoked:false,expectedSourceDeclarations:21,expectedEmittedImports:20,original:unobservedOutput(),redirected:unobservedOutput()},
      budgets:{caps:CAPS,rationale:{callerSource:'47120 pinned bytes fit 64 KiB with 18416 bytes headroom; independent of older 16 KiB fixtures.',
        dependencySource:'128 KiB per explicitly selected dependency source; transitive closure is not inferred.',
        prospectiveOutput:'64 KiB hard cap per future output, not a size prediction or permission to emit; actual emission is UNOBSERVED.',
        sourceRecord:'64 KiB for this source-only record; no full emitted text exists.',
        futureOutputRecord:'256 KiB future whole-record cap for two bounded outputs plus escaping/metadata; overflow must deny, never truncate or auto-grow.'}},
      limitations:['No compilation, emission, application load, service construction or network pairing performed.',
        'Expected erasure, import ordinals and extension rewrites are configuration-based expectations, not observed emitted facts.',
        'Ordinary imports of source interfaces remain runtime-export uncertainties; no type-only reclassification or staging omission authorized.',
        'The sole dynamic request is source syntax only; fallback execution, resolution and transitive dependency closure remain unresolved.',
        'Sequential source/tool observations do not establish authenticity, pinned consumption, runtime equivalence or facade removability.'],
      historicalAdmission:null,authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,...Object.fromEntries(FLAGS.map(key=>[key,false]))});
    validateRecordData(evidence);const json=JSON.stringify(evidence);checkPairBudget('sourceRecord',Buffer.byteLength(json));const digest=sha(json);verifyInputs();
    return Object.freeze({evidence,retained:freeze({json,sha256:digest,bytes:Buffer.byteLength(json)}),verifyInputs,
      // Unbound syntax diagnostics cannot be substituted for the captured record.
      inspectSource(text){return freeze({status:'blocked',executionAuthority:false,boundary:inspectPairSource(ts,text,texts)});},
      assess(candidate){verifyInputs();const raw=JSON.stringify(candidate);checkPairBudget('sourceRecord',Buffer.byteLength(raw));validateRecordData(candidate);check(sha(raw)===digest,'captured evidence substitution');verifyInputs();
        return freeze({status:'blocked',...Object.fromEntries(FLAGS.map(key=>[key,false])),authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,remainingCallerObligations:29,emissionStatus:'UNOBSERVED'});},
      cleanup:freeze({temporaryRootsCreated:0,outputFilesWritten:0,childProcessesStarted:0,parserCacheRestored:true})});
  }finally{if(!cached.has(entry))delete require.cache[entry];}
}
module.exports={preparePairSourceBoundary,checkPairBudget};
