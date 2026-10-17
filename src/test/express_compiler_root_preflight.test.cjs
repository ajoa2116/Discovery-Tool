// Static root/binding checks only. Inert bytes are never a compiler image.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {observeCatalogFiles,createCatalog,verifyCatalog}=require('../../scripts/payload-byte-catalog.cjs');
const ts=require('typescript');
function checked(full){assert.equal(fs.realpathSync(full),full);for(let p=full;;p=path.dirname(p)){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(path.dirname(p)===p)break;}}
test('Express capture root preflight preserves lowercase catalog identity',async t=>{
  const parent=fs.realpathSync(os.tmpdir());checked(parent);
  const base=fs.mkdtempSync(path.join(parent,'discovery-express-root-preflight-'));checked(base);
  const root=path.join(base,'compiler-evidence');fs.mkdirSync(root);
  const file='node_modules/@esbuild/win32-x64/esbuild.exe',full=path.join(root,file);
  fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,'INERT ROOT-ID TEST DATA; NEVER EXECUTE',{flag:'wx'});
  const roots=[{id:'compiler-evidence',path:root}],reference={root:'compiler-evidence',path:file};
  const manifest={candidates:[{source:file,output:file,status:'copied-candidate',selectionReasons:['Inert root preflight only.']}],unresolved:[]};
  let completed=false,failed=false;
  const sub=async(name,run)=>{
    if(failed){await t.test(name,t=>t.skip('Stopped after static preflight failure'));return;}
    await t.test(name,()=>{try{run();}catch(error){failed=true;throw error;}});
  };
  try{
    await sub('valid lowercase root and evidence reference are accepted',()=>{
      const measured=observeCatalogFiles(roots,[reference]);assert.equal(measured.length,1);assert.equal(measured[0].root,'compiler-evidence');
      const catalog=createCatalog({roots,staging:{root:'compiler-evidence',manifest}});
      assert.equal(catalog.entries.length,1);assert.equal(verifyCatalog(catalog,roots).matchedBytes,true);
    });
    await sub('original mixed-case root stays rejected without normalization',()=>{
      const invalidRoots=[{id:'compilerEvidence',path:root}];
      assert.throws(()=>observeCatalogFiles(invalidRoots,[{root:'compilerEvidence',path:file}]),{code:'root'});
      assert.throws(()=>createCatalog({roots:invalidRoots,staging:{root:'compilerEvidence',manifest}}),{code:'root'});
    });
    await sub('mismatched reference IDs cannot bind to the valid root',()=>{
      for(const id of ['compilerEvidence','Compiler-evidence','output'])
        assert.throws(()=>observeCatalogFiles(roots,[{root:id,path:file}]),{code:'root'});
      assert.equal(observeCatalogFiles(roots,[reference])[0].root,'compiler-evidence');
    });
    await sub('capture and validation source use the corrected ID consistently',()=>{
      for(const file of ['express_compiler_capture.cjs','dependency_guard_descriptors.cjs']){
        const text=fs.readFileSync(path.join(__dirname,'support',file),'utf8');
        const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0);
        const literals=[];const walk=n=>{if(ts.isStringLiteral(n))literals.push(n.text);ts.forEachChild(n,walk);};walk(tree);
        assert.equal(literals.includes('compilerEvidence'),false,'No obsolete root-ID literal in '+file);
        assert.ok(literals.includes('compiler-evidence'));
        assert.ok(text.includes('compilerEvidence'),'Evidence object property remains distinct from root ID');
      }
      const capture=fs.readFileSync(path.join(__dirname,'support/express_compiler_capture.cjs'),'utf8');
      assert.ok(capture.includes("roots.push({id:'compiler-evidence',path:evidenceRoot})"));
      const validator=fs.readFileSync(path.join(__dirname,'support/dependency_guard_descriptors.cjs'),'utf8');
      assert.ok(validator.includes("e.output.root==='output'"));assert.ok(validator.includes("e.generator.root==='compiler-evidence'"));
      assert.ok(validator.includes("r.id==='compiler-evidence'"));assert.ok(validator.includes("f.root==='compiler-evidence'"));
    });
    if(failed)throw Error('STOP: static root preflight failed; preserve '+base);
    checked(base);const relative=path.relative(parent,base);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    fs.rmSync(base,{recursive:true,force:true});assert.equal(fs.existsSync(base),false);completed=true;
    console.log('Root preflight: one inert file cleaned; no retained case root or compiler invocation.');
  }finally{if(!completed)console.error('Preserve only the new root-preflight fixture: '+base);}
});
