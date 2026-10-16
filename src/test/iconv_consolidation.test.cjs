// Opt-in bounded experiment: the imported test establishes the unchanged stage
// and nine original cold controls first. No production registration is executed.
const assert=require('node:assert/strict'), {test}=require('node:test');
const fs=require('node:fs'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const {getBaseline}=require('./iconv_lazy_contract.test.cjs');
const {javascript,tables,metadata,modes,reviews}=require('./support/iconv_lazy_probe.cjs');
const {createCatalog,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const {buildPackageAdmission}=require('../../scripts/staged-backend-review.cjs');

test('isolated iconv consolidation preserves variant-aware behavior and exact admission',()=>{
  const b=getBaseline(); assert.ok(b,'Original controls must complete first; no fallback stage or retry.');
  const {repo,out,stage,manifest,provenance,measure,checked,env}=b;
  const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2),{flag:'wx'});
  const build=path.join(out,'compile'), prototype=path.join(out,'prototype'), harness=path.join(out,'prototype-harness');
  for(const root of [build,prototype,harness]) {fs.mkdirSync(root);checked(root);}
  console.log('Iconv consolidation evidence: '+out);
  const bundle='node_modules/iconv-lite/encodings/consolidated.cjs', facade='node_modules/iconv-lite/lib/index.js';
  const inputs=javascript.filter(p=>p.startsWith('node_modules/iconv-lite/'));
  const retained=provenance.filter(f=>!inputs.includes(f.path));
  const unknown=retained.filter(f=>![...tables,...metadata,'node_modules/safer-buffer/safer.js'].includes(f.path));
  assert.equal(inputs.length,13);assert.equal(unknown.length,9);assert.equal(provenance.length,33);
  const binary=path.join(repo,'node_modules/@esbuild/win32-x64/esbuild.exe');
  const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
  const tools=['node_modules/esbuild/package.json','node_modules/@esbuild/win32-x64/package.json'].map(p=>{
    const pkg=JSON.parse(fs.readFileSync(path.join(repo,p),'utf8')), location=path.posix.dirname(p);
    assert.equal(pkg.version,'0.28.2');assert.equal(lock.packages[location].version,pkg.version);
    assert.ok(/^sha512-/.test(lock.packages[location].integrity));
    return {path:p,measurement:measure(path.join(repo,p)),lock:lock.packages[location]};
  });
  const toolIdentity=measure(binary), output=path.join(build,bundle), meta=path.join(out,'esbuild-metafile.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});checked(path.dirname(output));
  // Keep all module bodies and their internal CommonJS lazy wrappers. JSON and
  // safer-buffer remain external; placement preserves ./tables/*.json exactly.
  // Use the installed CLI directly: no downloaded compiler, plugin or service.
  const args=['node_modules/iconv-lite/lib/index.js','--bundle','--platform=node','--format=cjs',
    '--target=node24','--tree-shaking=false','--external:safer-buffer','--external:./tables/*.json',
    '--outfile='+output,'--metafile='+meta,'--log-level=warning'];
  write('compile-intent.json',{productionAuthority:false,binary,toolIdentity,tools,args,
    workingDirectory:stage,sourceInputs:provenance,unknownRetained:unknown.map(f=>f.path),
    compilationNotDependencyClosure:true,treeShaking:false,authoritativeStageUnchanged:true});
  const compile=spawnSync(binary,args,{cwd:stage,env,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  write('compile-owner.json',{pid:compile.pid,status:compile.status,signal:compile.signal,error:compile.error?.message??null,stderr:compile.stderr,stdout:compile.stdout});
  assert.equal(compile.error,undefined);assert.equal(compile.signal,null);assert.equal(compile.status,0,compile.stderr);
  assert.equal(compile.stderr,'','Compiler warnings are not silently accepted.');
  assert.deepEqual(measure(binary),toolIdentity);
  const graph=JSON.parse(fs.readFileSync(meta,'utf8'));
  const slash=p=>p.split(path.sep).join('/');
  assert.deepEqual(Object.keys(graph.inputs).map(slash).sort(),[...inputs].sort());
  assert.equal(Object.keys(graph.outputs).length,1);
  const artifact=Object.values(graph.outputs)[0];
  assert.deepEqual(Object.keys(artifact.inputs).map(slash).sort(),[...inputs].sort());
  const externals=[...new Set(artifact.imports.map(i=>i.path))].sort();
  const allowed=['buffer','stream','string_decoder','safer-buffer',...tables.map(t=>'./tables/'+path.posix.basename(t))].sort();
  assert.deepEqual(externals,allowed);
  assert.ok(artifact.imports.every(i=>i.external&&i.kind==='require-call'));
  for(const file of inputs)assert.equal(graph.inputs[file].bytes,Number(provenance.find(f=>f.path===file).staged.identity.size));
  const inventory=JSON.parse(fs.readFileSync(path.join(stage,'inventory.json'),'utf8'));
  const transformedEdges=[];
  for(const file of inputs) {
    assert.ok(reviews.some(r=>r.path===file),'All incorporated source bodies need explicit fixture review.');
    const references=inventory.references.filter(r=>r.source===file&&r.kind==='require');
    const imports=graph.inputs[file].imports;
    assert.equal(imports.length,references.length,'No source dependency may disappear from compile accounting.');
    for(const edge of imports) {
      const specifier=edge.original??edge.path;
      const reference=references.find(r=>r.specifier===specifier);assert.ok(reference,'Missing inventory provenance: '+file+':'+specifier);
      assert.equal(edge.kind,'require-call');
      if(!edge.external) {assert.ok(inputs.includes(edge.path));assert.equal(reference.resolvedPath,edge.path);}
      else {
        assert.ok(allowed.includes(edge.path));
        if(edge.path==='safer-buffer')assert.equal(reference.resolvedPath,'node_modules/safer-buffer/safer.js');
        if(edge.path.startsWith('./tables/'))assert.equal(reference.resolvedPath,path.posix.join(path.posix.dirname(file),edge.path));
      }
      transformedEdges.push({source:file,specifier,originalTarget:reference.resolvedPath??edge.path,
        emittedImporter:bundle,emittedTarget:edge.external?edge.path:bundle,
        kind:edge.external?'runtime-external':'internal-wrapper-not-node-loader-event'});
    }
  }
  const externalTarget=specifier=>specifier==='safer-buffer'?'node_modules/safer-buffer/safer.js':
    specifier.startsWith('./tables/')?path.posix.join(path.posix.dirname(bundle),specifier):'node:'+specifier;
  const runtimeEdges=[...externals.map(specifier=>({from:bundle,specifier,to:externalTarget(specifier)})),
    {from:facade,specifier:'../encodings/consolidated.cjs',to:bundle},
    {from:'node_modules/safer-buffer/safer.js',specifier:'buffer',to:'node:buffer'},
    ...['node_modules/body-parser/lib/read.js','node_modules/raw-body/index.js'].map(from=>({from,specifier:'iconv-lite',to:facade}))];
  assert.ok(inventory.references.some(r=>r.source==='node_modules/safer-buffer/safer.js'&&r.specifier==='buffer'));
  // Parse without executing either generated module. These exact source bytes
  // are copied only into the non-authorizing prototype, never into the stage.
  fs.mkdirSync(path.dirname(path.join(build,facade)),{recursive:true});
  fs.writeFileSync(path.join(build,facade),"'use strict';\nmodule.exports = require('../encodings/consolidated.cjs');\n",{flag:'wx'});
  const {Script}=require('node:vm');
  for(const file of [bundle,facade])new Script(fs.readFileSync(path.join(build,file),'utf8'),{filename:file});
  const sourceMap=[];
  for(const entry of [...retained.map(f=>({path:f.path,root:stage,kind:'unchanged-selected-input'})),
    ...[bundle,facade].map(p=>({path:p,root:build,kind:'generated-compile-output'}))]){
    const target=path.join(prototype,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});checked(path.dirname(target));
    const source=measure(path.join(entry.root,entry.path));
    fs.copyFileSync(path.join(entry.root,entry.path),target,fs.constants.COPYFILE_EXCL);
    const copied=measure(target);assert.equal(copied.sha256,source.sha256);
    sourceMap.push({...entry,source,copied});
  }
  // Existing manifest shape describes copies from explicitly recorded build or
  // stage roots. This is a fixture artifact manifest, NOT backend selection.
  const experimentalManifest={purpose:'non-authorizing-compile-artifact-copies',productionAuthority:false,completeClosure:false,
    candidates:sourceMap.map(f=>({source:f.path,output:f.path,status:'copied-candidate',
      selectionReasons:['fixture-only-copy-from:'+f.root, f.kind]})),
    unresolved:manifest.unresolved,loadingSummary:manifest.loadingSummary};
  const active=['node_modules/safer-buffer/safer.js',facade,bundle,...tables,...metadata];
  const admission=buildPackageAdmission(experimentalManifest,active.map(path=>({path,reason:'Exact compile-experiment artifact; not production approval.'})));
  assert.equal(admission.admitted.length,13);
  assert.equal(buildPackageAdmission(manifest).admitted.some(a=>a.path===bundle),false,'Historical source selection cannot admit a generated bundle.');
  fs.writeFileSync(path.join(prototype,'stage-manifest.json'),JSON.stringify(experimentalManifest,null,2),{flag:'wx'});
  fs.copyFileSync(path.join(stage,'.iconv-lazy-probe.cjs'),path.join(prototype,'.iconv-lazy-probe.cjs'),fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(b.harness,'review.cjs'),path.join(harness,'review.cjs'),fs.constants.COPYFILE_EXCL);
  const config=path.join(harness,'config.json');
  fs.writeFileSync(config,JSON.stringify({stage:prototype,consolidation:'external-tables-cjs-facade-v1',runtimeEdges,files:sourceMap.map(f=>({path:f.path,...f.copied}))},null,2),{flag:'wx'});
  const roots=[{id:'prototype',path:prototype},{id:'harness',path:harness},{id:'compile',path:build}];
  const overlays=[['prototype','stage-manifest.json'],['prototype','.iconv-lazy-probe.cjs'],['harness','review.cjs'],['harness','config.json'],
    ['compile',bundle],['compile',facade]].map(([root,path])=>({root,path,reason:'Explicit inert compile/test input, not backend selection.'}));
  const catalog=createCatalog({roots,staging:{root:'prototype',manifest:experimentalManifest},overlays,
    externalUnresolved:[{reason:'Node/runtime and exact mapped-image backing identity remain unapproved/unproven.'}]});
  write('prototype-byte-catalog.json',catalog);
  assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);
  const report={productionAuthority:false,completeClosure:false,selectedPayloadChanged:false,manifestCeiling:64,
    before:{backendSelected:b.report.stageSelected,packageAdmission:b.report.existingPackageAdmissionCount,unresolved:manifest.unresolved.length,
      experimentalSubset:33,executable:14,data:8,metadata:2,otherUnknown:9},
    after:{backendSelected:b.report.stageSelected,packageAdmission:b.report.existingPackageAdmissionCount,unresolved:manifest.unresolved.length,
      experimentalSubset:sourceMap.length,executable:3,data:8,metadata:2,otherUnknown:9,consolidatedSourceModules:13,consolidatedOutputs:2},
    compiler:{tools,binary,toolIdentity,args,graph},sourceMap,transformedEdges,runtimeEdges,unknownRetained:unknown.map(f=>f.path),
    packageMetadataUnchanged:true,conditionalAssets:tables.map(p=>({path:p,external:true,prototypeRuntimeVerified:false})),
    originalControls:{children:b.report.results.length,checks:b.report.results.reduce((n,r)=>n+r.checks.length,0)},
    equivalence:false,ceilingMetForBackend:false,atomicMeasuredHandleBinding:false,
    pending:['Equivalence is bounded to explicit fixture controls; not arbitrary module introspection or full package compatibility.',
      'Nine selected unexercised files retained, not classified unnecessary.',
      'Runtime/version/upstream provenance and full backend/provider closure remain unresolved.']};
  write('consolidation-before-execution.json',report);
  const results=[];
  for(const mode of modes) {
    const childArgs=['--permission','--allow-fs-read='+out,'--no-addons','--no-experimental-strip-types',path.join(prototype,'.iconv-lazy-probe.cjs'),config,mode];
    const child=spawnSync(process.execPath,childArgs,{cwd:prototype,env,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    const owner={mode,pid:child.pid,args:childArgs,status:child.status,signal:child.signal,error:child.error?.message??null,stderr:child.stderr};
    write('prototype-'+mode+'-owner.json',owner);
    fs.writeFileSync(path.join(out,'prototype-'+mode+'-stdout.json'),child.stdout||'',{flag:'wx'});
    // Raw evidence is durable before checking anything. Never run the next mode
    // after a mismatch, denial, timeout or inconclusive process result.
    try {
      assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0,child.stderr);
      const result=JSON.parse(child.stdout), original=b.report.results.find(r=>r.mode===mode);
      assert.equal(result.passed,true);assert.equal(result.variant,'consolidated');assert.deepEqual(result.violations,[]);
      for(const key of ['behavior','codecNames','registryNames','registry','exportsShape','packageMetadata','runtime','checks'])
        assert.deepEqual(result[key],original[key],'Variant difference: '+mode+':'+key);
      assert.equal(result.productionAuthority,false);assert.equal(result.completeClosure,false);
      assert.deepEqual(result.phases.map(({loaded,...logical})=>logical),original.phases.map(({loaded,...logical})=>logical));
      assert.ok(result.phases.every(p=>p.loaded.every(name=>active.includes(name))));
      results.push({...result,owner});
    } catch(error) {
      write('consolidation-stop.json',{stopped:true,mode,error:error.stack,owner,completedPrototypeModes:results.length,
        productionAuthority:false,evidencePreserved:true,retry:false,cleanupAttempted:false});
      throw error;
    }
  }
  const observed=[...new Set(results.flatMap(r=>r.loaded))].sort();
  assert.deepEqual(observed,[facade,bundle,'node_modules/safer-buffer/safer.js',...tables].sort());
  // Correspondence checks after all cold processes return. No prior session or
  // Windows owned-input/process recovery mechanism is accessed by this fixture.
  report.finalVerification={stage:verifyCatalog(b.catalog,b.roots),prototype:verifyCatalog(catalog,roots)};
  for(const f of provenance){assert.deepEqual(measure(path.join(repo,f.path)),f.source);assert.deepEqual(measure(path.join(stage,f.path)),f.staged);}
  for(const f of sourceMap){assert.deepEqual(measure(path.join(f.root,f.path)),f.source);assert.deepEqual(measure(path.join(prototype,f.path)),f.copied);}
  assert.deepEqual(measure(binary),toolIdentity);
  report.results=results;report.observed=observed;
  report.equivalence=true;report.scope='reviewed-library-controls-only';report.universalPackageEquivalence=false;
  report.stopped=false;
  for(const asset of report.conditionalAssets)asset.prototypeRuntimeVerified=observed.includes(asset.path);
  report.compatibilityDifferences=['Deep imports of consolidated-away source modules are not supported or validated.',
    'Physical cache entries, module parent/children graphs, cache deletion/reload behavior and stack filenames differ or remain untested.',
    'Internal wrapper calls bypass Node hooks; source/metafile accounting is not measured file consumption.',
    'Functions in registry comparison are classified by kind, not proven equivalent by source text.'];
  report.resources={compilerReturned:compile.status===0,originalChildrenReturned:b.report.results.length,prototypeChildrenReturned:results.length,
    additionalConsumersLaunched:0,fileDescriptorsScopedFinally:true,aclOwnersCreated:0,windowsProcessLeaseAuthority:false,
    evidenceRetained:true,automaticCleanupAttempted:false};
  write('consolidation-report.json',report);
  console.log(JSON.stringify({originalChildren:b.report.results.length,prototypeChildren:results.length,compilerChildren:1,
    checksPerVariant:results.reduce((n,r)=>n+r.checks.length,0),subset:sourceMap.length,matchedModes:results.length,
    stageUnchanged:true,productionAuthority:false}));
});
