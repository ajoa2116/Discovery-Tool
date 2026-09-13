import { observeWindowsReceive } from '../core/readiness/windows_receive_observation.ts';
import { Router } from 'express';
import { ReceiveMatrix } from '../core/readiness/receive_matrix.ts';
export function createReceiveMatrixRouter(matrix:ReceiveMatrix){
 const router=Router();router.get('/environment',async(req,res)=>{try{res.json(await observeWindowsReceive(Number(req.query.interfaceIndex)));}catch{res.status(503).json({error:'WINDOWS_OBSERVATION_UNAVAILABLE'});}});router.get('/',(_req,res)=>res.json({matrix:matrix.snapshot()}));
 router.post('/',(req,res)=>{try{const sessionId=matrix.start({...req.body,durationMs:req.body?.durationMs??20000,sendProbe:req.body?.sendProbe??false,strategies:req.body?.strategies??['WILDCARD_SELECTED','ADAPTER_SPECIFIC']});res.status(202).json({sessionId,matrix:matrix.snapshot()});}catch(error){const code=(error as Error).message;res.status(code==='DISCOVERY_BUSY'?409:400).json({error:code});}});
 router.post('/stop',(req,res)=>{const stopped=matrix.stop(req.body?.sessionId);res.status(stopped?202:409).json({stopped,matrix:matrix.snapshot()});});return router;
}
