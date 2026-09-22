import { Device, IPCollisionRecord } from '../types/index.ts';
import { hasIdentity } from './identity_policy.ts';
import { isActiveCollision } from './collision_state.ts';
import { normalizeIPv4 } from './address_validation.ts';

export interface CameraAccessDecision {
  allowed: boolean;
  code: 'SAFE_TO_OPEN' | 'AMBIGUOUS_COLLISION' | 'STALE_ADDRESS' | 'INSUFFICIENT_IDENTITY_EVIDENCE';
  deviceId: string;
  ipAddress?: string;
  message: string;
}

/** Permission to attempt ordinary IP routing, never a claim of MAC-bound browser access. */
export function decideCameraAccess(deviceId:string,devices:Device[],collisions:IPCollisionRecord[]):CameraAccessDecision {
  const matches=devices.filter(device=>device.id===deviceId),device=matches.length===1?matches[0]:undefined;
  const result=(code:CameraAccessDecision['code'],message:string):CameraAccessDecision=>({allowed:code==='SAFE_TO_OPEN',code,deviceId,ipAddress:device?.network.ipAddress,message});
  if(!device)return result('STALE_ADDRESS','The selected device is no longer uniquely present. Scan or Reverify before opening it.');
  const ip=normalizeIPv4(device.network.ipAddress);
  if(!ip||ip.startsWith('0.')||ip.startsWith('127.')||Number(ip.split('.')[0])>=224)return result('STALE_ADDRESS','The selected device has no usable current address. Scan or Reverify before opening it.');
  if(collisions.some(c=>isActiveCollision(c)&&c.ipAddress===ip)||devices.some(other=>other.id!==device.id&&other.network.ipAddress===ip)||
    (device.status==='COLLISION'&&!collisions.some(c=>c.ipAddress===ip&&!isActiveCollision(c))))
    return result('AMBIGUOUS_COLLISION','This IP address is currently shared by multiple discovered devices. CCTV Network Assistant cannot safely determine which camera a browser would open. Inspect the collision evidence and resolve the shared address before opening.');
  if(device.identityConflicts?.length)return result('INSUFFICIENT_IDENTITY_EVIDENCE','Conflicting physical identity evidence remains unresolved. Scan or Reverify and inspect the device identity before opening.');
  if(!hasIdentity(device))return result('INSUFFICIENT_IDENTITY_EVIDENCE','The address alone does not establish the selected physical device. Discover or verify its identity before opening.');
  if(device.sessionVerification==='NOT_FOUND'||device.sessionVerification==='NOT_VERIFIED')return result('STALE_ADDRESS','This saved address has not been verified for the selected device in the current session. Scan or Reverify before opening.');
  return result('SAFE_TO_OPEN','Access may be attempted at the selected device’s unique current address. This does not verify browser response ownership, login, or page rendering.');
}
