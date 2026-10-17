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
function fixture(run,{evidence, freshBuild}={}){
  const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'discovery-iconv-metadata-'));
  const roots=['payload','sources','build'].map(id=>({id,path:path.join(base,freshBuild&&id==='sources'?'stage':id)}));for(const r of roots)fs.mkdirSync(r.path);
  const full=(root,name)=>path.join(roots.find(r=>r.id===root).path,name);
  const put=(root,name,bytes)=>{fs.mkdirSync(path.dirname(full(root,name)),{recursive:true});fs.writeFileSync(full(root,name),bytes,{flag:'wx'});};
  const measure=(root,name)=>{const {identity,...m}=observeCatalogFiles(roots,[{root,path:name}])[0];return m;};
  let completed=false;
  try{
    assert.ok(path.isAbsolute(evidence));assert.equal(fs.realpathSync(evidence),evidence);
    const archived=JSON.parse(fs.readFileSync(path.join(evidence,'consolidation-report.json'),'utf8'));
    const originalContract=JSON.parse(fs.readFileSync(path.join(evidence,'iconv-contract.json'),'utf8'));
    const intent=JSON.parse(fs.readFileSync(path.join(evidence,'compile-intent.json'),'utf8'));
    const originals=[...layout.incorporated,layout.safer,...layout.tables,...layout.metadata,...layout.unknown];
    assert.equal(originals.length,33);assert.equal(new Set(originals).size,33);
    for(const name of originals){
      const bytes=fs.readFileSync(path.join(evidence,'stage',name));
      const recorded=intent.sourceInputs.find(f=>f.path===name);assert.ok(recorded);
      assert.equal(sha(bytes),recorded.staged.sha256);assert.equal(sha(bytes),sha(fs.readFileSync(path.join(repo,name))));
      put('sources',name,bytes);
      if(!layout.incorporated.includes(name))put('payload',name,bytes);
    }
    for(const name of [layout.bundle,layout.facade]){
      const bytes=fs.readFileSync(path.join(evidence,'prototype',name));
      assert.equal(sha(bytes),archived.sourceMap.find(f=>f.path===name).copied.sha256);put('payload',name,bytes);
    }
    for(const name of layout.contexts){const bytes=fs.readFileSync(path.join(evidence,'stage',name));
      assert.equal(sha(bytes),originalContract.consumerEvidence.find(f=>f.path===name).measurement.sha256);
      assert.equal(sha(bytes),sha(fs.readFileSync(path.join(repo,name))));put('sources',name,bytes);}
    const lock=JSON.parse(fs.readFileSync(path.join(repo,'package-lock.json'),'utf8'));
    put('sources','package.json',JSON.stringify({dependencies:{'iconv-lite':'0.4.24','safer-buffer':'2.1.2'}}));
    put('sources','package-lock.json',JSON.stringify({lockfileVersion:3,packages:Object.fromEntries(['node_modules/iconv-lite','node_modules/safer-buffer'].map(p=>[p,lock.packages[p]]))}));
    put('sources','tsconfig.json','{}');
    // Static inventory roots do not scan arbitrary unselected packages. These
    // literal context references expose only their source to the analyzer.
    put('sources','src/resolution-contexts.cjs',"require('../node_modules/body-parser/lib/read.js');require('../node_modules/raw-body/index.js');");
    for(const tool of intent.tools){const bytes=fs.readFileSync(path.join(repo,tool.path));assert.equal(sha(bytes),tool.measurement.sha256);put('build',tool.path,bytes);}
    const binary=fs.readFileSync(path.join(repo,'node_modules/@esbuild/win32-x64/esbuild.exe'));assert.equal(sha(binary),intent.toolIdentity.sha256);put('build','esbuild.exe',binary);
    put('build','compile-intent.json',fs.readFileSync(path.join(evidence,'compile-intent.json')));
    put('build','esbuild-metafile.json',fs.readFileSync(path.join(evidence,'esbuild-metafile.json')));
    if(freshBuild)freshBuild({base,roots,full,put,measure,originals,intent,archived});
    const inv=inventory(full('sources',''),{entrypoints:[{role:'backend-stage',path:layout.facade},...layout.contexts.map(path=>({role:'resolution-context-only',path}))]});
    const graph=JSON.parse(fs.readFileSync(full('build','esbuild-metafile.json'),'utf8'));
    const normalized=layout.normalizeIconvMetafile(graph,inv,'payload','sources');
    const externals=[layout.safer,...layout.tables,...layout.metadata,...layout.unknown].map(name=>({...measure('payload',name),
      role:layout.unknown.includes(name)?'retained-unknown':layout.tables.includes(name)?'data':layout.metadata.includes(name)?'metadata':'dependency',origin:measure('sources',name)}));
    const archivedManifest=JSON.parse(fs.readFileSync(path.join(evidence,'stage','stage-manifest.json'),'utf8'));
    assert.equal(archivedManifest.unresolved.length,4736);
    const content={outputs:[layout.facade,layout.bundle].map(p=>({...measure('payload',p),role:'generated-code'})),sources:layout.incorporated.map(p=>measure('sources',p)),
      derivation:{generator:{...measure('build','esbuild.exe'),version:'0.28.2'},options:clone(layout.options),entrypoint:{root:'sources',path:layout.facade},
        configuration:[...intent.tools.map(t=>measure('build',t.path)),measure('build','compile-intent.json'),
          ...['package.json','package-lock.json','tsconfig.json','src/resolution-contexts.cjs',...layout.contexts].map(p=>measure('sources',p))],evidence:[]},
      inventorySha256:hash(inv),sourceEdges:normalized.sourceEdges,transformedEdges:normalized.transformedEdges,generatedEdges:normalized.generatedEdges,
      runtimeEdges:normalized.runtimeEdges,externals,runtimeDependencies:['node:buffer','node:stream','node:string_decoder'].map(specifier=>({specifier,runtime:'recorded-node-unapproved',status:'unresolved'})),
      unresolved:[...archivedManifest.unresolved,...inv.unresolved],compatibility:{profile:'iconv-lite-0.4.24-esbuild-0.28.2',
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
      manifest=createGeneratedArtifactManifest({candidates:externals.map(f=>({source:f.path,output:f.path,status:'copied-candidate',selectionReasons:['explicit-archival-copy']})),unresolved:content.unresolved},record);
      catalog=createCatalog({roots,staging:{root:'payload',manifest},experimentalGenerated:true,overlays:files.filter(f=>f.root!=='payload').map(f=>({root:f.root,path:f.path,reason:'Explicit non-executing archival build/source evidence.'}))});
      selection={variant,contentSha256:record.contentSha256,reviews:content.outputs.map(f=>({path:f.path,role:f.role,size:f.size,sha256:f.sha256,provenanceRef:record.contentSha256,reason:'Independently selected archival output bytes; evidence only.'})),
        externalReviews:externals.filter(e=>e.role!=='retained-unknown').map(e=>({path:e.path,reason:'Exact measured external input.'})),observations};
    };
    refresh();
    const f={base,roots,full,content,inv,refresh,get manifest(){return manifest;},get catalog(){return catalog;},get selection(){return selection;},
      session:()=>createGeneratedArtifactSelection({roots,payloadRoot:'payload',sourceRoot:'sources',manifest,inventory:inv,catalog,selection})};
    run(f);completed=true;
  }finally{
    const relative=path.relative(fs.realpathSync(os.tmpdir()),base);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    if(completed)fs.rmSync(base,{recursive:true,force:true});else console.error('Unexplained metadata failure; evidence preserved: '+base);
  }
}
module.exports={fixture};
