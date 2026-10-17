// Informational bytes only. Never signs, loads code, launches helpers or grants trust.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LIMITS=Object.freeze({roots:16,files:20000,fileBytes:128*1024*1024,totalBytes:256*1024*1024,jsonBytes:32*1024*1024});
function deny(code){throw Object.assign(Error('Payload byte catalog rejected: '+code),{code});}
const key=value=>value.normalize('NFC').toLowerCase(); // Conservative Windows-target path identity.
function relative(value){
  if(typeof value!=='string'||!value||value!==value.normalize('NFC')||value.includes('\\')||/[\x00-\x1f<>:"|?*]/.test(value))deny('path');
  for(const part of value.split('/'))if(!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))deny('path');
  return value;
}
const inside=(base,target)=>{const name=path.relative(base,target);return name===''||(!name.startsWith('..'+path.sep)&&name!=='..'&&!path.isAbsolute(name));};
function checked(target){
  const absolute=path.resolve(target);
  for(let current=absolute;;current=path.dirname(current)){
    if(fs.lstatSync(current).isSymbolicLink())deny('reparse');
    if(path.dirname(current)===current)break;
  }
  const real=fs.realpathSync.native(absolute);
  if(key(real)!==key(absolute))deny('reparse');
  return real;
}
function boundedJSON(value){const bytes=JSON.stringify(value);if(!bytes||Buffer.byteLength(bytes)>LIMITS.jsonBytes)deny('metadata-limit');return JSON.parse(bytes);}
function rootsFor(specs){
  if(!Array.isArray(specs)||!specs.length||specs.length>LIMITS.roots)deny('roots');
  const roots=new Map();
  for(const spec of specs){
    if(!spec||typeof spec.id!=='string'||! /^[a-z][a-z0-9-]{0,63}$/.test(spec.id)||roots.has(spec.id)||typeof spec.path!=='string')deny('root');
    const location=checked(spec.path),stat=fs.lstatSync(location);
    if(!stat.isFile()&&!stat.isDirectory())deny('file-type');
    const kind=stat.isFile()?'file':'directory';
    const forbidden=[path.parse(location).root,process.env.SystemRoot,process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.USERPROFILE,require('node:os').tmpdir()].filter(Boolean).map(p=>path.resolve(p));
    if(kind==='directory'&&(forbidden.some(p=>key(p)===key(location))||(process.env.SystemRoot&&inside(path.resolve(process.env.SystemRoot),location))))deny('system-root');
    for(const prior of roots.values())if(inside(prior.location,location)||inside(location,prior.location))deny('overlapping-roots');
    roots.set(spec.id,{id:spec.id,location,kind});
  }
  return roots;
}
function full(root,name){relative(name);if(root.kind==='file'){if(name!==path.basename(root.location))deny('file-root');return root.location;}
  const target=path.resolve(root.location,...name.split('/'));if(!inside(root.location,target))deny('path');return target;}
function scan(roots){
  const files=new Map();let visited=0;
  for(const root of roots.values()){
    checked(root.location);const pending=[{target:root.location,name:root.kind==='file'?path.basename(root.location):''}];
    while(pending.length){if(++visited>LIMITS.files*2)deny('scan-limit');const {target,name}=pending.pop();checked(target);const stat=fs.lstatSync(target);
      if(stat.isDirectory()){
        const directory=fs.opendirSync(target);
        try {let entry;while((entry=directory.readSync())!==null){const child=entry.name;relative(child);
          if(pending.length+visited>=LIMITS.files*2)deny('scan-limit');pending.push({target:path.join(target,child),name:name?name+'/'+child:child});}}
        finally{directory.closeSync();}
      }
      else if(stat.isFile()){
        relative(name);const id=root.id+':'+key(name);if(files.has(id))deny('duplicate-path');
        if(files.size>=LIMITS.files)deny('file-limit');files.set(id,{root:root.id,path:name});
      }else deny('file-type');
    }
  }
  return files;
}
function measure(root,name,observe=false,collect=false,collectLimit=65536){
  const target=full(root,name);checked(target);const fd=fs.openSync(target,'r');
  try{
    const before=fs.fstatSync(fd,{bigint:true});if(!before.isFile()||before.size>BigInt(collect?collectLimit:LIMITS.fileBytes))deny('file-size');
    // Hard-link aliases are not independent payload inputs.
    if(before.nlink!==1n)deny('hardlink');
    const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(65536),chunks=[];let size=0,count;
    while((count=fs.readSync(fd,buffer,0,buffer.length,null))!==0){size+=count;if(size>(collect?collectLimit:LIMITS.fileBytes))deny('file-size');hash.update(buffer.subarray(0,count));if(collect)chunks.push(Buffer.from(buffer.subarray(0,count)));}
    const after=fs.fstatSync(fd,{bigint:true});checked(target);const current=fs.lstatSync(target,{bigint:true});
    if([after,current].some(s=>s.dev!==before.dev||s.ino!==before.ino||s.size!==before.size||s.mtimeNs!==before.mtimeNs||s.ctimeNs!==before.ctimeNs)||BigInt(size)!==before.size)deny('changed-during-read');
    return {size,sha256:hash.digest('hex'),...(observe?{identity:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(before[k])]))}:{}),...(collect?{bytes:Buffer.concat(chunks)}:{})};
  }finally{fs.closeSync(fd);}
}
function sameSet(expected,observed){for(const [id,row] of expected){if(!observed.has(id))deny('missing');if(observed.get(id).path!==row.path)deny('path-spelling');}
  for(const id of observed.keys())if(!expected.has(id))deny('unexpected');}
function checkFlags(catalog){if(catalog?.v!==1||catalog.purpose!=='non-authorizing-staged-payload-bytes'||catalog.productionAuthority!==false||catalog.completeClosure!==false||catalog.runtimeVerified!==false)deny('catalog');}
function createCatalog(options){
  const input=boundedJSON(options),roots=rootsFor(input.roots),expected=new Map();
  if(!input.staging||typeof input.staging.root!=='string'||!roots.has(input.staging.root)||!Array.isArray(input.staging.manifest?.candidates)||!Array.isArray(input.staging.manifest?.unresolved))deny('staging');
  function add(root,name,evidence,replace=false){if(!roots.has(root))deny('root');relative(name);const id=root+':'+key(name),prior=expected.get(id);
    if(prior){if(!replace||prior.overlay)deny('duplicate-path');if(prior.path!==name)deny('duplicate-path');prior.evidence.push(evidence);prior.overlay=true;}
    else {if(replace)deny('overlay-target');expected.set(id,{root,path:name,evidence:[evidence],overlay:evidence.kind==='explicit-overlay'});}}
  const generated=input.experimentalGenerated===true;
  if(input.staging.manifest.generatedArtifact&&!generated)deny('generated-opt-in-required');
  for(const candidate of input.staging.manifest.candidates){
    if(candidate.status==='generated-artifact'){
      if(!generated||input.staging.manifest.generatedArtifact?.version!==1||candidate.source!==null||
        candidate.provenanceRef!==input.staging.manifest.generatedArtifact.contentSha256)deny('generated-catalog-selection');
      add(input.staging.root,candidate.output,{kind:'experimental-generated-selection',provenanceRef:candidate.provenanceRef});
    }
    if(['transpiled','copied-candidate','generated-metadata'].includes(candidate.status))add(input.staging.root,candidate.output,
      {kind:'staging-selection',source:candidate.source??null,status:candidate.status,selectionReasons:candidate.selectionReasons??[]});
  }
  for(const overlay of input.overlays??[]){if(typeof overlay.reason!=='string'||!overlay.reason.trim())deny('overlay-evidence');
    add(overlay.root,overlay.path,{kind:'explicit-overlay',reason:overlay.reason,source:overlay.source??null},overlay.replacesStaged===true);}
  if(expected.size>LIMITS.files)deny('file-limit');sameSet(expected,scan(roots));
  let total=0;const entries=[];
  for(const row of [...expected.values()].sort((a,b)=>{const x=a.root+':'+a.path,y=b.root+':'+b.path;return x<y?-1:x>y?1:0;})){
    const bytes=measure(roots.get(row.root),row.path);if((total+=bytes.size)>LIMITS.totalBytes)deny('total-size');
    entries.push({root:row.root,path:row.path,...bytes,evidence:row.evidence});
  }
  sameSet(expected,scan(roots));
  return boundedJSON({v:1,purpose:'non-authorizing-staged-payload-bytes',productionAuthority:false,completeClosure:false,runtimeVerified:false,
    roots:[...roots.values()].map(r=>({id:r.id,kind:r.kind})),entries,totalBytes:total,
    unresolved:{staging:input.staging.manifest.unresolved,candidates:input.staging.manifest.candidates.filter(c=>!['transpiled','copied-candidate','generated-metadata',...(generated?['generated-artifact']:[])].includes(c.status)),external:input.externalUnresolved??[]},
    limits:LIMITS,analysisLimits:['Byte correspondence only; catalog/evidence authenticity is not established.','Uncataloged external inputs, executable/provider/runtime loading and complete closure remain unverified.',
      'Filesystem checks reject observed links/escapes and mutation during reads; no protected-installation or mapped-code/ancestor-race attestation.',
      'Same-length future changes, restored timestamps and Windows reparse/provider behavior are not exhaustively race tested.']});
}
function verifyCatalog(catalog,specs){
  const input=boundedJSON(catalog);checkFlags(input);const roots=rootsFor(specs),expected=new Map();
  if(!input.unresolved||!['staging','candidates','external'].every(k=>Array.isArray(input.unresolved[k]))||!Array.isArray(input.analysisLimits)||!input.analysisLimits.length)deny('catalog');
  if(!Array.isArray(input.roots)||input.roots.length!==roots.size||!Array.isArray(input.entries)||input.entries.length>LIMITS.files)deny('catalog');
  const ids=new Set();for(const declared of input.roots){if(ids.has(declared.id)||roots.get(declared.id)?.kind!==declared.kind)deny('root');ids.add(declared.id);}
  let total=0;for(const row of input.entries){if(!roots.has(row.root))deny('root');relative(row.path);const id=row.root+':'+key(row.path);if(expected.has(id))deny('duplicate-path');
    if(!Number.isSafeInteger(row.size)||row.size<0||row.size>LIMITS.fileBytes||! /^[a-f0-9]{64}$/.test(row.sha256)||!Array.isArray(row.evidence)||!row.evidence.length)deny('entry');
    if((total+=row.size)>LIMITS.totalBytes)deny('total-size');expected.set(id,row);}
  if(total!==input.totalBytes)deny('total-size');sameSet(expected,scan(roots));
  for(const row of expected.values()){const actual=measure(roots.get(row.root),row.path);if(actual.size!==row.size||actual.sha256!==row.sha256)deny('changed');}
  sameSet(expected,scan(roots));
  return {matchedBytes:true,files:expected.size,totalBytes:total,productionAuthority:false,completeClosure:false,runtimeVerified:false,unresolved:input.unresolved,analysisLimits:input.analysisLimits};
}
function observeCatalogFiles(specs,references){
  const roots=rootsFor(specs),seen=new Set();
  if(!Array.isArray(references)||references.length>LIMITS.files)deny('observation-limit');
  return references.map(ref=>{
    if(!roots.has(ref.root))deny('root');relative(ref.path);
    const id=ref.root+':'+key(ref.path);if(seen.has(id))deny('duplicate-path');seen.add(id);
    return {root:ref.root,path:ref.path,...measure(roots.get(ref.root),ref.path,true)};
  });
}
function readCatalogJSON(specs,reference,profile='synthetic-generated-v1'){
  const roots=rootsFor(specs);if(!roots.has(reference.root))deny('root');
  const {bytes,...measurement}=measure(roots.get(reference.root),reference.path,true,true,profile==='express-esbuild-0.28.2-v1'?262144:65536);
  const text=bytes.toString('utf8');
  if(!['synthetic-generated-v1','iconv-esbuild-0.28.2-v1','express-esbuild-0.28.2-v1'].includes(profile))deny('json-profile');
  if(!Buffer.from(text,'utf8').equals(bytes))deny(profile==='synthetic-generated-v1'?'synthetic-json-format':'json-encoding');
  // Bound parser recursion before parsing either format; strings do not count.
  let depth=0,quoted=false,escaped=false;
  for(const ch of text){if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}
    else if(ch==='"')quoted=true;else if(ch==='{'||ch==='['){if(++depth>64)deny('json-depth');}else if(ch==='}'||ch===']')depth--;}
  const value=JSON.parse(text);
  // Narrow canonical synthetic JSON only: no duplicate keys, alternate encodings
  // or general package/Node metadata interpretation is approved by this helper.
  if(profile==='synthetic-generated-v1'){
    if(!Buffer.from(JSON.stringify(value),'utf8').equals(bytes))deny('synthetic-json-format');
  }else{
    // JSON.parse rejects comments/trailing commas. The existing TypeScript JSON
    // AST retains duplicate properties that JSON.parse alone would erase.
    const ts=require('typescript'),tree=ts.parseJsonText('reviewed-metadata.json',text),pending=[tree];let nodes=0;
    if(tree.parseDiagnostics.length)deny('json-syntax');
    while(pending.length){const node=pending.pop();if(++nodes>20000)deny('json-node-limit');
      if(ts.isObjectLiteralExpression(node)){const names=new Set();for(const prop of node.properties){
        const name=prop.name?.text;if(typeof name!=='string'||names.has(name.normalize('NFC').toLowerCase()))deny('json-duplicate-key');
        names.add(name.normalize('NFC').toLowerCase());}}
      ts.forEachChild(node,child=>{pending.push(child);});
    }
  }
  return {value,measurement};
}
module.exports={createCatalog,verifyCatalog,observeCatalogFiles,readCatalogJSON,LIMITS};
if(require.main===module){
  try{
    const [command,configFile,catalogFile,...extra]=process.argv.slice(2);
    if(extra.length||!['create','verify'].includes(command)||!configFile||!catalogFile)deny('arguments');
    function read(file){checked(file);if(fs.statSync(file).size>LIMITS.jsonBytes)deny('metadata-limit');return boundedJSON(JSON.parse(fs.readFileSync(file,'utf8')));}
    const config=read(configFile);
    if(command==='create'){
      const roots=rootsFor(config.roots),output=path.resolve(catalogFile);checked(path.dirname(output));
      for(const root of roots.values())if(inside(root.location,output)||key(root.location)===key(output))deny('output-in-payload');
      if(config.staging?.manifestFile){config.staging.manifest=read(config.staging.manifestFile);delete config.staging.manifestFile;}
      const catalog=createCatalog(config),serialized=JSON.stringify(catalog,null,2)+'\n';
      if(Buffer.byteLength(serialized)>LIMITS.jsonBytes)deny('metadata-limit');fs.writeFileSync(output,serialized,{flag:'wx'});
      console.log(JSON.stringify({created:true,files:catalog.entries.length,productionAuthority:false,completeClosure:false,runtimeVerified:false}));
    }else console.log(JSON.stringify(verifyCatalog(read(catalogFile),config.roots)));
  }catch(error){console.error(JSON.stringify({rejected:true,code:error.code??'invalid-input',productionAuthority:false,completeClosure:false}));process.exitCode=1;}
}
