import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { CctvProjectBundle, Device, IPCollisionRecord, ProjectSession, RogueDHCPOffer, SiteProject } from '../../types/index.ts';
import { appStateDb } from './app_db.ts';

const PROJECT_FORMAT = 'CCTV_DISCOVERY_PROJECT' as const;
const PROJECT_SCHEMA_VERSION = 1 as const;
const APPLICATION_VERSION = '1.6.0';
const SECRET_KEY = /(password|passwd|credential|authorization|token|secret|api[_-]?key|session[_-]?key)/i;

export class ProjectValidationError extends Error {}

const clone = <T>(value: T): T => structuredClone(value);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!isObject(value)) return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!SECRET_KEY.test(key)) safe[key] = sanitize(child);
  }
  return safe;
}

function validateDevice(value: unknown, index: number): asserts value is Device {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) throw new ProjectValidationError(`Device ${index} is missing a stable id.`);
  if (!isObject(value.anchor) || !('macAddress' in value.anchor) || typeof value.anchor.vendor !== 'string') throw new ProjectValidationError(`Device ${index} has an invalid physical identity.`);
  if (!isObject(value.network) || typeof value.network.ipAddress !== 'string') throw new ProjectValidationError(`Device ${index} has invalid network information.`);
}

function validateProject(value: unknown): asserts value is SiteProject {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string') throw new ProjectValidationError('Project metadata is missing an id or name.');
  if (!Array.isArray(value.devices)) throw new ProjectValidationError('Project devices must be an array.');
  value.devices.forEach(validateDevice);
  for (const key of ['collisions', 'rogueDhcpEvents', 'auditLogs'] as const) {
    if (!Array.isArray(value[key])) throw new ProjectValidationError(`Project ${key} must be an array.`);
  }
}

function makeProject(name: string, location = '', description = ''): SiteProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name, description: description || undefined, siteLocation: location,
    technicianName: appStateDb.getTechnicianName(), createdAt: now, updatedAt: now,
    totalDevices: 0, devices: [], collisions: [], rogueDhcpEvents: [], auditLogs: [],
  };
}

function prepareDeviceForSave(device: Device): Device {
  const saved = sanitize(clone(device)) as Device;
  saved.savedStatusSnapshot = device.status;
  delete saved.sessionVerification;
  if (saved.customStaticProfile) delete saved.customStaticProfile.appliedCredentialsId;
  return saved;
}

function prepareLoadedDevice(device: Device): Device {
  const loaded = clone(device);
  loaded.savedStatusSnapshot = device.savedStatusSnapshot || device.status;
  loaded.status = 'UNKNOWN';
  loaded.sessionVerification = 'NOT_VERIFIED';
  delete loaded.reachability;
  delete loaded.telemetry;
  delete loaded.diagnostics;
  return loaded;
}

export class SiteProjectDatabase {
  private session: ProjectSession = { mode: 'QUICK_WORK', project: makeProject('Quick Work'), dirty: false };

  public getSession(): ProjectSession { return clone(this.session); }
  public getProject(): SiteProject { return this.session.project; }

  public startQuickWork(): SiteProject {
    this.session = { mode: 'QUICK_WORK', project: makeProject('Quick Work'), dirty: false };
    return this.session.project;
  }

  public createNewProject(name: string, location = '', description = ''): SiteProject {
    if (!name.trim()) throw new ProjectValidationError('Project name is required.');
    this.session = { mode: 'PROJECT', project: makeProject(name.trim(), location.trim(), description.trim()), dirty: true };
    return this.session.project;
  }

  public createProjectFromCurrentResults(name: string, description = ''): SiteProject {
    if (!name.trim()) throw new ProjectValidationError('Project name is required.');
    const current = this.session.project;
    const project = makeProject(name.trim(), current.siteLocation, description.trim());
    project.devices = clone(current.devices);
    project.totalDevices = project.devices.length;
    project.collisions = clone(current.collisions);
    project.rogueDhcpEvents = clone(current.rogueDhcpEvents);
    project.auditLogs = clone(current.auditLogs);
    this.session = { mode: 'PROJECT', project, dirty: true };
    return project;
  }

  public upsertDevice(device: Device): Device {
    const devices = this.session.project.devices;
    const mac = device.anchor.macAddress?.toLowerCase();
    const uuid = device.anchor.onvifEndpointUuid?.toLowerCase();
    const serial = device.anchor.serialNumber?.toLowerCase();
    const exactIdIndex = devices.findIndex(d => d.id === device.id);
    const identityMatchIndex = exactIdIndex >= 0 ? exactIdIndex : devices.findIndex(d => Boolean(
      (mac && d.anchor.macAddress?.toLowerCase() === mac) ||
      (uuid && d.anchor.onvifEndpointUuid?.toLowerCase() === uuid) ||
      (serial && d.anchor.serialNumber?.toLowerCase() === serial)
    ));
    let existingIndex = identityMatchIndex;
    if (identityMatchIndex >= 0) {
      const existing = devices[identityMatchIndex];
      const macConflict = Boolean(mac && existing.anchor.macAddress && existing.anchor.macAddress.toLowerCase() !== mac);
      const uuidConflict = Boolean(uuid && existing.anchor.onvifEndpointUuid && existing.anchor.onvifEndpointUuid.toLowerCase() !== uuid);
      if (macConflict || uuidConflict) {
        const conflict = { detectedAt: new Date().toISOString(), reason: macConflict ? 'Conflicting MAC addresses for matching identity evidence' : 'Conflicting ONVIF UUIDs for matching identity evidence', existingMac: existing.anchor.macAddress, incomingMac: device.anchor.macAddress, existingUuid: existing.anchor.onvifEndpointUuid, incomingUuid: device.anchor.onvifEndpointUuid };
        existing.identityConflicts = [...(existing.identityConflicts || []), conflict];
        device.identityConflicts = [...(device.identityConflicts || []), conflict];
        if (devices.some(candidate => candidate.id === device.id)) device = { ...device, id: `${device.id}:conflict:${crypto.randomUUID()}` };
        existingIndex = -1;
      }
    }

    let storedDevice: Device;
    if (existingIndex >= 0) {
      const existing = devices[existingIndex];
      const history = Array.from(new Set([...(existing.network.ipAddressHistory || [existing.network.ipAddress]), existing.network.ipAddress, device.network.ipAddress]));
      devices[existingIndex] = {
        ...existing, ...device, id: existing.id,
        anchor: { ...existing.anchor, ...device.anchor, macAddress: device.anchor.macAddress || existing.anchor.macAddress, onvifEndpointUuid: device.anchor.onvifEndpointUuid || existing.anchor.onvifEndpointUuid, serialNumber: device.anchor.serialNumber || existing.anchor.serialNumber },
        network: { ...existing.network, ...device.network, ipAddressHistory: history },
        technician: { ...existing.technician, ...device.technician },
        reachability: { ...existing.reachability, ...device.reachability },
        sessionVerification: device.reachability ? 'VERIFIED' : existing.sessionVerification,
        lastSeenAt: new Date().toISOString(),
      };
      storedDevice = devices[existingIndex];
    } else {
      device.network.ipAddressHistory = device.network.ipAddressHistory || [device.network.ipAddress];
      devices.push(device);
      storedDevice = device;
    }

    for (let i = devices.length - 1; i >= 0; i--) {
      const candidate = devices[i];
      if (candidate === storedDevice) continue;
      const sameMac = Boolean(storedDevice.anchor.macAddress && candidate.anchor.macAddress && storedDevice.anchor.macAddress.toLowerCase() === candidate.anchor.macAddress.toLowerCase());
      const sameUuid = Boolean(storedDevice.anchor.onvifEndpointUuid && candidate.anchor.onvifEndpointUuid && storedDevice.anchor.onvifEndpointUuid.toLowerCase() === candidate.anchor.onvifEndpointUuid.toLowerCase());
      const sameSerial = Boolean(storedDevice.anchor.serialNumber && candidate.anchor.serialNumber && storedDevice.anchor.serialNumber.toLowerCase() === candidate.anchor.serialNumber.toLowerCase());
      const macConflict = Boolean(storedDevice.anchor.macAddress && candidate.anchor.macAddress && !sameMac);
      const uuidConflict = Boolean(storedDevice.anchor.onvifEndpointUuid && candidate.anchor.onvifEndpointUuid && !sameUuid);
      if (!(sameMac || sameUuid || sameSerial) || macConflict || uuidConflict) continue;
      storedDevice.anchor = { ...candidate.anchor, ...storedDevice.anchor, macAddress: storedDevice.anchor.macAddress || candidate.anchor.macAddress, onvifEndpointUuid: storedDevice.anchor.onvifEndpointUuid || candidate.anchor.onvifEndpointUuid, serialNumber: storedDevice.anchor.serialNumber || candidate.anchor.serialNumber };
      storedDevice.network.ipAddressHistory = Array.from(new Set([...(candidate.network.ipAddressHistory || [candidate.network.ipAddress]), ...(storedDevice.network.ipAddressHistory || [storedDevice.network.ipAddress])]));
      storedDevice.technician = { ...candidate.technician, ...storedDevice.technician };
      storedDevice.reachability = { ...candidate.reachability, ...storedDevice.reachability };
      devices.splice(i, 1);
    }
    this.markDirty();
    return storedDevice;
  }

  public updateDeviceTechnicianFields(id: string, fields: { name?: string; location?: string; notes?: string }): Device {
    const device = this.getDeviceById(id);
    if (!device) throw new ProjectValidationError('Device not found.');
    device.technician = { ...device.technician, ...fields };
    this.markDirty();
    return device;
  }

  public getDevices(): Device[] { return this.session.project.devices; }
  public getDeviceByMac(mac: string): Device | undefined { return this.getDevices().find(d => d.anchor.macAddress?.toLowerCase() === mac.toLowerCase()); }
  public getDeviceById(id: string): Device | undefined { return this.getDevices().find(device => device.id === id); }
  public getDeviceByIdentifier(identifier: string): Device | undefined { return this.getDeviceById(identifier) || this.getDeviceByMac(identifier); }
  public recordCollision(collision: IPCollisionRecord): void { const existing = this.session.project.collisions.find(c => (collision.id&&c.id===collision.id)||c.ipAddress === collision.ipAddress); if (existing) { const id=existing.id||collision.id,detectedAt=existing.detectedAt;Object.assign(existing,collision,{id,detectedAt}); } else this.session.project.collisions.push(collision); this.markDirty(); }
  public getCollisions(): IPCollisionRecord[] { return this.session.project.collisions; }
  public recordRogueDhcp(event: RogueDHCPOffer): void { this.session.project.rogueDhcpEvents.push(event); this.markDirty(); }
  public getRogueDhcpEvents(): RogueDHCPOffer[] { return this.session.project.rogueDhcpEvents; }

  public exportProjectJson(): string {
    if (this.session.mode !== 'PROJECT') throw new ProjectValidationError('Create a project before saving Quick Work results.');
    return JSON.stringify(this.toBundle(), null, 2);
  }

  public exportProjectJsonForSave(): string {
    if (this.session.mode !== 'PROJECT') throw new ProjectValidationError('Create a project before saving Quick Work results.');
    const now = new Date().toISOString();
    this.session.project.lastSavedAt = now;
    this.session.project.updatedAt = now;
    this.session.dirty = false;
    return JSON.stringify(this.toBundle(), null, 2);
  }

  public importProjectJson(jsonData: string): SiteProject {
    let parsed: unknown;
    try { parsed = JSON.parse(jsonData); } catch { throw new ProjectValidationError('The project file is not valid JSON.'); }
    const project = this.parseBundle(parsed);
    this.session = { mode: 'PROJECT', project, dirty: false };
    return project;
  }

  public async openProject(filePath: string): Promise<SiteProject> { const project = this.importProjectJson(await fs.readFile(filePath, 'utf8')); this.session.filePath = filePath; return project; }

  public async saveProject(filePath = this.session.filePath): Promise<string> {
    if (!filePath) throw new ProjectValidationError('Choose a .cctvproj file location first.');
    if (!filePath.toLowerCase().endsWith('.cctvproj')) throw new ProjectValidationError('Project filename must use the .cctvproj extension.');
    if (this.session.mode !== 'PROJECT') throw new ProjectValidationError('Quick Work is not persisted automatically. Create a project first.');
    if (filePath !== this.session.filePath) {
      try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
        const existingId = parsed.format === PROJECT_FORMAT && isObject(parsed.project) ? parsed.project.id : parsed.id;
        if (existingId !== this.session.project.id) throw new ProjectValidationError('Refusing to overwrite an unrelated file. Choose another filename.');
      } catch (error) {
        if (error instanceof ProjectValidationError) throw error;
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const previousSavedAt = this.session.project.lastSavedAt;
    const now = new Date().toISOString();
    this.session.project.lastSavedAt = now;
    this.session.project.updatedAt = now;
    const json = this.exportProjectJson();
    const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(tempPath, json, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(tempPath, filePath);
    } catch (error) {
      this.session.project.lastSavedAt = previousSavedAt;
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
    this.session.filePath = filePath;
    this.session.dirty = false;
    return filePath;
  }

  public async saveAs(filePath: string): Promise<string> { return this.saveProject(filePath); }

  private toBundle(): CctvProjectBundle {
    const project = sanitize(clone(this.session.project)) as SiteProject;
    project.devices = this.session.project.devices.map(prepareDeviceForSave);
    project.totalDevices = project.devices.length;
    validateProject(project);
    return { format: PROJECT_FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, applicationVersion: APPLICATION_VERSION, project };
  }

  private parseBundle(value: unknown): SiteProject {
    let project: unknown;
    if (isObject(value) && value.format === PROJECT_FORMAT) {
      if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new ProjectValidationError(`Unsupported project schema version: ${String(value.schemaVersion)}.`);
      project = value.project;
    } else if (isObject(value) && typeof value.id === 'string' && Array.isArray(value.devices)) {
      project = value;
    } else throw new ProjectValidationError('Unsupported project file format.');
    validateProject(project);
    const loaded = sanitize(clone(project)) as SiteProject;
    loaded.totalDevices = loaded.devices.length;
    loaded.devices = loaded.devices.map(prepareLoadedDevice);
    return loaded;
  }

  private markDirty(): void { this.session.project.totalDevices = this.session.project.devices.length; this.session.project.updatedAt = new Date().toISOString(); this.session.dirty = true; }
}

export const projectDb = new SiteProjectDatabase();
