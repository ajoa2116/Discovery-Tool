// Opt-in fixture metadata normalization, never a loader/admission authority.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {observeCatalogFiles,verifyCatalog}=require('../../../scripts/payload-byte-catalog.cjs');
const profile='express-guards-v1';
const specs=[...['body-parser','express','finalhandler','send'].map(owner=>({
  importer:`node_modules/${owner}/node_modules/debug/src/index.js`,specifier:'./browser.js',
  target:`node_modules/${owner}/node_modules/debug/src/browser.js`,metadata:`node_modules/${owner}/node_modules/debug/package.json`,
  version:'2.6.9',name:'debug',category:'renderer-branch',expression:"typeof process !== 'undefined' && process.type === 'renderer'",
  digest:'0144ab6a52b9330c567de11a5c3a4aea35cdac47a4c106482aa24ae8054cdc6f',line:7,
})),{importer:'node_modules/inherits/inherits.js',specifier:'./inherits_browser.js',target:'node_modules/inherits/inherits_browser.js',
  metadata:'node_modules/inherits/package.json',version:'2.0.4',name:'inherits',category:'capability-exception-fallback',
  expression:"require('util') succeeds; typeof util.inherits === 'function'; any exception in try selects catch",line:8,
  digest:'ad322a7b1dec60f3d2ebda2091816469efb55b567d241cf3cf0fa4c5a4afe500'},
  {importer:'node_modules/express/lib/view.js',specifier:'<computed>',target:null,metadata:'node_modules/express/package.json',
    version:'4.22.2',name:'express',category:'engine-cache-miss',expression:'!opts.engines[this.ext]',line:81}];
const clone=v=>JSON.parse(JSON.stringify(v));
function normalize(input,check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'GENERATED_ARTIFACT_DENIED',reason});}){
  const {roots,catalog,inventory,sourceEdges,observations,extension,sourceRoot}=input;
  const same=(a,b)=>hash(a)===hash(b),keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),n.split(' ').sort()),'guard-shape');
  check(input.profile===profile,'guard-opt-in');hash(extension); // Existing bounded canonical metadata mechanism.
  keys(extension,'version profile inventorySha256 sourceEdgesSha256 files descriptors');
  check(extension.version===1&&extension.profile===profile,'guard-profile');
  check(Array.isArray(sourceEdges)&&sourceEdges.length<=20000&&Array.isArray(inventory.references),'guard-source-edges');
  check(extension.inventorySha256===hash(inventory)&&extension.sourceEdgesSha256===hash(sourceEdges),'guard-edge-evidence');
  const root=roots.find(r=>r.id===sourceRoot);check(!!root,'guard-root');
  const ref=p=>({root:sourceRoot,path:p});
  const required=[...new Set(specs.flatMap(s=>[s.importer,s.metadata,...(s.target?[s.target]:[])]))].sort();
  check(Array.isArray(extension.files)&&extension.files.length===required.length&&same(extension.files.map(f=>f.path).sort(),required),'guard-file-set');
  for(const file of extension.files){
    keys(file,'root path size sha256 identity');check(file.root===sourceRoot,'guard-file-root');
    check(observations.filter(o=>o.root===file.root&&o.path===file.path).length===1&&
      same(observations.find(o=>o.root===file.root&&o.path===file.path),file),'guard-original-measurement');
  }
  check(verifyCatalog(catalog,roots).matchedBytes===true,'guard-catalog');
  const current=()=>observeCatalogFiles(roots,extension.files.map(({root,path})=>({root,path})));
  check(same(current(),extension.files),'guard-file-identity');
  const seen=new Set();
  for(let i=0;i<sourceEdges.length;i++){
    const edge=sourceEdges[i];check(edge.occurrence===i&&!seen.has(edge.occurrence),'guard-occurrence-order');seen.add(edge.occurrence);
  }
  check(Array.isArray(extension.descriptors)&&extension.descriptors.length===6,'guard-descriptor-set');
  const consumed=new Set(),normalized=[];
  const compact=n=>n.getText().replace(/\s/g,'');
  function requireCalls(tree){const calls=[];const visit=n=>{
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='require')calls.push(n);ts.forEachChild(n,visit);
  };visit(tree);return calls;}
  for(const s of specs){
    const matches=extension.descriptors.filter(d=>same(d.source,ref(s.importer)));check(matches.length===1,'guard-duplicate-or-missing');
    const d=matches[0];keys(d,'occurrence source specifier target guard evidence reachability observedLoad compilerIncorporation runtimeAdmission closure possibleTargets derivation');
    keys(d.source,'root path');if(d.target)keys(d.target,'root path');keys(d.guard,'category expression');
    check(Number.isSafeInteger(d.occurrence)&&!consumed.has(d.occurrence),'guard-occurrence');consumed.add(d.occurrence);
    const e=sourceEdges[d.occurrence];
    check(e&&same(e.source,ref(s.importer))&&e.kind==='require'&&e.line===s.line&&e.specifier===s.specifier&&
      same(e.target,s.target?ref(s.target):null),'guard-source-correspondence');
    check(d.specifier===s.specifier&&same(d.target,s.target?ref(s.target):null),'guard-target');
    check(inventory.references.filter(r=>r.source===s.importer&&r.kind==='require'&&!r.typeOnly&&r.line===s.line&&r.specifier===s.specifier&&
      (s.target?r.resolvedPath===s.target:!r.resolvedPath)).length===1,'guard-inventory-correspondence');
    check(same(d.evidence,[ref(s.importer),ref(s.metadata),...(s.target?[ref(s.target)]:[])]),'guard-evidence');
    check(d.guard.category===s.category&&d.guard.expression===s.expression,'guard-expression');
    check(d.reachability===(s.target?'conditional':'unresolved')&&d.observedLoad==='not-asserted'&&d.compilerIncorporation==='not-asserted'&&
      d.runtimeAdmission==='unadmitted'&&d.closure==='unresolved'&&d.possibleTargets===null,'guard-no-authority');
    check(d.derivation===(s.target?null:'extension-or-default-engine -> this.ext -> this.ext.slice(1) -> require(mod)'),'guard-computed-derivation');
    const meta=JSON.parse(fs.readFileSync(path.join(root.path,s.metadata),'utf8'));
    check(meta.name===s.name&&meta.version===s.version,'guard-package');
    const text=fs.readFileSync(path.join(root.path,s.importer),'utf8'),tree=ts.createSourceFile(s.importer,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    check(tree.parseDiagnostics.length===0,'guard-source-syntax');
    if(s.category==='renderer-branch'){
      check(meta.main==='./src/index.js'&&meta.browser==='./src/browser.js','guard-package-entry');
      const node=tree.statements[0];check(ts.isIfStatement(node)&&compact(node.expression)==="typeofprocess!=='undefined'&&process.type==='renderer'",'guard-source-expression');
      const yes=requireCalls(node.thenStatement),no=requireCalls(node.elseStatement);
      check(yes.length===1&&yes[0].arguments[0].text==='./browser.js'&&no.length===1&&no[0].arguments[0].text==='./node.js','guard-source-branches');
    }else if(s.target){
      check(meta.main==='./inherits.js'&&meta.browser==='./inherits_browser.js','guard-package-entry');
      const node=tree.statements[0];check(ts.isTryStatement(node)&&node.catchClause,'guard-source-try');
      const guard=node.tryBlock.statements.find(ts.isIfStatement),yes=requireCalls(node.tryBlock),no=requireCalls(node.catchClause);
      check(guard&&compact(guard.expression)==="typeofutil.inherits!=='function'"&&ts.isThrowStatement(guard.thenStatement)&&
        yes.length===1&&yes[0].arguments[0].text==='util'&&no.length===1&&no[0].arguments[0].text==='./inherits_browser.js','guard-source-fallback');
    }else{
      const calls=requireCalls(tree).filter(n=>!ts.isStringLiteral(n.arguments[0]));
      check(calls.length===1&&calls[0].arguments[0].getText()==='mod'&&tree.getLineAndCharacterOfPosition(calls[0].getStart()).line+1===81,'guard-computed-source');
      let owner=calls[0].parent;while(owner&&!ts.isIfStatement(owner))owner=owner.parent;
      check(owner&&compact(owner.expression)==='!opts.engines[this.ext]'&&/var mod = this\.ext\.slice\(1\)/.test(text)&&
        /this\.ext = extname\(name\)/.test(text)&&/this\.defaultEngine = opts\.defaultEngine/.test(text)&&
        /if \(!this\.ext && !this\.defaultEngine\)/.test(text),'guard-computed-source-derivation');
    }
    if(s.target)check(extension.files.find(f=>f.path===s.target).sha256===s.digest,'guard-target-bytes');
    normalized.push(clone(d));
  }
  check(same(current(),extension.files),'guard-changed-during-validation');
  const result={version:1,profile,productionAuthority:false,executionAuthority:false,completeClosure:false,
    sourceEdgesSha256:hash(sourceEdges),sourceOccurrenceCount:sourceEdges.length,conditionalFiles:5,computedEdges:1,descriptors:normalized};
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(result);
}
// A deliberately partial compiler-shaped projection, not an esbuild observation.
// Actual compiler evidence needs a separately reviewed profile; never relabel it.
function normalizeCompilerCorrespondence(input,check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'GENERATED_ARTIFACT_DENIED',reason});}){
  if(input.compilerEvidence?.profile==='express-guard-actual-v1')return normalizeActualCompilerCorrespondence(input,check);
  const descriptors=normalize(input,check),e=input.compilerEvidence;
  const same=(a,b)=>hash(a)===hash(b),keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),n.split(' ').sort()),'compiler-guard-shape');
  hash(e);keys(e,'version profile kind scope descriptorSha256 sourceEdgesSha256 output graph');
  check(e.version===1&&e.profile==='express-guard-correspondence-v1','compiler-guard-profile');
  check(e.kind==='synthetic-source-derived'&&e.scope==='five-conditional-occurrences','compiler-guard-evidence-kind');
  check(e.descriptorSha256===hash(input.extension)&&e.sourceEdgesSha256===hash(input.sourceEdges),'compiler-guard-provenance');
  keys(e.output,'root path size sha256 identity');
  check(e.output.root===input.sourceRoot&&e.output.path==='evidence/synthetic-wrapper-shape.txt','compiler-guard-output-path');
  const expected=input.observations.filter(o=>o.root===e.output.root&&o.path===e.output.path);
  check(expected.length===1&&same(expected[0],e.output),'compiler-guard-output-identity');
  const observe=()=>observeCatalogFiles(input.roots,[{root:e.output.root,path:e.output.path}])[0];
  check(same(observe(),e.output),'compiler-guard-output-changed');
  const g=e.graph;keys(g,'inputs outputs');
  const paths=[...new Set(specs.flatMap(s=>[s.importer,...(s.target?[s.target]:[])]))].sort();
  check(same(Object.keys(g.inputs).sort(),paths),'compiler-guard-input-set');
  check(same(Object.keys(g.outputs),[e.output.path]),'compiler-guard-output-set');
  const out=g.outputs[e.output.path];keys(out,'bytes inputs imports');
  check(out.bytes===e.output.size&&same(Object.keys(out.inputs).sort(),paths)&&Array.isArray(out.imports)&&out.imports.length===0,'compiler-guard-output-record');
  let modeledBytes=0;
  for(const name of paths){
    const file=input.extension.files.find(f=>f.path===name);check(!!file,'compiler-guard-input-evidence');
    const row=g.inputs[name];keys(row,'bytes format imports');
    check(row.bytes===file.size&&row.format==='cjs'&&Array.isArray(row.imports),'compiler-guard-input-bytes');
    keys(out.inputs[name],'bytesInOutput');const bytes=out.inputs[name].bytesInOutput;
    check(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=e.output.size,'compiler-guard-wrapper-shape');modeledBytes+=bytes;
  }
  check(modeledBytes<=e.output.size,'compiler-guard-wrapper-byte-total');
  const rows=[],consumed=new Set();
  for(const s of specs){
    const edges=g.inputs[s.importer].imports,d=descriptors.descriptors.find(d=>d.source.path===s.importer);
    check(edges.length===(s.target?1:0),'compiler-guard-missing-or-duplicate-edge');
    if(!s.target)continue; // The computed request is explicitly NOT a literal import.
    const edge=edges[0];keys(edge,'path kind original');
    check(edge.path===s.target&&edge.original===s.specifier&&edge.kind==='require-call','compiler-guard-edge-correspondence');
    check(!consumed.has(d.occurrence),'compiler-guard-duplicate-occurrence');consumed.add(d.occurrence);
    check(g.inputs[s.target].imports.length===0,'compiler-guard-unmatched-edge');
    rows.push({sourceOccurrence:d.occurrence,source:d.source,specifier:d.specifier,target:d.target,guard:d.guard,
      packageIdentity:{location:s.metadata.slice(0,-'/package.json'.length),name:s.name,version:s.version,
        metadata:clone(input.extension.files.find(f=>f.path===s.metadata))},
      sourceMeasurement:clone(input.extension.files.find(f=>f.path===s.importer)),
      targetMeasurement:clone(input.extension.files.find(f=>f.path===s.target)),output:clone(e.output),
      compilerInput:'modeled',emittedWrapper:'not-demonstrated',transformation:'modeled-internal-wrapper',runtimeAdmission:'unadmitted'});
  }
  check(consumed.size===5,'compiler-guard-occurrence-count');
  check(same(observe(),e.output),'compiler-guard-output-changed');
  const result={version:1,profile:e.profile,evidenceKind:e.kind,scope:e.scope,genuineCompilerMatch:false,
    productionAuthority:false,executionAuthority:false,completeClosure:false,sourceOccurrenceCount:input.sourceEdges.length,
    matchedModeledOccurrences:rows,modeledCompilerInputs:paths.length,measuredOutput:clone(e.output),
    unresolvedComputed:clone(descriptors.descriptors.filter(d=>d.target===null)),
    outOfScopeSourceOccurrences:input.sourceEdges.filter(d=>!consumed.has(d.occurrence)&&d.specifier!=='<computed>').length,
    limitation:'Partial synthetic edge projection; no compiler invocation, actual emitted wrapper, complete metafile or runtime-consumption proof.'};
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(result);
}
// Full esbuild graph accounting. This is pure metadata correspondence, not an
// assertion that emitted code executes source semantics or consumes pinned files.
function matchActualCompilerGraph({graph,sourceEdges,measurements,descriptors,sourceRoot,output},check){
  const same=(a,b)=>hash(a)===hash(b),keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),n.split(' ').sort()),'actual-compiler-shape');
  keys(graph,'inputs outputs');
  const outputKey='../compile/node_modules/express/lib/consolidated.cjs';
  check(same(Object.keys(graph.outputs),[outputKey]),'actual-compiler-output-path');
  const out=graph.outputs[outputKey];keys(out,'imports exports entryPoint inputs bytes');
  check(out.entryPoint==='node_modules/express/index.js'&&same(out.exports,[])&&out.bytes===output.size,'actual-compiler-output');
  const incorporated=Object.keys(graph.inputs).sort();check(incorporated.length===135&&same(Object.keys(out.inputs).sort(),incorporated),'actual-compiler-input-set');
  const consumed=new Set(),transformed=[],externals=[];
  check(sourceEdges.length===347&&sourceEdges.every((e,i)=>e.occurrence===i),'actual-compiler-source-occurrences');
  for(const name of incorporated){
    const measured=measurements.filter(f=>f.root===sourceRoot&&f.path===name);check(measured.length===1,'actual-compiler-input-measurement');
    const row=graph.inputs[name];keys(row,'bytes imports'+(row.format===undefined?'':' format'));
    check(row.bytes===measured[0].size&&Array.isArray(row.imports)&&
      (row.format==='cjs'||(name.endsWith('.json')&&row.format===undefined)),'actual-compiler-input-bytes');
    keys(out.inputs[name],'bytesInOutput');check(Number.isSafeInteger(out.inputs[name].bytesInOutput)&&out.inputs[name].bytesInOutput>0&&out.inputs[name].bytesInOutput<=output.size,'actual-compiler-contribution');
    for(const edge of row.imports){
      keys(edge,edge.external===true?'path kind external':'path kind original');check(edge.kind==='require-call','actual-compiler-import-kind');
      const specifier=edge.original??edge.path;
      const original=sourceEdges.find(e=>!consumed.has(e.occurrence)&&e.source.root===sourceRoot&&e.source.path===name&&e.specifier===specifier&&e.kind==='require'&&
        (edge.external===true?typeof e.target==='string'?edge.path.replace(/^node:/,'')===e.target.replace(/^node:/,''):
          specifier==='iconv-lite'&&e.target?.root===sourceRoot&&e.target.path==='node_modules/iconv-lite/lib/index.js':e.target?.root===sourceRoot&&e.target.path===edge.path));
      check(!!original,'actual-compiler-unmatched-or-duplicate-edge');consumed.add(original.occurrence);
      if(edge.external===true)externals.push(edge);else check(incorporated.includes(edge.path),'actual-compiler-missing-target');
      transformed.push({sourceOccurrence:original.occurrence,source:original.source,specifier,target:original.target,
        compilerTarget:edge.path,disposition:edge.external===true?'external-runtime-request':'internal-wrapper',kind:edge.kind});
    }
  }
  const multiset=rows=>rows.map(r=>JSON.stringify(r)).sort();
  check(Array.isArray(out.imports)&&same(multiset(out.imports),multiset(externals)),'actual-compiler-external-occurrences');
  const missing=sourceEdges.filter(e=>incorporated.includes(e.source.path)&&!consumed.has(e.occurrence));
  const computed=descriptors.descriptors.filter(d=>d.target===null);check(computed.length===1,'actual-compiler-computed-descriptor');
  check(missing.length===1&&missing[0].occurrence===computed[0].occurrence&&missing[0].specifier==='<computed>','actual-compiler-unrepresented-edge');
  const outside=sourceEdges.filter(e=>!incorporated.includes(e.source.path));
  check(transformed.length===307&&outside.length===39&&307+39+1===sourceEdges.length,'actual-compiler-accounting');
  const conditional=descriptors.descriptors.filter(d=>d.target!==null).map(d=>{
    const rows=transformed.filter(e=>e.sourceOccurrence===d.occurrence);
    check(rows.length===1&&rows[0].disposition==='internal-wrapper'&&rows[0].compilerTarget===d.target.path&&incorporated.includes(d.target.path),'actual-compiler-conditional-correspondence');
    return {descriptor:clone(d),transformation:rows[0],sourceMeasurement:clone(measurements.find(f=>f.root===sourceRoot&&f.path===d.source.path)),
      targetMeasurement:clone(measurements.find(f=>f.root===sourceRoot&&f.path===d.target.path)),
      compilerContributionBytes:out.inputs[d.target.path].bytesInOutput,wrapperExecution:'not-executed',runtimeAdmission:'unadmitted'};
  });
  check(conditional.length===5,'actual-compiler-conditional-count');
  return {incorporated,transformed,externalOccurrences:externals,conditional,unresolvedComputed:clone(computed),outsideCompilerInputs:outside};
}
function normalizeActualCompilerCorrespondence(input,check){
  const descriptors=normalize(input,check),e=input.compilerEvidence;
  const same=(a,b)=>hash(a)===hash(b),keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),n.split(' ').sort()),'actual-compiler-shape');
  keys(e,'version profile kind descriptorSha256 sourceEdgesSha256 output metafile intent invocation generator packageMetadata lock');
  check(e.version===1&&e.profile==='express-guard-actual-v1'&&e.kind==='fresh-esbuild-0.28.2','actual-compiler-profile');
  for(const [field,name] of [['metafile','esbuild-metafile.json'],['intent','reviewed-invocation.json'],['invocation','compile-owner.json'],['lock','compiler-lock.json']])
    check(e[field].root==='compiler-evidence'&&e[field].path===name,'actual-compiler-evidence-path');
  check(e.descriptorSha256===hash(input.extension)&&e.sourceEdgesSha256===hash(input.sourceEdges),'actual-compiler-provenance');
  const observed=[];
  for(const f of [e.output,e.metafile,e.intent,e.invocation,e.generator,...e.packageMetadata,e.lock]){
    keys(f,'root path size sha256 identity');
    const rows=input.observations.filter(o=>o.root===f.root&&o.path===f.path);check(rows.length===1&&same(rows[0],f),'actual-compiler-observation');observed.push(f);
  }
  const measure=()=>observeCatalogFiles(input.roots,observed.map(({root,path})=>({root,path})));
  check(same(measure(),observed),'actual-compiler-file-identity');
  check(e.output.root==='output'&&e.output.path==='node_modules/express/lib/consolidated.cjs'&&e.output.size===651753&&
    e.output.sha256==='3327ef9e74137a5121da2f23bc23d394a42d85a9263286d5196b5c9a026707c5','actual-compiler-independent-output-expectation');
  check(e.generator.root==='compiler-evidence'&&e.generator.path==='node_modules/@esbuild/win32-x64/esbuild.exe'&&e.generator.size===11694592&&
    e.generator.sha256==='c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef','actual-compiler-generator');
  const read=f=>{
    const {readCatalogJSON}=require('../../../scripts/payload-byte-catalog.cjs');
    // Reuse the existing strict pretty-esbuild JSON reader; this is not iconv
    // artifact admission, only its duplicate-key/UTF-8 JSON parsing mechanism.
    const result=readCatalogJSON(input.roots,{root:f.root,path:f.path},'express-esbuild-0.28.2-v1');
    check(result.measurement.sha256===f.sha256&&same(result.measurement.identity,f.identity),'actual-compiler-json-identity');return result.value;
  };
  const intent=read(e.intent),owner=read(e.invocation),lock=read(e.lock);
  const source=input.roots.find(r=>r.id===input.sourceRoot).path,outputRoot=input.roots.find(r=>r.id==='output').path,metaRoot=input.roots.find(r=>r.id==='compiler-evidence').path;
  const expectedOptions={bundle:true,platform:'node',format:'cjs',target:'node24',treeShaking:false,external:['iconv-lite'],logLevel:'warning'};
  const expectedArgs=['node_modules/express/index.js','--bundle','--platform=node','--format=cjs','--target=node24','--tree-shaking=false',
    '--external:iconv-lite','--outfile='+path.join(outputRoot,e.output.path),'--metafile='+path.join(metaRoot,'esbuild-metafile.json'),'--log-level=warning'];
  check(same(intent.options,expectedOptions)&&same(intent.args,expectedArgs)&&intent.workingDirectory===source&&
    intent.binary===path.join(metaRoot,e.generator.path)&&intent.productionAuthority===false,'actual-compiler-options');
  check(owner.invocations===1&&Number.isSafeInteger(owner.pid)&&owner.status===0&&owner.signal===null&&owner.error===null&&owner.stdout===''&&owner.stderr==='','actual-compiler-exit-record');
  check(e.packageMetadata.length===2,'actual-compiler-package-metadata');
  for(const [i,name] of ['esbuild','@esbuild/win32-x64'].entries()){
    const f=e.packageMetadata[i];check(f.root==='compiler-evidence'&&f.path==='node_modules/'+name+'/package.json','actual-compiler-package-path');
    const pkg=read(f);check(pkg.name===name&&pkg.version==='0.28.2'&&lock.packages['node_modules/'+name]?.version==='0.28.2','actual-compiler-version');
  }
  const graph=read(e.metafile),matched=matchActualCompilerGraph({graph,sourceEdges:input.sourceEdges,measurements:input.observations,descriptors,sourceRoot:input.sourceRoot,output:e.output},check);
  check(same(measure(),observed)&&verifyCatalog(input.catalog,input.roots).matchedBytes===true,'actual-compiler-final-files');
  return {version:1,profile:e.profile,evidenceKind:e.kind,actualMetafileCorrespondence:true,compilerInvocationAuthenticated:false,
    productionAuthority:false,executionAuthority:false,completeClosure:false,atomicMeasuredHandleBinding:false,
    compilerAuthenticity:false,output:clone(e.output),metafile:clone(e.metafile),sourceOccurrenceCount:347,...matched,
    limitation:'Fresh fixture capture and measured metafile correspondence, not compiler authenticity, source semantics, executed wrappers or real loader identity.'};
}
module.exports={normalize,normalizeCompilerCorrespondence,matchActualCompilerGraph,specs:JSON.parse(JSON.stringify(specs))};
