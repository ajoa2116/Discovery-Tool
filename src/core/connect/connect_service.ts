import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { BrowserPreference, CameraAccessEndpoint, ConnectReadiness, ConnectionHistoryEntry, Device } from '../../types/index.ts';
import { DeviceDiagnosticEngine } from '../engine/diagnostic_engine.ts';
import { SiteProjectDatabase, projectDb } from '../storage/project_db.ts';
import { OSCredentialVault, osVault } from '../storage/vault.ts';

export class ConnectError extends Error { constructor(message: string, public readonly code: string) { super(message); } }
export interface BrowserLauncher { available(): Promise<BrowserPreference[]>; launch(url: string, preference: BrowserPreference): Promise<{ used: BrowserPreference; fallback: boolean }>; }

const run = (file: string, args: string[]) => new Promise<void>((resolve, reject) => execFile(file, args, { windowsHide: true }, error => error ? reject(error) : resolve()));
/** A GUI launch is acknowledged by process creation, not by the browser's later exit code. */
export function launchExternalProcess(file:string,args:string[],create:typeof spawn=spawn):Promise<void>{
  return new Promise((resolve,reject)=>{
    try {const child=create(file,args,{windowsHide:true,detached:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});}catch(error){reject(error);}
  });
}
export class WindowsBrowserLauncher implements BrowserLauncher {
  async available() {
    const result: BrowserPreference[] = ['SYSTEM', 'EMBEDDED'];
    for (const [name, executable] of [['EDGE', 'msedge.exe'], ['CHROME', 'chrome.exe']] as const) {
      try { await run('where.exe', [executable]); result.push(name); } catch { /* unavailable */ }
    }
    return result;
  }
  async launch(url: string, preference: BrowserPreference) {
    const supported = await this.available();
    const used = supported.includes(preference) ? preference : 'SYSTEM';
    if (used === 'EMBEDDED') return { used, fallback: false };
    if (used === 'EDGE') await launchExternalProcess('msedge.exe', [url]);
    else if (used === 'CHROME') await launchExternalProcess('chrome.exe', [url]);
    else await launchExternalProcess('explorer.exe', [url]);
    return { used, fallback: used !== preference };
  }
}

function validEndpoint(url: URL, device: Device): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && net.isIP(url.hostname) === 4 && url.hostname === device.network.ipAddress && (!url.port || (Number.isInteger(Number(url.port)) && Number(url.port) >= 1 && Number(url.port) <= 65535));
}

export class ConnectService {
  constructor(private readonly database: SiteProjectDatabase = projectDb, private readonly launcher: BrowserLauncher = new WindowsBrowserLauncher(), private readonly vault: OSCredentialVault = osVault, private readonly diagnostics = new DeviceDiagnosticEngine()) {}

  resolve(deviceId: string): { deviceId: string; endpoint: CameraAccessEndpoint; readiness: ConnectReadiness; identity: Record<string, unknown>; availableBrowsers?: BrowserPreference[] } {
    const device = this.requireDevice(deviceId);
    const checks = [...(device.diagnostics?.checks || [])].reverse();
    const usableWeb = (type: 'HTTPS' | 'HTTP') => checks.find(check => check.type === type && check.success && check.port && !check.ambiguousIdentity);
    const web = usableWeb('HTTPS') || usableWeb('HTTP');
    let endpoint: CameraAccessEndpoint | undefined;
    if (web) {
      const scheme = web.type === 'HTTPS' ? 'https' : 'http';
      const defaultPort = scheme === 'https' ? 443 : 80;
      endpoint = { url: `${scheme}://${device.network.ipAddress}${web.port === defaultPort ? '' : `:${web.port}`}`, scheme, port: web.port, verified: true, source: 'DIAGNOSTIC', certificateWarning: web.certificateWarning };
    }
    if (!endpoint) {
      const xaddrs = [...(device.network.xAddrs || []), device.network.xAddr].filter((value): value is string => Boolean(value));
      const parsed = xaddrs.flatMap(value => { try { const url = new URL(value); return validEndpoint(url, device) ? [url] : []; } catch { return []; } });
      const preferred = parsed.find(url => url.protocol === 'https:') || parsed.find(url => url.protocol === 'http:');
      if (preferred) endpoint = { url: `${preferred.protocol}//${preferred.host}`, scheme: preferred.protocol.slice(0, -1) as 'http' | 'https', port: preferred.port ? Number(preferred.port) : undefined, verified: false, source: 'XADDR' };
    }
    if (!endpoint) endpoint = { url: `http://${device.network.ipAddress}`, scheme: 'http', verified: false, source: 'IP_FALLBACK' };
    const ambiguous = device.status === 'COLLISION' || this.database.getDevices().some(other => other.id !== device.id && other.network.ipAddress === device.network.ipAddress);
    const readiness: ConnectReadiness = ambiguous
      ? { state: 'AMBIGUOUS', canOpenManually: true, pairAvailable: false, retryDiagnoseAvailable: true, warning: 'This IP is shared by distinct identities; browser access cannot be attributed to the selected physical device.' }
      : device.status === 'DIFFERENT_SUBNET'
        ? { state: 'DIFFERENT_SUBNET', canOpenManually: true, pairAvailable: true, retryDiagnoseAvailable: true, warning: 'Pair is available, but the PC network will never be changed automatically.' }
        : device.status === 'UNREACHABLE' || device.status === 'OFFLINE'
          ? { state: 'UNREACHABLE', canOpenManually: true, pairAvailable: false, retryDiagnoseAvailable: true, warning: 'The device is currently unreachable. Retry Diagnose or open cautiously.' }
          : endpoint.verified ? { state: 'READY', canOpenManually: true, pairAvailable: false, retryDiagnoseAvailable: true }
            : { state: 'UNKNOWN', canOpenManually: true, pairAvailable: false, retryDiagnoseAvailable: true, warning: 'The web endpoint is unverified; manual opening is still available.' };
    return { deviceId: device.id, endpoint, readiness, identity: { technicianName: device.technician?.name, location: device.technician?.location, manufacturer: device.anchor.vendor, model: device.anchor.model, ip: device.network.ipAddress, mac: device.anchor.macAddress, uuid: device.anchor.onvifEndpointUuid, status: device.status } };
  }

  async open(deviceId: string, preference: BrowserPreference) {
    if (!['SYSTEM', 'EDGE', 'CHROME', 'EMBEDDED'].includes(preference)) throw new ConnectError('Unsupported browser preference.', 'INVALID_BROWSER');
    const resolved = this.resolve(deviceId);
    const result = await this.launcher.launch(resolved.endpoint.url, preference);
    const device = this.requireDevice(deviceId);
    const history: ConnectionHistoryEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), mode: result.used, url: resolved.endpoint.url, statusBeforeOpen: device.status, event: 'OPEN_ATTEMPT', result: result.fallback ? 'Preferred browser unavailable; used System Default.' : 'Technician initiated camera access.' };
    device.connectionHistory = [...(device.connectionHistory || []), history].slice(-100);
    this.database.upsertDevice(device);
    return { ...resolved, browser: result };
  }

  async recheck(deviceId: string, signal?: AbortSignal) { const device = this.requireDevice(deviceId); await this.diagnostics.diagnose(device, { signal, isRefresh: true }); const history: ConnectionHistoryEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), mode: 'SYSTEM', url: this.resolve(deviceId).endpoint.url, statusBeforeOpen: device.status, event: 'RECHECK', result: device.status }; device.connectionHistory = [...(device.connectionHistory || []), history].slice(-100); this.database.upsertDevice(device); return { device, resolved: this.resolve(deviceId) }; }
  markFirstLogin(deviceId: string, required: boolean) { const device = this.requireDevice(deviceId); device.activationState = required ? 'PASSWORD_SETUP_REQUIRED' : 'TECHNICIAN_REPORTED_COMPLETE'; if (required) device.connectionHistory = [...(device.connectionHistory || []), { id: crypto.randomUUID(), timestamp: new Date().toISOString(), mode: 'SYSTEM', url: this.resolve(deviceId).endpoint.url, statusBeforeOpen: device.status, event: 'FIRST_LOGIN_REQUIRED' }]; this.database.upsertDevice(device); return device.activationState; }
  safeCredentials(deviceId: string) { const device = this.requireDevice(deviceId); return { selectedCredentialId: this.vault.getAssociation(device.id), references: this.vault.getSafeReferences(device.anchor.vendor) }; }
  associateCredential(deviceId: string, credentialId: string) { this.requireDevice(deviceId); if (!this.vault.hasCredential(credentialId)) throw new ConnectError('Credential reference not found.', 'CREDENTIAL_NOT_FOUND'); this.vault.associate(deviceId, credentialId); return { deviceId, credentialId }; }
  async saveCredential(deviceId: string, input: { username?: string; password?: string; remember?: boolean }) { const device = this.requireDevice(deviceId); if (!input.username || !input.password) throw new ConnectError('Username and password are required to save a credential.', 'INVALID_CREDENTIAL'); if (!input.remember) return { remembered: false }; const id = crypto.randomUUID(); await this.vault.saveCredential({ id, label: `${device.technician?.name || device.anchor.vendor} credential`, username: input.username, password: input.password, targetVendor: device.anchor.vendor, deviceIdentity: device.id }); this.vault.associate(device.id, id); return { remembered: true, credentialId: id }; }
  async deleteCredential(deviceId:string,id:string){this.requireDevice(deviceId);await this.vault.deleteCredential(id);return{deleted:true};}
  async updateCredential(deviceId:string,id:string,input:{username?:string;password?:string}){const device=this.requireDevice(deviceId);if(!this.vault.hasCredential(id))throw new ConnectError('Credential reference not found.','CREDENTIAL_NOT_FOUND');return this.vault.saveCredential({id,label:`${device.technician?.name||device.anchor.vendor} credential`,username:input.username||'',password:input.password||'',targetVendor:device.anchor.vendor,deviceIdentity:device.id});}
  async availableBrowsers() { return this.launcher.available(); }
  private requireDevice(id: string) { const device = this.database.getDeviceById(id); if (!device) throw new ConnectError('Device not found.', 'DEVICE_NOT_FOUND'); return device; }
}
