import { Device } from '../types/index.ts';
import { canonicalMac, canonicalAnchor, conflicts, sameIdentity } from './identity_policy.ts';

export interface NeighborObservation {ipAddress:string;macAddress:string;interfaceIndex?:number;state?:string}
/** Neighbor lookup never creates a UUID/MAC binding. Only corroborates a recent,
 * same-interface discovery response carrying that binding independently of ARP.
 * No row count, scan completion, ping, vendor label, or authentication substitutes for it.
 */
export function observeNeighbor(device:Device,neighbor:NeighborObservation,now=Date.now()):boolean {
  const mac=canonicalMac(neighbor.macAddress),known=canonicalMac(device.anchor.macAddress);
  const nic=device.reachability?.relationshipAdapter||device.reachability?.discoveryInterface;
  const proof=device.reachability?.identityObservation;
  const valid=Boolean(mac&&neighbor.ipAddress===device.network.ipAddress&&nic?.interfaceIndex!==undefined&&neighbor.interfaceIndex===nic.interfaceIndex&&!['Incomplete','Unreachable','0','1'].includes(String(neighbor.state)));
  const age=proof?now-Date.parse(proof.observedAt):Infinity;
  const bound=Boolean(
    valid && proof && proof.source==='WS_DISCOVERY' &&
    device.anchor.onvifEndpointUuid && proof.anchor.onvifEndpointUuid &&
    device.anchor.onvifEndpointUuid.trim().toLowerCase()===proof.anchor.onvifEndpointUuid.trim().toLowerCase() &&
    age>=0 && age<=30000 && proof.ipAddress===neighbor.ipAddress &&
    proof.interfaceIndex===neighbor.interfaceIndex && canonicalMac(proof.anchor.macAddress)===mac &&
    sameIdentity(device,{...device,anchor:{...proof.anchor,macAddress:null}}) &&
    !conflicts(device,{...device,anchor:proof.anchor})
  );
  const result:'CONFIRMED'|'UNBOUND'|'CONFLICT'|'INVALID'=!valid?'INVALID':known&&known!==mac?'CONFLICT':known===mac||bound?'CONFIRMED':'UNBOUND';
  device.reachability={...device.reachability,neighborObservations:[...(device.reachability?.neighborObservations||[]),{ipAddress:neighbor.ipAddress,macAddress:mac,interfaceIndex:neighbor.interfaceIndex,state:neighbor.state,observedAt:new Date(now).toISOString(),result}].slice(-8)};
  if(!known&&bound){device.anchor={...device.anchor,macAddress:mac};return true;}
  return false;
}

/** Returns a safe outcome before any provider metadata is written. */
export function assessAuthenticatedIdentity(device:Device,identity:{macAddress?:string;serial?:string}):'BOUND'|'CONFLICT'|'INVALID'|'INSUFFICIENT' {
  if(identity.macAddress&&!canonicalMac(identity.macAddress))return 'INVALID';
  const incoming=canonicalAnchor({macAddress:identity.macAddress||null,serialNumber:identity.serial,vendor:''});
  const serial=(value?:string)=>value?.trim().toLowerCase();
  if(conflicts(device,{...device,anchor:incoming})||(serial(device.anchor.serialNumber)&&serial(incoming.serialNumber)&&serial(device.anchor.serialNumber)!==serial(incoming.serialNumber)))return 'CONFLICT';
  return sameIdentity(device,{...device,anchor:incoming})?'BOUND':'INSUFFICIENT';
}
