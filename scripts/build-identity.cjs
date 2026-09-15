const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
function buildIdentity(root=path.resolve(__dirname,'..')) {
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  const files=[];
  function walk(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const name=relative+'/'+entry.name;if(name==='src/test')continue;if(entry.isDirectory())walk(name);else if(entry.isFile())files.push(name);}}
  for(const dir of ['src','scripts'])if(fs.existsSync(path.join(root,dir)))walk(dir);
  for(const name of ['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tailwind.config.js','postcss.config.js'])if(fs.existsSync(path.join(root,name)))files.push(name);
  const hash=crypto.createHash('sha256');for(const file of files.sort()){hash.update(file+'\0');hash.update(fs.readFileSync(path.join(root,file)));hash.update('\0');}
  let commit=null,dirty=null;
  try{const candidate=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();if(/^[a-f0-9]{40}$/.test(candidate)){commit=candidate;dirty=Boolean(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());const tracked=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0'));dirty=dirty||files.some(file=>!tracked.has(file));}}catch{}
  return {version,commit,dirty,sourceDigest:hash.digest('hex')};
}
module.exports={buildIdentity};
if(require.main===module){const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist','build-info.json'),JSON.stringify(buildIdentity(root),null,2)+'\n');console.log('Deterministic build identity written to dist/build-info.json');}
