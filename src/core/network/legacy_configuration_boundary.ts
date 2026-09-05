import { Device } from '../../types/index.ts';
import { ProjectValidationError, SiteProjectDatabase } from '../storage/project_db.ts';

export type LegacyConfigurationAvailability = 'NOT_VERIFIED'|'UNREACHABLE'|'NEEDS_ATTENTION';
export interface LegacyConfigurationReadResult {
  status: LegacyConfigurationAvailability;
  deviceId: string;
  message: string;
  authoritativeReadEndpoint: string;
}

const physicalKeys = ['onvifConfig','manufacturerParams','network','cameraConfiguration','ntp','timeZone','timezone','gateway','dns','dhcp','password','credential'];

export class LegacyConfigurationBoundary {
  constructor(private db: SiteProjectDatabase) {}
  private device(identifier: string): Device {
    const device = this.db.getDeviceByIdentifier(identifier);
    if (!device) throw new ProjectValidationError('Device not found.');
    return device;
  }
  public read(identifier: string): LegacyConfigurationReadResult {
    const device = this.device(identifier);
    const ambiguous = device.status === 'COLLISION' || this.db.getDevices().some(other => other.id !== device.id && other.network.ipAddress === device.network.ipAddress);
    if (ambiguous) return { status:'NEEDS_ATTENTION', deviceId:device.id, message:'Device identity is ambiguous because this IP is duplicated. Use Duplicate Assistant before reading camera settings.', authoritativeReadEndpoint:`/api/device/${encodeURIComponent(device.id)}/configuration/capabilities` };
    if (['OFFLINE','UNREACHABLE','UNRESPONSIVE'].includes(device.status)) return { status:'UNREACHABLE', deviceId:device.id, message:'Camera configuration is unavailable because the device is not currently reachable. Diagnose and verify the device before reading settings.', authoritativeReadEndpoint:`/api/device/${encodeURIComponent(device.id)}/configuration/capabilities` };
    return { status:'NOT_VERIFIED', deviceId:device.id, message:'Configuration has not been read from this camera. Select a saved credential and use the authenticated Device Configuration read.', authoritativeReadEndpoint:`/api/device/${encodeURIComponent(device.id)}/configuration/capabilities` };
  }
  public updateLocalMetadata(identifier: string, payload: Record<string, unknown>): Device {
    if (physicalKeys.some(key => key in payload)) throw new ProjectValidationError('This legacy endpoint cannot change physical camera configuration. Use the authenticated Device Configuration workflow.');
    const raw = payload.technician;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProjectValidationError('Only local technician Name, Location, and Notes may be updated here.');
    const input = raw as Record<string, unknown>;
    if (Object.keys(input).some(key => !['name','location','notes'].includes(key))) throw new ProjectValidationError('Only local technician Name, Location, and Notes may be updated here.');
    const fields: {name?:string;location?:string;notes?:string} = {};
    for (const key of ['name','location','notes'] as const) if (key in input) {
      if (typeof input[key] !== 'string') throw new ProjectValidationError(`${key} must be text.`);
      fields[key] = input[key] as string;
    }
    return this.db.updateDeviceTechnicianFields(this.device(identifier).id, fields);
  }
}
