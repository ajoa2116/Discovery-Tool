import { AuditLogEntry, Device, ProjectSession } from '../../types/index.ts';

const SECRET_KEY=/(password|passwd|pwd|credential|authorization|cookie|token|secret|api[_-]?key|session[_-]?key)/i;
export function sanitizeSupportEvidence(value:unknown,key=''):unknown{
  if(SECRET_KEY.test(key))return'[REDACTED]';
  if(Array.isArray(value))return value.map(item=>sanitizeSupportEvidence(item));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([childKey,child])=>[childKey,sanitizeSupportEvidence(child,childKey)]));
  if(typeof value==='string')return value.replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9._~+\/-]+=*/gi,'[REDACTED AUTH]').replace(/([?&](?:password|passwd|pwd|token|secret|api[_-]?key)=)[^&\s]+/gi,'$1[REDACTED]').replace(/\b(password|passwd|pwd|token|secret)\s*[:=]\s*[^,;\s]+/gi,'$1=[REDACTED]');
  return value;
}
type TimelineEvent={timestamp:string;category:string;summary:string;deviceId?:string;evidence?:unknown;reference?:string;result?:string};
const time=(value?:string)=>value||new Date(0).toISOString();
const sorted=<T extends{timestamp:string}>(items:T[])=>items.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
const auditEvent=(entry:AuditLogEntry):TimelineEvent=>({timestamp:entry.timestamp,category:entry.category,summary:entry.message,deviceId:entry.deviceId,evidence:entry.details,reference:String(entry.details?.reference||'')||undefined,result:entry.level});
function deviceEvents(device:Device,audit:AuditLogEntry[]):TimelineEvent[]{
  const events:TimelineEvent[]=[{timestamp:time(device.firstSeenAt),category:'DISCOVERY',summary:'Device first entered the current inventory.',deviceId:device.id,evidence:{ipAddress:device.network.ipAddress,macAddress:device.anchor.macAddress,onvifEndpointUuid:device.anchor.onvifEndpointUuid,serialNumber:device.anchor.serialNumber,discoveredPhase:device.discoveredPhase}}];
  for(const check of device.diagnostics?.checks||[])events.push({timestamp:check.timestamp,category:'DIAGNOSTIC',summary:`${check.type} check ${check.success?'responded':'did not verify a response'}.`,deviceId:device.id,evidence:check,result:check.success?'VERIFIED':'NOT_VERIFIED'});
  for(const entry of device.connectionHistory||[])events.push({timestamp:entry.timestamp,category:'CONNECT',summary:entry.event.replaceAll('_',' '),deviceId:device.id,evidence:{mode:entry.mode,url:entry.url,statusBeforeOpen:entry.statusBeforeOpen},result:entry.result});
  if(device.configurationEvidence)events.push({timestamp:device.configurationEvidence.updatedAt,category:'CONFIGURATION',summary:'Camera operation evidence was verified.',deviceId:device.id,evidence:{verifiedOperations:device.configurationEvidence.verifiedOperations},result:'VERIFIED'});
  for(const entry of audit.filter(item=>item.deviceId===device.id))events.push(auditEvent(entry));
  if(device.lastSeenAt!==device.firstSeenAt)events.push({timestamp:time(device.lastSeenAt),category:'IDENTITY',summary:'Latest evidence retained for the same stable identity.',deviceId:device.id,evidence:{currentIp:device.network.ipAddress,ipAddressHistory:device.network.ipAddressHistory,status:device.status,sessionVerification:device.sessionVerification}});
  return sorted(events);
}
export interface SupportBundleInput{application:{name:string;version:string;runtime:string;platform:string};readiness:unknown;network:unknown[];monitoring:unknown;discovery:unknown;projectSession:ProjectSession;events:AuditLogEntry[];pair:unknown}
export class SupportBundleBuilder{
  public build(input:SupportBundleInput){
    const safeEvents=input.events.filter(entry=>entry.category!=='SECURITY').slice(0,1000),global=sorted(safeEvents.map(auditEvent)).slice(-250),devices=input.projectSession.project.devices,fullTimelines=Object.fromEntries(devices.map(device=>[device.id,deviceEvents(device,safeEvents)]));
    const bundle={manifest:{format:'CCTV_SAFE_SUPPORT_BUNDLE',schemaVersion:2,generatedAt:new Date().toISOString(),bounded:true,limits:{sourceAuditEvents:1000,globalTimeline:250,eventsPerDevice:100},truncated:{sourceAuditEvents:input.events.length>1000,globalTimeline:safeEvents.length>250,deviceTimelines:Object.fromEntries(devices.map(device=>[device.id,fullTimelines[device.id].length>100]))}},application:input.application,readiness:input.readiness,network:input.network,monitoring:input.monitoring,discovery:input.discovery,project:{id:input.projectSession.project.id,name:input.projectSession.project.name,mode:input.projectSession.mode,dirty:input.projectSession.dirty},pair:input.pair,devices:devices.map(device=>({deviceId:device.id,identity:{macAddress:device.anchor.macAddress,onvifEndpointUuid:device.anchor.onvifEndpointUuid,serialNumber:device.anchor.serialNumber,manufacturer:device.anchor.vendor,model:device.anchor.model,firmwareVersion:device.anchor.firmwareVersion},network:{ipAddress:device.network.ipAddress,subnetMask:device.network.subnetMask,ipAddressHistory:device.network.ipAddressHistory},status:device.status,sessionVerification:device.sessionVerification})),deviceTimelines:Object.fromEntries(devices.map(device=>[device.id,fullTimelines[device.id].slice(-100)])),globalTimeline:global,recentErrors:global.filter(event=>event.result==='WARNING'||event.result==='ERROR')};
    return sanitizeSupportEvidence(bundle);
  }
}
