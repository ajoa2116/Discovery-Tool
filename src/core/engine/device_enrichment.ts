import { canonicalMac } from '../../shared/identity_policy.ts';
import { execFile } from 'node:child_process';
import net from 'node:net';
import { Device, NICInfo, ReachabilityEvidence } from '../../types/index.ts';

export interface NeighborEntry {
  ipAddress: string;
  macAddress: string;
  interfaceIndex?: number;
  state?: string;
}

export interface NeighborProvider {
  lookup(ipAddress: string, options?: { signal?: AbortSignal; interfaceIndex?: number; localAddress?: string }): Promise<NeighborEntry | null>;
}

export interface ReachabilityProvider {
  probe(
    ipAddress: string,
    options: { ports: number[]; timeoutMs: number; signal?: AbortSignal; localAddress?: string },
  ): Promise<Array<{ port: number; reachable: boolean; testedAt: string }>>;
}

export interface DeviceEnrichmentOptions {
  onEvidence?: (stage:string) => void;
  signal?: AbortSignal;
  onUpdate?: (device: Device, changedFields: string[]) => void;
}

export interface DeviceEnricher {
  enrich(device: Device, options?: DeviceEnrichmentOptions): Promise<Device>;
}

export const normalizeMacAddress = canonicalMac;

function ipv4ToUint32(ipAddress: string): number | null {
  const parts = ipAddress.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

export function classifySubnet(deviceIp: string, nicIp: string, netmask: string): 'LOCAL' | 'DIFFERENT_SUBNET' | 'UNKNOWN' {
  const device = ipv4ToUint32(deviceIp);
  const nic = ipv4ToUint32(nicIp);
  const mask = ipv4ToUint32(netmask);
  if (device === null || nic === null || mask === null) return 'UNKNOWN';
  return ((device & mask) >>> 0) === ((nic & mask) >>> 0) ? 'LOCAL' : 'DIFFERENT_SUBNET';
}

export type NeighborCommand = (script:string,signal?:AbortSignal)=>Promise<string>;
const runNeighborCommand:NeighborCommand = (script,signal)=>new Promise((resolve,reject)=>{
  execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:2500,maxBuffer:1024*1024,signal},(error,stdout)=>{
    if(error){if(signal?.aborted)resolve('');else reject(error);}else resolve(stdout);
  });
});
const neighborStates = ['Unreachable','Incomplete','Probe','Delay','Stale','Reachable','Permanent'];
export function parseWindowsNeighbors(output:string):NeighborEntry[] {
  const parsed=output.trim()?JSON.parse(output):[];
  return (Array.isArray(parsed)?parsed:[parsed]).slice(0,4096).flatMap(row=>{
    if(!row||typeof row!=='object')return [];
    const state=neighborStates[Number(row.State)] || neighborStates.find(value=>value.toLowerCase()===String(row.State).toLowerCase());
    const macAddress=normalizeMacAddress(typeof row.LinkLayerAddress==='string'?row.LinkLayerAddress:null);
    const ipAddress=typeof row.IPAddress==='string'?row.IPAddress.trim():'';
    const index=Number(row.InterfaceIndex);
    return macAddress && ipv4ToUint32(ipAddress)!==null && Number.isInteger(index) && index>0 && state && !['Unreachable','Incomplete'].includes(state)
      && (row.AddressFamily===undefined || ['IPv4','2'].includes(String(row.AddressFamily)))
      ? [{ipAddress,macAddress,interfaceIndex:index,state}]:[];
  });
}
export class WindowsNeighborProvider implements NeighborProvider {
  constructor(private readonly run:NeighborCommand=runNeighborCommand){}
  async list(signal?:AbortSignal):Promise<NeighborEntry[]> {
    return parseWindowsNeighbors(await this.run('Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop | Select-Object IPAddress,LinkLayerAddress,InterfaceIndex,State,AddressFamily | ConvertTo-Json -Compress',signal));
  }
  async lookup(ipAddress:string,options:{signal?:AbortSignal;interfaceIndex?:number;localAddress?:string}={}):Promise<NeighborEntry|null>{
    if(ipv4ToUint32(ipAddress)===null)return null;
    if(options.interfaceIndex!==undefined&&(!Number.isInteger(options.interfaceIndex)||options.interfaceIndex<1))return null;
    if(options.localAddress!==undefined&&ipv4ToUint32(options.localAddress)===null)return null;
    const setup=options.interfaceIndex!==undefined?`$ifIndex = ${options.interfaceIndex}; `:options.localAddress
      ? `$ifIndex = (Get-NetIPAddress -AddressFamily IPv4 -IPAddress '${options.localAddress}' -ErrorAction Stop | Select-Object -First 1 -ExpandProperty InterfaceIndex); if (!$ifIndex) { throw 'ADAPTER_NOT_FOUND' }; `:'$ifIndex = $null; ';
    // Select all matching rows before validation: an incomplete first row must not hide a valid Stale row.
    const script=setup+`$entries = Get-NetNeighbor -AddressFamily IPv4 -IPAddress '${ipAddress}' -ErrorAction SilentlyContinue; if ($ifIndex) { $entries = $entries | Where-Object InterfaceIndex -eq $ifIndex }; $entries | Select-Object IPAddress,LinkLayerAddress,InterfaceIndex,State,AddressFamily | ConvertTo-Json -Compress`;
    const matches=parseWindowsNeighbors(await this.run(script,options.signal)).filter(row=>row.ipAddress===ipAddress&&(options.interfaceIndex===undefined||row.interfaceIndex===options.interfaceIndex));
    if(new Set(matches.map(row=>row.macAddress)).size!==1)return null;
    return matches[0]||null;
  }
}

export class TcpReachabilityProvider implements ReachabilityProvider {
  public async probe(
    ipAddress: string,
    options: { ports: number[]; timeoutMs: number; signal?: AbortSignal; localAddress?: string },
  ): Promise<Array<{ port: number; reachable: boolean; testedAt: string }>> {
    return Promise.all(options.ports.map(port => this.probePort(ipAddress, port, options)));
  }

  private probePort(
    ipAddress: string,
    port: number,
    options: { timeoutMs: number; signal?: AbortSignal; localAddress?: string },
  ): Promise<{ port: number; reachable: boolean; testedAt: string }> {
    return new Promise(resolve => {
      let settled = false;
      const socket = net.createConnection({ host: ipAddress, port, localAddress: options.localAddress });
      const finish = (reachable: boolean) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        socket.destroy();
        resolve({ port, reachable, testedAt: new Date().toISOString() });
      };
      const onAbort = () => finish(false);
      socket.setTimeout(options.timeoutMs, () => finish(false));
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) finish(false);
    });
  }
}

export class NoopDeviceEnricher implements DeviceEnricher {
  public async enrich(device: Device): Promise<Device> { return device; }
}

export class WindowsDeviceEnricher implements DeviceEnricher {
  constructor(
    private readonly neighbors: NeighborProvider = new WindowsNeighborProvider(),
    private readonly reachability: ReachabilityProvider = new TcpReachabilityProvider(),
  ) {}

  public async enrich(device: Device, options: DeviceEnrichmentOptions = {}): Promise<Device> {
    const nic = device.reachability?.relationshipAdapter || device.reachability?.discoveryInterface;
    const subnetClassification = nic
      ? classifySubnet(device.network.ipAddress, nic.ipAddress, nic.netmask)
      : device.reachability?.subnetClassification || 'UNKNOWN';
    device.reachability = { ...device.reachability, subnetClassification };
    if (subnetClassification === 'DIFFERENT_SUBNET') device.status = 'DIFFERENT_SUBNET';
    options.onUpdate?.(device, ['subnetClassification']);

    let neighbor = await this.safeNeighborLookup(device.network.ipAddress, nic, options.signal, options.onEvidence);
    if (neighbor?.macAddress && !device.anchor.macAddress) {
      device.anchor.macAddress = neighbor.macAddress;
      options.onUpdate?.(device, ['macAddress']);
    }

    if (options.signal?.aborted) return device;
    const advertisedPort = device.network.port > 0 ? device.network.port : undefined;
    const ports = Array.from(new Set([advertisedPort, 80, 443].filter((port): port is number => Boolean(port))));
    const services = await this.reachability.probe(device.network.ipAddress, {
      ports,
      timeoutMs: 800,
      signal: options.signal,
      localAddress: nic?.ipAddress,
    });
    const successful = services.filter(service => service.reachable);
    const evidence: ReachabilityEvidence = {
      ...device.reachability,
      tcpServices: services,
      lastSuccessfulResponseAt: successful.at(-1)?.testedAt || device.reachability?.lastSuccessfulResponseAt,
    };
    device.reachability = evidence;
    if (successful.length > 0 && subnetClassification !== 'DIFFERENT_SUBNET') device.status = 'ONLINE';
    options.onUpdate?.(device, ['reachability']);

    if (!device.anchor.macAddress && !options.signal?.aborted) {
      neighbor = await this.safeNeighborLookup(device.network.ipAddress, nic, options.signal, options.onEvidence);
      if (neighbor?.macAddress) {
        device.anchor.macAddress = neighbor.macAddress;
        options.onUpdate?.(device, ['macAddress']);
      }
    }
    return device;
  }

  private async safeNeighborLookup(
    ipAddress: string,
    nic: ReachabilityEvidence['discoveryInterface'],
    signal?: AbortSignal,
    onEvidence?: (stage:string) => void,
  ): Promise<NeighborEntry | null> {
    try {
      onEvidence?.('NEIGHBOR_LOOKUP_STARTED');
      const neighbor=await this.neighbors.lookup(ipAddress, {
        signal,
        interfaceIndex: nic?.interfaceIndex,
        localAddress: nic?.ipAddress,
      });
      onEvidence?.(neighbor?'NEIGHBOR_MATCHED':'NEIGHBOR_NOT_FOUND');
      return neighbor;
    } catch {
      onEvidence?.('NEIGHBOR_LOOKUP_UNAVAILABLE');
      return null;
    }
  }
}
