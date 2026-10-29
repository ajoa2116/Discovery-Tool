import {Device,IPCollisionRecord,ProjectSession} from '../types/index.ts';
import {TaskSnapshot} from './tasks.ts';
import {isActiveCollision} from './collision_state.ts';

export const activeCollisionChoices=(records:IPCollisionRecord[])=>records.filter(isActiveCollision).map(c=>({id:c.id||c.ipAddress,ip:c.ipAddress,count:new Set(c.deviceIds||c.collidingDevices.map(d=>d.id)).size}));
export const hasUnsavedAttention=(session:ProjectSession|null)=>session?.mode==='PROJECT'&&session.dirty;
export interface DiagnosticRequest {taskId?:string;pending?:boolean;failed?:boolean;}
/** Display operation/evidence state only; never derives network status or access permission. */
export function diagnosticPresentation(device:Device,snapshot:TaskSnapshot&{unavailable?:boolean},request?:DiagnosticRequest){
  const task=request?.taskId?snapshot.tasks.find(t=>t.id===request.taskId):snapshot.tasks.find(t=>t.diagnosticDevices?.some(d=>d.deviceId===device.id));
  const result=task?.diagnosticDevices?.find(d=>d.deviceId===device.id);
  // An unknown acknowledgment cannot borrow an earlier task's outcome. Only an
  // explicitly correlated, currently observed terminal result resolves that uncertainty.
  const confirmedOutcome=Boolean(request?.taskId&&!snapshot.unavailable&&result&&['COMPLETED','FAILED','CANCELLED'].includes(result.state));
  const unacknowledged=Boolean(request?.failed&&!confirmedOutcome);
  const state=unacknowledged?'Unavailable':request?.pending?'Running':snapshot.unavailable?'Unavailable':result?.state==='RUNNING'?'Running':result?.state==='COMPLETED'?'Completed':result?.state==='FAILED'?'Failed':result?.state==='CANCELLED'?'Cancelled':request?.taskId?'Unavailable':device.diagnostics?.lastRunCompletedAt?'Completed':'Unavailable';
  const failureMessage=result?.reason==='DIAGNOSTIC_RESULT_STALE'
    ?'Diagnostic result no longer applies. The device record or IP address changed before the diagnostic result could be accepted. Run Diagnose again for the current device.'
    :'Diagnostics could not complete. Review available evidence or retry.';
  return {state,taskId:task?.id,checks:(device.diagnostics?.checks||[]).filter(c=>c.targetIp===device.network.ipAddress),message:unacknowledged?'The diagnostic request failed or was not acknowledged. Check Tasks before retrying; an accepted operation may still be running.':state==='Failed'?failureMessage:state==='Cancelled'?'Diagnostics were cancelled. Partial evidence may be available.':state==='Unavailable'?'No current operation state is available. Existing evidence may be from an earlier check.':state==='Running'?'Diagnostics are running. Evidence appears as checks finish.':'Diagnostic operation completed. Network failures remain evidence, not an operation failure.'};
}
export type DiagnosticPresentation=ReturnType<typeof diagnosticPresentation>;
