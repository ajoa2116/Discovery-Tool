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

export function normalizeMacAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const hex = value.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12 || !/^[0-9a-f]{12}$/.test(hex)) return null;
  if (hex === '000000000000' || hex === 'ffffffffffff') return null;
  if ((parseInt(hex.slice(0, 2), 16) & 1) === 1) return null;
  return hex.match(/.{2}/g)!.join(':');
}

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

export class WindowsNeighborProvider implements NeighborProvider {
  public list(signal?: AbortSignal): Promise<NeighborEntry[]> {
    return new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop | Select-Object IPAddress,LinkLayerAddress,InterfaceIndex,State | ConvertTo-Json -Compress'],
        { windowsHide: true, timeout: 2500, maxBuffer: 1024 * 1024, signal }, (error, stdout) => {
          if (error) { if (signal?.aborted) resolve([]); else reject(error); return; }
          try { const parsed = stdout.trim() ? JSON.parse(stdout) : []; resolve((Array.isArray(parsed) ? parsed : [parsed]).slice(0,4096).flatMap(row => {
            const macAddress = normalizeMacAddress(row.LinkLayerAddress);
            return macAddress && ipv4ToUint32(row.IPAddress || '') !== null && !['0','1','Unreachable','Incomplete'].includes(String(row.State)) ? [{ ipAddress: row.IPAddress, macAddress, interfaceIndex: row.InterfaceIndex, state: String(row.State) }] : [];
          })); } catch (error) { reject(error); }
        });
    });
  }
  public lookup(
    ipAddress: string,
    options: { signal?: AbortSignal; interfaceIndex?: number; localAddress?: string } = {},
  ): Promise<NeighborEntry | null> {
    if (ipv4ToUint32(ipAddress) === null) return Promise.resolve(null);
    const escapedIp = ipAddress.replace(/'/g, "''");
    const localAddress = options.localAddress && ipv4ToUint32(options.localAddress) !== null
      ? options.localAddress.replace(/'/g, "''")
      : undefined;
    const interfaceSetup = options.interfaceIndex !== undefined
      ? `$ifIndex = ${options.interfaceIndex}; `
      : localAddress
        ? `$ifIndex = (Get-NetIPAddress -AddressFamily IPv4 -IPAddress '${localAddress}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty InterfaceIndex); `
        : '$ifIndex = $null; ';
    const script = `${interfaceSetup}$entries = Get-NetNeighbor -AddressFamily IPv4 -IPAddress '${escapedIp}' -ErrorAction SilentlyContinue; if ($ifIndex) { $entries = $entries | Where-Object InterfaceIndex -eq $ifIndex }; $entry = $entries | Select-Object -First 1 IPAddress,LinkLayerAddress,InterfaceIndex,State; if ($entry) { $entry | ConvertTo-Json -Compress }`;

    return new Promise((resolve, reject) => {
      const child = execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 2500, maxBuffer: 64 * 1024, signal: options.signal },
        (error, stdout) => {
          if (error) {
            if (options.signal?.aborted) resolve(null);
            else reject(error);
            return;
          }
          const output = stdout.trim();
          if (!output) {
            resolve(null);
            return;
          }
          try {
            const parsed = JSON.parse(output);
            const macAddress = normalizeMacAddress(parsed.LinkLayerAddress);
            resolve(macAddress && !['0','1','Unreachable','Incomplete'].includes(String(parsed.State)) ? {
              ipAddress: parsed.IPAddress,
              macAddress,
              interfaceIndex: Number.isInteger(parsed.InterfaceIndex) ? parsed.InterfaceIndex : undefined,
              state: parsed.State !== undefined ? String(parsed.State) : undefined,
            } : null);
          } catch (parseError) {
            reject(parseError);
          }
        },
      );
      if (options.signal?.aborted) child.kill();
    });
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
    const nic = device.reachability?.discoveryInterface;
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
