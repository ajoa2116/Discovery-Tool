// Fixture-only static import descriptions. No rewrite, compilation or module load.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {observeCatalogFiles,verifyCatalog}=require('../../../scripts/payload-byte-catalog.cjs');
const {derive:deriveIsland,createIslandAssessment,members}=require('./application_island_model.cjs');
const profile='address-identity-caller-mapping-v1',owners=new WeakSet();
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function relativeSpecifier(importer,target){
  for(const p of [importer,target])if(typeof p!=='string'||p!==p.normalize('NFC')||p!==path.posix.normalize(p)||p.startsWith('/')||
    /[\\\x00-\x1f<>:"|?*#%]/.test(p)||p.split('/').some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)))
    throw Object.assign(Error('caller-target-ambiguity'),{code:'CALLER_MAPPING_DENIED',reason:'caller-target-ambiguity'});
  let specifier=path.posix.relative(path.posix.dirname(importer),target);
  // A dot-prefixed directory name is NOT an ESM relative specifier.
  if(!specifier.startsWith('./')&&!specifier.startsWith('../'))specifier='./'+specifier;
  return specifier;
}
function callerRefs(baseline){
  const edges=baseline.inventory.references.filter(e=>members.some(p=>e.resolvedPath===p+'.ts')&&!members.some(p=>e.source===p+'.ts'));
  const sources=[...new Set(edges.map(e=>e.source))].sort();
  const emitted=sources.map(s=>baseline.provenance.files.find(f=>f.source===s&&f.status==='transpiled')).filter(Boolean);
  return [...sources.map(p=>({root:'callers',path:'source/'+p})),...emitted.map(f=>({root:'callers',path:'emitted/'+f.output}))];
}
function derive(input,check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'CALLER_MAPPING_DENIED',reason});}){
  const same=(a,b)=>hash(a)===hash(b),island=deriveIsland(input),{baseline}=input;
  verifyCatalog(input.catalog,input.roots);
  check(same(observeCatalogFiles(input.roots,callerRefs(baseline)),input.callerObservations),'caller-current-identity');
  const callersRoot=input.roots.find(r=>r.id==='callers'),cache=new Map();
  const parse=name=>{
    if(cache.has(name))return cache.get(name);
    const text=fs.readFileSync(path.join(callersRoot.path,name),'utf8');
    const tree=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,name.endsWith('.tsx')?ts.ScriptKind.TSX:name.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
    check(tree.parseDiagnostics.length===0,'caller-syntax');cache.set(name,tree);return tree;
  };
  const bindings=(n,tree)=>{
    const c=n.importClause;
    return {clauseTypeOnly:c?.isTypeOnly??false,default:c?.name?.text??null,namespace:c?.namedBindings&&ts.isNamespaceImport(c.namedBindings)?c.namedBindings.name.text:null,
      named:c?.namedBindings&&ts.isNamedImports(c.namedBindings)?c.namedBindings.elements.map(e=>({imported:e.propertyName?.text??e.name.text,local:e.name.text,typeOnly:e.isTypeOnly})):[],
      sideEffect:!c,attributes:n.attributes?.getText(tree)??null};
  };
  const imports=tree=>tree.statements.flatMap((n,statementIndex)=>ts.isImportDeclaration(n)?[{statementIndex,line:tree.getLineAndCharacterOfPosition(n.getStart()).line+1,
    specifier:ts.isStringLiteral(n.moduleSpecifier)?n.moduleSpecifier.text:null,bindings:bindings(n,tree)}]:[]);
  const used=new Set(),destination=island.outputs[0].path;
  const records=island.incoming.map(({occurrence,edge})=>{
    const tree=parse('source/'+edge.source),allSourceImports=imports(tree),matches=allSourceImports.filter(n=>n.line===edge.line&&n.specifier===edge.specifier);
    check(edge.kind==='static-import'&&matches.length===1,'caller-source-occurrence');
    const sourceImport=matches[0],b=sourceImport.bindings;
    check(!b.default&&!b.namespace&&!b.sideEffect&&!b.attributes&&!b.clauseTypeOnly&&b.named.length>0&&b.named.every(v=>!v.typeOnly),'caller-unsupported-import-form');
    const target=edge.resolvedPath.replace(/\.ts$/,'.js'),oldExports=island.outputs.find(o=>o.path===target)?.exports;
    check(oldExports&&b.named.every(n=>oldExports.includes(n.imported)),'caller-export-mismatch');
    const sourceMeasurement=input.callerObservations.find(o=>o.path==='source/'+edge.source);
    const targetFile=island.files.find(f=>f.provenance.output===target);
    const provenance=baseline.provenance.files.find(f=>f.source===edge.source&&f.status==='transpiled');
    let emitted=null,mapping=null,usage='source-value-import-emission-outside-selected-backend';
    if(provenance){
      check(sourceMeasurement.sha256===provenance.sourceSha256,'caller-source-provenance');
      const file=provenance.output,jsTree=parse('emitted/'+file),allEmittedImports=imports(jsTree);
      const candidates=allEmittedImports.filter(n=>n.specifier?.startsWith('.')&&path.posix.normalize(path.posix.join(path.posix.dirname(file),n.specifier))===target&&same(n.bindings,b));
      check(candidates.length===1,'caller-emitted-correspondence');
      const n=candidates[0],key=file+':'+n.statementIndex;check(!used.has(key),'caller-emitted-reuse');used.add(key);
      const measurement=input.callerObservations.find(o=>o.path==='emitted/'+file);
      check(measurement?.sha256===provenance.outputSha256,'caller-emitted-provenance');
      emitted={file,measurement:clone(measurement),provenanceRef:hash(provenance),import:n,allImports:allEmittedImports};
      const specifier=relativeSpecifier(file,destination);
      check((specifier.startsWith('./')||specifier.startsWith('../'))&&path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier))===destination,'caller-target-ambiguity');
      mapping={disposition:'hypothetical-specifier-only-rewrite',realm:'backend-esm',target:destination,specifier,
        bindings:clone(b),statementIndex:n.statementIndex,mergeDeclarations:false,outputIdentity:null,outputSha256:null};
      usage='emitted-value-import-not-executed';
    }
    return {occurrence,edge:clone(edge),sourceMeasurement:clone(sourceMeasurement),sourceImport,allSourceImports,
      originalTarget:clone(targetFile),inventoryTypeOnly:edge.typeOnly,usage,emitted,mapping,
      disposition:provenance?'backend-static-map-only':'retain-original-source-path-outside-backend'};
  });
  check(records.length===39&&records.filter(r=>r.emitted).length===34,'caller-coverage');
  const sourceSet=new Set(records.map(r=>r.edge.source));
  const affected=list=>list.flatMap((record,occurrence)=>sourceSet.has(record.source)?[{occurrence,record}]:[]);
  const otherReferences=baseline.inventory.references.flatMap((edge,occurrence)=>sourceSet.has(edge.source)&&!records.some(r=>r.occurrence===occurrence)?[{occurrence,edge}]:[]);
  const unknownRequests=otherReferences.filter(r=>r.edge.specifier==='<computed>'||r.edge.kind==='dynamic-import'||r.edge.kind==='require'&&!r.edge.resolvedPath&&r.edge.resolution!=='node-builtin');
  return clone({version:1,profile,islandSha256:hash(island),baselineSha256:hash(baseline),records,
    metadata:island.assets.sharedMetadata,sourceOnlyAncestry:island.sourceOnlyEdges,
    uncertainty:{affectedStaging:affected(baseline.manifest.unresolved),affectedInventory:affected(baseline.inventory.unresolved),otherReferences,unknownRequests,
      globalStagingSha256:hash(baseline.manifest.unresolved),globalInventorySha256:hash(baseline.inventory.unresolved)},
    semanticRequirements:{namedAndLocalBindings:'exact-including-aliases',defaultAndNamespaceImports:'none-observed-do-not-invent',
      liveBindings:'must-preserve-no-snapshot-or-destructuring-substitute',declarationOrder:'preserve-original-statement-slots-no-merge',
      evaluationOrder:'not-established-two-module-graph-to-one-module',moduleIdentity:'not-established-namespace-cache-function-identity',
      esm:'retain-module-format-and-shared-metadata',outsideBackend:'retain-source-paths-separate-build-contract',
      changedCallers:'29-new-generated-output-identities-and-reviews-required'},
    singleOutput:{path:destination,format:'esm',size:null,sha256:null,identity:null,status:'unbuilt-unadmitted'},
    oneOutputDefensible:false,runtimeEquivalence:'not-established',executionAuthority:false});
}
function createCallerAssessment(input){
  if(input.callerProfile!==profile||!input.contract||owners.has(input.contract))throw Object.assign(Error('caller-opt-in-or-owner'),{code:'CALLER_MAPPING_DENIED'});
  owners.add(input.contract);const snapshot=hash(input);let terminal=false;
  return Object.freeze({assess(){
    const deny=reason=>{terminal=true;return freeze({version:1,profile,status:'denied',reason,executionAuthority:false,productionReady:false,productionAuthority:false});};
    if(terminal)return deny('caller-sticky-denial');
    try{
      const check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{reason});};
      check(hash(input)===snapshot,'caller-record-changed');
      const parent=createIslandAssessment({...input,model:clone(input.model)}).assess();check(parent.status==='blocked'&&parent.executionAuthority===false,'caller-island-evidence');
      const expected=derive(input,check),same=(a,b)=>hash(a)===hash(b);
      check(Array.isArray(input.contract.records)&&input.contract.records.length===39,'caller-missing-mapping');
      const occurrences=input.contract.records.map(r=>r.occurrence);check(new Set(occurrences).size===39,'caller-duplicate-mapping');
      for(let i=0;i<39;i++){
        const r=input.contract.records[i],e=expected.records[i];
        check(r.occurrence===e.occurrence&&same(r.edge,e.edge),'caller-source-edge');
        check(same(r.sourceMeasurement,e.sourceMeasurement)&&same(r.originalTarget,e.originalTarget),'caller-identity-or-digest');
        check(same(r.sourceImport,e.sourceImport)&&same(r.emitted,e.emitted),'caller-import-or-export');
        check(same(r.mapping,e.mapping),'caller-target-or-bindings');
      }
      check(same(input.contract.metadata,expected.metadata),'caller-metadata');
      check(same(input.contract.uncertainty,expected.uncertainty),'caller-uncertainty');
      check(same(input.contract.semanticRequirements,expected.semanticRequirements),'caller-semantics');
      check(same(input.contract,expected),'caller-contract-correspondence');
      check(same(observeCatalogFiles(input.roots,callerRefs(input.baseline)),input.callerObservations),'caller-final-identity');
      terminal=true;
      return freeze({version:1,profile,status:'blocked',executionAuthority:false,productionAuthority:false,productionReady:false,contract:clone(expected),
        coverage:{sourceOccurrences:39,stagedValueImports:34,outsideBackend:5,distinctSourceFiles:new Set(expected.records.map(r=>r.edge.source)).size,
          distinctStagedCallers:new Set(expected.records.filter(r=>r.emitted).map(r=>r.emitted.file)).size,declaredTypeOnly:0,defaultImports:0,namespaceImports:0},
        staticBackendMappingFeasible:true,allCallersRedirectable:false,oneOutputDefensible:false,facadesRetained:true,
        physical:{baselineIsland:2,retainedFacadeProposal:3,acceptedOneOutputCount:null,hypotheticalBackendOnlyOutput:1,prospectiveRewrittenCallers:29,globalPayloadCount:null,ceilingMet:false},
        blockers:['outside-backend-source-build-boundary','live-binding-evaluation-and-module-identity-unproven','rewritten-caller-bytes-and-admission-missing','generated-island-bytes-and-admission-missing'],
        selectionAndAdmissionChanged:false});
    }catch(e){return deny(e.reason??e.code??'caller-invalid-evidence');}
  }});
}
module.exports={profile,callerRefs,derive,createCallerAssessment,relativeSpecifier};
