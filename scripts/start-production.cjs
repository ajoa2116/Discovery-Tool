// This source distribution intentionally packages tsx as a runtime dependency.
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
const child=spawn(process.execPath,['--import','tsx',resolve(root,'src/server/index.ts')],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,NODE_ENV:'production'}});
child.once('error',()=>{console.error('CCTV Network Assistant could not start its local backend.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
