import { reconcileCollisionState } from '../engine/collision_reconciliation.ts';
import { canonicalAnchor, canonicalMac, mergeAnchors, selectIdentity, sameIdentity } from '../../shared/identity_policy.ts';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { CctvProjectBundle, Device, IPCollisionRecord, ProjectSession, RogueDHCPOffer, SiteProject } from '../../types/index.ts';
import { appStateDb } from './app_db.ts';
import { AppendProjectHistory, ProjectHistoryFilter, ProjectHistoryService } from './project_history.ts';

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
  for (const key of ['collisions', 'rogueDhcpEvents'] as const) {
    if (!Array.isArray(value[key])) throw new ProjectValidationError(`Project ${key} must be an array.`);
  }
  if (value.auditLogs !== undefined && !Array.isArray(value.auditLogs)) throw new ProjectValidationError('Project auditLogs must be an array when present.');
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
  saved.anchor = canonicalAnchor(saved.anchor);
  const status = device.sessionVerification === 'NOT_FOUND' && device.savedStatusSnapshot ? device.savedStatusSnapshot : device.status;
  saved.status = status;
  saved.savedStatusSnapshot = status;
  delete saved.sessionVerification;
  if (saved.customStaticProfile) delete saved.customStaticProfile.appliedCredentialsId;
  return saved;
}

function prepareLoadedDevice(device: Device): Device {
  const loaded = clone(device);
  loaded.anchor = canonicalAnchor(loaded.anchor);
  loaded.savedStatusSnapshot = device.savedStatusSnapshot || device.status;
  loaded.status = 'UNKNOWN';
  loaded.sessionVerification = 'NOT_VERIFIED';
  delete loaded.reachability;
  delete loaded.telemetry;
  delete loaded.diagnostics;
  return loaded;
}

export class SiteProjectDatabase {
  constructor(private readonly isolation: 'TECHNICIAN' | 'ISOLATED_TEST' = 'TECHNICIAN') {}
  public acceptsEvidence(device: Device): boolean {
    return device.evidenceProvenance === undefined || device.evidenceProvenance === 'PHYSICAL_NETWORK' || this.isolation === 'ISOLATED_TEST';
  }
  private session: ProjectSession = { mode: 'QUICK_WORK', project: makeProject('Quick Work'), dirty: false };
  private hiddenCurrentDeviceIds = new Set<string>();
  private currentOnlyDeviceIds = new Set<string>();
  private removedProjectIdentities: Array<{ id: string; mac?: string; uuid?: string; serial?: string }> = [];

  public getSession(): ProjectSession { return { ...clone(this.session), project: this.getProject() }; }
  public getProject(): SiteProject {
    const project = clone(this.session.project);
    project.devices = project.devices.filter(device => !this.hiddenCurrentDeviceIds.has(device.id));
    project.totalDevices = project.devices.length;
    return project;
  }

  private resetTransientDeviceState(): void {
    this.hiddenCurrentDeviceIds.clear(); this.currentOnlyDeviceIds.clear(); this.removedProjectIdentities = [];
  }

  public startQuickWork(): SiteProject {
    this.resetTransientDeviceState();
    this.session = { mode: 'QUICK_WORK', project: makeProject('Quick Work'), dirty: false };
    return this.session.project;
  }

  public createNewProject(name: string, location = '', description = ''): SiteProject {
    if (!name.trim()) throw new ProjectValidationError('Project name is required.');
    this.resetTransientDeviceState(); this.session = { mode: 'PROJECT', project: makeProject(name.trim(), location.trim(), description.trim()), dirty: true };
    this.appendHistory({ type:'PROJECT_CREATED', title:'Project Created', summary:`Project “${this.session.project.name}” was created.`, details:{ creationMethod:'NEW_PROJECT' } });
    return this.session.project;
  }

  public createProjectFromCurrentResults(name: string, description = ''): SiteProject {
    if (!name.trim()) throw new ProjectValidationError('Project name is required.');
    const current = this.getProject();
    const project = makeProject(name.trim(), current.siteLocation, description.trim());
    project.devices = clone(current.devices);
    project.totalDevices = project.devices.length;
    project.collisions = clone(current.collisions);
    project.rogueDhcpEvents = clone(current.rogueDhcpEvents);
    project.auditLogs = clone(current.auditLogs);
    this.resetTransientDeviceState(); this.session = { mode: 'PROJECT', project, dirty: true };
    this.appendHistory({ type:'PROJECT_CREATED', title:'Project Created from Current Results', summary:`Project “${project.name}” was created with ${project.devices.length} device(s).`, details:{ creationMethod:'CURRENT_RESULTS', deviceCount:project.devices.length } });
    for (const device of project.devices) this.appendHistory({ type:'DEVICE_ADDED', title:'Added to Project', summary:'Device was added when the Project was created from current results.', deviceId:device.id });
    return project;
  }

  public upsertDevice(device: Device, membershipHistory: 'DEVICE_ADDED'|'DEVICE_RE_ADDED' = 'DEVICE_ADDED', runtime = false): Device {
    if (!this.acceptsEvidence(device)) throw new ProjectValidationError('Nonphysical discovery evidence requires an isolated test inventory.');
    const devices = this.session.project.devices;
    device.anchor = canonicalAnchor(device.anchor);
    const selection = selectIdentity(devices,device);
    const existingIndex = selection.index;
    if (existingIndex < 0 && selection.related.length) {
      const conflict = { detectedAt:new Date().toISOString(), reason:selection.ambiguous ? 'Ambiguous physical identity matches' : 'Conflicting physical identity evidence', existingMac:selection.related[0].anchor.macAddress, incomingMac:device.anchor.macAddress, existingUuid:selection.related[0].anchor.onvifEndpointUuid, incomingUuid:device.anchor.onvifEndpointUuid };
      for (const related of selection.related) related.identityConflicts=[...(related.identityConflicts||[]),conflict];
      device={...device,identityConflicts:[...(device.identityConflicts||[]),conflict]};
      if(devices.some(d=>d.id===device.id)) device.id=`${device.id}:conflict:${crypto.randomUUID()}`;
    }

    let storedDevice: Device;
    const previousIp = existingIndex >= 0 ? devices[existingIndex].network.ipAddress : undefined;
    if (existingIndex >= 0) {
      const existing = devices[existingIndex];
      const history = Array.from(new Set([...(existing.network.ipAddressHistory || [existing.network.ipAddress]), existing.network.ipAddress, device.network.ipAddress]));
      devices[existingIndex] = {
        ...existing, ...device, id: existing.id,
        anchor: mergeAnchors(existing.anchor, device.anchor),
        network: { ...existing.network, ...device.network, ipAddressHistory: history },
        technician: { ...device.technician, ...existing.technician },
        reachability: { ...existing.reachability, ...device.reachability },
        sessionVerification: device.sessionVerification ?? (device.reachability?.lastSuccessfulResponseAt || device.reachability?.wsDiscoveryRespondedAt ? 'VERIFIED' : existing.sessionVerification),
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
      if (selection.ambiguous || existingIndex < 0 || !sameIdentity(storedDevice,candidate)) continue;
      storedDevice.anchor = mergeAnchors(candidate.anchor,storedDevice.anchor);
      storedDevice.network.ipAddressHistory = Array.from(new Set([...(candidate.network.ipAddressHistory || [candidate.network.ipAddress]), ...(storedDevice.network.ipAddressHistory || [storedDevice.network.ipAddress])]));
      storedDevice.technician = { ...candidate.technician, ...storedDevice.technician };
      storedDevice.reachability = { ...candidate.reachability, ...storedDevice.reachability };
      devices.splice(i, 1);
    }
    this.session.project.totalDevices=devices.length;
    if(!runtime)this.markDirty();
    if (!runtime && this.session.mode === 'PROJECT') {
      if (existingIndex < 0) this.appendHistory({ type:membershipHistory, title:membershipHistory==='DEVICE_RE_ADDED'?'Re-added to Project':'Added to Project', summary:membershipHistory==='DEVICE_RE_ADDED'?'A previously removed stable identity was explicitly re-added to the Project.':'A stable device identity was added to the Project.', deviceId:storedDevice.id, details:{operation:'ADD_TO_EXISTING_PROJECT',result:membershipHistory==='DEVICE_RE_ADDED'?'RE_ADDED':'ADDED'} });
      else if (previousIp !== storedDevice.network.ipAddress) this.appendHistory({ type:'IP_ADDRESS_CHANGED', title:'IP Address Changed', summary:`IP changed from ${previousIp} to ${storedDevice.network.ipAddress}.`, deviceId:storedDevice.id, details:{ previousIp, currentIp:storedDevice.network.ipAddress } });
    }
    return storedDevice;
  }

  public applyDiagnosticRefresh(observed:Device):Device|undefined {
    const current=this.getDeviceById(observed.id);
    if(!current||current.network.ipAddress!==observed.network.ipAddress)return;
    return this.upsertDevice({...current,diagnostics:observed.diagnostics,
      status:current.status==='COLLISION'?'COLLISION':observed.status,
      statusMessage:current.status==='COLLISION'?current.statusMessage:observed.statusMessage,
      sessionVerification:observed.sessionVerification},'DEVICE_ADDED',true);
  }

  public updateDeviceTechnicianFields(id: string, fields: { name?: string; location?: string; notes?: string }): Device {
    const device = this.getDeviceById(id);
    if (!device) throw new ProjectValidationError('Device not found.');
    const before = clone(device.technician || {}); device.technician = { ...device.technician, ...fields };
    this.markDirty();
    if (this.session.mode === 'PROJECT') {
      if (fields.name !== undefined && fields.name !== before.name) this.appendHistory({type:'TECHNICIAN_NAME_CHANGED',title:'Device Name Changed',summary:'Technician changed the device name.',deviceId:id,details:{before:before.name||'',after:fields.name}});
      if (fields.location !== undefined && fields.location !== before.location) this.appendHistory({type:'LOCATION_CHANGED',title:'Device Location Changed',summary:'Technician changed the device location.',deviceId:id,details:{before:before.location||'',after:fields.location}});
      if (fields.notes !== undefined && fields.notes !== before.notes) this.appendHistory({type:'NOTES_UPDATED',title:'Notes Updated',summary:'Technician updated device notes.',deviceId:id});
    }
    return device;
  }

  public getDevices(): Device[] { return this.session.project.devices; }
  public getProjectMemberDevices(): Device[] { return this.session.project.devices.filter(device => !this.currentOnlyDeviceIds.has(device.id)); }
  public isProjectMember(id: string): boolean { return this.getProjectMemberDevices().some(device => device.id === id); }
  public applyReverification(memberDevices: Device[], liveOnlyDevices: Device[], persistentChanged: boolean, dirtyBefore: boolean): void {
    const memberIds = new Set(memberDevices.map(device => device.id));
    this.session.project.devices = [...clone(memberDevices), ...clone(liveOnlyDevices).filter(device => !memberIds.has(device.id))];
    this.currentOnlyDeviceIds = new Set(liveOnlyDevices.filter(device => !memberIds.has(device.id)).map(device => device.id));
    for (const device of memberDevices) if (device.sessionVerification === 'VERIFIED') this.hiddenCurrentDeviceIds.delete(device.id);
    this.session.project.totalDevices = this.session.project.devices.length;
    reconcileCollisionState(this.session.project.devices,this.session.project.collisions);
    this.session.dirty = dirtyBefore || persistentChanged;
    if (persistentChanged) this.session.project.updatedAt = new Date().toISOString();
  }
  public confirmProjectReplacement(originalId: string, replacement: Device): Device {
    const index = this.session.project.devices.findIndex(device => device.id === originalId && !this.currentOnlyDeviceIds.has(device.id));
    if (index < 0) throw new ProjectValidationError('Original Project device is no longer available for replacement review.');
    const original = this.session.project.devices[index];
    const timestamp = new Date().toISOString();
    const history = Array.from(new Set([...(original.network.ipAddressHistory || [original.network.ipAddress]), original.network.ipAddress, replacement.network.ipAddress]));
    const updated: Device = { ...original, ...clone(replacement), id: original.id, technician: clone(original.technician), firstSeenAt: original.firstSeenAt, anchor: clone(replacement.anchor), network: { ...clone(replacement.network), ipAddressHistory: history }, sessionVerification: 'VERIFIED', lastSeenAt: replacement.lastSeenAt || timestamp };
    this.session.project.devices[index] = updated;
    const duplicateIndex = this.session.project.devices.findIndex((device, candidateIndex) => candidateIndex !== index && device.id === replacement.id && this.currentOnlyDeviceIds.has(device.id));
    if (duplicateIndex >= 0) this.session.project.devices.splice(duplicateIndex, 1);
    this.currentOnlyDeviceIds.delete(replacement.id); this.hiddenCurrentDeviceIds.delete(original.id);
    this.appendHistory({ type:'REPLACEMENT_CONFIRMED', title:'Replacement Confirmed', summary:'Technician confirmed Project device replacement.', deviceId:original.id, timestamp, level:'SUCCESS', category:'EDGE_CASE', result:'SUCCESS', details: { previousIdentity: { macAddress: original.anchor.macAddress, onvifEndpointUuid: original.anchor.onvifEndpointUuid, serialNumber: original.anchor.serialNumber, ipAddress: original.network.ipAddress }, replacementIdentity: { macAddress: replacement.anchor.macAddress, onvifEndpointUuid: replacement.anchor.onvifEndpointUuid, serialNumber: replacement.anchor.serialNumber, ipAddress: replacement.network.ipAddress } } });
    this.markDirty();
    return clone(updated);
  }
  public removeDeviceFromCurrentList(id: string): Device {
    const device = this.getDeviceById(id);
    if (!device) throw new ProjectValidationError('Device not found.');
    this.hiddenCurrentDeviceIds.add(id);
    return clone(device);
  }
  public removeDeviceFromProject(id: string): Device {
    if (this.session.mode !== 'PROJECT') throw new ProjectValidationError('Remove from Project is available only for a saved Project session.');
    const index = this.session.project.devices.findIndex(device => device.id === id);
    if (index < 0) throw new ProjectValidationError('Device not found.');
    const [device] = this.session.project.devices.splice(index, 1);
    this.appendHistory({ type:'DEVICE_REMOVED', title:'Removed from Project', summary:'Technician explicitly removed this device from Project membership.', deviceId:device.id, details:{ operation:'REMOVE_FROM_PROJECT', identity:{ macAddress:device.anchor.macAddress,onvifEndpointUuid:device.anchor.onvifEndpointUuid,serialNumber:device.anchor.serialNumber } } });
    this.hiddenCurrentDeviceIds.delete(id); this.currentOnlyDeviceIds.delete(id);
    this.removedProjectIdentities.push({ id, mac: device.anchor.macAddress?.toLowerCase(), uuid: device.anchor.onvifEndpointUuid?.toLowerCase(), serial: device.anchor.serialNumber?.toLowerCase() });
    this.markDirty();
    return clone(device);
  }
  public restoreDiscoveredDevice(device: Device): void {
    this.hiddenCurrentDeviceIds.delete(device.id);
    const mac=device.anchor.macAddress?.toLowerCase(),uuid=device.anchor.onvifEndpointUuid?.toLowerCase(),serial=device.anchor.serialNumber?.toLowerCase();
    const removed = this.removedProjectIdentities.find(identity => identity.id===device.id || Boolean((mac&&identity.mac===mac)||(uuid&&identity.uuid===uuid)||(serial&&identity.serial===serial)));
    if (removed) this.currentOnlyDeviceIds.add(device.id);
  }
  public getDeviceByMac(mac: string): Device | undefined { const matches=this.getDevices().filter(d => Boolean(canonicalMac(mac)) && canonicalMac(d.anchor.macAddress) === canonicalMac(mac)); return matches.length===1 ? matches[0] : undefined; }
  public getDeviceById(id: string): Device | undefined { return this.getDevices().find(device => device.id === id); }
  public getDeviceByIdentifier(identifier: string): Device | undefined { return this.getDeviceById(identifier) || this.getDeviceByMac(identifier); }
  public recordCollision(collision: IPCollisionRecord): void { const existing = this.session.project.collisions.find(c => (collision.id&&c.id===collision.id)||c.ipAddress === collision.ipAddress); if (existing) { const id=existing.id||collision.id,detectedAt=existing.detectedAt;Object.assign(existing,collision,{id,detectedAt}); } else this.session.project.collisions.push(collision); this.markDirty(); }
  public getCollisions(): IPCollisionRecord[] { return this.session.project.collisions; }
  public recordRogueDhcp(event: RogueDHCPOffer): void { this.session.project.rogueDhcpEvents.push(event); this.markDirty(); }
  public getRogueDhcpEvents(): RogueDHCPOffer[] { return this.session.project.rogueDhcpEvents; }
  // Operational observations remain visible and are captured by the next explicit Save,
  // like monitoring snapshots. They do not independently represent a document edit.
  public appendHistory(event: AppendProjectHistory, runtime = false): void { if (this.session.mode !== 'PROJECT') return; this.session.project.auditLogs = ProjectHistoryService.bounded([...this.session.project.auditLogs, ProjectHistoryService.create(event)]); if(!runtime)this.markDirty(); }
  public recordProjectAudit(entry: SiteProject['auditLogs'][number]): void { if (this.session.mode !== 'PROJECT') return; this.session.project.auditLogs = ProjectHistoryService.bounded([...this.session.project.auditLogs, clone(entry)]); this.markDirty(); }
  public listProjectHistory(filter: ProjectHistoryFilter = 'ALL', deviceId?: string) { return this.session.mode === 'PROJECT' ? ProjectHistoryService.list(this.session.project.auditLogs, filter, deviceId) : []; }
  public recordConfigurationHistory(deviceId:string, operation:string, result:'SUCCESS'|'FAILED'|'CANCELLED'|'UNKNOWN', details:Record<string,unknown>={}) { this.appendHistory({type:'CONFIGURATION',title:'Configuration Operation',summary:`${operation} completed with result ${result}.`,deviceId,result,level:result==='SUCCESS'?'SUCCESS':result==='FAILED'?'ERROR':'INFO',category:'PROVISIONING',details:{operation,...details}}); }

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
    this.resetTransientDeviceState(); this.session = { mode: 'PROJECT', project, dirty: false };
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
    project.devices = this.session.project.devices.filter(device => !this.currentOnlyDeviceIds.has(device.id)).map(prepareDeviceForSave);
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
    loaded.auditLogs = ProjectHistoryService.bounded(Array.isArray(loaded.auditLogs) ? loaded.auditLogs : []);
    loaded.totalDevices = loaded.devices.length;
    if (loaded.devices.some(device=>!this.acceptsEvidence(device))) throw new ProjectValidationError('Nonphysical evidence cannot be opened in technician inventory.');
    loaded.devices = loaded.devices.map(prepareLoadedDevice);
    return loaded;
  }

  private markDirty(): void { this.session.project.totalDevices = this.session.project.devices.length; this.session.project.updatedAt = new Date().toISOString(); this.session.dirty = true; }
}

export const projectDb = new SiteProjectDatabase();
