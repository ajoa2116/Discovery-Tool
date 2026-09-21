import { hasIdentity } from '../../shared/identity_policy.ts';
import { Device, DiagnosticCheckEvidence, IPCollisionRecord } from '../../types/index.ts';
import { isActiveCollision } from '../../shared/collision_state.ts';
import { DeviceDiagnosticEngine } from './diagnostic_engine.ts';

function currentStatus(device:Device):void {
  if(device.status!=='COLLISION')return;
  device.status='UNKNOWN';delete device.statusMessage;
  const start=device.diagnostics?.lastRunStartedAt;
  const evidence:DiagnosticCheckEvidence[]=(device.diagnostics?.checks||[]).filter(check=>check.targetIp===device.network.ipAddress&&(!start||check.timestamp>=start));
  const lastCheck=evidence.reduce((last,check)=>check.timestamp>last?check.timestamp:last,'');
  const discovery=device.reachability?.wsDiscoveryRespondedAt;
  if(discovery&&Date.now()-Date.parse(discovery)<=90_000&&discovery>=lastCheck)evidence.push({type:'ONVIF_WS_DISCOVERY',targetIp:device.network.ipAddress,success:true,timestamp:discovery});
  // Use the existing status rules, without incrementing diagnostic failure counters during reconciliation.
  const projection=structuredClone(device);projection.diagnostics||={checks:[]};
  new DeviceDiagnosticEngine().deriveStatus(projection,evidence,Boolean(device.diagnostics?.lastRefreshAt));
  device.status=projection.status;device.statusMessage=projection.statusMessage;device.sessionVerification=projection.sessionVerification;
}

/** Runtime collision lifecycle. Existing records preserve history; no persistent edit or network operation. */
export function reconcileCollisionState(devices:Device[],records:IPCollisionRecord[]):{active:IPCollisionRecord[];transitions:string[]} {
  const groups=new Map<string,Device[]>(),transitions:string[]=[];
  for(const device of devices){const ip=device.network.ipAddress;if(!ip||ip==='Unknown'||!hasIdentity(device))continue;groups.set(ip,[...(groups.get(ip)||[]),device]);}
  const duplicateGroups=new Map([...groups].filter(([ip,group])=>group.length>1 && !(records.some(record=>record.ipAddress===ip&&!isActiveCollision(record)) && group.some(device=>device.sessionVerification==='NOT_VERIFIED'||device.sessionVerification==='NOT_FOUND'))));
  for(const record of records){
    if(isActiveCollision(record)&&!duplicateGroups.has(record.ipAddress)){
      record.resolved=true;record.state='RESOLVED';record.ambiguity='CLEAR';record.updatedAt=new Date().toISOString();
      transitions.push(`Collision resolved at ${record.ipAddress}. Historical identity evidence retained.`);
    }
  }
  for(const [ip,group] of duplicateGroups){
    const existing=records.find(record=>record.ipAddress===ip);
    const wasActive=existing&&isActiveCollision(existing);
    const now=new Date().toISOString();
    const record:IPCollisionRecord=existing||{id:crypto.randomUUID(),ipAddress:ip,detectedAt:now,collidingDevices:[],resolved:false};
    if(!existing)records.push(record);
    if(!wasActive){record.resolved=false;record.state='AMBIGUOUS';record.ambiguity='NONE_UNIQUELY_TARGETABLE';record.updatedAt=now;transitions.push(`Collision ${existing?'reopened':'detected'} at ${ip}.`);}
    record.deviceIds=group.map(device=>device.id);
    record.collidingDevices=structuredClone(group);
    record.resolutionStrategy||='MANUAL_REASSIGN';
    record.devices=group.map(device=>(wasActive&&record.devices?.find(item=>item.deviceId===device.id))||({deviceId:device.id,identity:{macAddress:device.anchor.macAddress,onvifEndpointUuid:device.anchor.onvifEndpointUuid,serialNumber:device.anchor.serialNumber},targetable:false,targetabilityReason:'Responses on the shared IP cannot be attributed uniquely.',credentialAvailable:false,state:'NEEDS_ISOLATION'}));
    for(const device of group){device.status='COLLISION';device.statusMessage=`Duplicate IP collision on ${ip} with ${group.length-1} other device(s)`;}
  }
  for(const device of devices)if(!duplicateGroups.has(device.network.ipAddress))currentStatus(device);
  return {active:records.filter(isActiveCollision),transitions};
}
