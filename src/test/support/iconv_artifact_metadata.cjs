// Fixed metadata compatibility only. Never compiles, imports a package body,
// resolves a recorded filesystem path, or creates admission/execution authority.
const path=require('node:path'),crypto=require('node:crypto');
const {javascript,tables,metadata}=require('./iconv_lazy_probe.cjs');
const bundle='node_modules/iconv-lite/encodings/consolidated.cjs',facade='node_modules/iconv-lite/lib/index.js';
const incorporated=javascript.filter(p=>p.startsWith('node_modules/iconv-lite/'));
const safer='node_modules/safer-buffer/safer.js';
const contexts=['node_modules/body-parser/lib/read.js','node_modules/raw-body/index.js'];
const unknown=['node_modules/iconv-lite/Changelog.md','node_modules/iconv-lite/LICENSE','node_modules/iconv-lite/README.md','node_modules/iconv-lite/lib/index.d.ts',
  'node_modules/safer-buffer/dangerous.js','node_modules/safer-buffer/tests.js','node_modules/safer-buffer/LICENSE','node_modules/safer-buffer/Porting-Buffer.md','node_modules/safer-buffer/Readme.md'].sort();
const options={bundle:true,platform:'node',format:'cjs',target:'node24',treeShaking:false,external:['safer-buffer','./tables/*.json'],logLevel:'warning'};
const facadeText="'use strict';\nmodule.exports = require('../encodings/consolidated.cjs');\n";
const ref=(root,path)=>({root,path}),json=v=>JSON.stringify(v),multiset=rows=>rows.map(json).sort();
const defaultCheck=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'ICONV_METADATA_DENIED'});};
function normalizeIconvMetafile(graph,inventory,payloadRoot,sourceRoot,check=defaultCheck){
  const keys=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&json(Object.keys(v).sort())===json(names.split(' ').sort()),'iconv-metafile-shape');
  keys(graph,'inputs outputs');check(json(Object.keys(graph.inputs).sort())===json([...incorporated].sort()),'iconv-input-set');
  // An exact descriptive compiler key, never resolved or opened as a path.
  const outputKey='../compile/'+bundle;
  check(json(Object.keys(graph.outputs))===json([outputKey]),'iconv-output-key');
  const out=graph.outputs[outputKey];keys(out,'imports exports entryPoint inputs bytes');
  check(out.entryPoint===facade&&Array.isArray(out.exports)&&out.exports.length===0&&Number.isSafeInteger(out.bytes)&&out.bytes>0,'iconv-output-metadata');
  check(json(Object.keys(out.inputs).sort())===json([...incorporated].sort()),'iconv-output-inputs');
  const refs=inventory.references.filter(r=>incorporated.includes(r.source)&&!r.typeOnly);
  check(refs.length===38&&refs.every(r=>r.kind==='require'&&r.specifier!=='<computed>'),'iconv-source-occurrences');
  const target=r=>r.resolution==='node-builtin'?'node:'+r.specifier.replace(/^node:/,''):
    incorporated.includes(r.resolvedPath)?ref(sourceRoot,r.resolvedPath):ref(payloadRoot,r.resolvedPath);
  const sourceEdges=refs.map((r,occurrence)=>({occurrence,source:ref(sourceRoot,r.source),line:r.line,kind:r.kind,specifier:r.specifier,target:target(r)}));
  const consumed=new Set(),transformedEdges=[],externalImports=[];
  for(const name of incorporated){const input=graph.inputs[name];keys(input,'bytes imports format');
    check(input.format==='cjs'&&Number.isSafeInteger(input.bytes)&&input.bytes>0&&Array.isArray(input.imports),'iconv-input-metadata');
    keys(out.inputs[name],'bytesInOutput');check(Number.isSafeInteger(out.inputs[name].bytesInOutput)&&out.inputs[name].bytesInOutput>0&&out.inputs[name].bytesInOutput<=out.bytes,'iconv-emitted-input');
    for(const edge of input.imports){
      keys(edge,edge.external===true?'path kind external':'path kind original');
      check(edge.kind==='require-call'&&typeof edge.path==='string','iconv-import-kind');
      const specifier=edge.external?edge.path:edge.original;
      const occurrence=refs.findIndex((r,i)=>!consumed.has(i)&&r.source===name&&r.specifier===specifier&&
        (edge.external||r.resolvedPath===edge.path));
      check(occurrence>=0,'iconv-import-correspondence');consumed.add(occurrence);
      const r=refs[occurrence],t=target(r);
      if(edge.external){
        const expected=specifier==='safer-buffer'?safer:specifier.startsWith('./tables/')?path.posix.join(path.posix.dirname(bundle),specifier):null;
        check(expected?[safer,...tables].includes(expected)&&r.resolvedPath===expected:
          ['buffer','stream','string_decoder'].includes(specifier)&&r.resolution==='node-builtin','iconv-external-target');
        externalImports.push(edge);
      }else check(incorporated.includes(edge.path),'iconv-internal-target');
      transformedEdges.push({occurrence,output:ref(payloadRoot,bundle),disposition:edge.external?(typeof t==='string'?'builtin':'external'):'internal-wrapper',target:t});
    }
  }
  check(consumed.size===38,'iconv-missing-occurrence');
  check(Array.isArray(out.imports)&&json(multiset(out.imports))===json(multiset(externalImports)),'iconv-output-import-occurrences');
  transformedEdges.sort((a,b)=>a.occurrence-b.occurrence);
  const runtime=[];
  for(const e of transformedEdges)if(e.disposition!=='internal-wrapper')runtime.push({from:e.output,specifier:refs[e.occurrence].specifier,to:e.target});
  const generatedEdges=[{from:ref(payloadRoot,facade),specifier:'../encodings/consolidated.cjs',to:ref(payloadRoot,bundle)}];
  const auxiliaryEdges=[{from:ref(payloadRoot,safer),specifier:'buffer',to:'node:buffer'},
    ...contexts.map(p=>({from:ref(sourceRoot,p),specifier:'iconv-lite',to:ref(payloadRoot,facade)}))];
  const runtimeEdges=[...new Map([...runtime,...generatedEdges,...auxiliaryEdges].map(e=>[json(e),e])).values()];
  check(runtimeEdges.length===16,'iconv-runtime-edge-count');
  return {sourceEdges,transformedEdges,generatedEdges,auxiliaryEdges,runtimeEdges,outputMetadata:out};
}
function validateIconvCompatibility({c,inventory,payloadRoot,sourceRoot,readJSON,same,check=defaultCheck}){
  const keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),n.split(' ').sort()),'iconv-profile-shape');
  keys(c.compatibility,'profile metafile compileIntent contexts retainedUnknown');
  const p=c.compatibility,d=c.derivation;
  check(p.profile==='iconv-lite-0.4.24-esbuild-0.28.2'&&same(d.options,options)&&d.generator.version==='0.28.2','iconv-compiler-options');
  check(same(c.outputs.map(o=>o.path).sort(),[bundle,facade].sort())&&same(c.sources.map(s=>s.path).sort(),[...incorporated].sort()),'iconv-source-output-selection');
  const facadeFile=c.outputs.find(o=>o.path===facade);
  check(facadeFile.size===Buffer.byteLength(facadeText)&&facadeFile.sha256===crypto.createHash('sha256').update(facadeText).digest('hex'),'iconv-facade-bytes');
  check(c.externals.length===20&&same(c.externals.filter(e=>e.role==='retained-unknown').map(e=>e.path).sort(),unknown)&&same(p.retainedUnknown,unknown),'iconv-retained-unknown');
  check(same(c.externals.filter(e=>e.role==='data').map(e=>e.path).sort(),[...tables].sort())&&
    same(c.externals.filter(e=>e.role==='metadata').map(e=>e.path).sort(),[...metadata].sort())&&
    same(c.externals.filter(e=>e.role==='dependency').map(e=>e.path),[safer]),'iconv-external-selection');
  const evidence=d.evidence.find(e=>same(ref(e.root,e.path),p.metafile)),intentFile=d.configuration.find(e=>same(ref(e.root,e.path),p.compileIntent));
  check(evidence&&intentFile&&d.evidence.length===2,'iconv-derivation-files');
  const graph=readJSON(evidence,'iconv-esbuild-0.28.2-v1'),intent=readJSON(intentFile,'iconv-esbuild-0.28.2-v1');
  const normalized=normalizeIconvMetafile(graph,inventory,payloadRoot,sourceRoot,check);
  check(normalized.outputMetadata.bytes===c.outputs.find(o=>o.path===bundle).size,'iconv-bundle-size');
  for(const source of c.sources)check(graph.inputs[source.path].bytes===source.size,'iconv-source-size');
  check(same(c.sourceEdges,normalized.sourceEdges)&&same(c.transformedEdges,normalized.transformedEdges)&&
    same(c.generatedEdges,normalized.generatedEdges)&&same(c.runtimeEdges,normalized.runtimeEdges),'iconv-normalized-edges');
  check(inventory.references.some(r=>r.source===safer&&r.kind==='require'&&r.specifier==='buffer'&&r.resolution==='node-builtin'),'iconv-safer-edge');
  check(same(p.contexts,contexts.map(p=>ref(sourceRoot,p))),'iconv-context-selection');
  for(const context of p.contexts){check(d.configuration.some(f=>f.root===context.root&&f.path===context.path),'iconv-context-measurement');
    check(inventory.references.filter(r=>r.source===context.path&&r.kind==='require'&&r.specifier==='iconv-lite'&&r.resolvedPath===facade).length===1,'iconv-context-edge');}
  for(const meta of c.externals.filter(e=>e.role==='metadata')){
    const value=readJSON(meta,'iconv-esbuild-0.28.2-v1');
    if(meta.path===metadata[0]){
      keys(value,'name description version license keywords author main typings homepage bugs repository engines scripts browser devDependencies dependencies');
      check(value.name==='iconv-lite'&&value.version==='0.4.24'&&value.main==='./lib/index.js'&&value.typings==='./lib/index.d.ts'&&
        same(value.dependencies,{'safer-buffer':'>= 2.1.2 < 3'})&&same(value.browser,{'./lib/extend-node':false,'./lib/streams':false})&&
        same(value.engines,{node:'>=0.10.0'}),'iconv-package-resolution');
    }else{
      keys(value,'name version description main scripts author license repository bugs devDependencies files');
      check(value.name==='safer-buffer'&&value.version==='2.1.2'&&value.main==='safer.js'&&same(value.files,['Porting-Buffer.md','Readme.md','tests.js','dangerous.js','safer.js']),'iconv-safer-resolution');
    }
  }
  keys(intent,'productionAuthority binary toolIdentity tools args workingDirectory sourceInputs unknownRetained compilationNotDependencyClosure treeShaking authoritativeStageUnchanged');
  check(intent.productionAuthority===false&&intent.treeShaking===false&&intent.authoritativeStageUnchanged===true&&intent.compilationNotDependencyClosure===true&&
    intent.toolIdentity.sha256===d.generator.sha256&&Number(intent.toolIdentity.identity.size)===d.generator.size,'iconv-generator-correspondence');
  const win=path.win32,wd=intent.workingDirectory;
  check(typeof intent.binary==='string'&&/^[A-Za-z]:\\/.test(intent.binary)&&win.normalize(intent.binary)===intent.binary&&
    intent.binary.endsWith('\\node_modules\\@esbuild\\win32-x64\\esbuild.exe'),'iconv-recorded-generator-path');
  check(typeof wd==='string'&&/^[A-Za-z]:\\/.test(wd)&&win.normalize(wd)===wd&&win.basename(wd)==='stage','iconv-recorded-layout');
  const args=[facade,'--bundle','--platform=node','--format=cjs','--target=node24','--tree-shaking=false','--external:safer-buffer','--external:./tables/*.json',
    '--outfile='+win.resolve(wd,'../compile',bundle),'--metafile='+win.resolve(wd,'../esbuild-metafile.json'),'--log-level=warning'];
  check(same(intent.args,args)&&same([...intent.unknownRetained].sort(),unknown),'iconv-recorded-arguments');
  const originals=[...c.sources,...c.externals.map(e=>e.origin)];
  check(intent.sourceInputs.length===33&&new Set(intent.sourceInputs.map(f=>f.path)).size===33,'iconv-recorded-input-set');
  for(const original of originals){const row=intent.sourceInputs.find(f=>f.path===original.path);
    check(row&&row.source.sha256===original.sha256&&row.staged.sha256===original.sha256&&Number(row.source.identity.size)===original.size&&Number(row.staged.identity.size)===original.size,'iconv-recorded-source');}
  check(intent.tools.length===2,'iconv-tool-metadata');
  for(const name of ['node_modules/esbuild/package.json','node_modules/@esbuild/win32-x64/package.json']){
    const file=d.configuration.find(f=>f.path===name),row=intent.tools.find(t=>t.path===name);check(file&&row,'iconv-tool-selection');
    const value=readJSON(file,'iconv-esbuild-0.28.2-v1');
    check(value.version==='0.28.2'&&value.name===(name.includes('@esbuild')?'@esbuild/win32-x64':'esbuild')&&row.lock.version==='0.28.2'&&
      row.measurement.sha256===file.sha256,'iconv-tool-version');
  }
  return normalized.auxiliaryEdges;
}
module.exports={bundle,facade,incorporated,safer,contexts,unknown,options,tables,metadata,normalizeIconvMetafile,validateIconvCompatibility};
