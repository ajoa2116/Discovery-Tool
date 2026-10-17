// Static fixture model of ONE reviewed application pair. Never imports its code.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {inventory}=require('../../../scripts/dependency-inventory.cjs');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord}=require('../../../scripts/stage-backend.cjs');
const {observeCatalogFiles,verifyCatalog}=require('../../../scripts/payload-byte-catalog.cjs');
const profile='address-identity-island-v1',members=['src/shared/address_validation','src/shared/identity_policy'];
const bundle='src/shared/.consolidation/address-identity.generated.js',owned=new WeakSet();
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const refs=()=>[...members.map(p=>({root:'typescript',path:p+'.ts'})),...members.map(p=>({root:'javascript',path:p+'.js'})),
  {root:'typescript',path:'src/types/index.ts'},{root:'javascript',path:'package.json'}];
function derive(input,check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'APPLICATION_ISLAND_DENIED',reason});}){
  const same=(a,b)=>hash(a)===hash(b),{baseline,roots,observations}=input;
  verifyCatalog(input.catalog,roots);
  check(same(observeCatalogFiles(roots,refs()),observations),'island-current-identity');
  const scoped=inventory(roots.find(r=>r.id==='typescript').path,{entrypoints:members.map(p=>({role:'backend-stage',path:p+'.ts'}))});
  const sourceEdges=baseline.inventory.references.flatMap((edge,occurrence)=>members.some(p=>edge.source===p+'.ts')?[{occurrence,edge}]:[]);
  const reduced=scoped.references.filter(e=>members.some(p=>e.source===p+'.ts'));
  const minimal=e=>({source:e.source,line:e.line,kind:e.kind,specifier:e.specifier,typeOnly:e.typeOnly,resolvedPath:e.resolvedPath,resolution:e.resolution});
  check(sourceEdges.length===2&&same(reduced.map(minimal),sourceEdges.map(r=>minimal(r.edge))),'island-source-inventory');
  const records=members.map(p=>baseline.provenance.files.find(f=>f.source===p+'.ts'&&f.output===p+'.js'));
  check(records.every(f=>f?.status==='transpiled'),'island-staging-record');
  for(const f of records){for(const [root,name,digest]of [['typescript',f.source,f.sourceSha256],['javascript',f.output,f.outputSha256]]){
    const measured=observations.find(o=>o.root===root&&o.path===name);check(measured?.sha256===digest,'island-source-or-output-bytes');
  }}
  const emitted=[],exports={};
  for(const p of members){
    for(const [root,extension]of [['typescript','.ts'],['javascript','.js']]){
      const filename=p+extension,bytes=fs.readFileSync(path.join(roots.find(r=>r.id===root).path,filename),'utf8');
      const tree=ts.createSourceFile(filename,bytes,ts.ScriptTarget.Latest,true,extension==='.ts'?ts.ScriptKind.TS:ts.ScriptKind.JS);
      check(tree.parseDiagnostics.length===0,'island-syntax');
      const visit=node=>{
        if(ts.isCallExpression(node)||ts.isNewExpression(node)){
          const expression=node.expression.getText(tree);
          check(!/(?:^|\.)(?:require|import|eval|Function|fetch|URL|Worker|WebSocket|readFileSync|readFile|writeFile|writeFileSync|open|openSync|createReadStream|createWriteStream|readdir|spawn|exec|fork)$/.test(expression),'island-unsupported-operation');
        }
        if(ts.isMetaProperty(node))check(false,'island-module-url');
        ts.forEachChild(node,visit);
      };visit(tree);
      if(root==='javascript'){
        const names=[];
        for(const statement of tree.statements){
          if(ts.isImportDeclaration(statement)){
            check(ts.isStringLiteral(statement.moduleSpecifier),'island-nonliteral-import');
            const specifier=statement.moduleSpecifier.text,target=path.posix.normalize(path.posix.join(path.posix.dirname(filename),specifier));
            check(members.some(p=>target===p+'.js'),'island-external-runtime-import');
            const occurrence=sourceEdges.find(r=>r.edge.source===p+'.ts'&&r.edge.resolvedPath===target.replace(/\.js$/,'.ts'))?.occurrence;
            check(occurrence!==undefined,'island-emitted-correspondence');
            emitted.push({sourceOccurrence:occurrence,source:filename,line:tree.getLineAndCharacterOfPosition(statement.getStart()).line+1,specifier,target,
              bindings:statement.importClause?.getText(tree)??null});
          }
          check(!ts.isExportDeclaration(statement),'island-unrepresented-reexport');
          if(statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
            if(ts.isFunctionDeclaration(statement))names.push(statement.name.text);
            else if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations){check(ts.isIdentifier(d.name),'island-export-pattern');names.push(d.name.text);}
            else check(false,'island-export-shape');
          }
        }exports[filename]=names.sort();
      }
    }
  }
  check(emitted.length===1,'island-literal-edge-count');
  const incoming=baseline.inventory.references.flatMap((edge,occurrence)=>!members.some(p=>edge.source===p+'.ts')&&members.some(p=>edge.resolvedPath===p+'.ts')?[{occurrence,edge}]:[]);
  const witnesses=members.map(member=>{
    const queue=[{source:'src/server/index.ts',via:[]}],seen=new Set();
    while(queue.length){const row=queue.shift();if(row.source===member+'.ts')return {target:row.source,occurrences:row.via};if(seen.has(row.source))continue;seen.add(row.source);
      for(let occurrence=0;occurrence<baseline.inventory.references.length;occurrence++){
        const e=baseline.inventory.references[occurrence];if(e.source===row.source&&!e.typeOnly&&e.kind==='static-import'&&e.resolvedPath)queue.push({source:e.resolvedPath,via:row.via.concat(occurrence)});
      }
    }check(false,'island-production-reachability');
  });
  const affected=list=>list.flatMap((record,occurrence)=>members.some(p=>record.source===p+'.ts'||record.source===p+'.js')?[{occurrence,record}]:[]);
  const metadata=observations.find(f=>f.root==='javascript'&&f.path==='package.json');
  check(metadata.sha256===baseline.catalog.entries.find(f=>f.root==='stage'&&f.path==='package.json').sha256,'island-package-metadata');
  const metadataValue=JSON.parse(fs.readFileSync(path.join(roots.find(r=>r.id==='javascript').path,'package.json'),'utf8'));
  check(metadataValue.type==='module','island-module-format');
  return clone({version:1,profile,baselineSha256:hash(baseline),files:records.map(f=>({provenance:clone(f),provenanceRef:hash(f),
      sourceObservation:clone(observations.find(o=>o.root==='typescript'&&o.path===f.source)),javascriptObservation:clone(observations.find(o=>o.root==='javascript'&&o.path===f.output))})),
    sourceEdges,emittedEdges:emitted,incoming,witnesses,
    sourceOnlyEdges:sourceEdges.filter(r=>!emitted.some(e=>e.sourceOccurrence===r.occurrence)).map(r=>({...r,disposition:'absent-from-reviewed-emitted-js-not-reclassified'})),
    assets:{moduleRelativeData:[],json:[],configuration:[],workers:[],native:[],dynamicImport:[],computedRequire:[],moduleUrls:[],filesystem:[],
      disposition:'none-in-fixed-reviewed-bytes-only',sharedMetadata:clone(metadata),sourceTypeBoundary:clone(observations.find(f=>f.root==='typescript'&&f.path==='src/types/index.ts'))},
    uncertainty:{staging:affected(baseline.manifest.unresolved),inventory:affected(baseline.inventory.unresolved),scoped:clone(scoped.unresolved),
      globalStagingSha256:hash(baseline.manifest.unresolved),globalInventorySha256:hash(baseline.inventory.unresolved)},
    outputs:[{path:bundle,role:'proposed-generated-code',format:'esm',exports:[...new Set(Object.values(exports).flat())].sort(),size:null,sha256:null,identity:null,status:'unbuilt-unadmitted'},
      ...members.map(p=>({path:p+'.js',role:'proposed-generated-facade',format:'esm',exports:exports[p+'.js'],target:bundle,size:null,sha256:null,identity:null,status:'unbuilt-unadmitted'}))],
    admission:'missing',executionAuthority:false});
}
function createIslandAssessment(input){
  if(input.profile!==profile||!input.model||owned.has(input.model))throw Object.assign(Error('island-opt-in-or-owner'),{code:'APPLICATION_ISLAND_DENIED'});
  owned.add(input.model);const original=hash(input);let terminal=false;
  return Object.freeze({assess(){
    const deny=reason=>{terminal=true;return freeze({version:1,profile,status:'denied',reason,executionAuthority:false,productionReady:false,productionAuthority:false});};
    if(terminal)return deny('island-sticky-denial');
    try{
      const check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{reason});};
      check(hash(input)===original,'island-record-changed');
      const expected=derive(input,check),same=(a,b)=>hash(a)===hash(b),global=input.wholeBackendReport;
      check(global?.profile==='whole-backend-consolidation-plan-v1'&&global.status==='blocked'&&global.executionAuthority===false&&global.productionReady===false&&
        global.baselineSha256===expected.baselineSha256&&global.proposalSha256===hash(input.proposals)&&global.unresolvedRecords===4736,'island-global-plan-reference');
      const existingSources=input.proposals.flatMap(p=>p.kind==='express'?p.record.actual.incorporated:require('./iconv_artifact_metadata.cjs').incorporated);
      const existingOutputs=input.proposals.flatMap(p=>p.review.outputs.map(f=>f.path));
      check(members.every(p=>!existingSources.includes(p+'.js')&&!existingOutputs.includes(p+'.js'))&&expected.outputs.every(o=>!existingOutputs.includes(o.path)&&!existingSources.includes(o.path)),'island-overlap');
      check(input.proposals.length===2&&new Set(input.proposals.map(p=>p.kind)).size===2,'island-proposal-set');
      for(const [field,reason]of [['files','island-file-measurement'],['sourceEdges','island-source-edges'],['emittedEdges','island-emitted-edges'],['incoming','island-incoming-boundary'],
        ['assets','island-asset-disposition'],['uncertainty','island-uncertainty'],['outputs','island-unbuilt-output'],['sourceOnlyEdges','island-source-only-correspondence']])check(same(input.model[field],expected[field]),reason);
      check(same(input.model,expected),'island-model-correspondence');
      check(same(observeCatalogFiles(input.roots,refs()),input.observations),'island-final-identity');
      terminal=true;
      const generatedDescription=createGeneratedArtifactRecord({outputs:[],sources:input.observations.filter(f=>f.root==='javascript'&&members.some(p=>f.path===p+'.js')),
        pendingOutputs:expected.outputs,derivation:{kind:'static-proposal-only',compilerInvocation:null},unresolved:expected.uncertainty},input.observations);
      return freeze({version:1,profile,status:'blocked',executionAuthority:false,productionAuthority:false,productionReady:false,
        model:clone(expected),generatedDescription,physical:{islandBaseline:2,proposedOutputs:3,projectedIslandOnly:3,delta:1,validatedReplacementCount:null,
          sharedMetadataOutsideIsland:1,globalPayloadCount:null,manifestCeiling:64,ceilingMet:false},
        blockers:['generated-bytes-and-admission-missing','facade-export-and-cache-equivalence-unproven','compiler-transform-not-observed'],
        limitations:['Static AST review is bounded; it does not prove arbitrary JavaScript purity or a hostile-code sandbox.',
          'No original file is excluded. Source-only edge elision is observed in existing emitted bytes, not inferred from type syntax.',
          'Whole-backend 685 remains hypothetical and is not updated by this island model.'],selectionAndAdmissionChanged:false});
    }catch(e){return deny(e.reason??e.code??'island-invalid-evidence');}
  }});
}
module.exports={profile,members:Object.freeze([...members]),refs,derive,createIslandAssessment};
