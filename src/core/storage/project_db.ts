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

  public upsertDevice(device: Device): void {
    const existingIndex = this.currentProject.devices.findIndex(
      d => d.anchor.macAddress.toLowerCase() === device.anchor.macAddress.toLowerCase()
    );

    if (existingIndex >= 0) {
      this.currentProject.devices[existingIndex] = {
        ...this.currentProject.devices[existingIndex],
        ...device,
        lastSeenAt: new Date().toISOString(),
      };
    } else {
      this.currentProject.devices.push(device);
    }

    this.currentProject.totalDevices = this.currentProject.devices.length;
    this.currentProject.updatedAt = new Date().toISOString();
  }

  public getDevices(): Device[] {
    return this.currentProject.devices;
  }

  public getDeviceByMac(mac: string): Device | undefined {
    return this.currentProject.devices.find(
      d => d.anchor.macAddress.toLowerCase() === mac.toLowerCase()
    );
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
