// Shared isolated admission fixture; optional single reviewed compile hook.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const layout=require('./iconv_artifact_metadata.cjs');
const {inventory}=require('../../../scripts/dependency-inventory.cjs');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../../scripts/payload-byte-catalog.cjs');
const {createGeneratedArtifactRecord,createGeneratedArtifactManifest,generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {createGeneratedArtifactSelection,buildPackageAdmission,installPackageAdmissionHooks}=require('../../../scripts/staged-backend-review.cjs');
const variant='iconv-esbuild-0.28.2-v1',repo=path.resolve(__dirname,'../../..'),clone=v=>JSON.parse(JSON.stringify(v));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Fresh-only snapshots are independent of the missing archival experiment.
// Pins are explicit test-owner selections, not inferred from compiler output.
function captureLocalInputs(pins){
  const originals=[...layout.incorporated,layout.safer,...layout.tables,...layout.metadata,...layout.unknown];
  const names=[...originals,...layout.contexts,'node_modules/esbuild/package.json','node_modules/@esbuild/win32-x64/package.json'];
  assert.equal(originals.length,33);assert.equal(layout.incorporated.length,13);assert.equal(layout.tables.length,8);assert.equal(layout.metadata.length,2);assert.equal(layout.unknown.length,9);
  assert.deepEqual(pins.map(p=>p[0]),names,'Exact ordered local selection; no aliases or omissions');
  const roots=[{id:'repository',path:repo}],refs=names.map(path=>({root:'repository',path}));
  const read=()=>observeCatalogFiles(roots,refs),observations=read();
  for(let i=0;i<pins.length;i++){assert.equal(observations[i].size,pins[i][1]);assert.equal(observations[i].sha256,pins[i][2]);}
  const bytes=name=>{const pin=pins.find(p=>p[0]===name);assert.ok(pin);const b=fs.readFileSync(path.join(repo,name));assert.equal(b.length,pin[1]);assert.equal(sha(b),pin[2],'Consumed local bytes');return b;};
  const lockMeasurement=observeCatalogFiles(roots,[{root:'repository',path:'package-lock.json'}])[0];
  const lockBytes=fs.readFileSync(path.join(repo,'package-lock.json'));assert.equal(sha(lockBytes),lockMeasurement.sha256);assert.equal(lockBytes.length,lockMeasurement.size);
  const lock=JSON.parse(lockBytes);
  for(const [name,version]of [['iconv-lite','0.4.24'],['safer-buffer','2.1.2'],['esbuild','0.28.2'],['@esbuild/win32-x64','0.28.2']]){
    const p='node_modules/'+name;assert.equal(JSON.parse(bytes(p+'/package.json')).version,version);assert.equal(lock.packages[p].version,version);
  }
  const verify=()=>{assert.deepEqual(read(),observations,'Local input identity/bytes changed');assert.deepEqual(observeCatalogFiles(roots,[{root:'repository',path:'package-lock.json'}])[0],lockMeasurement,'Local lock changed');};
  verify();return {originals,observations,lock,lockMeasurement,bytes,verify};
}
function fixture(run,{evidence, freshBuild,localFresh=false,pins}={}){
  assert.equal(typeof localFresh,'boolean');
  if(localFresh){assert.equal(evidence,undefined,'Fresh mode never reads archival evidence');assert.equal(typeof freshBuild,'function','Fresh mode requires the reviewed compiler hook');}
  const local=localFresh?captureLocalInputs(pins):null;
  const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'discovery-iconv-metadata-'));
  const roots=['payload','sources','build'].map(id=>({id,path:path.join(base,freshBuild&&id==='sources'?'stage':id)}));for(const r of roots)fs.mkdirSync(r.path);
  const full=(root,name)=>path.join(roots.find(r=>r.id===root).path,name);
  const put=(root,name,bytes)=>{fs.mkdirSync(path.dirname(full(root,name)),{recursive:true});fs.writeFileSync(full(root,name),bytes,{flag:'wx'});};
  const measure=(root,name)=>{const {identity,...m}=observeCatalogFiles(roots,[{root,path:name}])[0];return m;};
  let completed=false;
  try{
    let archived,originalContract,intent;
    if(!local){assert.ok(path.isAbsolute(evidence));assert.equal(fs.realpathSync(evidence),evidence);
      archived=JSON.parse(fs.readFileSync(path.join(evidence,'consolidation-report.json'),'utf8'));
      originalContract=JSON.parse(fs.readFileSync(path.join(evidence,'iconv-contract.json'),'utf8'));
      intent=JSON.parse(fs.readFileSync(path.join(evidence,'compile-intent.json'),'utf8'));
    }else{
      const asMeasurement=({identity,sha256})=>({identity,sha256});
      const binary='node_modules/@esbuild/win32-x64/esbuild.exe';
      const toolIdentity=observeCatalogFiles([{id:'repository',path:repo}],[{root:'repository',path:binary}])[0];
      assert.equal(toolIdentity.size,11694592);assert.equal(toolIdentity.sha256,'c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef');
      intent={productionAuthority:false,binary:path.join(repo,binary),toolIdentity:asMeasurement(toolIdentity),
        tools:['node_modules/esbuild/package.json','node_modules/@esbuild/win32-x64/package.json'].map(p=>{
          const lock=local.lock.packages[p.replace(/\/package\.json$/,'')];assert.equal(lock.version,'0.28.2');
          return {path:p,measurement:asMeasurement(local.observations.find(o=>o.path===p)),lock};
        }),
        args:[],workingDirectory:full('sources',''),sourceInputs:[],unknownRetained:clone(layout.unknown),compilationNotDependencyClosure:true,treeShaking:false,authoritativeStageUnchanged:true};
    }
    const originals=[...layout.incorporated,layout.safer,...layout.tables,...layout.metadata,...layout.unknown];
    assert.equal(originals.length,33);assert.equal(new Set(originals).size,33);
    for(const name of originals){
      const bytes=local?local.bytes(name):fs.readFileSync(path.join(evidence,'stage',name));
      if(!local){const recorded=intent.sourceInputs.find(f=>f.path===name);assert.ok(recorded);assert.equal(sha(bytes),recorded.staged.sha256);}
      assert.equal(sha(bytes),sha(fs.readFileSync(path.join(repo,name))));
      put('sources',name,bytes);
      if(!layout.incorporated.includes(name))put('payload',name,bytes);
    }
    if(!local)for(const name of [layout.bundle,layout.facade]){
      const bytes=fs.readFileSync(path.join(evidence,'prototype',name));
      assert.equal(sha(bytes),archived.sourceMap.find(f=>f.path===name).copied.sha256);put('payload',name,bytes);
    }
    for(const name of layout.contexts){const bytes=local?local.bytes(name):fs.readFileSync(path.join(evidence,'stage',name));
      if(!local)assert.equal(sha(bytes),originalContract.consumerEvidence.find(f=>f.path===name).measurement.sha256);
      assert.equal(sha(bytes),sha(fs.readFileSync(path.join(repo,name))));put('sources',name,bytes);}
    const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
    put('sources','package.json',JSON.stringify({dependencies:{'iconv-lite':'0.4.24','safer-buffer':'2.1.2'}}));
    put('sources','package-lock.json',JSON.stringify({lockfileVersion:3,packages:Object.fromEntries(['node_modules/iconv-lite','node_modules/safer-buffer'].map(p=>[p,lock.packages[p]]))}));
    put('sources','tsconfig.json','{}');
    // Static inventory roots do not scan arbitrary unselected packages. These
    // literal context references expose only their source to the analyzer.
    put('sources','src/resolution-contexts.cjs',"require('../node_modules/body-parser/lib/read.js');require('../node_modules/raw-body/index.js');");
    for(const tool of intent.tools){const bytes=local?local.bytes(tool.path):fs.readFileSync(path.join(repo,tool.path));assert.equal(sha(bytes),tool.measurement.sha256);put('build',tool.path,bytes);}
    const binary=fs.readFileSync(path.join(repo,'node_modules/@esbuild/win32-x64/esbuild.exe'));assert.equal(sha(binary),intent.toolIdentity.sha256);put('build','esbuild.exe',binary);
    put('build','compile-intent.json',local?JSON.stringify(intent):fs.readFileSync(path.join(evidence,'compile-intent.json')));
    if(!local)put('build','esbuild-metafile.json',fs.readFileSync(path.join(evidence,'esbuild-metafile.json')));
    if(local)put('build','fresh-context.json',JSON.stringify({scope:'fresh-local-only',historicalCorrespondence:'UNVERIFIED',historicalStageUnresolved:'unavailable; not reconstructed or discharged',observations:local.observations,lockMeasurement:local.lockMeasurement,authoritativeBaseline:825,ceiling:64,productionAuthority:false}));
    if(freshBuild)freshBuild({base,roots,full,put,measure,originals,intent,archived,local});
    if(local)local.verify();
    const inv=inventory(full('sources',''),{entrypoints:[{role:'backend-stage',path:layout.facade},...layout.contexts.map(path=>({role:'resolution-context-only',path}))]});
    const graph=JSON.parse(fs.readFileSync(full('build','esbuild-metafile.json'),'utf8'));
    const normalized=layout.normalizeIconvMetafile(graph,inv,'payload','sources');
    const externals=[layout.safer,...layout.tables,...layout.metadata,...layout.unknown].map(name=>({...measure('payload',name),
      role:layout.unknown.includes(name)?'retained-unknown':layout.tables.includes(name)?'data':layout.metadata.includes(name)?'metadata':'dependency',origin:measure('sources',name)}));
    const archivedManifest=local?null:JSON.parse(fs.readFileSync(path.join(evidence,'stage','stage-manifest.json'),'utf8'));
    if(archivedManifest)assert.equal(archivedManifest.unresolved.length,4736);
    const content={outputs:[layout.facade,layout.bundle].map(p=>({...measure('payload',p),role:'generated-code'})),sources:layout.incorporated.map(p=>measure('sources',p)),
      derivation:{generator:{...measure('build','esbuild.exe'),version:'0.28.2'},options:clone(layout.options),entrypoint:{root:'sources',path:layout.facade},
        configuration:[...intent.tools.map(t=>measure('build',t.path)),measure('build','compile-intent.json'),
          ...['package.json','package-lock.json','tsconfig.json','src/resolution-contexts.cjs',...layout.contexts].map(p=>measure('sources',p)),...(local?[measure('build','fresh-context.json')]:[])],evidence:[]},
      inventorySha256:hash(inv),sourceEdges:normalized.sourceEdges,transformedEdges:normalized.transformedEdges,generatedEdges:normalized.generatedEdges,
      runtimeEdges:normalized.runtimeEdges,externals,runtimeDependencies:['node:buffer','node:stream','node:string_decoder'].map(specifier=>({specifier,runtime:'recorded-node-unapproved',status:'unresolved'})),
      unresolved:[...(archivedManifest?.unresolved??[]),...inv.unresolved],compatibility:{profile:'iconv-lite-0.4.24-esbuild-0.28.2',
        metafile:{root:'build',path:'esbuild-metafile.json'},compileIntent:{root:'build',path:'compile-intent.json'},
        contexts:layout.contexts.map(path=>({root:'sources',path})),retainedUnknown:clone(layout.unknown)}};
    put('build','normalized-edges.json','{}');
    let manifest,catalog,selection;
    const refresh=()=>{
      // Test-owner review is deliberately independent of admission; negatives
      // can repin descriptive bytes to prove structural checks also reject them.
      for(const v of [...content.sources,...content.outputs,...content.externals,...content.externals.map(e=>e.origin),content.derivation.generator,...content.derivation.configuration])
        Object.assign(v,measure(v.root,v.path));
      fs.writeFileSync(full('build','normalized-edges.json'),JSON.stringify({sourceEdges:content.sourceEdges,transformedEdges:content.transformedEdges,runtimeEdges:content.runtimeEdges}));
      content.derivation.evidence=[measure('build','normalized-edges.json'),measure('build','esbuild-metafile.json')];
      const files=[...content.sources,...content.outputs,...content.externals,...content.externals.map(e=>e.origin),content.derivation.generator,...content.derivation.configuration,...content.derivation.evidence];
      const observations=observeCatalogFiles(roots,files.map(({root,path})=>({root,path})));
      const record=createGeneratedArtifactRecord(content,observations,variant);
      manifest=createGeneratedArtifactManifest({candidates:externals.map(f=>({source:f.path,output:f.path,status:'copied-candidate',selectionReasons:[local?'explicit-fresh-local-copy':'explicit-archival-copy']})),unresolved:content.unresolved},record);
      catalog=createCatalog({roots,staging:{root:'payload',manifest},experimentalGenerated:true,overlays:files.filter(f=>f.root!=='payload').map(f=>({root:f.root,path:f.path,reason:local?'Explicit fresh local build/source evidence; no historical identity.':'Explicit non-executing archival build/source evidence.'}))});
      selection={variant,contentSha256:record.contentSha256,reviews:content.outputs.map(f=>({path:f.path,role:f.role,size:f.size,sha256:f.sha256,provenanceRef:record.contentSha256,reason:local?'Independent fixed output pin plus fresh measurements; evidence only.':'Independently selected archival output bytes; evidence only.'})),
        externalReviews:externals.filter(e=>e.role!=='retained-unknown').map(e=>({path:e.path,reason:'Exact measured external input.'})),observations};
    };
    refresh();
    const f={base,roots,full,content,inv,refresh,get manifest(){return manifest;},get catalog(){return catalog;},get selection(){return selection;},
      session:()=>createGeneratedArtifactSelection({roots,payloadRoot:'payload',sourceRoot:'sources',manifest,inventory:inv,catalog,selection})};
    run(f);if(local)local.verify();completed=true;
  }finally{
    const relative=path.relative(fs.realpathSync(os.tmpdir()),base);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    if(completed)fs.rmSync(base,{recursive:true,force:true});else console.error('Unexplained metadata failure; evidence preserved: '+base);
  }
}
module.exports={fixture,captureLocalInputs};
