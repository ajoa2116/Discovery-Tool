// One opt-in compile-only feasibility experiment. Generated Express code is
// never admitted or executed; stop evidence is retained for independent review.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {generatedArtifactContentHash:hash,createGeneratedArtifactRecord,createGeneratedArtifactManifest}=require('../../scripts/stage-backend.cjs');
const {buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');
const evidence=process.env.DISCOVERY_EXPRESS_CONTRACT,repo=path.resolve(__dirname,'../..');
const actualCapture=process.env.DISCOVERY_EXPRESS_ACTUAL_CORRESPONDENCE==='1';
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('Express literal-closure compile-only feasibility',{skip:!evidence},()=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);assert.match(path.basename(parent),/^discovery-express-compile-[a-f0-9]{32}$/);
  assert.deepEqual(fs.readdirSync(parent),[]);assert.ok(path.isAbsolute(evidence));checked(evidence);
  const prior=JSON.parse(fs.readFileSync(evidence,'utf8'));assert.equal(prior.version,'4.22.2');
  assert.equal(prior.resources.cleanupConfirmed,true);assert.equal(prior.sourceProvenance.length,231);
  assert.equal(prior.originalBackend.selected,825);assert.equal(prior.originalBackend.unresolved,4736);
  const base=fs.mkdtempSync(path.join(parent,'express-feasibility-'));checked(base);console.log('Express compile evidence: '+base);
  const stage=path.join(base,'stage'),outputRoot=path.join(base,'compile');fs.mkdirSync(stage);fs.mkdirSync(outputRoot);
  const roots=[{id:'sources',path:stage},{id:'output',path:outputRoot}];
  const sourceRoots=[{id:'repository',path:repo}];
  const write=(name,value)=>fs.writeFileSync(path.join(base,name),JSON.stringify(value,null,2),{flag:'wx'});
  const put=(name,bytes)=>{const full=path.join(stage,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes,{flag:'wx'});};
  let invocations=0,completed=false;
  try{
    const observations=[];
    for(const file of prior.sourceProvenance){
      const current=observeCatalogFiles(sourceRoots,[{root:'repository',path:file.path}])[0];assert.deepEqual(current,file.source,'Source identity/digest must match measured contract');
      put(file.path,fs.readFileSync(path.join(repo,file.path)));observations.push(current);
    }
    const names=prior.sourceProvenance.map(f=>f.path);
    const copied=observeCatalogFiles(roots,names.map(path=>({root:'sources',path})));
    for(const file of copied)assert.equal(file.sha256,observations.find(f=>f.path===file.path).sha256);
    const resolutionMetadata=[];
    if(actualCapture){
      for(const [name,value] of [['package.json',{private:true,dependencies:{express:'4.22.2'}}],
        ['package-lock.json',{lockfileVersion:3,packages:Object.fromEntries(prior.packageMetadata.map(p=>[p.location,p.lock]))}],['tsconfig.json',{}]]){
        put(name,JSON.stringify(value));resolutionMetadata.push({source:name,output:name,status:'copied-candidate',selectionReasons:['Explicit fixture inventory metadata; not payload admission.']});
      }
    }
    const manifest={productionAuthority:false,completeClosure:false,informationalOnly:true,candidates:[...prior.sourceProvenance.map(f=>f.selection),...resolutionMetadata],unresolved:prior.unresolved};
    const catalog=createCatalog({roots:[roots[0]],staging:{root:'sources',manifest}});write('source-byte-catalog.json',catalog);
    assert.equal(verifyCatalog(catalog,[roots[0]]).matchedBytes,true);
    const toolPaths=['node_modules/@esbuild/win32-x64/esbuild.exe','node_modules/esbuild/package.json','node_modules/@esbuild/win32-x64/package.json','package-lock.json'];
    const tools=observeCatalogFiles(sourceRoots,toolPaths.map(path=>({root:'repository',path})));
    assert.equal(tools[0].sha256,'c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef');
    assert.equal(tools[0].size,11694592);
    const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
    for(const name of toolPaths.slice(1,3)){
      const pkg=JSON.parse(fs.readFileSync(path.join(repo,name),'utf8'));assert.equal(pkg.version,'0.28.2');
      assert.equal(lock.packages[path.posix.dirname(name)].version,pkg.version);
    }
    const capture=actualCapture?require('./support/express_compiler_capture.cjs').prepare({base,stage,roots,prior,tools,toolPaths,repo,manifest}):null;
    const bundle='node_modules/express/lib/consolidated.cjs',output=path.join(outputRoot,bundle),meta=capture?.metafile??path.join(base,'esbuild-metafile.json');
    fs.mkdirSync(path.dirname(output),{recursive:true});checked(path.dirname(output));
    const args=['node_modules/express/index.js','--bundle','--platform=node','--format=cjs','--target=node24','--tree-shaking=false',
      '--external:iconv-lite','--outfile='+output,'--metafile='+meta,'--log-level=warning'];
    const intent={productionAuthority:false,binary:capture?.binary??path.join(repo,toolPaths[0]),tools,args,workingDirectory:stage,
      options:{bundle:true,platform:'node',format:'cjs',target:'node24',treeShaking:false,external:['iconv-lite'],logLevel:'warning'},
      entrypoint:'node_modules/express/index.js',sources:copied,originalContractSha256:hash(prior),
      unresolved:prior.unresolved,computed:prior.sourceEdges.filter(e=>e.specifier==='<computed>'),
      sourceClosureFiles:231,priorSyntheticEngineControlsExcluded:4,authoritativeStageUnchanged:true};
    write('compile-intent.json',intent);
    capture?.recordIntent(intent);
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.NODE_ENV='production';
    assert.equal(invocations++,0);
    const child=spawnSync(intent.binary,args,{cwd:stage,env,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    const compileOwner={pid:child.pid,status:child.status,signal:child.signal,error:child.error?.message??null,stdout:child.stdout,stderr:child.stderr,invocations};
    write('compile-owner.json',compileOwner);capture?.recordOwner(compileOwner);
    assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');
    // Preserve compiler diagnostics before deciding whether metadata/probes can proceed.
    assert.equal(child.stderr,'','Compiler warnings are a stop condition, never suppressed');
    assert.deepEqual(observeCatalogFiles(sourceRoots,toolPaths.map(path=>({root:'repository',path}))),tools);
    assert.deepEqual(observeCatalogFiles(sourceRoots,names.map(path=>({root:'repository',path}))),observations);
    assert.equal(verifyCatalog(catalog,[roots[0]]).matchedBytes,true);
    const graph=JSON.parse(fs.readFileSync(meta,'utf8'));write('measured-compiler-metadata.json',graph);
    assert.equal(Object.keys(graph.outputs).length,1);
    const out=Object.values(graph.outputs)[0];assert.equal(out.entryPoint,'node_modules/express/index.js');
    const incorporated=Object.keys(graph.inputs).sort();assert.deepEqual(Object.keys(out.inputs).sort(),incorporated);
    const generated=observeCatalogFiles(roots,[{root:'output',path:bundle}])[0];assert.equal(out.bytes,generated.size);
    const normalized=[],consumed=new Set(),unmatched=[];
    const occurrences=prior.sourceEdges.map((edge,occurrence)=>({...edge,occurrence}));
    for(const source of incorporated){
      const measured=copied.find(f=>f.path===source);assert.ok(measured,'Unexpected compiler input: '+source);
      assert.equal(graph.inputs[source].bytes,measured.size);
      for(const edge of graph.inputs[source].imports){
        const specifier=edge.original??edge.path;
        const original=occurrences.find(e=>!consumed.has(e.occurrence)&&e.source===source&&e.specifier===specifier&&
          (edge.external||e.resolvedPath===edge.path));
        if(!original)unmatched.push({source,edge});else{
          consumed.add(original.occurrence);normalized.push({sourceOccurrence:original.occurrence,source,specifier,
            target:edge.path,disposition:edge.external?'external':'internal-wrapper',kind:edge.kind});
        }
      }
    }
    const incorporatedUnknown=incorporated.filter(p=>prior.retainedUnadmitted.includes(p));
    const retained=names.filter(p=>!incorporated.includes(p)||prior.retainedUnadmitted.includes(p));
    const unrepresented=occurrences.filter(e=>incorporated.includes(e.source)&&!consumed.has(e.occurrence));
    const measurement=({identity,...value})=>value;
    // Reuse the existing evidence envelope only. Its synthetic profile does NOT
    // validate real Express metadata, and no generated selection owner is issued.
    const content={outputs:[{...measurement(generated),role:'generated-code'}],sources:copied.filter(f=>incorporated.includes(f.path)).map(measurement),
      derivation:{generator:{...measurement(tools[0]),version:'0.28.2'},options:intent.options,entrypoint:{root:'sources',path:intent.entrypoint}},
      sourceEdges:occurrences,transformedEdges:normalized,externals:out.imports,unresolved:[...prior.unresolved,...unrepresented]};
    const record=createGeneratedArtifactRecord(content,[...copied,generated,...tools]);
    write('generated-provenance-description.json',record);
    const generatedManifest=createGeneratedArtifactManifest({candidates:[],unresolved:content.unresolved},record);
    write('generated-manifest-description.json',generatedManifest);
    assert.throws(()=>buildPackageAdmission(generatedManifest,[{path:bundle,reason:'Source review does not admit this generated artifact.'}]),e=>e.code==='GENERATED_ARTIFACT_DENIED');
    const report={productionAuthority:false,executionAuthority:false,completeClosure:false,atomicMeasuredHandleBinding:false,
      compilerAuthenticity:false,original:{contractPackageFiles:235,literalClosureFiles:231,backendFiles:825,backendUnresolved:4736},
      experimental:{generatedFiles:1,generated,incorporatedFiles:incorporated.length,incorporated,retainedFiles:retained.length,retained,
        candidatePhysicalLowerBound:1+retained.length,ceilingMet:1+retained.length<=64,deliveredRuntimePayload:false},
      compiler:{version:'0.28.2',tools,args,ownerPid:child.pid,invocations},
      sourceEdges:occurrences,transformedEdges:normalized,unmatched,unrepresented,incorporatedUnknown,externalImports:out.imports,
      originalLibraryControls:{freshlyRun:false,previousChildren:4,previousChecks:12,previousImportCache:135},
      prototypeLibraryControls:{children:0,executed:false,reason:'No independently reviewed Express generated-artifact admission profile; never inherit source admission.'},
      resources:{compilerChildren:1,compilerReturned:true,consumerChildren:0,jobs:0,aclOwners:0,cleanupConfirmed:false,preserved:true},
      compatibility:['Computed engine require must remain external/unresolved; metafile omission is not closure.',
        'Internal wrappers bypass ordinary Node per-file hooks; cache/stack/module graphs and source resolution require separate proof.',
        'All conditional/unobserved sources remain in source evidence; retained metadata and external iconv are counted separately.']};
    write('feasibility-report.json',report);
    assert.deepEqual(unmatched,[],'Compiler edges must correspond to measured source occurrences');
    const unexpected=unrepresented.filter(e=>e.specifier!=='<computed>');assert.deepEqual(unexpected,[],'Literal source edges cannot disappear silently');
    if(capture){
      const result=capture.complete({graph,generated,report});
      const recordPath=path.join(parent,'express-compiler-correspondence.json');
      result.resources.catalogFiles=result.catalog.entries.length;
      fs.writeFileSync(recordPath,JSON.stringify(result,null,2),{flag:'wx'});
      checked(base);fs.rmSync(base,{recursive:true,force:true});assert.equal(fs.existsSync(base),false);
      assert.deepEqual(fs.readdirSync(parent),['express-compiler-correspondence.json']);
      result.resources.cleanupConfirmed=true;result.resources.temporaryRootsRemaining=0;
      fs.writeFileSync(recordPath,JSON.stringify(result,null,2));completed=true;
      console.log(JSON.stringify({compilerInvocations:invocations,incorporated:result.actual.incorporated.length,transformed:result.actual.transformed.length,
        conditional:result.actual.conditional.length,outside:result.actual.outsideCompilerInputs.length,computed:result.actual.unresolvedComputed.length,
        checks:result.checks.length,catalogFiles:result.resources.catalogFiles,cleanupConfirmed:true}));return;
    }
    // An analysis compile may incorporate conditionals, but the earlier review
    // explicitly withheld execution admission for these files. Stop before probes.
    assert.deepEqual(incorporatedUnknown,[],'STOP: compiler incorporated retained-unadmitted conditional sources; independent review required');
    assert.equal(unrepresented.length,0,'STOP: computed resolution remains unsupported by the current generated-artifact profile');
    assert.fail('STOP: no independently reviewed Express generated-output profile; do not execute the prototype');
  }finally{if(!completed)console.error('Preserve this new compile-only session; no retry or cleanup: '+base);}
});
