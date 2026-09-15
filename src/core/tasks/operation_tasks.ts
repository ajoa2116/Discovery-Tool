import { ForegroundSnapshot } from '../../shared/discovery_session.ts';
import { AdvancedScanStatus } from '../../shared/advanced_scan.ts';
import { PairSessionState } from '../../types/index.ts';
import { TaskManager } from './task_manager.ts';

/** Read-only projections of authoritative state machines, never operation owners. */
export class OperationTasks {
  private foregroundRevision=-1;
  private foregroundEpoch='';
  private pairId='';
  private restoreId='';
  private restoreStarted=false;
  private lastPairState='';
  constructor(readonly tasks:TaskManager) {}
  foreground(snapshot:ForegroundSnapshot,cancel:()=>boolean,advanced?:AdvancedScanStatus){
    if(snapshot.epoch===this.foregroundEpoch&&snapshot.revision<this.foregroundRevision)return;
    if(snapshot.epoch===this.foregroundEpoch&&snapshot.revision===this.foregroundRevision&&snapshot.session&&['COMPLETED','FAILED','CANCELLED'].includes(snapshot.session.state))return;
    this.foregroundEpoch=snapshot.epoch;this.foregroundRevision=snapshot.revision;
    const s=snapshot.session;if(!s)return;
    const id=this.tasks.begin(s.origin==='MANUAL'?'SCAN':'ADVANCED',s.sessionId,cancel);
    const state=s.state==='PREPARING'?'QUEUED':['SCANNING','STOPPING'].includes(s.state)?'RUNNING':s.state as 'COMPLETED'|'FAILED'|'CANCELLED';
    const progress=s.origin==='ADVANCED'&&advanced?.targetCount&&s.state!=='PREPARING'?{completed:advanced.completedTargets,total:advanced.targetCount}:undefined;
    this.tasks.update(id,{state,phase:s.state==='PREPARING'?'PREPARING':s.state==='SCANNING'?'SCANNING':s.state==='STOPPING'?'STOPPING':s.state==='COMPLETED'?'DONE':s.state==='FAILED'?'FAILED':'CANCELLED',progress});
    this.tasks.cancellation(id,['PREPARING','SCANNING'].includes(s.state)?cancel:undefined);
  }
  pair(pair:PairSessionState|null){
    if(!pair)return;
    if(this.pairId===`${pair.purpose==='NETWORK_MATCH'?'MATCH':'PAIR'}:${pair.id}`&&this.lastPairState===pair.state&&['RESTORED','FAILED','CANCELLED'].includes(pair.state))return;
    this.lastPairState=pair.state;
    if(this.pairId&&this.pairId!==`${pair.purpose==='NETWORK_MATCH'?'MATCH':'PAIR'}:${pair.id}`){
      const old=this.tasks.get(this.pairId);if(old&&['NEEDS_ATTENTION','QUEUED','RUNNING'].includes(old.state))this.tasks.update(this.pairId,{state:'CANCELLED',phase:'CANCELLED'},true);
    }
    this.pairId=this.tasks.begin(pair.purpose==='NETWORK_MATCH'?'MATCH':'PAIR',pair.id);
    this.tasks.adapterTarget(this.pairId,pair.adapter.interfaceIndex,pair.purpose==='NETWORK_MATCH'?pair.selectedCandidate?.ipAddress:pair.cameraIp);
    const s=pair.state;
    if(s==='RESTORING'&&!this.restoreStarted){this.restoreId=this.tasks.begin('RESTORE');this.tasks.correlate(this.restoreId,pair.id);this.tasks.adapterTarget(this.restoreId,pair.adapter.interfaceIndex);this.restoreStarted=true;}
    if(s==='RESTORING'){this.tasks.update(this.restoreId,{state:'RUNNING',phase:'RESTORING'});return;}
    if(s==='RESTORED'){
      if(this.restoreId)this.tasks.update(this.restoreId,{state:'COMPLETED',phase:'DONE'});
      this.tasks.update(this.pairId,{state:'COMPLETED',phase:'DONE'},true);this.restoreStarted=false;return;
    }
    if(s==='ROLLBACK_REQUIRED'){
      if(this.restoreStarted){this.tasks.update(this.restoreId,{state:'FAILED',phase:'RECOVERY',result:'NETWORK_RECOVERY'});this.restoreStarted=false;}
      this.tasks.update(this.pairId,{state:'NEEDS_ATTENTION',phase:'RECOVERY',result:'NETWORK_RECOVERY'},true);return;
    }
    if(s==='PAIRED'){this.tasks.update(this.pairId,{state:'NEEDS_ATTENTION',phase:pair.cameraReachabilityVerified?'RESPONDED':'PAIRED',result:'NETWORK_RECOVERY'},true);return;}
    if(s==='READY_FOR_CONFIRMATION'){this.tasks.update(this.pairId,{state:'NEEDS_ATTENTION',phase:'CONFIRM',result:'NETWORK_RECOVERY'},true);return;}
    this.tasks.update(this.pairId,{state:s==='FAILED'?'FAILED':s==='CANCELLED'?'CANCELLED':'RUNNING',phase:s==='FAILED'?'FAILED':s==='CANCELLED'?'CANCELLED':s==='APPLYING'?'APPLYING':s==='VERIFYING'?'VERIFYING':'PREPARING'},true);
  }
}

export interface TaskBatch {state:string;items:Array<{state:string}>;readyCount?:number;completedCount?:number;cancellationRequested?:boolean}
export function observeBatch(tasks:TaskManager,id:string,batch:TaskBatch){
  const terminal=['COMPLETED','PARTIAL_FAILURE','FAILED','CANCELLED'].includes(batch.state);
  const completed=batch.completedCount??batch.items.filter(i=>['VERIFIED','FAILED','NEEDS_ATTENTION'].includes(i.state)).length;
  const total=batch.readyCount??batch.items.length;
  tasks.update(id,{state:batch.state==='COMPLETED'?'COMPLETED':batch.state==='CANCELLED'?'CANCELLED':batch.state==='PARTIAL_FAILURE'?'NEEDS_ATTENTION':batch.state==='FAILED'?'FAILED':'RUNNING',phase:terminal?batch.state==='COMPLETED'?'DONE':batch.state==='CANCELLED'?'CANCELLED':batch.state==='FAILED'?'FAILED':'ATTENTION':batch.cancellationRequested?'STOPPING':'WORKING',progress:{completed:Math.min(completed,total),total}});
}
