import express, {Router} from 'express';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Resolve release assets relative to the application, never a technician's current directory. */
export const productionAssetRoot=fileURLToPath(new URL('../../dist/',import.meta.url));
export function productionAssets(root=productionAssetRoot){
  const router=Router();
  router.use('/api',(_req,res)=>res.status(404).json({error:'This application endpoint does not exist.'}));
  router.get('/',(_req,res,next)=>{
    if(!existsSync(join(root,'index.html')))return res.status(503).type('text').send('The application UI has not been built. Run npm run build in the application folder, then restart.');
    next();
  });
  router.use(express.static(root,{index:'index.html'}));
  return router;
}

export function startupFailureMessage(code?:string){
  if(code==='EACCES')return 'CCTV Network Assistant could not bind localhost:3001. Windows denied access to the local port. Check host port/security policy, then restart; no application session started.';
  if(code==='EADDRINUSE')return 'CCTV Network Assistant could not bind localhost:3001. Another process is using the port. Close the other application instance or resolve the port conflict, then restart.';
  return 'CCTV Network Assistant could not start its local server. Check the local runtime environment, then restart.';
}
