import assert from 'node:assert/strict';
import express from 'express';
import {TaskManager,TASK_PHASES} from '../core/tasks/task_manager.ts';
import {OperationTasks,observeBatch} from '../core/tasks/operation_tasks.ts';
import {ForegroundDiscovery} from '../core/engine/foreground_discovery.ts';
import {taskHttpIntegration} from '../server/task_routes.ts';
import {readFileSync} from 'node:fs';
import {sanitizeSupportEvidence} from '../core/readiness/support_bundle.ts';
import {PairSessionState} from '../types/index.ts';
let passed=0;
const check=(value:unknown,name:string)=>{assert.ok(value,name);passed++;console.log('PASS: '+name)};
let tick=0;const events:unknown[]=[];
const tasks=new TaskManager(3,()=>new Date(1700000000000+tick++*1000).toISOString(),t=>events.push(t));
const correlation=crypto.randomUUID(),id=tasks.begin('SCAN',correlation,()=>true);
check(tasks.begin('SCAN',correlation)===id,'stable authoritative operation identity');
check(tasks.get(id)?.state==='QUEUED','queued at acceptance');
tasks.update(id,{state:'RUNNING',phase:'SCANNING'});
check(tasks.get(id)?.state==='RUNNING'&&!tasks.get(id)?.progress,'indeterminate running without fabricated progress');
check(tasks.get(id)?.startedAt!==tasks.get(id)?.updatedAt,'start timestamp preserved across progress');
await tasks.cancel(id);check(tasks.get(id)?.state==='RUNNING'&&tasks.get(id)?.cancellationRequested,'cancel request waits for operation termination');
check(!(await tasks.cancel(id)),'repeated cancellation unavailable');
tasks.update(id,{state:'CANCELLED',phase:'CANCELLED'});
check(Boolean(tasks.get(id)?.endedAt)&&!tasks.get(id)?.cancellable,'cancelled terminal timestamp and no Cancel');
tasks.update(id,{state:'RUNNING',phase:'WORKING'});check(tasks.get(id)?.state==='CANCELLED','late progress cannot resurrect terminal task');
for(const state of ['COMPLETED','FAILED','NEEDS_ATTENTION'] as const){const task=tasks.begin('PROJECT');tasks.update(task,{state,phase:state==='COMPLETED'?'DONE':state==='FAILED'?'FAILED':'ATTENTION'});check(tasks.get(task)?.state===state&&Boolean(tasks.get(task)?.endedAt),`${state} terminal state and timestamp`);}
check(tasks.snapshot().tasks.length===3,'bounded terminal history including attention');
const active=tasks.begin('REPORT');for(let n=0;n<10;n++){const t=tasks.begin('PROJECT');tasks.update(t,{state:'COMPLETED',phase:'DONE'});}
check(Boolean(tasks.get(active))&&tasks.snapshot().tasks.length===4,'live tasks retained outside recent history cap');
const bad=tasks.begin('CAMERA','password=hunter-secret');tasks.update(bad,{state:'FAILED',phase:'FAILED',reference:'password=hunter-secret'});
check(!JSON.stringify(tasks.snapshot()).includes('hunter-secret'),'unsafe correlation and reference discarded');
check(JSON.stringify(sanitizeSupportEvidence(tasks.snapshot())).includes('Camera Configuration'),'safe task evidence retained in support');
const invalidProgress=tasks.begin('REVERIFY');tasks.update(invalidProgress,{state:'RUNNING',phase:'WORKING',progress:{completed:9,total:4}});
check(!tasks.get(invalidProgress)?.progress,'invalid progress discarded instead of fabricated');
tasks.update(invalidProgress,{state:'FAILED',phase:'FAILED',reference:'OP-ABC12345'});check(tasks.get(invalidProgress)?.reference==='OP-ABC12345','support reference preserved');
check(events.length<40,'evidence records lifecycle, not micro-operation chatter');

const scanTasks=new TaskManager(),observer=new OperationTasks(scanTasks);
const foreground=new ForegroundDiscovery(s=>observer.foreground(s,()=>foreground.stop(s.session?.sessionId)));
const first=foreground.begin('MANUAL');foreground.scanning(first.context.sessionId);
for(let n=0;n<60;n++)observer.foreground(foreground.getState(),()=>false);
check(scanTasks.snapshot().tasks.length===1&&scanTasks.snapshot().active===1,'one foreground task through repeated status/monitor polls');
foreground.finish(first.context.sessionId,'COMPLETED');check(scanTasks.snapshot().tasks[0].state==='COMPLETED','foreground completion authoritative');
const stale=foreground.getState();const second=foreground.begin('ADVANCED');foreground.scanning(second.context.sessionId);
observer.foreground(foreground.getState(),()=>foreground.stop(second.context.sessionId),{running:true,mode:'ADVANCED',targetCount:32,completedTargets:18,findings:2,cancelled:false,message:'password=not-for-tasks'});
const advancedId=`ADVANCED:${second.context.sessionId}`;
check(scanTasks.get(advancedId)?.progress?.completed===18,'Advanced Scan measured target progress');
observer.foreground(stale,()=>false);check(scanTasks.get(advancedId)?.state==='RUNNING','stale foreground session cannot mutate newer task');
await scanTasks.cancel(advancedId);check(second.signal.aborted,'Tasks cancel invokes exact foreground cancellation primitive');
foreground.finish(second.context.sessionId,'COMPLETED');check(scanTasks.get(advancedId)?.state==='CANCELLED','aborted scan finishes cancelled despite completed callback');
check(!JSON.stringify(scanTasks.snapshot()).includes('not-for-tasks'),'raw advanced status message never exposed');

const pairTasks=new TaskManager(2),pairObserver=new OperationTasks(pairTasks);
const adapter={interfaceIndex:8,interfaceAlias:'password=private',ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}]};
const pair={id:crypto.randomUUID(),state:'PREPARING',adapter,originalAdapter:adapter,cameraIp:'192.168.1.100',candidates:[],recoveryAvailable:false} as unknown as PairSessionState;
for(const purpose of ['CAMERA_PAIR','NETWORK_MATCH'] as const){
  pair.id=crypto.randomUUID();pair.purpose=purpose;pair.state='PREPARING';pairObserver.pair(pair);
  const key=`${purpose==='NETWORK_MATCH'?'MATCH':'PAIR'}:${pair.id}`;
  check(pairTasks.get(key)?.state==='RUNNING',`${purpose} state machine preparation`);
  pair.state='READY_FOR_CONFIRMATION';pairObserver.pair(pair);check(pairTasks.get(key)?.state==='NEEDS_ATTENTION',`${purpose} explicit confirmation attention`);
  for(const state of ['APPLYING','VERIFYING'] as const){pair.state=state;pairObserver.pair(pair);check(pairTasks.get(key)?.state==='RUNNING'&&!pairTasks.get(key)?.cancellable,`${purpose} no unsafe cancellation in ${state}`);}
  pair.state='PAIRED';pair.recoveryAvailable=true;pair.cameraReachabilityVerified=true;pairObserver.pair(pair);
  check(pairTasks.get(key)?.phase===TASK_PHASES.RESPONDED&&pairTasks.get(key)?.result==='NETWORK_RECOVERY',`${purpose} paired result with camera response and Restore attention`);
  const stamp=pairTasks.get(key)?.endedAt;pairObserver.pair(pair);check(pairTasks.get(key)?.endedAt===stamp,`${purpose} polling does not rewrite completion time`);
  pair.state='RESTORING';pairObserver.pair(pair);check(pairTasks.snapshot().tasks.some(t=>t.kind==='RESTORE'&&t.state==='RUNNING'&&!t.cancellable),`${purpose} separate safe Restore task`);
  pair.state='ROLLBACK_REQUIRED';pairObserver.pair(pair);check(pairTasks.get(key)?.state==='NEEDS_ATTENTION',`${purpose} failed restore retains recovery attention`);
  pair.state='RESTORING';pairObserver.pair(pair);pair.state='RESTORED';pairObserver.pair(pair);
  check(pairTasks.get(key)?.state==='COMPLETED',`${purpose} restored resolves adapter attention`);
}
check(!JSON.stringify(pairTasks.snapshot()).includes('private'),'adapter display names cannot leak secrets');
const restarted=new TaskManager();pair.state='ROLLBACK_REQUIRED';new OperationTasks(restarted).pair(pair);
check(restarted.snapshot().tasks[0].state==='NEEDS_ATTENTION','existing recovery snapshot recreates attention after restart');
check(new TaskManager().snapshot().tasks.length===0,'ordinary session history is ephemeral');
const superseded=new TaskManager(),supersedingObserver=new OperationTasks(superseded);
pair.id=crypto.randomUUID();pair.state='PREPARING';supersedingObserver.pair(pair);const oldPreview=superseded.snapshot().tasks[0].id;
pair.id=crypto.randomUUID();supersedingObserver.pair(pair);check(superseded.get(oldPreview)?.state==='CANCELLED','superseded Pair preparation cannot remain running');
pair.state='READY_FOR_CONFIRMATION';supersedingObserver.pair(pair);check(!superseded.snapshot().tasks[0].endedAt,'waiting for confirmation is not falsely finished');

for(const kind of ['BULK_REIP','BULK_CONFIGURE'] as const){
 const store=new TaskManager(),key=store.begin(kind,crypto.randomUUID(),()=>true);
 observeBatch(store,key,{state:'EXECUTING',readyCount:2,items:[{state:'VERIFIED'},{state:'APPLYING'},{state:'UNSUPPORTED'}]});
 check(store.snapshot().tasks.length===1&&store.get(key)?.progress?.completed===1,`${kind} one parent with result-derived progress`);
 observeBatch(store,key,{state:'PARTIAL_FAILURE',readyCount:2,items:[{state:'VERIFIED'},{state:'NEEDS_ATTENTION'},{state:'UNSUPPORTED'}]});
 check(store.get(key)?.state==='NEEDS_ATTENTION',`${kind} unsupported/blocked results do not become global failure`);
 const cancelled=store.begin(kind);observeBatch(store,cancelled,{state:'CANCELLED',readyCount:2,items:[{state:'VERIFIED'},{state:'SKIPPED'}]});
 check(store.get(cancelled)?.state==='CANCELLED',`${kind} authoritative cancellation outcome`);
}

// Real Express middleware exercises production boundaries, held requests and safe results.
const httpTasks=new TaskManager();let release=()=>{},cancelCalls=0;const batches=new Map<string,any>();
const integration=taskHttpIntegration(httpTasks,{refresh:()=>{},monitoring:()=>({enabled:true,status:'WAITING',lastError:'password=secret'}),bulk:(_kind,id)=>batches.get(id),cancelBulk:(_kind,id)=>{const batch=batches.get(id);if(!batch)return false;batch.cancellationRequested=true;return true},cancelReverify:()=>{cancelCalls++;return true}});
const app=express();app.use(express.json());app.use(integration.middleware);app.use('/api/tasks',integration.router);
app.post('/api/project/reverify',async(req,res)=>{await new Promise<void>(r=>{release=r});if(req.body.error)res.status(500).json({code:'OPERATION_FAILED',presentation:{reference:'OP-ABC12345'}});else if(req.body.fail)res.status(400).json({code:'CANCELLED',presentation:{reference:'OP-ABC12345'},error:'password=secret'});else res.json({result:{possibleReplacements:req.body.attention?[{}]:[]}})});
app.post('/api/reports/export/pdf',(_req,res)=>res.type('application/pdf').send(Buffer.from('report')));
app.post('/api/device/:id/configuration/apply',(_req,res)=>res.json({verified:false,message:'password=secret'}));
app.post('/api/project/save',(_req,res)=>res.status(500).json({presentation:{reference:'OP-ABC12345'},error:'password=secret',stack:'secret stack'}));
app.post('/api/bulk/:kind/plan',(_req,res)=>{const batchId=crypto.randomUUID(),batch={batchId,state:'READY',readyCount:1,items:[{state:'PENDING'}]};batches.set(batchId,batch);res.json(batch)});
app.post('/api/bulk/:kind/:id/cancel',(req,res)=>{batches.get(req.params.id).state='CANCELLED';res.json({cancelled:true})});
app.post('/api/bulk/:kind/:id/apply',async(req,res)=>{const batch=batches.get(req.params.id);if(!req.body.confirmed||batch.state!=='READY')return res.status(409).json({error:'Not ready'});batch.state='EXECUTING';await new Promise<void>(r=>{release=r});res.json(batch)});
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
const post=(url:string,body={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
try{
 for(const options of [{},{attention:true},{fail:true},{error:true}]){
  const before=httpTasks.snapshot().tasks.length;const pending=post('/api/project/reverify',options);
  while(httpTasks.snapshot().tasks.length===before)await new Promise(r=>setTimeout(r,5));
  const task=httpTasks.snapshot().tasks[0];check(task.state==='RUNNING'&&!task.progress,'Reverify pending response remains one indeterminate running task');
  if('fail' in options){const response=await post(`/api/tasks/${encodeURIComponent(task.id)}/cancel`);check(response.status===202&&cancelCalls===1,'Reverify cancellation uses existing primitive');}
  release();await pending;
  check(httpTasks.get(task.id)?.state===('error' in options?'FAILED':'fail' in options?'CANCELLED':'attention' in options?'NEEDS_ATTENTION':'COMPLETED'),'Reverify authoritative completed/replacement/cancelled outcome');
 }
 await post('/api/reports/export/pdf');check(httpTasks.snapshot().tasks[0].state==='COMPLETED'&&httpTasks.snapshot().tasks[0].result==='REPORTS','report completes only after rendering with existing result navigation');
 await post('/api/device/camera/configuration/apply');check(httpTasks.snapshot().tasks[0].state==='NEEDS_ATTENTION','unverified camera write requires attention');
 await post('/api/project/save');check(httpTasks.snapshot().tasks[0].state==='FAILED'&&httpTasks.snapshot().tasks[0].reference==='OP-ABC12345','project failure keeps support reference');
 const snapshot=await(await fetch(base+'/api/tasks')).json();check(snapshot.monitoring.status==='WAITING','background monitoring separate from task count');
 check(!JSON.stringify(snapshot).includes('secret'),'raw error, monitoring error, password and stack never enter HTTP task response');
 check(!JSON.stringify(snapshot).includes('"pass"')&&!JSON.stringify(snapshot).includes('"admin"'),'factory username/password values never enter Tasks');
 for(const kind of ['network','configuration']){
  const batchId=crypto.randomUUID();const batch={state:'READY',readyCount:2,items:[{state:'PENDING'},{state:'PENDING'}]};batches.set(batchId,batch);
  const before=httpTasks.snapshot().tasks.length;
  await post(`/api/bulk/${kind}/${batchId}/apply`);check(httpTasks.snapshot().tasks.length===before,`${kind} unconfirmed request creates no false execution task`);
  const pending=post(`/api/bulk/${kind}/${batchId}/apply`,{confirmed:true});
  while(batch.state==='READY')await new Promise(r=>setTimeout(r,5));
  const task=httpTasks.snapshot().tasks[0];batch.items[0].state='VERIFIED';integration.refresh();
  check(httpTasks.get(task.id)?.progress?.completed===1,`${kind} live progress reads authoritative batch`);
  await post(`/api/bulk/${kind}/${batchId}/apply`,{confirmed:true});check(httpTasks.snapshot().tasks.length===before+1&&httpTasks.get(task.id)?.state==='RUNNING',`${kind} rejected duplicate cannot poison active task`);
  await post(`/api/tasks/${encodeURIComponent(task.id)}/cancel`);check(httpTasks.get(task.id)?.state==='RUNNING',`${kind} accepted cancel waits for workers`);
  batch.state='CANCELLED';batch.items[1].state='SKIPPED';release();await pending;
  check(httpTasks.get(task.id)?.state==='CANCELLED',`${kind} terminal batch governs task result`);
 }
 for(const kind of ['network','configuration']){
  const plan=await(await post(`/api/bulk/${kind}/plan`)).json();const preview=httpTasks.snapshot().tasks[0];
  check(preview.state==='NEEDS_ATTENTION'&&preview.correlationId===plan.batchId,`${kind} preview waits for confirmation with batch correlation`);
  const pending=post(`/api/bulk/${kind}/${plan.batchId}/apply`,{confirmed:true});const batch=batches.get(plan.batchId);
  while(batch.state==='READY')await new Promise(r=>setTimeout(r,5));
  check(httpTasks.get(preview.id)?.state==='RUNNING'&&httpTasks.snapshot().tasks.filter(t=>t.correlationId===plan.batchId).length===1,`${kind} preview and apply share one stable parent`);
  batch.state='COMPLETED';batch.items[0].state='VERIFIED';release();await pending;
  check(httpTasks.get(preview.id)?.state==='COMPLETED',`${kind} parent finishes from batch result`);
  const cancelledPlan=await(await post(`/api/bulk/${kind}/plan`)).json();const previewId=httpTasks.snapshot().tasks[0].id;
  await post(`/api/bulk/${kind}/${cancelledPlan.batchId}/cancel`);check(httpTasks.get(previewId)?.state==='CANCELLED',`${kind} existing preview cancel resolves task attention`);
 }
 const noCancel=await post(`/api/tasks/${encodeURIComponent(httpTasks.snapshot().tasks[0].id)}/cancel`);check(noCancel.status===409,'finished task cannot pretend to cancel');
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
const source=readFileSync('src/server/index.ts','utf8');
check(source.includes('finishDiagnostic()')&&source.includes("tasks.begin('DIAGNOSTICS'"),'accepted diagnostics explicitly observes eventual completion');
check(source.includes('tasks:tasks.snapshot()'),'support bundle includes bounded safe task snapshot');
check(!readFileSync('src/core/tasks/task_manager.ts','utf8').includes('factory_credentials'),'factory hint values excluded from task model');
console.log(`Task Manager: ${passed} passed, 0 failed, 0 skipped`);
