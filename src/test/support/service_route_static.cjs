// Static fixture descriptions only. Historical JS is parsed as text, never loaded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord}=require('../../../scripts/stage-backend.cjs');
const {verifyCatalog,observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const {relativeSpecifier}=require('./application_caller_mapping.cjs');
const profile='service-route-static-v1',caller='src/server/backend_application.js';
const members=['current_list_routes','report_routes','report_set_routes','task_routes'].map(n=>'src/server/'+n+'.js');
const exportsByFile=[['createCurrentListRouter'],['REPORT_RENDERER_ID','createReportRouter'],['createReportSetRouter'],['taskHttpIntegration']];
const pinned=['0f025aeb5f1a0dfcd7c334a7ca7ad271dacbbf171dfd962ad70e9f898dbcb1fb','0f9995779fefd57955ae782a70e42cbbf3d3cc761bd12ef359c99bb3122852c6','17ac1741cf26bb5b2eb3ce95d66685cb3b654fd12dd51712e4af39f863813b57','2ea6946ef101e81f20569d43061c3c7f91252c564850139b842d8411c22ad337','9a355e4ecd98a1fc19eacb789706c23b114d1fbd095cc908c31ab36aef258f8f'];
const destination='src/server/service_routes.generated.js',owners=new WeakSet();
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>hash(a)===hash(b);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function check(ok,reason){if(!ok)throw Object.assign(Error(reason),{reason,code:'SERVICE_ROUTE_DENIED'});}
function parse(name,text){const tree=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,name.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);check(!tree.parseDiagnostics.length,'syntax');return tree;}
function imports(tree){return tree.statements.flatMap((n,slot)=>ts.isImportDeclaration(n)?[{
  slot,line:tree.getLineAndCharacterOfPosition(n.getStart(tree)).line+1,specifier:n.moduleSpecifier.text,
  default:n.importClause?.name?.text??null,namespace:n.importClause?.namedBindings&&ts.isNamespaceImport(n.importClause.namedBindings)?n.importClause.namedBindings.name.text:null,
  typeOnly:n.importClause?.isTypeOnly??false,attributes:n.attributes?.getText(tree)??null,
  named:n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)?n.importClause.namedBindings.elements.map(e=>({imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly})):[],
}]:[]);}
function target(file,spec){return spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):null;}
function exported(tree){return tree.statements.flatMap(n=>{
  if(!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))return [];
  check(!n.modifiers.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword),'default-export');
  if(ts.isFunctionDeclaration(n))return [n.name.text];
  check(ts.isVariableStatement(n),'unsupported-export');
  return n.declarationList.declarations.map(d=>{check(ts.isIdentifier(d.name),'export-pattern');return d.name.text;});
});}
function loadEvidence(root,repo){
  const json=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
  const baseline={manifest:json('before/stage-manifest.json'),inventory:json('before/inventory.json'),catalog:json('before-byte-catalog.json'),provenance:json('selected-provenance.json')};
  const roots=[{id:'stage',path:path.join(root,'before')}];verifyCatalog(baseline.catalog,roots);
  const text={};for(const f of baseline.provenance.files.filter(f=>f.status==='transpiled'))text[f.output]=fs.readFileSync(path.join(root,'before',f.output),'utf8');
  const sources={};for(const f of [...members,caller])sources[f.replace(/\.js$/,'.ts')]=fs.readFileSync(path.join(repo,f.replace(/\.js$/,'.ts')),'utf8');
  const tools={};for(const n of ['scripts/staged-backend-review.cjs','scripts/staged-backend-probe.cjs'])tools[n]=fs.readFileSync(path.join(repo,n),'utf8');
  const refs=[...members,caller,'package.json'].map(path=>({root:'stage',path}));
  return {baseline,text,sources,tools,observations:observeCatalogFiles(roots,refs)};
}
function derive(e){
  const {baseline:b,text,sources,tools}=e,{manifest:m,inventory:i,catalog:c,provenance:p}=b;
  check(m.productionAuthority===false&&m.completeClosure===false&&i.productionAuthority===false&&c.productionAuthority===false,'authority');
  const selected=m.candidates.filter(f=>f.output);
  check(selected.length===825&&p.files.length===825&&c.entries.length===827&&c.totalBytes===17152182,'baseline-count');
  check(m.unresolved.length===4736&&i.unresolved.length===882&&same(c.unresolved.staging,m.unresolved),'uncertainty');
  const selectedPaths=selected.map(f=>f.output);check(new Set(selectedPaths.map(s=>s.toLowerCase())).size===825,'duplicate-baseline');
  for(const f of selected){
    const pr=p.files.filter(g=>g.output===f.output),ce=c.entries.filter(g=>g.root==='stage'&&g.path===f.output);
    check(pr.length===1&&ce.length===1&&pr[0].source===f.source&&pr[0].status===f.status&&same(pr[0].selectionReasons,f.selectionReasons)&&pr[0].outputSha256===ce[0].sha256&&pr[0].outputIdentity.bytes===ce[0].size,'baseline-correspondence');
  }
  const emitted=p.files.filter(f=>f.status==='transpiled');check(emitted.length===97&&Object.keys(text).length===97,'emitted-coverage');
  const trees=new Map();
  for(const f of emitted){check(crypto.createHash('sha256').update(text[f.output]).digest('hex')===f.outputSha256,'emitted-hash');trees.set(f.output,parse(f.output,text[f.output]));}
  const inputs=[...members,caller].map((name,j)=>{
    const pr=p.files.find(f=>f.output===name);check(pr?.outputSha256===pinned[j],'pinned-input');
    const obs=e.observations.filter(o=>o.root==='stage'&&o.path===name);
    check(obs.length===1&&obs[0].sha256===pr.outputSha256&&obs[0].size===pr.outputIdentity.bytes,'input-observation');
    const source=pr.source,raw=sources[source];check(typeof raw==='string','source-missing');
    const rawHash=crypto.createHash('sha256').update(raw).digest('hex'),lfHash=crypto.createHash('sha256').update(raw.replace(/\r\n/g,'\n')).digest('hex');
    check(rawHash===pr.sourceSha256||(name===caller&&lfHash===pr.sourceSha256),'source-hash');
    return {provenance:clone(pr),currentRecoveryObservation:clone(obs[0]),currentSourceSHA256:rawHash,historicalSourceExact:rawHash===pr.sourceSha256,lfDiagnosticMatches:lfHash===pr.sourceSha256};
  });
  const metadata=c.entries.find(f=>f.root==='stage'&&f.path==='package.json'),metaObs=e.observations.find(o=>o.path==='package.json');
  check(metadata&&metaObs?.sha256===metadata.sha256&&metaObs.size===metadata.size,'metadata');
  const incoming=[];
  for(const [file,tree]of trees)for(const n of imports(tree))if(members.includes(target(file,n.specifier)))incoming.push({file,...n,target:target(file,n.specifier)});
  check(incoming.length===4&&incoming.every(n=>n.file===caller&&!n.default&&!n.namespace&&!n.attributes&&!n.typeOnly&&n.named.length===1),'incoming-coverage');
  const sourceIncoming=i.references.flatMap((edge,occurrence)=>members.map(s=>s.replace(/\.js$/,'.ts')).includes(edge.resolvedPath)?[{occurrence,edge}]:[]);
  check(sourceIncoming.length===4&&sourceIncoming.every(r=>r.edge.source===caller.replace(/\.js$/,'.ts')),'source-caller-coverage');
  const callerImports=imports(trees.get(caller));
  const factoryNames=new Set(['createCurrentListRouter','taskHttpIntegration','createReportSetRouter','createReportRouter']),factoryCalls=[];
  const callerTree=trees.get(caller);
  const visitCalls=node=>{
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&factoryNames.has(node.expression.text))
      factoryCalls.push({name:node.expression.text,line:callerTree.getLineAndCharacterOfPosition(node.getStart(callerTree)).line+1,position:node.getStart(callerTree),expression:node.getText(callerTree)});
    ts.forEachChild(node,visitCalls);
  };visitCalls(callerTree);
  check(factoryCalls.length===4&&new Set(factoryCalls.map(f=>f.name)).size===4,'factory-call-coverage');
  for(const n of incoming){
    const source=sourceIncoming.filter(r=>r.edge.resolvedPath===n.target.replace(/\.js$/,'.ts'));check(source.length===1,'caller-source-mapping');
    const si=imports(parse(source[0].edge.source,sources[source[0].edge.source])).filter(v=>v.line===source[0].edge.line&&v.specifier===source[0].edge.specifier);
    check(si.length===1&&same(si[0].named,n.named),'caller-binding');
    check(n.named[0].imported===exportsByFile[members.indexOf(n.target)].find(v=>v!=='REPORT_RENDERER_ID')&&n.named[0].local===n.named[0].imported,'caller-alias');
    n.sourceOccurrence=clone(source[0]);n.proposedSpecifier=relativeSpecifier(caller,destination);
  }
  const sourceEdges=i.references.flatMap((edge,occurrence)=>members.map(s=>s.replace(/\.js$/,'.ts')).includes(edge.source)?[{occurrence,edge}]:[]);
  check(sourceEdges.length===13&&sourceEdges.every(r=>r.edge.kind==='static-import'),'source-edge-coverage');
  const external=[],exports=[],correspondence=[];
  for(let j=0;j<members.length;j++){
    const file=members[j],tree=trees.get(file),names=exported(tree);check(same(names,exportsByFile[j]),'exports');
    exports.push(...names.map(name=>({name,origin:file})));
    for(const s of tree.statements){
      if(ts.isImportDeclaration(s)||ts.isFunctionDeclaration(s))continue;
      check(ts.isVariableStatement(s)&&s.declarationList.declarations.every(d=>ts.isStringLiteral(d.initializer)),'top-level-effects');
    }
    const scan=node=>{
      check(!ts.isMetaProperty(node)&&!ts.isExportDeclaration(node),'unsupported-module-operation');
      if(ts.isCallExpression(node)||ts.isNewExpression(node))check(!/(^|\.)(import|require|eval|Function|URL|Worker|readFile|readFileSync|spawn|exec|fork)$/.test(node.expression.getText(tree)),'unsupported-loader-or-asset');
      ts.forEachChild(node,scan);
    };scan(tree);
    const si=imports(parse(file.replace(/\.js$/,'.ts'),sources[file.replace(/\.js$/,'.ts')]));
    for(const row of sourceEdges.filter(r=>r.edge.source===file.replace(/\.js$/,'.ts'))){
      const sourceImport=si.filter(v=>v.line===row.edge.line&&v.specifier===row.edge.specifier);check(sourceImport.length===1,'source-import');
      const matches=imports(tree).filter(v=>v.specifier===row.edge.specifier.replace(/\.ts$/,'.js'));
      check(matches.length<=1,'duplicate-emitted-edge');
      if(matches.length){check(matches[0].named.every(v=>sourceImport[0].named.some(s=>same(s,v))),'emitted-binding');}
      correspondence.push({...clone(row),emitted:clone(matches),disposition:matches.length?'emitted-runtime-candidate':'absent-from-exact-emitted-imports-not-reclassified'});
    }
    for(const n of imports(tree)){
      check(correspondence.some(r=>r.edge.source===file.replace(/\.js$/,'.ts')&&r.emitted.some(v=>same(v,n))),'unrepresented-emitted-edge');
      check(!n.default&&!n.namespace&&!n.attributes&&!n.typeOnly,'external-form');
      const resolved=target(file,n.specifier)??(n.specifier==='express'?'node_modules/express/index.js':null);
      check(resolved&&!members.includes(resolved),'external-target');
      const pr=p.files.find(f=>f.output===resolved),ce=c.entries.find(f=>f.path===resolved&&f.root==='stage');check(pr&&ce&&pr.outputSha256===ce.sha256,'external-measurement');
      external.push({importer:file,...n,resolved,retainedMeasurement:clone(ce),historicalProvenance:clone(pr)});
    }
  }
  check(exports.length===5&&new Set(exports.map(x=>x.name)).size===5&&external.length===7,'export-edge-count');
  const uncertainty=m.unresolved.flatMap((record,occurrence)=>members.map(s=>s.replace(/\.js$/,'.ts')).includes(record.source)?[{occurrence,record}]:[]);
  check(uncertainty.length===4&&uncertainty.every(r=>r.record.reason==='package-conditions-and-runtime-resolution-unverified'),'route-uncertainty');
  const toolConsumers=Object.entries(tools).map(([file,body])=>({file,sha256:crypto.createHash('sha256').update(body).digest('hex'),references:members.filter(s=>body.includes(s)||body.includes("'"+path.posix.basename(s,'.js')+"'")),disposition:'non-shipped-review-probe-mapping-required-before-use'}));
  check(toolConsumers.length===2&&toolConsumers.every(t=>t.references.length),'tool-consumers');
  check(!selectedPaths.includes(destination),'replacement-overlap');
  return {version:1,profile,baselineSha256:hash(b),inputs,metadata:clone(metadata),incoming,callerImports,exports,sourceCorrespondence:correspondence,external,
    uncertainty,globalUncertainty:{staging:4736,inventory:882,stagingSha256:hash(m.unresolved),inventorySha256:hash(i.unresolved)},
    packageBoundary:{request:'express',package:clone(m.packages.find(v=>v.path==='node_modules/express')),metadata:clone(c.entries.find(v=>v.path==='node_modules/express/package.json')),dependencies:clone(m.dependencies.filter(v=>v.parent==='node_modules/express')),allExternalFilesRetained:true},
    toolConsumers,order:{originalCallerSequence:callerImports.map(n=>({slot:n.slot,specifier:n.specifier})),preserveCallerDeclarationSlots:true,mergeCallerImports:false,
      originalFactoryCalls:factoryCalls,preserveFactoryInvocationOrder:true,preserveLiveBindings:true,externalModules:'retain-original-objects-no-inlining-or-duplication',evaluationEquivalence:'unproven-interleaved-import-initialization-may-move-earlier',runtimeEquivalence:'unproven'},
    physical:{originals:4,bundle:1,mandatoryFacades:[],retainedOriginals:[],additionalShippedFiles:[],sharedMetadataRetained:true,externalDependenciesRetained:true,netSaved:3},
    output:{path:destination,format:'esm',size:null,sha256:null,identity:null,status:'unbuilt-unadmitted'},
    generatedDescription:createGeneratedArtifactRecord({outputs:[],sources:inputs.slice(0,4).map(x=>x.provenance)},[]),
    prerequisites:['review-exact-compiled-output-and-provenance','validate-evaluation-order-and-runtime-equivalence-before-execution','independent-generated-admission-missing','exact-owned-consumer-binding-missing','adapt-review-probe-mappings-without-transferring-admission'],
    executionAuthority:false,productionAuthority:false,productionReady:false};
}
function createAssessment(e,model){
  check(model&&typeof model==='object'&&!owners.has(model),'owner-reuse');owners.add(model);
  const snapshot=hash({e,model});let terminal=false;
  const deny=reason=>freeze({status:'denied',reason,executionAuthority:false,productionAuthority:false,productionReady:false});
  return Object.freeze({assess(){
    if(terminal)return deny('sticky-denial');terminal=true;
    try{check(hash({e,model})===snapshot,'post-reservation-mutation');const expected=derive(e);
      check(same(model,expected),'contract-substitution');
      const extras=model.physical.mandatoryFacades.length+model.physical.retainedOriginals.length+model.physical.additionalShippedFiles.length;
      check(4-1-extras>=1,'no-positive-saving');
      return freeze({status:'blocked',investigationDecision:'GO-COMPILE-ONLY',executionAuthority:false,productionAuthority:false,productionReady:false,
        candidateNetSaved:4-1-extras,authoritativeFiles:825,globalPayloadCount:null,ceilingMet:false,selectionAndAdmissionChanged:false,model:clone(expected)});
    }catch(err){return deny(err.reason??err.code??'invalid-evidence');}
  }});
}
module.exports={profile,members,caller,destination,loadEvidence,derive,createAssessment};
