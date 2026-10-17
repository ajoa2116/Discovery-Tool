// Static descriptors and inert admission denials only. No vendor body or compiler.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {inventory}=require('../../scripts/dependency-inventory.cjs');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {normalizeDependencyGuardDescriptors:normalize,normalizeDependencyGuardCompilerCorrespondence:correspond,
  generatedArtifactContentHash:hash,createGeneratedArtifactRecord,createGeneratedArtifactManifest}=require('../../scripts/stage-backend.cjs');
const {createGeneratedArtifactSelection,buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');
const {specs}=require('./support/dependency_guard_descriptors.cjs');
const evidence=process.env.DISCOVERY_EXPRESS_CONTRACT,profile='express-guards-v1',clone=v=>JSON.parse(JSON.stringify(v));
test('conditional/computed descriptors remain exact, unresolved and non-authorizing',{skip:!evidence},async t=>{
  const parent=fs.realpathSync(os.tmpdir());assert.match(path.basename(parent),/^discovery-guard-validation-[a-f0-9]{32}$/);
  assert.equal(fs.lstatSync(parent).isSymbolicLink(),false);assert.deepEqual(fs.readdirSync(parent),[]);
  const base=fs.mkdtempSync(path.join(parent,'guard-descriptors-')),roots=[{id:'inputs',path:base}],repo=path.resolve(__dirname,'../..');
  const full=p=>path.join(base,p),put=(p,bytes)=>{fs.mkdirSync(path.dirname(full(p)),{recursive:true});fs.writeFileSync(full(p),bytes,{flag:'wx'});};
  let completed=false,failed=false;
  try{
    const prior=JSON.parse(fs.readFileSync(evidence,'utf8'));
    const names=[...new Set(specs.flatMap(s=>[s.importer,s.metadata,...(s.target?[s.target]:[])]))].sort();
    const original=[];
    for(const name of names){
      const observed=observeCatalogFiles([{id:'repository',path:repo}],[{root:'repository',path:name}])[0];
      assert.deepEqual(observed,prior.sourceProvenance.find(p=>p.path===name).source);original.push(observed);
      put(name,fs.readFileSync(path.join(repo,name)));
    }
    for(const [p,bytes] of [['package.json','{"dependencies":{}}'],['package-lock.json','{"packages":{}}'],['tsconfig.json','{}']])put(p,bytes);
    const entrypoints=specs.map(s=>({role:'backend-stage',path:s.importer}));
    // Entrypoint declarations annotate discovered files; retain the unseeded
    // snapshot to prove they cannot manufacture source-reference evidence.
    const unseededInventory=inventory(base,{entrypoints});
    const seed='src/descriptor-seeds.cjs';
    put(seed,specs.map(s=>'require('+JSON.stringify('../'+s.importer)+');').join('\n'));
    // Existing project-directory traversal discovers this inert wrapper and
    // follows its literal references. This file is parsed, never required.
    const inv=inventory(base,{entrypoints});
    const sourceEdges=prior.sourceEdges.map((e,occurrence)=>({occurrence,source:{root:'inputs',path:e.source},line:e.line,kind:'require',specifier:e.specifier,
      target:e.resolution==='node-builtin'?'node:'+e.specifier.replace(/^node:/,''):e.resolvedPath?{root:'inputs',path:e.resolvedPath}:null}));
    assert.equal(sourceEdges.length,347);
    const fileRefs=names.map(path=>({root:'inputs',path}));
    const files=observeCatalogFiles(roots,fileRefs);
    for(const file of files)assert.equal(file.sha256,original.find(o=>o.path===file.path).sha256);
    const modeledOutput='evidence/synthetic-wrapper-shape.txt';
    put(modeledOutput,'INERT SYNTHETIC EDGE-PROJECTION BYTES; NOT A COMPILER OUTPUT.\n');
    const candidates=[...names,'package.json','package-lock.json','tsconfig.json',seed,modeledOutput].map(path=>({source:path,output:path,status:'copied-candidate',selectionReasons:['Explicit static descriptor fixture evidence; no execution authority.']}));
    const manifest={candidates,unresolved:clone(prior.unresolved)};
    const catalog=createCatalog({roots,staging:{root:'inputs',manifest}});
    const observations=observeCatalogFiles(roots,candidates.map(c=>({root:'inputs',path:c.output})));
    const ref=p=>({root:'inputs',path:p});
    const extension={version:1,profile,inventorySha256:hash(inv),sourceEdgesSha256:hash(sourceEdges),files,
      descriptors:specs.map(s=>({occurrence:sourceEdges.find(e=>e.source.path===s.importer&&e.specifier===s.specifier).occurrence,
        source:ref(s.importer),specifier:s.specifier,target:s.target?ref(s.target):null,
        guard:{category:s.category,expression:s.expression},evidence:[ref(s.importer),ref(s.metadata),...(s.target?[ref(s.target)]:[])],
        reachability:s.target?'conditional':'unresolved',observedLoad:'not-asserted',compilerIncorporation:'not-asserted',runtimeAdmission:'unadmitted',closure:'unresolved',possibleTargets:null,
        derivation:s.target?null:'extension-or-default-engine -> this.ext -> this.ext.slice(1) -> require(mod)'}))};
    const input={profile,roots,catalog,inventory:inv,sourceEdges,observations,extension,sourceRoot:'inputs'};
    const denied=(run,reason)=>assert.throws(run,e=>e.code==='GENERATED_ARTIFACT_DENIED'&&(!reason||e.reason===reason));
    const sub=async(name,run)=>{
      if(failed){await t.test(name,t=>t.skip('Stopped after unexpected static assertion failure'));return;}
      await t.test(name,()=>{try{run();}catch(error){failed=true;throw error;}});
    };
    const baseline=hash({sourceEdges,extension,observations});
    await sub('five distinct file objects and one unknown computed target; immutable non-authorizing result',()=>{
      const r=normalize(input);assert.equal(r.conditionalFiles,5);assert.equal(r.computedEdges,1);assert.equal(r.sourceOccurrenceCount,347);
      assert.equal(r.productionAuthority,false);assert.equal(r.executionAuthority,false);assert.equal(r.completeClosure,false);
      assert.equal(new Set(extension.files.filter(f=>specs.some(s=>s.target===f.path)).map(f=>f.identity.dev+':'+f.identity.ino)).size,5);
      assert.equal(new Set(extension.descriptors.map(d=>d.occurrence)).size,6);assert.ok(Object.isFrozen(r.descriptors[0].guard));
      assert.equal(hash({sourceEdges,extension,observations}),baseline);
    });
    await sub('entrypoint names without traversal seeding still deny exact guard correspondence',()=>{
      assert.equal(unseededInventory.references.length,0);
      assert.ok(specs.every(s=>!unseededInventory.files.some(f=>f.path===s.importer)));
      assert.ok(specs.every(s=>inv.files.some(f=>f.path===s.importer)));
      const unseeded=clone(input);unseeded.inventory=unseededInventory;
      unseeded.extension.inventorySha256=hash(unseededInventory);
      denied(()=>normalize(unseeded),'guard-inventory-correspondence');
    });
    const changes=[
      ['missing descriptor',x=>x.extension.descriptors.pop()],
      ['duplicated descriptor',x=>x.extension.descriptors[1]=clone(x.extension.descriptors[0])],
      ['duplicate occurrence',x=>x.extension.descriptors[1].occurrence=x.extension.descriptors[0].occurrence],
      ['wrong occurrence',x=>x.extension.descriptors[0].occurrence++],
      ['missing original edge',x=>x.sourceEdges.splice(x.extension.descriptors[0].occurrence,1)],
      ['duplicated original edge',x=>x.sourceEdges[1]=clone(x.sourceEdges[0])],
      ['guard expression changed',x=>x.extension.descriptors[0].guard.expression='true'],
      ['guard category changed',x=>x.extension.descriptors[4].guard.category='unconditional'],
      ['wrong importer',x=>x.extension.descriptors[0].source.path=specs[1].importer],
      ['target substituted',x=>x.extension.descriptors[0].target.path=specs[1].target],
      ['path traversal',x=>x.extension.descriptors[0].target.path='../escape.js'],
      ['path case alias',x=>x.extension.descriptors[0].source.path=x.extension.descriptors[0].source.path.toUpperCase()],
      ['redirected file record',x=>x.extension.files[0].path='../escape.js'],
      ['source identity changed',x=>x.extension.files.find(f=>f.path===specs[0].importer).identity.ino='0'],
      ['target identity changed',x=>x.extension.files.find(f=>f.path===specs[0].target).identity.ino='0'],
      ['target digest changed',x=>x.extension.files.find(f=>f.path===specs[0].target).sha256='0'.repeat(64)],
      ['missing file evidence',x=>x.extension.files.pop()],
      ['missing AST evidence',x=>x.extension.descriptors[0].evidence=[]],
      ['malformed descriptor',x=>delete x.extension.descriptors[0].guard],
      ['unknown metadata field',x=>x.extension.descriptors[0].admitted=true],
      ['implicit profile',x=>delete x.profile],
      ['wrong version',x=>x.extension.version=2],
      ['invented computed target',x=>x.extension.descriptors[5].target={root:'inputs',path:specs[0].target}],
      ['finite computed target assertion',x=>x.extension.descriptors[5].possibleTargets=['ejs']],
      ['closed computed edge',x=>x.extension.descriptors[5].closure='closed'],
      ['computed derivation changed',x=>x.extension.descriptors[5].derivation='caller supplied approved path'],
      ['admitted conditional',x=>x.extension.descriptors[0].runtimeAdmission='admitted'],
      ['observed load invented',x=>x.extension.descriptors[0].observedLoad='loaded'],
      ['compiler incorporation invented',x=>x.extension.descriptors[0].compilerIncorporation='incorporated'],
    ];
    for(const [name,change] of changes)await sub(name+' denies',()=>{const altered=clone(input);change(altered);denied(()=>normalize(altered));});
    await sub('valid descriptors never admit an artifact; denial is sticky and copied fallback fails',()=>{
      const content={outputs:[],sourceEdges,inventorySha256:hash(inv),conditionalGuards:extension};
      const record=createGeneratedArtifactRecord(content,observations),m=createGeneratedArtifactManifest(manifest,record);
      const selection={variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:[],externalReviews:[],observations};
      const args={roots,payloadRoot:'inputs',sourceRoot:'inputs',manifest:m,inventory:inv,catalog,selection,conditionalGuardProfile:profile};
      const owner=createGeneratedArtifactSelection(args);denied(()=>owner.admit(),'conditional-descriptors-not-admission');assert.equal(owner.denied,true);
      denied(()=>createGeneratedArtifactSelection(args),'selection-owner');
      delete m.generatedArtifact;denied(()=>owner.admit(),'sticky-denial');denied(()=>buildPackageAdmission(m,[]));
    });
    await sub('guard tampering latches existing owner despite record replacement or source-only review',()=>{
      const bad=clone(extension);bad.descriptors[0].guard.expression='true';
      const record=createGeneratedArtifactRecord({outputs:[],sourceEdges,inventorySha256:hash(inv),conditionalGuards:bad},observations);
      const m=createGeneratedArtifactManifest(manifest,record),selection={variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:[],externalReviews:[],observations};
      const owner=createGeneratedArtifactSelection({roots,payloadRoot:'inputs',sourceRoot:'inputs',manifest:m,inventory:inv,catalog,selection,conditionalGuardProfile:profile});
      denied(()=>owner.admit(),'guard-expression');m.generatedArtifact.content.conditionalGuards=clone(extension);
      denied(()=>owner.admit(),'sticky-denial');denied(()=>buildPackageAdmission(m,[{path:specs[0].target,reason:'Source review is not generated authority.'}]));
    });
    await sub('without explicit profile, annotation cannot silently enter historical admission',()=>{
      const record=createGeneratedArtifactRecord({outputs:[],conditionalGuards:extension},observations),m=createGeneratedArtifactManifest(manifest,record);
      const owner=createGeneratedArtifactSelection({roots,payloadRoot:'inputs',sourceRoot:'inputs',manifest:m,inventory:inv,catalog,
        selection:{variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:[],externalReviews:[],observations}});
      denied(()=>owner.admit(),'conditional-guard-opt-in');
    });
    // Freshly constructed partial records, not copied/reconstructed actual compiler
    // observations. Only the five conditional edges are modeled; all other source
    // occurrences stay out of scope and View's computed request stays unresolved.
    const modeledPaths=[...new Set(specs.flatMap(s=>[s.importer,...(s.target?[s.target]:[])]))].sort();
    const outputMeasurement=observations.find(f=>f.path===modeledOutput);
    const compilerEvidence={version:1,profile:'express-guard-correspondence-v1',kind:'synthetic-source-derived',scope:'five-conditional-occurrences',
      descriptorSha256:hash(extension),sourceEdgesSha256:hash(sourceEdges),output:outputMeasurement,
      graph:{inputs:Object.fromEntries(modeledPaths.map(name=>[name,{bytes:files.find(f=>f.path===name).size,format:'cjs',
        imports:specs.filter(s=>s.importer===name&&s.target).map(s=>({path:s.target,kind:'require-call',original:s.specifier}))}])),
      outputs:{[modeledOutput]:{bytes:outputMeasurement.size,imports:[],inputs:Object.fromEntries(modeledPaths.map(name=>[name,{bytesInOutput:1}]))}}}};
    const compilerInput={...input,compilerEvidence};
    await sub('synthetic projection binds five distinct conditional occurrences; never claims actual compiler correspondence',()=>{
      const result=correspond(compilerInput);
      assert.equal(result.genuineCompilerMatch,false);assert.equal(result.evidenceKind,'synthetic-source-derived');
      assert.equal(result.executionAuthority,false);assert.equal(result.productionAuthority,false);assert.equal(result.completeClosure,false);
      assert.equal(result.matchedModeledOccurrences.length,5);assert.equal(result.modeledCompilerInputs,11);
      assert.equal(result.unresolvedComputed.length,1);assert.equal(result.unresolvedComputed[0].target,null);
      assert.equal(result.unresolvedComputed[0].possibleTargets,null);assert.equal(result.outOfScopeSourceOccurrences,341);
      assert.equal(5+result.unresolvedComputed.length+result.outOfScopeSourceOccurrences,347);
      assert.equal(new Set(result.matchedModeledOccurrences.map(r=>r.targetMeasurement.identity.ino)).size,5);
      assert.ok(result.matchedModeledOccurrences.every(r=>r.emittedWrapper==='not-demonstrated'&&r.runtimeAdmission==='unadmitted'));
      assert.ok(Object.isFrozen(result.matchedModeledOccurrences[0].packageIdentity.metadata.identity));
    });
    const correspondenceMutations=[
      ['missing conditional edge',x=>x.compilerEvidence.graph.inputs[specs[0].importer].imports=[]],
      ['duplicated compiler edge',x=>{const e=x.compilerEvidence.graph.inputs[specs[0].importer].imports;e.push(clone(e[0]));}],
      ['missing target compiler input',x=>delete x.compilerEvidence.graph.inputs[specs[0].target]],
      ['case-aliased compiler input',x=>{const g=x.compilerEvidence.graph;g.inputs[specs[0].target.toUpperCase()]=g.inputs[specs[0].target];delete g.inputs[specs[0].target];}],
      ['redirected target',x=>x.compilerEvidence.graph.inputs[specs[0].importer].imports[0].path='../escape.js'],
      ['same-bytes different target substituted',x=>x.compilerEvidence.graph.inputs[specs[0].importer].imports[0].path=specs[1].target],
      ['original specifier changed',x=>x.compilerEvidence.graph.inputs[specs[0].importer].imports[0].original='./node.js'],
      ['unmatched leaf compiler import',x=>x.compilerEvidence.graph.inputs[specs[0].target].imports.push({path:'unreviewed',kind:'require-call',external:true})],
      ['unexpected runtime request',x=>x.compilerEvidence.graph.outputs[modeledOutput].imports.push({path:'fixture-engine',kind:'require-call',external:true})],
      ['invented computed engine import',x=>x.compilerEvidence.graph.inputs[specs[5].importer].imports.push({path:'ejs',kind:'require-call',external:true})],
      ['guard changed under projection',x=>x.extension.descriptors[0].guard.expression='true'],
      ['conditional admitted under projection',x=>x.extension.descriptors[0].runtimeAdmission='admitted'],
      ['target identity substituted',x=>x.extension.files.find(f=>f.path===specs[0].target).identity.ino='0'],
      ['output identity changed',x=>x.compilerEvidence.output.identity.ino='0'],
      ['output digest changed',x=>x.compilerEvidence.output.sha256='0'.repeat(64)],
      ['output namespace alias',x=>{const g=x.compilerEvidence.graph;g.outputs['../other.txt']=g.outputs[modeledOutput];delete g.outputs[modeledOutput];}],
      ['input byte count mismatch',x=>x.compilerEvidence.graph.inputs[specs[0].importer].bytes++],
      ['missing output wrapper record',x=>delete x.compilerEvidence.graph.outputs[modeledOutput].inputs[specs[0].target]],
      ['fabricated actual compiler claim',x=>x.compilerEvidence.kind='actual-esbuild-metafile'],
      ['malformed compiler evidence',x=>x.compilerEvidence.compilerAuthentic=true],
      ['stale descriptor binding',x=>x.compilerEvidence.descriptorSha256='0'.repeat(64)],
    ];
    for(const [name,mutate] of correspondenceMutations)await sub('projection '+name+' denies',()=>{
      const altered=clone(compilerInput);mutate(altered);denied(()=>correspond(altered));
    });
    for(const tampered of [false,true])await sub('projection '+(tampered?'edge tampering latches denial':'valid evidence cannot issue admission'),()=>{
      const compiler=clone(compilerEvidence);if(tampered)compiler.graph.inputs[specs[0].importer].imports[0].path=specs[1].target;
      const record=createGeneratedArtifactRecord({outputs:[],sourceEdges,inventorySha256:hash(inv),conditionalGuards:extension,guardCompilerEvidence:compiler},observations);
      const m=createGeneratedArtifactManifest(manifest,record),args={roots,payloadRoot:'inputs',sourceRoot:'inputs',manifest:m,inventory:inv,catalog,
        selection:{variant:'synthetic-generated-v1',contentSha256:record.contentSha256,reviews:[],externalReviews:[],observations},conditionalGuardProfile:profile};
      const owner=createGeneratedArtifactSelection(args);
      denied(()=>owner.admit(),tampered?'compiler-guard-edge-correspondence':'conditional-descriptors-not-admission');
      assert.equal(owner.denied,true);denied(()=>createGeneratedArtifactSelection(args),'selection-owner');
      m.generatedArtifact.content.guardCompilerEvidence=clone(compilerEvidence);denied(()=>owner.admit(),'sticky-denial');
      delete m.generatedArtifact;denied(()=>buildPackageAdmission(m,[]));
      denied(()=>buildPackageAdmission(m,[{path:specs[0].target,reason:'Source-only fallback is prohibited.'}]));
    });
    if(failed)throw Error('STOP: preserve new descriptor evidence: '+base);
    assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);assert.equal(catalog.entries.length,22);
    for(const name of names)assert.deepEqual(observeCatalogFiles([{id:'repository',path:repo}],[{root:'repository',path:name}])[0],original.find(o=>o.path===name));
    assert.ok(path.relative(parent,base)&&!path.relative(parent,base).startsWith('..'));assert.equal(fs.realpathSync(base),base);
    fs.rmSync(base,{recursive:true,force:true});assert.equal(fs.existsSync(base),false);assert.deepEqual(fs.readdirSync(parent),[]);completed=true;
    console.log('Descriptor fixture: 22 files cleaned; no retained roots, compiler or consumer children.');
  }finally{if(!completed)console.error('Preserve this new descriptor session: '+base);}
});
