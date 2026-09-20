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
const setEqual=(a:string[],b:string[])=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
/** DHCP leases and automatic DNS values can change while the configured modes remain original. */
export function sameAdapterConfiguration(expected:WindowsAdapterSnapshot,actual:WindowsAdapterSnapshot):boolean {
  return samePhysicalAdapter(expected,actual)&&expected.dhcpEnabled===actual.dhcpEnabled&&expected.dnsAutomatic===actual.dnsAutomatic&&
    (expected.dhcpEnabled||(setEqual(expected.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`),actual.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`))&&setEqual(expected.defaultGateways,actual.defaultGateways)))&&
    (expected.dnsAutomatic||setEqual(expected.dnsServers,actual.dnsServers));
}
