import { RequestHandler, Router } from 'express';
import { TaskManager } from '../core/tasks/task_manager.ts';
import { observeBatch, TaskBatch } from '../core/tasks/operation_tasks.ts';
import { TaskKind } from '../shared/tasks.ts';

interface Dependencies {
  refresh:()=>void; monitoring:()=>unknown;
  bulk:(kind:TaskKind,id:string)=>TaskBatch|undefined;
  cancelBulk:(kind:TaskKind,id:string)=>boolean;
  cancelReverify:()=>boolean;
}
/** Observe only awaited production endpoints. 202 workflows require explicit lifecycle hooks. */
export function taskHttpIntegration(tasks:TaskManager,d:Dependencies){
  const live=new Map<string,()=>void>();
  const refresh=()=>{d.refresh();for(const read of live.values())read();};
  const middleware:RequestHandler=(req,res,next)=>{
    if(req.method!=='POST')return next();
    const path=req.path;
    const cancellation=path.match(/^\/api\/bulk\/(network|configuration)\/([^/]+)\/cancel$/);
    if(cancellation){
      const kind=cancellation[1]==='network'?'BULK_REIP':'BULK_CONFIGURE';
      const task=tasks.snapshot().tasks.find(t=>t.kind===kind&&t.correlationId===cancellation[2]);
      const json=res.json.bind(res);res.json=((body:any)=>{if(task&&body?.cancelled&&d.bulk(kind,cancellation[2])?.state==='CANCELLED')tasks.update(task.id,{state:'CANCELLED',phase:'CANCELLED'},true);return json(body);}) as typeof res.json;
      return next();
    }
    let kind:TaskKind|undefined,correlation:string|undefined,cancel:(()=>boolean)|undefined;
    const bulk=path.match(/^\/api\/bulk\/(network|configuration)\/([^/]+)\/apply$/);
    const planning=path.match(/^\/api\/bulk\/(network|configuration)\/(?:plan|[^/]+\/retry)$/);
    if(bulk){kind=bulk[1]==='network'?'BULK_REIP':'BULK_CONFIGURE';if(req.body?.confirmed!==true||d.bulk(kind,bulk[2])?.state!=='READY')return next();correlation=bulk[2];const k=kind;cancel=()=>d.cancelBulk(k,bulk[2]);}
    else if(planning)kind=planning[1]==='network'?'BULK_REIP':'BULK_CONFIGURE';
    else if(path==='/api/project/reverify'){if(tasks.snapshot().tasks.some(t=>t.kind==='REVERIFY'&&['RUNNING','QUEUED'].includes(t.state)))return next();kind='REVERIFY';cancel=d.cancelReverify;}
    else if(/^\/api\/reports\/export\/(pdf|csv|json)$/.test(path))kind='REPORT';
    else if(/^\/api\/project\/(save|save-content|open|from-current|new|add-existing\/confirm)$/.test(path))kind='PROJECT';
    else if(/^\/api\/device\/[^/]+\/(configuration|network)\/apply$/.test(path))kind='CAMERA';
    if(!kind)return next();
    // Rejected duplicate batch requests must not alter the already-running task.
    const existing=correlation?tasks.snapshot().tasks.find(t=>t.kind===kind&&t.correlationId===correlation):undefined;
    if(existing&&existing.state!=='NEEDS_ATTENTION')return next();
    const id=existing?.id||tasks.begin(kind,correlation,cancel);
    tasks.update(id,{state:'RUNNING',phase:planning?'PREPARING':'WORKING'},true);
    tasks.cancellation(id,cancel);
    if(bulk){const k=kind;live.set(id,()=>{const batch=d.bulk(k,bulk[2]);if(batch)observeBatch(tasks,id,batch);});}
    let body:any;
    const json=res.json.bind(res);
    res.json=((value:any)=>{body=value;return json(value);}) as typeof res.json;
    const send=res.send.bind(res);let settled=false;
    const settle=()=>{if(settled)return;settled=true;
      live.delete(id);
      if(res.statusCode>=400){tasks.update(id,{state:body?.code==='CANCELLED'?'CANCELLED':'FAILED',phase:body?.code==='CANCELLED'?'CANCELLED':'FAILED',reference:body?.presentation?.reference});return;}
      if(planning&&body?.batchId){tasks.correlate(id,body.batchId);tasks.update(id,{state:'NEEDS_ATTENTION',phase:body.state==='READY'?'CONFIRM':'ATTENTION'});return;}
      if(bulk&&body?.items){observeBatch(tasks,id,body);return;}
      if(kind==='REPORT'&&res.locals.reportGeneration)tasks.reportGenerated(id,res.locals.reportGeneration.instant,res.locals.reportGeneration.timeZone);
      const attention=Boolean(body?.result?.possibleReplacements?.length)||(kind==='CAMERA'&&body?.verified!==true);
      tasks.update(id,{state:attention?'NEEDS_ATTENTION':'COMPLETED',phase:attention?'ATTENTION':'DONE',result:kind==='REPORT'?'REPORTS':kind==='REVERIFY'||kind==='PROJECT'?'PROJECT_HISTORY':undefined});
    };
    res.send=((value:any)=>{settle();return send(value);}) as typeof res.send;
    // Connection closure is not operation completion. Awaited handlers still own their outcome.
    next();
  };
  const router=Router();
  router.get('/',(_req,res)=>{
    refresh();const current=d.monitoring() as {enabled?:boolean;status?:string}|undefined;
    const status=current?.status&&['ACTIVE','WAITING','DEFERRED','OFF'].includes(current.status)?current.status:'UNAVAILABLE';
    res.json({...tasks.snapshot(),monitoring:{enabled:current?.enabled,status}});
  });
  router.post('/:id/cancel',async(req,res)=>{
    refresh();try{const accepted=await tasks.cancel(req.params.id);refresh();res.status(accepted?202:409).json({accepted,...tasks.snapshot()});}
    catch{res.status(409).json({error:'This task cannot be cancelled in its current phase.'});}
  });
  return {middleware,router,refresh};
}
