import {Device,ProjectSession} from '../../types/index.ts';
import {ReportMember,ReportSetSnapshot} from '../../shared/report_set.ts';
import {canonicalAnchor,hasIdentity,mergeAnchors,selectIdentity} from '../../shared/identity_policy.ts';

// Explicit report fields only. Raw provider payloads, credential references and login material never enter storage.
const sensitive=/(password|passwd|pwd|credential|authorization|bearer|basic|token|cookie|secret|digest|api[_ -]?key|vault|https?:\/\/[^\s/]+@)/i;
const text=(v:unknown):string|undefined=>typeof v==='string'&&!sensitive.test(v)?v:undefined;
export function reportSnapshot(d:Device):Device {
 const a=canonicalAnchor(d.anchor);
 return {id:text(d.id)||'unavailable',anchor:{macAddress:a.macAddress,onvifEndpointUuid:text(a.onvifEndpointUuid),serialNumber:text(a.serialNumber),vendor:text(a.vendor)||'Unknown',model:text(a.model),firmwareVersion:text(a.firmwareVersion)},
  network:{ipAddress:text(d.network.ipAddress)||'Unknown',subnetMask:text(d.network.subnetMask)||'Unknown',gateway:text(d.network.gateway),port:d.network.port,protocol:d.network.protocol,ipAddressHistory:d.network.ipAddressHistory?.map(text).filter((s):s is string=>Boolean(s))},
  technician:{name:text(d.technician?.name),location:text(d.technician?.location),notes:text(d.technician?.notes)},status:d.status,sessionVerification:d.sessionVerification,discoveredPhase:d.discoveredPhase,firstSeenAt:text(d.firstSeenAt)||'',lastSeenAt:text(d.lastSeenAt)||'',
  configuredState:d.configuredState?{inferred:d.configuredState.inferred,manualOverride:d.configuredState.manualOverride}:undefined,
  manufacturerParams:{activeDriver:text(d.manufacturerParams?.activeDriver)},
  reachability:{subnetClassification:d.reachability?.subnetClassification,lastSuccessfulResponseAt:text(d.reachability?.lastSuccessfulResponseAt)},
  diagnostics:d.diagnostics?{lastSuccessfulContactAt:text(d.diagnostics.lastSuccessfulContactAt),checks:d.diagnostics.checks.filter(c=>c.targetIp===d.network.ipAddress).map(c=>({type:c.type,targetIp:text(c.targetIp)||'',success:c.success,timestamp:text(c.timestamp)||'',httpStatus:c.httpStatus,port:c.port,errorCategory:c.errorCategory}))}:undefined};
}

/** Backend-process session state; independent of project storage and current-list removal. */
export class ReportSet {
 private members:ReportMember[]=[];
 constructor(private getSession:()=>ProjectSession){}
 private reconcile(){
  const current=this.getSession().project.devices;
  for(const member of this.members){
   const selection=selectIdentity(current,member.device),candidate=selection.index>=0?current[selection.index]:undefined;
   member.current=false;delete member.currentDeviceId;
   if(!candidate)continue;
   // The match must be unique in both directions; a weak rediscovery cannot own two retained identities.
   const reverse=selectIdentity(this.members.map(m=>m.device),candidate);
   if(reverse.index<0||this.members[reverse.index].id!==member.id)continue;
   const next=reportSnapshot(candidate);next.anchor=mergeAnchors(member.device.anchor,next.anchor);
   next.id=member.device.id;
   if(JSON.stringify(next)!==JSON.stringify(member.device))member.updatedAt=new Date().toISOString();
   member.device=next;member.current=true;member.currentDeviceId=candidate.id;
  }
 }
 snapshot():ReportSetSnapshot{
  this.reconcile();return {members:this.members.map(m=>({...structuredClone(m),macLastSix:m.device.anchor.macAddress?.replaceAll(':','').slice(-6).toUpperCase()}))};
 }
 add(deviceIds:string[]){
  this.reconcile();const devices=this.getSession().project.devices,working=structuredClone(this.members);
  for(const id of new Set(deviceIds)){
   const device=devices.find(d=>d.id===id);if(!device)throw Error('A selected device is no longer in the current list.');
   const safe=reportSnapshot(device);if(!hasIdentity(safe))throw Error('An established MAC, ONVIF UUID or serial identity is required.');
   const match=selectIdentity(working.map(m=>m.device),safe);if(match.ambiguous)throw Error('Report identity is ambiguous. Inspect the established identities before adding.');
   if(match.index>=0)continue;
   const stamp=new Date().toISOString();working.push({id:crypto.randomUUID(),device:safe,addedAt:stamp,updatedAt:stamp,current:true,currentDeviceId:id});
  }
  this.members=working;return this.snapshot();
 }
 remove({memberIds=[],deviceIds=[]}:{memberIds?:string[];deviceIds?:string[]}){
  this.reconcile();const ids=new Set(memberIds);for(const member of this.members)if(member.currentDeviceId&&deviceIds.includes(member.currentDeviceId))ids.add(member.id);
  this.members=this.members.filter(m=>!ids.has(m.id));return this.snapshot();
 }
 clear(confirmed:boolean){if(this.members.length&&!confirmed)throw Error('Confirm Clear Report Set.');this.members=[];return this.snapshot();}
 reportSession():ProjectSession{
  const members=this.snapshot().members;if(!members.length)throw Error('No devices have been added to Report Set.');
  // Report row IDs belong to report membership; original stable Device IDs remain unchanged in snapshots.
  const devices=members.map(m=>({...structuredClone(m.device),id:m.id}));
  return {mode:'QUICK_WORK',dirty:false,project:{id:'report-set',name:'Report Set',siteLocation:'',technicianName:'',createdAt:members[0].addedAt,updatedAt:new Date().toISOString(),devices,totalDevices:devices.length,collisions:[],rogueDhcpEvents:[],auditLogs:[]}};
 }
}
