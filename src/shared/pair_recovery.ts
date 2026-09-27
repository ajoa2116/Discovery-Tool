import { PairSessionState, WindowsAdapterSnapshot } from '../types/index.ts';
import { isAdapterCollection, isRecord } from './advanced_scan_contract.ts';
import { normalizeIPv4 } from './address_validation.ts';

export const adapterGuid = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const guid=value.replace(/^\{(.*)\}$/, '$1').toLowerCase();
  return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(guid) && !/^0{8}(-0{4}){3}-0{12}$/.test(guid) ? guid : null;
};
export const samePhysicalAdapter=(a:WindowsAdapterSnapshot,b:WindowsAdapterSnapshot)=>Boolean(adapterGuid(a.interfaceGuid)&&adapterGuid(a.interfaceGuid)===adapterGuid(b.interfaceGuid));
export function validRecoverySnapshot(value:unknown):value is WindowsAdapterSnapshot {
  return isAdapterCollection([value]) && isRecord(value) && Boolean(adapterGuid(value.interfaceGuid)) &&
    value.ipv4Addresses.length>0 && value.ipv4Addresses.every((ip:{prefixLength:number})=>ip.prefixLength>=1&&ip.prefixLength<=30) &&
    [...value.defaultGateways,...value.dnsServers].every(ip=>normalizeIPv4(ip)!==null) && (value.dnsAutomatic||value.dnsServers.length>0);
}
export function validRecoverySession(value:unknown):value is PairSessionState {
  return isRecord(value)&&typeof value.id==='string'&&typeof value.deviceId==='string'&&typeof value.cameraIp==='string'&&typeof value.cameraSubnetMask==='string'&&
    typeof value.createdAt==='string'&&typeof value.updatedAt==='string'&&Array.isArray(value.candidates)&&typeof value.recoveryAvailable==='boolean'&&
    ['APPLYING','VERIFYING','PAIRED','RESTORING','ROLLBACK_REQUIRED','RESTORED','CANCELLED'].includes(value.state)&&
    validRecoverySnapshot(value.originalAdapter)&&validRecoverySnapshot(value.adapter)&&samePhysicalAdapter(value.originalAdapter,value.adapter);
}
/** Positive recognition of the pre-GUID format; never supplies identity for Restore. */
export function legacyRecoverySession(value:unknown):value is PairSessionState { try{return recognizeLegacyRecovery(value);}catch{return false;} }
function recognizeLegacyRecovery(value:unknown):value is PairSessionState {
  if(!isRecord(value)||validRecoverySession(value))return false;
  const ip=(v:unknown)=>typeof v==='string'?normalizeIPv4(v):null;
  const keys=['id','purpose','state','deviceId','cameraIp','cameraSubnetMask','adapter','originalAdapter','candidates','selectedCandidate','createdAt','updatedAt','technicianConfirmedAt','adapterConfigurationVerified','cameraReachabilityVerified','verification','message','errorCode','recoveryAvailable','temporaryGateway','subnetSource'];
  if(Object.keys(value).some(k=>!keys.includes(k)))return false;
  const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  const snapshot=(v:unknown):v is WindowsAdapterSnapshot=>isRecord(v)&&!('interfaceGuid' in v)&&isAdapterCollection([v])&&
    Object.keys(v).every(k=>['interfaceIndex','interfaceAlias','interfaceDescription','mediaType','physicalMediaType','hardwareInterface','operationalStatus','eligible','eligibilityReason','dhcpEnabled','ipv4Addresses','defaultGateways','dnsAutomatic','dnsServers','capturedAt'].includes(k))&&
    v.interfaceAlias.trim().length>0&&date(v.capturedAt)&&v.ipv4Addresses.length>0&&v.ipv4Addresses.every((ip:any)=>ip.prefixLength>=1&&ip.prefixLength<=30)&&
    [...v.defaultGateways,...v.dnsServers].every(ip=>normalizeIPv4(ip)!==null)&&(v.dnsAutomatic||v.dnsServers.length>0);
  const candidate=(v:any)=>isRecord(v)&&Object.keys(v).every(k=>['ipAddress','prefixLength','confidence','evidence'].includes(k))&&ip(v.ipAddress)!==null&&Number.isInteger(v.prefixLength)&&v.prefixLength>=1&&v.prefixLength<=30&&v.confidence==='AVAILABLE'&&Array.isArray(v.evidence)&&v.evidence.every((s:unknown)=>typeof s==='string');
  if(!snapshot(value.adapter)||!snapshot(value.originalAdapter)||value.adapter.interfaceIndex!==value.originalAdapter.interfaceIndex||value.adapter.interfaceAlias!==value.originalAdapter.interfaceAlias||value.adapter.mediaType!==value.originalAdapter.mediaType)return false;
  if(typeof value.id!=='string'||!adapterGuid(value.id)||!date(value.createdAt)||!date(value.updatedAt)||!date(value.technicianConfirmedAt)||Date.parse(value.updatedAt)<Date.parse(value.createdAt)||value.recoveryAvailable!==true)return false;
  if(!['APPLYING','VERIFYING','PAIRED','RESTORING','ROLLBACK_REQUIRED'].includes(value.state)||!candidate(value.selectedCandidate)||!Array.isArray(value.candidates)||!value.candidates.length||!value.candidates.every(candidate)||!value.candidates.some((c:any)=>c.ipAddress===value.selectedCandidate.ipAddress&&c.prefixLength===value.selectedCandidate.prefixLength))return false;
  if(value.purpose!==undefined&&!['CAMERA_PAIR','NETWORK_MATCH'].includes(value.purpose))return false;
  if(['adapterConfigurationVerified','cameraReachabilityVerified'].some(k=>value[k]!==undefined&&typeof value[k]!=='boolean')||['message','errorCode'].some(k=>value[k]!==undefined&&typeof value[k]!=='string'))return false;
  if(value.subnetSource!==undefined&&!['CAMERA_EVIDENCE','ADAPTER_PREFIX_PROPOSAL'].includes(value.subnetSource))return false;
  if(value.verification!==undefined){
    const v=value.verification;
    if(!isRecord(v)||Object.keys(v).some(k=>!['startedAt','elapsedMs','cameraResponded','attempts','successfulSource'].includes(k))||!date(v.startedAt)||!Number.isFinite(v.elapsedMs)||v.elapsedMs<0||typeof v.cameraResponded!=='boolean'||!Array.isArray(v.attempts)||v.successfulSource!==undefined&&typeof v.successfulSource!=='string')return false;
    if(v.cameraResponded!==value.cameraReachabilityVerified||!v.attempts.every((a:any)=>isRecord(a)&&Number.isInteger(a.attempt)&&a.attempt>0&&Array.isArray(a.checks)&&a.checks.every((c:any)=>isRecord(c)&&typeof c.type==='string'&&ip(c.targetIp)!==null&&typeof c.success==='boolean'&&date(c.timestamp))))return false;
  }
  if(value.purpose==='NETWORK_MATCH'?(value.deviceId!==''||value.cameraIp!==''):(typeof value.deviceId!=='string'||!value.deviceId||ip(value.cameraIp)===null))return false;
  const prefix=value.selectedCandidate.prefixLength,mask=[24,16,8,0].map(shift=>((0xffffffff<<(32-prefix))>>>shift)&255).join('.');
  if(value.cameraSubnetMask!==mask||value.temporaryGateway!==undefined&&ip(value.temporaryGateway)===null)return false;
  if(value.state==='PAIRED'&&(value.adapterConfigurationVerified!==true||value.adapter.dhcpEnabled||!value.adapter.ipv4Addresses.some(ip=>ip.address===value.selectedCandidate.ipAddress&&ip.prefixLength===prefix)))return false;
  if(value.state==='PAIRED'&&(JSON.stringify(value.adapter.defaultGateways)!==JSON.stringify(value.temporaryGateway?[value.temporaryGateway]:[])||value.adapter.dnsAutomatic!==value.originalAdapter.dnsAutomatic||!value.adapter.dnsAutomatic&&JSON.stringify(value.adapter.dnsServers)!==JSON.stringify(value.originalAdapter.dnsServers)))return false;
  // Recovery is not a credential container. Unknown/secret-bearing structures require review.
  const safe=(v:unknown):boolean=>!v||typeof v!=='object'||Object.entries(v).every(([k,item])=>!/password|credential|authorization|cookie|token|secret/i.test(k)&&safe(item));
  return safe(value);
}
const setEqual=(a:string[],b:string[])=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
/** DHCP leases and automatic DNS values can change while the configured modes remain original. */
export function sameAdapterConfiguration(expected:WindowsAdapterSnapshot,actual:WindowsAdapterSnapshot):boolean {
  return samePhysicalAdapter(expected,actual)&&expected.dhcpEnabled===actual.dhcpEnabled&&expected.dnsAutomatic===actual.dnsAutomatic&&
    (expected.dhcpEnabled||(setEqual(expected.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`),actual.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`))&&setEqual(expected.defaultGateways,actual.defaultGateways)))&&
    (expected.dnsAutomatic||setEqual(expected.dnsServers,actual.dnsServers));
}
