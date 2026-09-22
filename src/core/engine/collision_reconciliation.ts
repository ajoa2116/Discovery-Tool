import { hasIdentity } from '../../shared/identity_policy.ts';
import { Device, DiagnosticCheckEvidence, IPCollisionRecord, NICInfo } from '../../types/index.ts';
import { isActiveCollision } from '../../shared/collision_state.ts';
import { DeviceDiagnosticEngine } from './diagnostic_engine.ts';
import { classifySubnet } from './device_enrichment.ts';
import { isEligibleDiscoveryInterface } from './phase1_topology.ts';

/** Use this cycle's topology, retaining interface provenance and preferring a matching address. */
function reconcileSubnet(device:Device,interfaces:NICInfo[]):void {
  const eligible=interfaces.filter(isEligibleDiscoveryInterface);
  const discovery=device.reachability?.discoveryInterface;
  const relationship=device.reachability?.relationshipAdapter;
  const belongs=(nic:NICInfo,source:typeof discovery)=>Boolean(source&&(source.interfaceIndex!==undefined ? nic.interfaceIndex===source.interfaceIndex : nic.name===source.name));
  const local=eligible.filter(nic=>classifySubnet(device.network.ipAddress,nic.ipAddress,nic.netmask)==='LOCAL');
  const selected=local.find(nic=>belongs(nic,discovery)) || local.find(nic=>belongs(nic,relationship)) ||
    (local.length===1?local[0]:undefined) || (local.length===0 ?
      eligible.find(nic=>belongs(nic,discovery)) || eligible.find(nic=>belongs(nic,relationship)) || (eligible.length===1?eligible[0]:undefined) : undefined);
  device.reachability={...device.reachability,
    relationshipAdapter:selected?{name:selected.name,ipAddress:selected.ipAddress,netmask:selected.netmask,interfaceIndex:selected.interfaceIndex}:undefined,
    subnetClassification:local.length?'LOCAL':selected?classifySubnet(device.network.ipAddress,selected.ipAddress,selected.netmask):'UNKNOWN'};
}

function currentStatus(device:Device,interfaces?:NICInfo[]):void {
  if(interfaces)reconcileSubnet(device,interfaces);
  if(!interfaces&&device.status!=='COLLISION')return;
  device.status='UNKNOWN';delete device.statusMessage;
  const start=device.diagnostics?.lastRunStartedAt;
  const evidence:DiagnosticCheckEvidence[]=(device.diagnostics?.checks||[]).filter(check=>check.targetIp===device.network.ipAddress&&(!start||check.timestamp>=start));
  const lastCheck=evidence.reduce((last,check)=>check.timestamp>last?check.timestamp:last,'');
  const discovery=device.reachability?.wsDiscoveryRespondedAt;
  const discoveryAge=discovery?Date.now()-Date.parse(discovery):NaN;
  if(discovery&&discoveryAge>=0&&discoveryAge<=90_000&&discovery>=lastCheck)evidence.push({type:'ONVIF_WS_DISCOVERY',targetIp:device.network.ipAddress,success:true,timestamp:discovery});
  // Enrichment completes before this pass. Its current services use the same diagnostic rules.
  for(const service of device.reachability?.tcpServices||[]){
    const age=Date.now()-Date.parse(service.testedAt);
    if(age>=0&&age<=90_000&&service.testedAt>=lastCheck)evidence.push({type:'TCP',targetIp:device.network.ipAddress,port:service.port,success:service.reachable,timestamp:service.testedAt});
  }
  // Use the existing status rules, without incrementing diagnostic failure counters during reconciliation.
  const projection=structuredClone(device);projection.diagnostics||={checks:[]};
  new DeviceDiagnosticEngine().deriveStatus(projection,evidence,Boolean(device.diagnostics?.lastRefreshAt));
  device.status=projection.status;device.statusMessage=projection.statusMessage;device.sessionVerification=projection.sessionVerification;
}

/** Runtime collision lifecycle. Existing records preserve history; no persistent edit or network operation. */
export function reconcileCollisionState(devices:Device[],records:IPCollisionRecord[],interfaces?:NICInfo[]):{active:IPCollisionRecord[];transitions:string[]} {
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
    for(const device of group){if(interfaces)reconcileSubnet(device,interfaces);device.status='COLLISION';device.statusMessage=`Duplicate IP collision on ${ip} with ${group.length-1} other device(s)`;}
  }
  for(const device of devices)if(!duplicateGroups.has(device.network.ipAddress))currentStatus(device,interfaces);
  return {active:records.filter(isActiveCollision),transitions};
}
