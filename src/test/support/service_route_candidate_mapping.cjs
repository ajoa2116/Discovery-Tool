// Fixture descriptions only. No staging, import rewriting, admission or execution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const {members,caller,destination}=require('./service_route_static.cjs');
const {relativeSpecifier}=require('./application_caller_mapping.cjs');
const profile='service-route-candidate-mapping-v1',used=new WeakSet();
const evidencePath='PHASE_18C_7T_SERVICE_ROUTE_COMPILE_EVIDENCE.json';
const evidenceLF='6f09555ac617b8871159251e63b0bd2ab05aee160805c39535b4db43477794f9';
const tools=['scripts/staged-backend-review.cjs','scripts/staged-backend-probe.cjs'];
const sourceTests=['src/test/current_list_paths.test.ts','src/test/task_manager.test.ts','src/test/report_set_routes.test.ts',
  'src/test/report_architecture_routes.test.ts','src/test/report_route_integration.test.ts','src/test/browser/bulk_actions.cjs',
  'src/test/browser/current_list_suppression.cjs','src/test/browser/report_architecture.cjs','src/test/browser/report_set.cjs'];
const phaseSources=['src/shared/identity_policy.ts','src/shared/report_configuration.ts','src/core/tasks/task_manager.ts',
  'src/core/storage/project_history.ts','src/shared/browser_secret_redaction.ts','src/shared/collision_state.ts','src/shared/project_history.ts'];
const observedPaths=[evidencePath,...members.map(p=>p.replace(/\.js$/,'.ts')),caller.replace(/\.js$/,'.ts'),...tools,...sourceTests,
  ...phaseSources,'src/core/reporting/report_service.ts','src/core/tasks/operation_tasks.ts','src/shared/error_presentation.ts','package.json',
  'PHASE_18C_7T_SERVICE_ROUTE_STATIC_CONTRACT.md','PHASE_18C_7T_SERVICE_ROUTE_COMPILE_ONLY.md',
  'src/test/support/service_route_static.cjs','src/test/service_route_static.test.cjs'];
const clone=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>hash(a)===hash(b);
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function check(ok,reason){if(!ok)throw Object.assign(Error(reason),{code:'SERVICE_ROUTE_MAPPING_DENIED',reason});}
function parse(name,text){const tree=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,name.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
  check(!tree.parseDiagnostics.length,'mapping-source-syntax');return tree;}
function walk(node,visit){visit(node);ts.forEachChild(node,child=>{walk(child,visit);});}
function named(n){const c=n.importClause;return {default:c?.name?.text??null,namespace:c?.namedBindings&&ts.isNamespaceImport(c.namedBindings)?c.namedBindings.name.text:null,
  typeOnly:c?.isTypeOnly??false,named:c?.namedBindings&&ts.isNamedImports(c.namedBindings)?c.namedBindings.elements.map(e=>({imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly})):[],attributes:n.attributes?.getText()??null};}
function imports(tree){return tree.statements.flatMap((n,slot)=>ts.isImportDeclaration(n)?[{slot,line:tree.getLineAndCharacterOfPosition(n.getStart()).line+1,specifier:n.moduleSpecifier.text,...named(n)}]:[]);}
function initializationPhase({m,tree,current,currentFactoryCalls}){
  const direct=(slot,specifier)=>{
    const row=m.order.originalCallerSequence.filter(r=>r.slot===slot&&r.specifier===specifier);
    check(row.length===1,'phase-original-entry');return clone(row[0]);
  };
  const hasImport=(file,specifier,binding)=>{
    const row=imports(tree(file)).find(r=>r.specifier===specifier&&r.named.some(n=>n.imported===binding&&!n.typeOnly));
    check(row,'phase-source-import');return {file,import:row,measurement:current.find(o=>o.path===file),
      basis:'current-source-declaration-not-proof-of-emitted-or-executed-edge'};
  };
  const reportSlot=m.incoming.find(r=>r.target==='src/server/report_routes.js').slot;
  const entries=[
    {id:'express',originalEntry:direct(0,'./current_list_routes.js'),path:'node_modules/express/index.js',
      basis:'recorded-external-route-dependency',potentialEarlierEvaluation:false},
    {id:'operation_tasks',originalEntry:direct(9,'../core/tasks/operation_tasks.js'),path:'src/core/tasks/operation_tasks.js',
      basis:'recorded-direct-composition-entry',potentialEarlierEvaluation:true},
    {id:'identity_policy',originalEntry:direct(1,'../shared/identity_policy.js'),path:'src/shared/identity_policy.js',
      basis:'direct-entry-also-reachable-through-ReportService',potentialEarlierEvaluation:true,
      via:hasImport('src/core/reporting/report_service.ts','../../shared/identity_policy.ts','canonicalMac')},
    {id:'report_configuration',originalEntry:direct(8,'../core/tasks/task_manager.js'),path:'src/shared/report_configuration.js',
      basis:'already-reachable-through-TaskManager-also-through-ReportService',potentialEarlierEvaluation:true,
      originalVia:hasImport('src/core/tasks/task_manager.ts','../../shared/report_configuration.ts','reportGeneration'),
      via:hasImport('src/core/reporting/report_service.ts','../../shared/report_configuration.ts','reportColumns')},
    {id:'ReportService',originalEntry:direct(reportSlot,'./report_routes.js'),path:'src/core/reporting/report_service.js',
      basis:'report-route-entry-reporting-helpers-may-already-be-shared',potentialEarlierEvaluation:true,
      via:hasImport('src/core/reporting/report_service.ts','../storage/project_history.ts','ProjectHistoryService')},
    {id:'technicianErrorResponse',originalEntry:direct(reportSlot,'./report_routes.js'),path:'src/shared/error_presentation.js',
      basis:'report-route-entry-error-helpers-may-already-be-shared',potentialEarlierEvaluation:true,
      via:hasImport('src/shared/error_presentation.ts','./browser_secret_redaction.ts','redactBrowserSecrets')},
  ].map(r=>({...r,candidateDependencyEntrySlot:0,necessarilyEarlier:false,evaluationObserved:false,firstActualEvaluation:'unresolved-cache-and-transitive-path-dependent'}));
  const sourceFacts=[...phaseSources,'src/core/reporting/report_service.ts','src/core/tasks/operation_tasks.ts','src/shared/error_presentation.ts']
    .map(file=>({file,measurement:current.find(o=>o.path===file),sourceImports:imports(tree(file)),
      scope:'source-syntax-only-not-complete-runtime-closure'}));
  const deferred=[];
  for(const member of members){
    const file=member.replace(/\.js$/,'.ts'),t=tree(file),factory=m.exports.find(r=>r.origin===member&&r.name!=='REPORT_RENDERER_ID').name;
    const declaration=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===factory);
    check(declaration?.body,'phase-factory-source');
    // This bounded check does not certify the purity of transitive dependencies.
    check(t.statements.every(n=>ts.isImportDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isFunctionDeclaration(n)||
      ts.isVariableStatement(n)&&n.declarationList.declarations.every(d=>d.name.getText(t)==='REPORT_RENDERER_ID'&&ts.isStringLiteral(d.initializer))), 'phase-route-top-level-shape');
    walk(declaration.body,n=>{
      let obligation;
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='Router')obligation='router-construction';
      if(ts.isNewExpression(n)&&n.expression.getText(t)==='ReportService')obligation='ReportService-construction';
      if(ts.isNewExpression(n)&&n.expression.getText(t)==='Map')obligation='task-closure-allocation';
      if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(t)==='router'&&['get','post'].includes(n.expression.name.text))obligation='handler-registration';
      if(obligation)deferred.push({obligation,file,factory,position:n.getStart(t),expression:n.getText(t),
        sourceDesignPhase:'factory-invocation',generatedRuntimeVerified:false});
    });
  }
  for(const [id,count]of [['router-construction',4],['ReportService-construction',1],['task-closure-allocation',1],['handler-registration',10]])
    check(deferred.filter(r=>r.obligation===id).length===count,'phase-deferred-obligations');
  const registrations=[],ct=tree(caller.replace(/\.js$/,'.ts'));
  walk(ct,n=>{
    if(!ts.isCallExpression(n)||n.expression.getText(ct)!=='app.use')return;
    const first=n.arguments[0],request=first&&ts.isStringLiteral(first)?first.text:null;
    const id=first?.getText(ct)==='taskIntegration.middleware'?'task-middleware':
      ({'/api/tasks':'task-router','/api/current-list':'current-list','/api/report-set':'report-set','/api/reports':'report'})[request];
    if(id)registrations.push({id,position:n.getStart(ct),expression:n.getText(ct),basis:'source-call-order-not-executed-registration'});
  });
  check(same(registrations.map(r=>r.id),['task-middleware','task-router','current-list','report-set','report']),'phase-registration-order');
  return {version:1,profile:'service-route-initialization-phase-v1',purpose:'risk-description-not-equivalence-certification',entries,sourceFacts,
    dependencyEntryIsEvaluationTimeline:false,runtimeEvaluationProof:false,completeTransitiveClosure:false,
    occurrenceAccounting:'seven-import-occurrences-do-not-mean-seven-module-evaluations',
    dependencyResolution:'source-type-uses-are-not-automatically-emitted-edges',
    deferred:{sourceFacts:deferred,requiredObligations:['router-construction','ReportService-construction','task-closure-allocation','handler-activity'],
      handlerActivityPhase:'request-or-callback-invocation-after-factory-registration',generatedRuntimeVerified:false},
    factoryOrder:currentFactoryCalls.map(r=>r.name),registrationOrder:registrations,
    unknowns:{completeTransitiveCycles:'unresolved',canonicalResolutionAndCacheIdentity:'unproven',liveBindings:'unproven',
      exportedMutableConfigurationIdentity:'unproven-retain-shared-external-objects',importLinkEvaluationFailureTiming:'unproven-phases-distinct',
      mixedOriginalGeneratedIdentity:'unproven-no-duplicate-implementations',fullBehavioralEquivalence:'unproven'},
    failureBoundary:'linking-may-fail-before-evaluation-evaluation-errors-are-outside-route-handler-catches',
    executionAuthority:false,admissionAuthority:false,productionReady:false};
}
function loadInput(repo){
  // Explicit repository paths only. Never follow the archival paths inside JSON.
  const roots=[{id:'repository',path:fs.realpathSync(repo)}],refs=observedPaths.map(path=>({root:'repository',path}));
  const before=observeCatalogFiles(roots,refs),files=Object.fromEntries(observedPaths.map(p=>[p,fs.readFileSync(path.join(repo,p),'utf8')]));
  check(same(before,observeCatalogFiles(roots,refs)),'mapping-read-changed');
  return {roots,observations:before,files};
}
function derive(input){
  check(same(Object.keys(input.files).sort(),[...observedPaths].sort()),'mapping-input-set');
  check(input.roots.length===1&&input.roots[0].id==='repository','mapping-root');
  const current=observeCatalogFiles(input.roots,observedPaths.map(path=>({root:'repository',path})));
  check(same(current,input.observations),'mapping-current-identity');
  for(const o of current)check(typeof input.files[o.path]==='string'&&digest(input.files[o.path])===o.sha256,'mapping-current-bytes');
  const text=p=>input.files[p],tree=p=>parse(p,text(p));
  check(digest(text(evidencePath).replace(/\r\n/g,'\n'))===evidenceLF,'mapping-archival-record');
  const e=JSON.parse(text(evidencePath)),m=e.intent.contract.model;
  check(e.executionAuthority===false&&e.productionAuthority===false&&e.productionReady===false&&e.compilerInvocations===1&&
    e.decision==='GO-NON-EXECUTING-REVIEW'&&e.cleanup.rootAbsent===true,'mapping-evidence-authority');
  check(e.output.path===destination&&e.output.size===9497&&e.output.sha256==='3feedc565c11808b57d773ff87c784deb641dbd2ce7222a2563e19c70ae6ea57', 'mapping-historical-output');
  const rawMeta=JSON.parse(e.rawMetafile);
  check(digest(e.rawMetafile)===e.metafile.sha256&&same(rawMeta.inputs,e.compilerInputMetadata)&&same(rawMeta.outputs,e.compilerOutputMetadata),'mapping-metafile');
  check(m.incoming.length===4&&same(m.incoming.map(r=>r.slot),[0,10,50,51])&&m.exports.length===5&&m.external.length===7&&
    m.sourceCorrespondence.length===13&&m.uncertainty.length===4&&m.globalUncertainty.staging===4736&&m.globalUncertainty.inventory===882,'mapping-historical-coverage');
  const sourceMeasurements=m.inputs.map(r=>{
    const p=r.provenance.source,raw=digest(text(p)),lf=digest(text(p).replace(/\r\n/g,'\n'));
    check(raw===r.provenance.sourceSha256||lf===r.provenance.sourceSha256,'mapping-source-correspondence');
    return {path:p,current:current.find(o=>o.path===p),historicalProvenance:clone(r.provenance),rawHistoricalMatch:raw===r.provenance.sourceSha256,
      lfDiagnosticMatches:lf===r.provenance.sourceSha256,identityTransferred:false};
  });
  const sourceCaller=caller.replace(/\.js$/,'.ts'),callerImports=imports(tree(sourceCaller));
  const mappings=m.incoming.map((r,occurrence)=>{
    const source=r.sourceOccurrence,match=callerImports.filter(n=>n.specifier===source.edge.specifier&&n.line===source.edge.line);
    check(match.length===1&&same(match[0].named,r.named)&&!match[0].default&&!match[0].namespace&&!match[0].typeOnly&&!match[0].attributes,'mapping-caller-source');
    return {occurrence,sourceOccurrence:clone(source),currentSourceImport:match[0],historicalEmittedImport:clone(r),origin:r.target,
      candidate:{path:destination,specifier:relativeSpecifier(caller,destination),named:clone(r.named),slot:r.slot,mergeDeclarations:false},
      rewrittenCaller:{path:caller,sha256:null,identity:null,review:'missing'}};
  });
  const currentFactoryCalls=[];
  walk(tree(sourceCaller),n=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&m.order.originalFactoryCalls.some(f=>f.name===n.expression.text))
    currentFactoryCalls.push({name:n.expression.text,position:n.getStart(),expression:n.getText()});});
  check(same(currentFactoryCalls.map(r=>r.name),m.order.originalFactoryCalls.map(r=>r.name)),'mapping-factory-order');
  const literalRefs=(p,probe)=>{
    const t=tree(p),rows=[];
    walk(t,n=>{
      if(!ts.isStringLiteral(n))return;
      const original=members.find(f=>n.text===f||(!probe&&n.text===path.posix.basename(f,'.js')));if(!original)return;
      let parent=n;while(parent&&!ts.isVariableDeclaration(parent))parent=parent.parent;
      const context=parent?.name?.getText(t)??null;
      if(probe)check(ts.isCallExpression(n.parent)&&n.parent.expression.getText(t)==='load'&&n.parent.arguments[0]===n,'mapping-probe-form');
      else check((n.text===original&&context==='initialProjects')||(n.text!==original&&context==='additions'&&
        ts.isPropertyAssignment(n.parent.parent)&&n.parent.parent.name.text==='src/server/'),'mapping-review-form');
      rows.push({original,position:n.getStart(),line:t.getLineAndCharacterOfPosition(n.getStart()).line+1,literal:n.text,context,
        candidatePath:destination,disposition:probe?'candidate-only-load-description-not-invoked':'candidate-review-required-no-inherited-admission'});
    });return rows;
  };
  const toolBoundaries=tools.map((p,index)=>{
    const refs=literalRefs(p,index===1),recorded=m.toolConsumers.find(r=>r.file===p),generic=[];
    walk(tree(p),n=>{if(ts.isIdentifier(n)&&n.text==='reviewedProjects')generic.push({position:n.getStart(),line:n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line+1});});
    check(refs.length===(index===0?4:3)&&same(refs.map(r=>r.original).sort(),[...recorded.references].sort())&&generic.length>0,'mapping-tool-coverage');
    return {file:p,current:current.find(o=>o.path===p),historicalToolSha256:recorded.sha256,rawHistoricalMatch:digest(text(p))===recorded.sha256,
      historicalIdentityOrReviewTransferred:false,references:refs,genericReviewedProjectReferences:generic,shipped:false,behaviorChanged:false};
  });
  const sourceCompatibility=sourceTests.map(p=>{
    const t=tree(p),refs=[];
    walk(t,n=>{if(!ts.isStringLiteral(n)||!n.text.startsWith('.'))return;
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(p),n.text));
      if(members.some(f=>f.replace(/\.js$/,'.ts')===target))refs.push({position:n.getStart(),specifier:n.text,target});});
    check(refs.length>0,'mapping-source-test-reference');
    return {file:p,current:current.find(o=>o.path===p),references:refs,disposition:'retain-original-typescript-source-tests',shippedRuntimeFile:false,
      validatesGeneratedCandidate:false};
  });
  const compilerOrder=['src/server/current_list_routes.js','src/server/task_routes.js','src/server/report_set_routes.js','src/server/report_routes.js'];
  const available=e.emittedImports.map((r,index)=>({index,...r})),taken=new Set();
  const externalOccurrences=m.external.map((r,occurrence)=>{
    const candidates=available.filter(v=>v.specifier===r.specifier&&!taken.has(v.index));
    // Compiler source-module order is independent of the archived occurrence-list order.
    const sameSpecifier=m.external.filter(v=>v.specifier===r.specifier).sort((a,b)=>compilerOrder.indexOf(a.importer)-compilerOrder.indexOf(b.importer));
    const emitted=available.filter(v=>v.specifier===r.specifier)[sameSpecifier.indexOf(r)];
    check(candidates.length>0&&emitted&&!taken.has(emitted.index)&&same(emitted.bindings.map(b=>b.imported),r.named.map(b=>b.imported)),'mapping-external-correspondence');
    taken.add(emitted.index);
    return {occurrence,source:clone(r),compilerImport:emitted,retainedExternal:true,incorporated:false};
  });
  check(taken.size===7&&e.emittedExports.length===5&&same(e.emittedExports.map(r=>r.exported).sort(),m.exports.map(r=>r.name).sort()),'mapping-compiler-coverage');
  const externalCurrent=['src/core/reporting/report_service.ts','src/shared/error_presentation.ts','src/core/tasks/operation_tasks.ts'].map(p=>({path:p,
    current:current.find(o=>o.path===p),imports:imports(tree(p)),disposition:'current-source-observation-not-historical-emitted-admission'}));
  const initialization=initializationPhase({m,tree,current,currentFactoryCalls});
  return clone({version:1,profile,purpose:'candidate-only-static-compatibility',measurements:current,sourceMeasurements,
    historicalEvidence:{file:evidencePath,current:current.find(o=>o.path===evidencePath),recordDigest:hash(e),archivedOutput:clone(e.output),
      liveOutputAvailable:false,currentAdmission:false,compilerInvocationPerformed:false},
    callerMappings:mappings,completeCurrentCallerImports:callerImports,currentFactoryCalls,exports:m.exports,externalOccurrences,toolBoundaries,sourceCompatibility,externalCurrent,
    initializationPhase:initialization,
    preservedEvidence:{sourceCorrespondence:m.sourceCorrespondence,routeUncertainty:m.uncertainty,globalUncertainty:m.globalUncertainty,
      historicalCallerImports:m.callerImports,historicalFactoryCalls:m.order.originalFactoryCalls,packageBoundary:m.packageBoundary,
      rootMetadata:m.metadata,currentRootMetadata:current.find(o=>o.path==='package.json')},
    candidateOutput:{path:destination,format:'esm',sha256:null,identity:null,size:null,status:'unbuilt-unadmitted',independentReview:'missing'},
    semantics:{liveBindings:'required-unproven',evaluationOrder:'all-dependencies-may-initialize-at-first-caller-import',moduleIdentity:'unproven-one-canonical-generated-url-required',
      factoryAndMiddlewareOrder:'preserve-exact-calls-and-mounts',sourceTests:'not-generated-runtime-tests',errorBoundaries:'preserve-existing-handler-scopes-unproven',runtimeEquivalence:'unproven'},
    physical:{authoritativeBaseline:825,replacedOriginals:members,generatedOutputs:[destination],compatibilityFiles:[],retainedOriginals:[],additionalGeneratedOutputs:[],
      rewrittenExistingCallers:[caller],netSaved:3,conditionalCandidate:822,achievedPayload:null,admittedPayload:null,ceiling:64,ceilingMet:false},
    executionAuthority:false,productionAuthority:false,productionReady:false,selectionAndAdmissionChanged:false});
}
function createAssessment(input,candidate){
  check(candidate&&typeof candidate==='object'&&!used.has(candidate),'mapping-owner-reuse');used.add(candidate);
  const reserved=hash({input,candidate});let terminal=false;
  return Object.freeze({assess(){
    const deny=reason=>{terminal=true;return freeze({version:1,profile,status:'denied',reason,executionAuthority:false,productionAuthority:false,productionReady:false});};
    if(terminal)return deny('mapping-sticky-denial');
    try{
      check(hash({input,candidate})===reserved,'mapping-post-reservation-mutation');
      const expected=derive(input);
      check(candidate.executionAuthority===false&&candidate.productionAuthority===false&&candidate.productionReady===false&&candidate.selectionAndAdmissionChanged===false,'mapping-authority');
      check(same(candidate.historicalEvidence,expected.historicalEvidence)&&same(candidate.candidateOutput,expected.candidateOutput),'mapping-no-historical-admission');
      check(Array.isArray(candidate.callerMappings)&&candidate.callerMappings.length===4,'mapping-caller-count');
      check(new Set(candidate.callerMappings.map(r=>r.occurrence)).size===4,'mapping-caller-duplicate');
      check(same(candidate.callerMappings,expected.callerMappings)&&same(candidate.completeCurrentCallerImports,expected.completeCurrentCallerImports)&&same(candidate.currentFactoryCalls,expected.currentFactoryCalls),'mapping-caller-correspondence');
      check(same(candidate.exports,expected.exports),'mapping-exports');
      check(same(candidate.externalOccurrences,expected.externalOccurrences),'mapping-external-occurrences');
      check(same(candidate.toolBoundaries,expected.toolBoundaries),'mapping-tool-boundaries');
      check(same(candidate.sourceCompatibility,expected.sourceCompatibility),'mapping-source-compatibility');
      check(same(candidate.initializationPhase,expected.initializationPhase),'mapping-initialization-phase');
      check(candidate.physical?.retainedOriginals?.length===0,'mapping-duplicate-shipped-implementation');
      check(same(candidate.physical,expected.physical),'mapping-overhead-or-accounting');
      check(same(candidate,expected),'mapping-contract-correspondence');terminal=true;
      return freeze({version:1,profile,status:'blocked',candidateMapping:'structurally-consistent-only',executionAuthority:false,productionAuthority:false,productionReady:false,
        selectionAndAdmissionChanged:false,candidate:clone(expected),blockers:['initialization-and-runtime-equivalence-unproven','current-generated-bytes-and-independent-review-missing',
          'service-route-admission-profile-absent','exact-owned-consumer-binding-missing','physical-manifest-ceiling'],
        coverage:{callers:4,exports:5,externalOccurrences:7,reviewReferences:4,probeReferences:3,sourceTestFiles:9},physical:clone(expected.physical)});
    }catch(err){return deny(err.reason??'mapping-invalid-record');}
  }});
}
module.exports={profile,loadInput,derive,createAssessment,observedPaths};
