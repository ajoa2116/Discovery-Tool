import { Device, IPCollisionRecord, RogueDHCPOffer, SiteProject, AuditLogEntry } from '../../types/index.ts';
import { appStateDb } from './app_db.ts';

export class SiteProjectDatabase {
  private currentProject: SiteProject;

  constructor() {
    this.currentProject = this.createNewProject('Enterprise Campus Rollout - Sector 4', 'Building B & Perimeter');
  }

  public createNewProject(name: string, location: string): SiteProject {
    const proj: SiteProject = {
      id: crypto.randomUUID(),
      name,
      siteLocation: location,
      technicianName: appStateDb.getTechnicianName(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalDevices: 0,
      devices: [],
      collisions: [],
      rogueDhcpEvents: [],
      auditLogs: [],
    };
    this.currentProject = proj;
    return proj;
  }

  public getProject(): SiteProject {
    return this.currentProject;
  }

  public upsertDevice(device: Device): Device {
    const mac = device.anchor.macAddress?.toLowerCase();
    const uuid = device.anchor.onvifEndpointUuid?.toLowerCase();
    const serial = device.anchor.serialNumber?.toLowerCase();
    const exactIdIndex = this.currentProject.devices.findIndex(d => d.id === device.id);
    const identityMatchIndex = exactIdIndex >= 0 ? exactIdIndex : this.currentProject.devices.findIndex(d =>
      (mac && d.anchor.macAddress?.toLowerCase() === mac) ||
      (uuid && d.anchor.onvifEndpointUuid?.toLowerCase() === uuid) ||
      (serial && d.anchor.serialNumber?.toLowerCase() === serial) ||
      false
    );

    let existingIndex = identityMatchIndex;
    if (identityMatchIndex >= 0) {
      const existing = this.currentProject.devices[identityMatchIndex];
      const macConflict = Boolean(mac && existing.anchor.macAddress && existing.anchor.macAddress.toLowerCase() !== mac);
      const uuidConflict = Boolean(uuid && existing.anchor.onvifEndpointUuid && existing.anchor.onvifEndpointUuid.toLowerCase() !== uuid);
      if (macConflict || uuidConflict) {
        const conflict = {
          detectedAt: new Date().toISOString(),
          reason: macConflict ? 'Conflicting MAC addresses for matching identity evidence' : 'Conflicting ONVIF UUIDs for matching identity evidence',
          existingMac: existing.anchor.macAddress,
          incomingMac: device.anchor.macAddress,
          existingUuid: existing.anchor.onvifEndpointUuid,
          incomingUuid: device.anchor.onvifEndpointUuid,
        };
        existing.identityConflicts = [...(existing.identityConflicts || []), conflict];
        device.identityConflicts = [...(device.identityConflicts || []), conflict];
        if (this.currentProject.devices.some(candidate => candidate.id === device.id)) {
          device = { ...device, id: `${device.id}:conflict:${crypto.randomUUID()}` };
        }
        existingIndex = -1;
      }
    }

    let storedDevice: Device;
    if (existingIndex >= 0) {
      const existing = this.currentProject.devices[existingIndex];
      const history = Array.from(new Set([
        ...(existing.network.ipAddressHistory || [existing.network.ipAddress]),
        existing.network.ipAddress,
        device.network.ipAddress,
      ]));
      this.currentProject.devices[existingIndex] = {
        ...existing,
        ...device,
        id: existing.id,
        anchor: {
          ...existing.anchor,
          ...device.anchor,
          macAddress: device.anchor.macAddress || existing.anchor.macAddress,
          onvifEndpointUuid: device.anchor.onvifEndpointUuid || existing.anchor.onvifEndpointUuid,
          serialNumber: device.anchor.serialNumber || existing.anchor.serialNumber,
        },
        network: {
          ...existing.network,
          ...device.network,
          ipAddressHistory: history,
        },
        reachability: { ...existing.reachability, ...device.reachability },
        lastSeenAt: new Date().toISOString(),
      };
      storedDevice = this.currentProject.devices[existingIndex];
    } else {
      device.network.ipAddressHistory = device.network.ipAddressHistory || [device.network.ipAddress];
      this.currentProject.devices.push(device);
      storedDevice = device;
    }

    // Late MAC enrichment can connect a UUID-only record to an earlier MAC-only
    // record. Merge compatible evidence into the stable application row.
    for (let i = this.currentProject.devices.length - 1; i >= 0; i--) {
      const candidate = this.currentProject.devices[i];
      if (candidate === storedDevice) continue;
      const sameMac = Boolean(storedDevice.anchor.macAddress && candidate.anchor.macAddress &&
        storedDevice.anchor.macAddress.toLowerCase() === candidate.anchor.macAddress.toLowerCase());
      const sameUuid = Boolean(storedDevice.anchor.onvifEndpointUuid && candidate.anchor.onvifEndpointUuid &&
        storedDevice.anchor.onvifEndpointUuid.toLowerCase() === candidate.anchor.onvifEndpointUuid.toLowerCase());
      const sameSerial = Boolean(storedDevice.anchor.serialNumber && candidate.anchor.serialNumber &&
        storedDevice.anchor.serialNumber.toLowerCase() === candidate.anchor.serialNumber.toLowerCase());
      const macConflict = Boolean(storedDevice.anchor.macAddress && candidate.anchor.macAddress && !sameMac);
      const uuidConflict = Boolean(storedDevice.anchor.onvifEndpointUuid && candidate.anchor.onvifEndpointUuid && !sameUuid);
      if (!(sameMac || sameUuid || sameSerial) || macConflict || uuidConflict) continue;

      storedDevice.anchor = {
        ...candidate.anchor,
        ...storedDevice.anchor,
        macAddress: storedDevice.anchor.macAddress || candidate.anchor.macAddress,
        onvifEndpointUuid: storedDevice.anchor.onvifEndpointUuid || candidate.anchor.onvifEndpointUuid,
        serialNumber: storedDevice.anchor.serialNumber || candidate.anchor.serialNumber,
      };
      storedDevice.network.ipAddressHistory = Array.from(new Set([
        ...(candidate.network.ipAddressHistory || [candidate.network.ipAddress]),
        ...(storedDevice.network.ipAddressHistory || [storedDevice.network.ipAddress]),
      ]));
      storedDevice.reachability = { ...candidate.reachability, ...storedDevice.reachability };
      this.currentProject.devices.splice(i, 1);
    }

    this.currentProject.totalDevices = this.currentProject.devices.length;
    this.currentProject.updatedAt = new Date().toISOString();
    return storedDevice;
  }

  public getDevices(): Device[] {
    return this.currentProject.devices;
  }

  public getDeviceByMac(mac: string): Device | undefined {
    return this.currentProject.devices.find(
      d => d.anchor.macAddress?.toLowerCase() === mac.toLowerCase()
    );
  }

  public getDeviceById(id: string): Device | undefined {
    return this.currentProject.devices.find(device => device.id === id);
  }

  public getDeviceByIdentifier(identifier: string): Device | undefined {
    return this.getDeviceById(identifier) || this.getDeviceByMac(identifier);
  }

  public recordCollision(collision: IPCollisionRecord): void {
    const existing = this.currentProject.collisions.find(c => c.ipAddress === collision.ipAddress);
    if (existing) {
      existing.collidingDevices = collision.collidingDevices;
      existing.resolved = collision.resolved;
    } else {
      this.currentProject.collisions.push(collision);
    }
  }

  public getCollisions(): IPCollisionRecord[] {
    return this.currentProject.collisions;
  }

  public recordRogueDhcp(event: RogueDHCPOffer): void {
    this.currentProject.rogueDhcpEvents.push(event);
  }

  public getRogueDhcpEvents(): RogueDHCPOffer[] {
    return this.currentProject.rogueDhcpEvents;
  }

  public exportProjectJson(): string {
    return JSON.stringify(this.currentProject, null, 2);
  }

  public importProjectJson(jsonData: string): SiteProject {
    const parsed = JSON.parse(jsonData) as SiteProject;
    this.currentProject = parsed;
    return this.currentProject;
  }
}

export const projectDb = new SiteProjectDatabase();
