import { Device, IPCollisionRecord } from '../types/index.ts';
import { canonicalAnchor } from './identity_policy.ts';
import { isActiveCollision } from './collision_state.ts';
import { decideCameraAccess } from './camera_access.ts';

export function collisionKeyForDevice(device:Device,collisions:IPCollisionRecord[]):string|undefined {
  const member=(c:IPCollisionRecord)=>(c.deviceIds||c.collidingDevices.map(d=>d.id)).includes(device.id);
  const collision=collisions.find(c=>isActiveCollision(c)&&c.ipAddress===device.network.ipAddress)||
    collisions.find(c=>c.ipAddress===device.network.ipAddress&&member(c))||
    [...collisions].reverse().find(member);
  return collision?.id||collision?.ipAddress;
}

/** Read-only projection of Phase 4 records; never creates or resolves a collision. */
export function duplicateAssistantView(collisions:IPCollisionRecord[],devices:Device[],key:string) {
  const collision=collisions.find(c=>c.id===key||c.ipAddress===key);
  if(!collision)return undefined;
  const ids=[...new Set([...(collision.deviceIds||[]),...collision.collidingDevices.map(d=>d.id)])];
  const participants=ids.flatMap(id=>{
    const current=devices.find(d=>d.id===id),device=current||collision.collidingDevices.find(d=>d.id===id);
    if(!device)return [];
    const anchor=canonicalAnchor(device.anchor),adapter=device.reachability?.relationshipAdapter||device.reachability?.discoveryInterface;
    // Explicit fields only: no provider parameters, credential references, or raw payloads.
    return [{id,current:Boolean(current),name:device.technician?.name||anchor.model||anchor.vendor||'Unknown',
      manufacturer:anchor.vendor||undefined,model:anchor.model,ip:device.network.ipAddress,
      mac:anchor.macAddress,macLastSix:anchor.macAddress?.replaceAll(':','').slice(-6).toUpperCase(),
      serial:anchor.serialNumber,uuid:anchor.onvifEndpointUuid,
      adapter:adapter?`${adapter.name} • ${adapter.ipAddress}${adapter.interfaceIndex!==undefined?` (index ${adapter.interfaceIndex})`:''}`:undefined,
      status:current?.status||'Not in current inventory',lastSeen:device.lastSeenAt,
      discoveryAt:device.reachability?.wsDiscoveryRespondedAt,
      diagnostics:(device.diagnostics?.checks||[]).filter(c=>c.targetIp===device.network.ipAddress).slice(-5).map(c=>({type:c.type,success:c.success,at:c.timestamp,ambiguous:Boolean(c.ambiguousIdentity)})),
      neighbors:(device.reachability?.neighborObservations||[]).filter(n=>n.ipAddress===device.network.ipAddress).slice(-3).map(n=>({mac:n.macAddress,result:n.result,at:n.observedAt})),
      access:decideCameraAccess(id,devices,collisions)}];
  });
  return {id:collision.id||collision.ipAddress,ip:collision.ipAddress,active:isActiveCollision(collision),
    detectedAt:collision.detectedAt,updatedAt:collision.updatedAt,participants,
    currentAtSharedIp:participants.filter(p=>p.current&&p.ip===collision.ipAddress).length};
}
export type DuplicateAssistantView=NonNullable<ReturnType<typeof duplicateAssistantView>>;
