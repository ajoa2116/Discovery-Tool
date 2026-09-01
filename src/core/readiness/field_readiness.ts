import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { join } from 'node:path';

export type ReadinessState = 'READY' | 'WARNING' | 'UNAVAILABLE';
export interface ReadinessCheck { id: string; label: string; state: ReadinessState; detail: string; critical: boolean }
export interface PreflightResult { application: string; version: string; platform: string; runtime: string; checkedAt: string; overall: ReadinessState; checks: ReadinessCheck[] }

export interface PreflightDependencies {
  platform?: NodeJS.Platform;
  runtime?: string;
  appDataDirectory?: string;
  enumerateAdapters?: () => Promise<number>;
  commandAvailable?: (command: string) => Promise<boolean>;
  credentialStoreAvailable?: () => Promise<boolean>;
  portAvailable?: (port: number) => Promise<boolean>;
  udpSocketAvailable?: () => Promise<boolean>;
  writable?: (directory: string) => Promise<boolean>;
}

const powershell = (script: string) => new Promise<boolean>(resolve => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 }, error => resolve(!error));
});
const portAvailable = (port: number) => new Promise<boolean>(resolve => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
const udpSocketAvailable = () => new Promise<boolean>(resolve => {
  const socket = dgram.createSocket('udp4');
  socket.once('error', () => { try { socket.close(); } catch {} resolve(false); });
  socket.bind(0, '0.0.0.0', () => socket.close(() => resolve(true)));
});
const writable = async (directory: string) => {
  const marker = join(directory, `.preflight-${crypto.randomUUID()}.tmp`);
  try { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(marker, 'readiness', { flag: 'wx' }); await fs.rm(marker); return true; } catch { await fs.rm(marker, { force: true }).catch(() => undefined); return false; }
};

export class WindowsPreflightService {
  constructor(private readonly dependencies: PreflightDependencies = {}) {}
  async run(): Promise<PreflightResult> {
    const platform = this.dependencies.platform ?? process.platform;
    const runtime = this.dependencies.runtime ?? process.version;
    const appData = this.dependencies.appDataDirectory ?? join(process.env.LOCALAPPDATA || os.tmpdir(), 'CCTVDiscoveryTool');
    const enumerate = this.dependencies.enumerateAdapters ?? (async () => Object.values(os.networkInterfaces()).flat().filter(Boolean).length);
    const command = this.dependencies.commandAvailable ?? (name => powershell(`$null=Get-Command '${name}' -ErrorAction Stop`));
    const credentials = this.dependencies.credentialStoreAvailable ?? (() => powershell("Add-Type -AssemblyName System.Runtime.WindowsRuntime;$null=[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]"));
    const canListen = this.dependencies.portAvailable ?? portAvailable;
    const canUdp = this.dependencies.udpSocketAvailable ?? udpSocketAvailable;
    const canWrite = this.dependencies.writable ?? writable;
    const checks: ReadinessCheck[] = [];
    const add = (id: string, label: string, ok: boolean, detail: string, critical = false, warning = false) => checks.push({ id, label, state: ok ? 'READY' : warning ? 'WARNING' : 'UNAVAILABLE', detail, critical });
    add('platform', 'Supported Windows platform', platform === 'win32', platform === 'win32' ? 'Windows platform detected.' : `Detected ${platform}; Windows-only operations are unavailable.`, true);
    const major = Number(runtime.match(/^v?(\d+)/)?.[1] || 0); add('runtime', 'Node runtime', major === 20 || major === 22, `${runtime}${major === 24 ? ' detected; Node 24 has shown intermittent tsx environment failures. Prefer Node 22 LTS for development.' : ''}`, false, major >= 18);
    try { add('adapters', 'Adapter enumeration', (await enumerate()) > 0, 'Operating-system network interfaces can be enumerated.', true); } catch { add('adapters', 'Adapter enumeration', false, 'Network interfaces could not be enumerated.', true); }
    for (const [id, label, name] of [['powershell','PowerShell','powershell.exe'],['neighbor','Get-NetNeighbor','Get-NetNeighbor'],['ipaddress','Get-NetIPAddress','Get-NetIPAddress']] as const) { const available = await command(name); add(id, label, available, `${label} ${available ? 'is available.' : 'is unavailable.'}`, id === 'powershell'); }
    add('credentials', 'Windows credential storage', await credentials(), 'Windows PasswordVault provider readiness checked.', false, true);
    add('backend-port', 'Local backend port 3001', await canListen(3001), 'Port 3001 availability checked without retaining the listener.', true);
    add('app-data', 'Application data directory', await canWrite(appData), appData, true);
    add('pair-recovery', 'Pair recovery directory', await canWrite(appData), appData, true);
    add('project-report-output', 'Project/report output capability', await canWrite(appData), 'Temporary write/create/remove check completed.', true);
    add('udp-discovery', 'UDP discovery sockets', await canUdp(), 'A local UDP socket was created and closed; no multicast probe was sent.', true);
    const overall: ReadinessState = checks.some(check => check.critical && check.state === 'UNAVAILABLE') ? 'UNAVAILABLE' : checks.some(check => check.state !== 'READY') ? 'WARNING' : 'READY';
    return { application: 'CCTV Network Assistant', version: '1.6.0', platform, runtime, checkedAt: new Date().toISOString(), overall, checks };
  }
}

export interface Stoppable { stop?: () => void; cancelCurrent?: () => void }
export class ShutdownCoordinator {
  private closing: Promise<void> | null = null;
  constructor(private readonly discovery: { stopDiscovery(): boolean }, private readonly monitor: Stoppable, private readonly controllers: Iterable<AbortController>, private readonly closeWebSocket: () => Promise<void>, private readonly closeHttp: () => Promise<void>) {}
  shutdown(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => { this.discovery.stopDiscovery(); this.monitor.stop?.(); this.monitor.cancelCurrent?.(); for (const controller of this.controllers) controller.abort(); await this.closeWebSocket(); await this.closeHttp(); })();
    return this.closing;
  }
}
