import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { join } from 'node:path';

export type ReadinessState = 'READY' | 'WARNING' | 'UNAVAILABLE';
export interface ReadinessCheck { id: string; label: string; state: ReadinessState; detail: string; critical: boolean }
export interface PreflightResult { application: string; version: string; platform: string; runtime: string; checkedAt: string; overall: ReadinessState; checks: ReadinessCheck[]; build?: PreflightDependencies['build'] }

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
  isAdministrator?: () => Promise<boolean>;
  productionAssetsAvailable?: () => Promise<boolean>;
  recoveryRequired?: () => Promise<boolean>;
  operationActive?: () => Promise<boolean>;
  production?: boolean;
  build?: {commit:string|null;sourceDigest:string|null;dirty:boolean|null;runtimeMode:string};
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
    const enumerate = this.dependencies.enumerateAdapters ?? (async () => Object.values(os.networkInterfaces()).flat().filter(item=>item&&item.family==='IPv4'&&!item.internal).length);
    const command = this.dependencies.commandAvailable ?? (name => powershell(`$null=Get-Command '${name}' -ErrorAction Stop`));
    const credentials = this.dependencies.credentialStoreAvailable ?? (() => powershell("Add-Type -AssemblyName System.Runtime.WindowsRuntime;$null=[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]"));
    const canListen = this.dependencies.portAvailable ?? portAvailable;
    const canUdp = this.dependencies.udpSocketAvailable ?? udpSocketAvailable;
    const canWrite = this.dependencies.writable ?? writable;
    const checks: ReadinessCheck[] = [];
    const safe=async(check:()=>Promise<boolean>)=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([check(),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),6000)})]);}catch{return false;}finally{clearTimeout(timer);}};
    const add = (id: string, label: string, ok: boolean, detail: string, critical = false, warning = false) => checks.push({ id, label, state: ok ? 'READY' : warning ? 'WARNING' : 'UNAVAILABLE', detail, critical });
    add('platform', 'Supported Windows platform', platform === 'win32', platform === 'win32' ? 'Windows platform detected.' : `Detected ${platform}; Windows-only operations are unavailable.`, true);
    const major = Number(runtime.match(/^v?(\d+)/)?.[1] || 0); add('runtime', 'Node runtime', major === 20 || major === 22, `${runtime}${major === 24 ? ' detected; Node 24 has shown intermittent tsx environment failures. Prefer Node 22 LTS for development.' : ''}`, false, major >= 18);
    const hasAdapter=await safe(async()=>await enumerate()>0);add('adapters','Active IPv4 adapters',hasAdapter,hasAdapter?'An eligible IPv4 adapter is available.':'No eligible IPv4 adapter is available. Connect the intended Ethernet adapter and refresh. Discovery requires an eligible interface.',false,true);
    for (const [id, label, name] of [['powershell','PowerShell','powershell.exe'],['neighbor','Get-NetNeighbor','Get-NetNeighbor'],['ipaddress','Get-NetIPAddress','Get-NetIPAddress']] as const) { const available = await safe(()=>command(name)); add(id, label, available, `${label} ${available ? 'is available.' : 'is unavailable.'}`, id === 'powershell'); }
    add('credentials', 'Windows credential storage', await safe(credentials), 'Windows PasswordVault capability checked; no password was read or saved. Unavailable storage affects explicit credential saving only.', false, true);
    add('backend-port', 'Local backend port 3001', await safe(()=>canListen(3001)), 'The application listener or pre-start availability is checked. A conflict requires closing the other instance; unrelated processes are never terminated.', true);
    const storageReady=await safe(()=>canWrite(appData));
    add('app-data','Application data directory',storageReady,'Application data write/create/remove check. No user profile path is included.',false,true);
    add('pair-recovery','Pair recovery directory',storageReady,'Writable recovery storage is required before temporary adapter changes.',false,true);
    add('project-report-output','Project/report output capability',true,'Projects, reports and support bundles use browser downloads; verify the chosen destination when saving. App-data access does not prove download-folder access.');
    add('udp-discovery', 'UDP discovery sockets', await safe(canUdp), 'A local UDP socket was created and closed; no multicast probe was sent. This does not prove port 3702 membership or inbound WS-Discovery reception.', false, true);
    if(this.dependencies.isAdministrator)add('elevation','Adapter change privileges',await safe(this.dependencies.isAdministrator),'Elevation is required only for Pair/Match apply and Restore where Windows requires it. Scan, diagnostics, projects and reports do not require global elevation.',false,true);
    if(this.dependencies.productionAssetsAvailable)add('production-assets','Production frontend',await safe(this.dependencies.productionAssetsAvailable),'Build the production frontend with npm run build if unavailable.',Boolean(this.dependencies.production),true);
    // A missing production build is critical only in production mode.
    if(this.dependencies.production){const assets=checks.find(check=>check.id==='production-assets');if(assets&&assets.state!=='READY')assets.state='UNAVAILABLE';}
    if(this.dependencies.recoveryRequired){const required=!(await safe(async()=>!(await this.dependencies.recoveryRequired!())));add('network-recovery','Network recovery',!required,required?'Recovery inspection is incomplete or a temporary adapter snapshot requires review. Do not start new adapter changes until original state is established; review Tasks/Network Adapter and support evidence.':'No temporary adapter recovery is required.',false,true);}
    if(this.dependencies.operationActive){const idle=await safe(async()=>!(await this.dependencies.operationActive!()));add('operation-ownership','Discovery/operation ownership',idle,idle?'No active technician operation or support trace owns discovery. Background monitoring remains separate.':'An operation or support trace is active. Finish or safely stop its owner before conflicting tests.',false,true);}
    if(this.dependencies.build)add('build-identity','Field build identity',Boolean(this.dependencies.build.sourceDigest),'Build identity comes from dist/build-info.json. Rebuild if unavailable; an absent commit is never invented.',false,true);
    const overall: ReadinessState = checks.some(check => check.critical && check.state === 'UNAVAILABLE') ? 'UNAVAILABLE' : checks.some(check => check.state !== 'READY') ? 'WARNING' : 'READY';
    return { application: 'CCTV Network Assistant', version: '1.6.0', platform, runtime, checkedAt: new Date().toISOString(), overall, checks, ...(this.dependencies.build?{build:this.dependencies.build}:{}) };
  }
}

export const recoveryRequiresReview=(inspectionComplete:boolean,session:{recoveryAvailable?:boolean}|null)=>!inspectionComplete||Boolean(session?.recoveryAvailable);

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
