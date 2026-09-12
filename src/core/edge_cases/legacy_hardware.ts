import { Device, WindowsAdapterSnapshot } from '../../types/index.ts';
import { normalizeIPv4, normalizeManualMac } from '../../shared/address_validation.ts';
import { applyNetworkRelationship } from '../../shared/network_relationship.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export interface LegacyOnboardingPayload { ipAddress:string; macAddress?:string; manufacturer?:string; model?:string; serialNumber?:string; technicianName?:string; location?:string; notes?:string }

export class LegacyHardwareOnboarding {
  /** Records technician-supplied evidence without claiming discovery, protocol support, or verification. */
  static onboardLegacyDevice(payload:LegacyOnboardingPayload, adapters: WindowsAdapterSnapshot[] = []):Device {
    const ipAddress=normalizeIPv4(String(payload.ipAddress||'')),rawMac=String(payload.macAddress||'').trim(),macAddress=rawMac?normalizeManualMac(rawMac):null;
    if(!ipAddress)throw new Error('Enter a valid IPv4 address, for example 192.168.1.100.');
    if(rawMac&&!macAddress)throw new Error('Enter a valid device MAC using colons, hyphens, or 12 hexadecimal characters.');
    const now=new Date().toISOString(),vendor=String(payload.manufacturer||'').trim()||(macAddress?appStateDb.resolveVendor(macAddress):'Unknown');
    const device:Device={id:macAddress?`mac:${macAddress}`:`manual:${crypto.randomUUID()}`,anchor:{macAddress:macAddress||null,vendor,model:String(payload.model||'').trim()||undefined,serialNumber:String(payload.serialNumber||'').trim()||undefined},network:{ipAddress,subnetMask:null,port:0,protocol:'MANUAL',ipAddressHistory:[ipAddress]},status:'UNKNOWN',statusMessage:'Manually entered; current reachability, identity, and services are not verified.',sessionVerification:'NOT_VERIFIED',discoveredPhase:1,firstSeenAt:now,lastSeenAt:now,technician:{name:String(payload.technicianName||'').trim()||undefined,location:String(payload.location||'').trim()||undefined,notes:String(payload.notes||'').trim()||undefined}};
    applyNetworkRelationship(device, adapters, projectDb.getDevices());
    const stored=projectDb.upsertDevice(device);appStateDb.logAudit({id:crypto.randomUUID(),timestamp:now,category:'EDGE_CASE',level:'INFO',message:`Manual device record created at technician-supplied address ${ipAddress}; not live-verified.`,deviceId:stored.id,details:{subnetClassification:stored.reachability?.subnetClassification,pairEligibility:stored.reachability?.pairEligibility}});return stored;
  }
}
