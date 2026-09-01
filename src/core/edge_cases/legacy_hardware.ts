import { Device } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export interface LegacyOnboardingPayload { ipAddress:string; macAddress?:string; manufacturer?:string; model?:string; serialNumber?:string; technicianName?:string; location?:string; notes?:string }
const ipv4=(value:string)=>{const parts=value.split('.').map(Number);return parts.length===4&&parts.every(part=>Number.isInteger(part)&&part>=0&&part<=255)};
const mac=(value:string)=>/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value);

export class LegacyHardwareOnboarding {
  /** Records technician-supplied evidence without claiming discovery, protocol support, or verification. */
  static onboardLegacyDevice(payload:LegacyOnboardingPayload):Device {
    const ipAddress=String(payload.ipAddress||'').trim(),macAddress=String(payload.macAddress||'').trim().toLowerCase();
    if(!ipv4(ipAddress))throw new Error('Enter a valid IPv4 address.');
    if(macAddress&&!mac(macAddress))throw new Error('MAC address must contain six hexadecimal pairs separated by colons.');
    const now=new Date().toISOString(),vendor=String(payload.manufacturer||'').trim()||(macAddress?appStateDb.resolveVendor(macAddress):'Unknown');
    const device:Device={id:macAddress?`mac:${macAddress}`:`manual:${crypto.randomUUID()}`,anchor:{macAddress:macAddress||null,vendor,model:String(payload.model||'').trim()||undefined,serialNumber:String(payload.serialNumber||'').trim()||undefined},network:{ipAddress,subnetMask:null,port:0,protocol:'MANUAL',ipAddressHistory:[ipAddress]},status:'UNKNOWN',statusMessage:'Manually entered; current reachability, identity, and services are not verified.',sessionVerification:'NOT_VERIFIED',discoveredPhase:1,firstSeenAt:now,lastSeenAt:now,technician:{name:String(payload.technicianName||'').trim()||undefined,location:String(payload.location||'').trim()||undefined,notes:String(payload.notes||'').trim()||undefined}};
    const stored=projectDb.upsertDevice(device);appStateDb.logAudit({id:crypto.randomUUID(),timestamp:now,category:'EDGE_CASE',level:'INFO',message:`Manual device record created at technician-supplied address ${ipAddress}; not live-verified.`,deviceId:stored.id});return stored;
  }
}
