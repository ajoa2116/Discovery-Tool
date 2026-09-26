import { TASK_TITLES, TaskKind, TaskSnapshot, TaskState, TechnicianTask, taskActive } from '../../shared/tasks.ts';

// Only controlled phrases cross this boundary. Raw operation errors, request bodies,
// camera metadata and credential material never become task text.
export const TASK_PHASES = {
  WAITING: 'Waiting to start', WORKING: 'Operation in progress', PREPARING: 'Preparing',
  SCANNING: 'Discovering devices', STOPPING: 'Stopping; waiting for active work',
  CONFIRM: 'Review the preview and explicitly confirm', APPLYING: 'Applying configuration',
  VERIFYING: 'Verifying communication and configuration', PAIRED: 'Adapter verified; Restore remains available',
  RESPONDED: 'Adapter verified; camera responded. Restore remains available',
  RESTORING: 'Restoring preserved adapter configuration', RECOVERY: 'Original network configuration requires Restore',
  DONE: 'Operation completed', FAILED: 'Operation could not complete. View Technical Details for support.',
  CANCELLED: 'Operation cancelled', ATTENTION: 'Some results require technician review',
} as const;
type Phase = keyof typeof TASK_PHASES;
type Update = { state: TaskState; phase: Phase; progress?: { completed:number; total:number }; reference?:string; result?:TechnicianTask['result'] };
export class TaskManager {
  private entries = new Map<string, TechnicianTask>();
  private cancels = new Map<string, () => boolean | Promise<boolean>>();
  constructor(private limit = 100, private now = () => new Date().toISOString(), private evidence: (task:TechnicianTask)=>void = () => {}) {}
  begin(kind:TaskKind, correlationId:string = crypto.randomUUID(), cancel?:()=>boolean|Promise<boolean>) {
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(correlationId))correlationId=crypto.randomUUID();
    const id = `${kind}:${correlationId}`;
    if(this.entries.has(id))return id;
    const stamp=this.now();
    this.entries.set(id,{id,correlationId,kind,title:TASK_TITLES[kind],state:'QUEUED',phase:TASK_PHASES.WAITING,startedAt:stamp,updatedAt:stamp,cancellable:Boolean(cancel)});
    if(cancel)this.cancels.set(id,cancel);
    this.evidence(this.get(id)!);this.trim();return id;
  }
  update(id:string, update:Update, allowResolution=false) {
    const task=this.entries.get(id);if(!task)return;
    // Late progress must never resurrect a finished operation.
    if(!taskActive(task)&&!(allowResolution&&task.state==='NEEDS_ATTENTION'))return;
    if(task.state===update.state&&task.phase===TASK_PHASES[update.phase]&&JSON.stringify(task.progress)===JSON.stringify(update.progress)&&task.result===update.result&&task.reference===update.reference)return;
    const previous=task.state;
    task.state=update.state;task.phase=TASK_PHASES[update.phase];task.updatedAt=this.now();
    const p=update.progress;
    task.progress=p&&Number.isSafeInteger(p.completed)&&Number.isSafeInteger(p.total)&&p.total>0&&p.completed>=0&&p.completed<=p.total?{...p}:undefined;
    task.reference=update.reference&&/^OP-[A-Z0-9-]{4,64}$/.test(update.reference)?update.reference:undefined;
    task.result=update.result;
    if(!taskActive(task)){task.endedAt=task.updatedAt;task.cancellable=false;this.cancels.delete(id);this.entries.delete(id);this.entries.set(id,task);}
    else task.endedAt=undefined;
    if(update.phase==='CONFIRM')task.endedAt=undefined;
    if(previous!==task.state)this.evidence(this.get(id)!);
    this.trim();
  }
  cancellation(id:string, callback?:()=>boolean|Promise<boolean>) {
    const task=this.entries.get(id);if(!task||!taskActive(task))return;
    task.cancellable=Boolean(callback)&&!task.cancellationRequested;
    if(callback)this.cancels.set(id,callback);else this.cancels.delete(id);
  }
  async cancel(id:string) {
    const task=this.entries.get(id),cancel=this.cancels.get(id);
    if(!task||!taskActive(task)||!task.cancellable||!cancel)return false;
    const accepted=await cancel();
    if(accepted&&taskActive(task)){task.cancellationRequested=true;task.cancellable=false;task.phase=TASK_PHASES.STOPPING;}
    return accepted; // Only the operation's actual terminal state finishes the task.
  }
  get(id:string){const task=this.entries.get(id);return task?structuredClone(task):undefined;}
  correlate(id:string,correlationId:string){const task=this.entries.get(id);if(task&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(correlationId))task.correlationId=correlationId;}
  adapterTarget(id:string,index:number,ip?:string){
    const task=this.entries.get(id);if(!task||!Number.isSafeInteger(index)||index<1)return;
    const valid=ip&&/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)&&ip.split('.').every(p=>Number(p)<=255);
    task.target=`Adapter ${index}${valid?` • ${ip}`:''}`;
  }
  diagnosticTargets(id:string,deviceIds:string[]) {
    const task=this.entries.get(id);if(!task||task.kind!=='DIAGNOSTICS'||!taskActive(task))return;
    task.diagnosticDevices=[...new Set(deviceIds)].map(deviceId=>({deviceId,state:'RUNNING'}));
  }
  diagnosticResult(id:string,deviceId:string,state:'COMPLETED'|'FAILED'|'CANCELLED') {
    const task=this.entries.get(id);if(!task||!taskActive(task))return;
    const item=task.diagnosticDevices?.find(d=>d.deviceId===deviceId);if(item?.state==='RUNNING')item.state=state;
  }
  snapshot():TaskSnapshot {
    const tasks=[...this.entries.values()].reverse().map(t=>structuredClone(t));
    return {tasks,active:tasks.filter(taskActive).length,attention:tasks.filter(t=>t.state==='FAILED'||t.state==='NEEDS_ATTENTION').length};
  }
  private trim(){
    // Retain all live/safety-attention tasks; cap ordinary recent terminal history.
    const recent=[...this.entries.values()].filter(t=>!taskActive(t)&&!(t.state==='NEEDS_ATTENTION'&&t.result==='NETWORK_RECOVERY'));
    for(const task of recent.slice(0,Math.max(0,recent.length-this.limit)))this.entries.delete(task.id);
  }
}
