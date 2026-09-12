import dgram, { RemoteInfo } from 'node:dgram';
import { Device, NICInfo } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';
import { classifySubnet } from '../engine/device_enrichment.ts';
import { DIFFERENT_NETWORK_MESSAGE } from '../../shared/network_relationship.ts';

export const ONVIF_MULTICAST_ADDRESS = '239.255.255.250';
export const ONVIF_DISCOVERY_PORT = 3702;

export interface UdpSocketLike {
  bind(options: { port: number; address: string; exclusive?: boolean }, callback: () => void): void;
  setMulticastInterface(address: string): void;
  addMembership?(address: string, interfaceAddress: string): void;
  send(message: Uint8Array | string, port: number, address: string, callback: (error?: Error | null) => void): void;
  on(event: 'message', listener: (message: Buffer, remote: RemoteInfo) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  off(event: 'message' | 'error', listener: (...args: any[]) => void): this;
  close(callback?: () => void): void;
}

export type UdpSocketFactory = () => UdpSocketLike;

export interface WsDiscoveryOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onDevice?: (device: Device, isNew: boolean) => void;
  socketFactory?: UdpSocketFactory;
  multicastSocketFactory?: UdpSocketFactory;
}

export interface WsDiscoveryResult {
  devices: Device[];
  interfaceErrors: Array<{ interfaceName: string; message: string }>;
  cancelled: boolean;
  messageCounts?: { acceptedProbeMatches: number; acceptedHellos: number; rejected: number };
}

export interface OnvifDiscoveryTransport {
  discover(interfaces: NICInfo[], options?: WsDiscoveryOptions): Promise<WsDiscoveryResult>;
}

function sameIdentity(left: Device, right: Device): boolean {
  const leftMac = left.anchor.macAddress?.toLowerCase();
  const rightMac = right.anchor.macAddress?.toLowerCase();
  if (leftMac && rightMac && leftMac === rightMac) return true;

  const leftUuid = left.anchor.onvifEndpointUuid?.toLowerCase();
  const rightUuid = right.anchor.onvifEndpointUuid?.toLowerCase();
  if (leftUuid && rightUuid && leftUuid === rightUuid) return true;

  const leftSerial = left.anchor.serialNumber?.toLowerCase();
  const rightSerial = right.anchor.serialNumber?.toLowerCase();
  return Boolean(leftSerial && rightSerial && leftSerial === rightSerial);
}

function identityConflicts(left: Device, right: Device): boolean {
  const leftMac = left.anchor.macAddress?.toLowerCase();
  const rightMac = right.anchor.macAddress?.toLowerCase();
  const leftUuid = left.anchor.onvifEndpointUuid?.toLowerCase();
  const rightUuid = right.anchor.onvifEndpointUuid?.toLowerCase();
  return Boolean(
    (leftMac && rightMac && leftMac !== rightMac) ||
    (leftUuid && rightUuid && leftUuid !== rightUuid)
  );
}

export function mergeDiscoveredDevice(
  devices: Device[],
  incoming: Device,
): { device: Device; isNew: boolean } {
  const existingIndex = devices.findIndex(device => sameIdentity(device, incoming));
  if (existingIndex < 0) {
    devices.push(incoming);
    return { device: incoming, isNew: true };
  }

  const existing = devices[existingIndex];
  if (identityConflicts(existing, incoming)) {
    const conflict = {
      detectedAt: new Date().toISOString(),
      reason: 'Conflicting MAC/UUID identity evidence',
      existingMac: existing.anchor.macAddress,
      incomingMac: incoming.anchor.macAddress,
      existingUuid: existing.anchor.onvifEndpointUuid,
      incomingUuid: incoming.anchor.onvifEndpointUuid,
    };
    existing.identityConflicts = [...(existing.identityConflicts || []), conflict];
    const separate = {
      ...incoming,
      id: devices.some(device => device.id === incoming.id)
        ? `${incoming.id}:conflict:${crypto.randomUUID()}`
        : incoming.id,
      identityConflicts: [...(incoming.identityConflicts || []), conflict],
    };
    devices.push(separate);
    return { device: separate, isNew: true };
  }
  const merged: Device = {
    ...existing,
    ...incoming,
    id: incoming.anchor.macAddress
      ? `mac:${incoming.anchor.macAddress.toLowerCase()}`
      : existing.anchor.macAddress
        ? `mac:${existing.anchor.macAddress.toLowerCase()}`
        : existing.id,
    firstSeenAt: existing.firstSeenAt,
    lastSeenAt: incoming.lastSeenAt,
    anchor: {
      ...existing.anchor,
      ...incoming.anchor,
      macAddress: incoming.anchor.macAddress || existing.anchor.macAddress,
      onvifEndpointUuid: incoming.anchor.onvifEndpointUuid || existing.anchor.onvifEndpointUuid,
      serialNumber: incoming.anchor.serialNumber || existing.anchor.serialNumber,
      vendor: incoming.anchor.vendor !== 'Unknown ONVIF Device'
        ? incoming.anchor.vendor
        : existing.anchor.vendor,
      model: incoming.anchor.model || existing.anchor.model,
    },
    network: {
      ...existing.network,
      ...incoming.network,
      xAddrs: Array.from(new Set([
        ...(existing.network.xAddrs || []),
        ...(incoming.network.xAddrs || []),
      ])),
    },
  };
  devices[existingIndex] = merged;
  return { device: merged, isNew: false };
}

export class NodeOnvifWsDiscoveryTransport implements OnvifDiscoveryTransport {
  public async discover(interfaces: NICInfo[], options: WsDiscoveryOptions = {}): Promise<WsDiscoveryResult> {
    const timeoutMs = options.timeoutMs ?? 3500;
    const socketFactory = options.socketFactory ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true }));
    const devices: Device[] = [];
    const interfaceErrors: WsDiscoveryResult['interfaceErrors'] = [];
    let cancelled = options.signal?.aborted ?? false;
    const messageCounts = { acceptedProbeMatches: 0, acceptedHellos: 0, rejected: 0 };
    const receive = (message: Buffer, remote: RemoteInfo, nic?: NICInfo, announcementOnly = false) => {
      const xml = message.toString('utf8');
      const hello = /<(?:\w+:)?Hello\b/.test(xml);
      const parsed = hello ? OnvifDriver.parseHello(xml, remote.address) : announcementOnly ? null : OnvifDriver.parseProbeMatch(xml, remote.address);
      if (!parsed?.id || !parsed.anchor || !parsed.network) { messageCounts.rejected++; return; }
      if (hello) messageCounts.acceptedHellos++; else messageCounts.acceptedProbeMatches++;
      const now = new Date().toISOString();
      const subnetClassification = nic ? classifySubnet(remote.address, nic.ipAddress, nic.netmask) : 'UNKNOWN';
      const device: Device = { ...parsed, id: parsed.id, anchor: parsed.anchor, network: parsed.network,
        status: subnetClassification === 'DIFFERENT_SUBNET' ? 'DIFFERENT_SUBNET' : hello ? 'UNKNOWN' : 'ONLINE',
        statusMessage: subnetClassification === 'DIFFERENT_SUBNET' ? DIFFERENT_NETWORK_MESSAGE : parsed.statusMessage,
        sessionVerification: hello ? 'NOT_VERIFIED' : 'VERIFIED',
        reachability: { subnetClassification, ...(hello ? { wsDiscoveryAnnouncedAt: now } : { wsDiscoveryRespondedAt: now, lastSuccessfulResponseAt: now }),
          discoveryInterface: nic ? { name: nic.name, ipAddress: nic.ipAddress, netmask: nic.netmask, interfaceIndex: nic.interfaceIndex } : undefined },
        discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now };
      const merged = mergeDiscoveredDevice(devices, device);
      options.onDevice?.(merged.device, merged.isNew);
    };

    const eligibleInterfaces = interfaces.filter(nic => !nic.isInternal && Boolean(nic.ipAddress));
    const announcements = this.listenAnnouncements(eligibleInterfaces, timeoutMs, options.multicastSocketFactory ?? socketFactory, options.signal,
      (message, remote) => {
        // dgram exposes no receiving interface index. Do not invent one for multi-adapter multicast.
        const nic = eligibleInterfaces.length === 1 ? eligibleInterfaces[0] : undefined;
        receive(message, remote, nic, true);
      }, interfaceErrors);
    await Promise.all([announcements, ...eligibleInterfaces.map(async nic => {
      try {
        await this.probeInterface(nic, timeoutMs, socketFactory, options.signal, (message, remote) => receive(message, remote, nic));
      } catch (error) {
        if (options.signal?.aborted) {
          cancelled = true;
          return;
        }
        interfaceErrors.push({
          interfaceName: nic.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })]);

    return { devices, interfaceErrors, messageCounts, cancelled: cancelled || Boolean(options.signal?.aborted) };
  }

  private listenAnnouncements(interfaces: NICInfo[], timeoutMs: number, factory: UdpSocketFactory, signal: AbortSignal | undefined,
    receive: (message: Buffer, remote: RemoteInfo) => void, warnings: WsDiscoveryResult['interfaceErrors']): Promise<void> {
    if (!interfaces.length || signal?.aborted) return Promise.resolve();
    return new Promise(resolve => {
      let socket: UdpSocketLike;
      try { socket = factory(); } catch { warnings.push({ interfaceName: 'Multicast listener', message: 'Unable to create WS-Discovery announcement socket.' }); resolve(); return; }
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', finish); socket.off('message', receive); socket.off('error', failure); try { socket.close(); } catch {} resolve(); };
      const failure = () => { warnings.push({ interfaceName: 'Multicast listener', message: 'WS-Discovery announcement listener failed; unicast probes remain available.' }); finish(); };
      socket.on('error', failure); socket.on('message', receive);
      signal?.addEventListener('abort', finish, { once: true });
      timer = setTimeout(finish, timeoutMs);
      try { socket.bind({ port: ONVIF_DISCOVERY_PORT, address: '0.0.0.0', exclusive: false }, () => {
        if (settled) return;
        for (const nic of interfaces) {
          try { if (!socket.addMembership) throw Error('Unsupported'); socket.addMembership(ONVIF_MULTICAST_ADDRESS, nic.ipAddress); }
          catch { warnings.push({ interfaceName: nic.name, message: 'Unable to join WS-Discovery multicast group on this adapter; unicast probes remain available.' }); }
        }
      }); } catch { failure(); }
    });
  }

  private probeInterface(
    nic: NICInfo,
    timeoutMs: number,
    socketFactory: UdpSocketFactory,
    signal: AbortSignal | undefined,
    onDevice: (message: Buffer, remote: RemoteInfo) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = socketFactory();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        socket.off('message', onMessage);
        socket.off('error', onError);
        try {
          socket.close();
        } catch {
          // Socket may already be closed by the platform.
        }
      };

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };

      const onAbort = () => finish();
      const onError = (error: Error) => finish(error);
      const onMessage = (message: Buffer, remote: RemoteInfo) => {
        if (!settled) onDevice(message, remote);
      };

      socket.on('message', onMessage);
      socket.on('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        finish();
        return;
      }

      socket.bind({ port: 0, address: nic.ipAddress, exclusive: true }, () => {
        if (settled) return;
        try {
          socket.setMulticastInterface(nic.ipAddress);
          const probe = OnvifDriver.createProbeEnvelope();
          socket.send(probe, ONVIF_DISCOVERY_PORT, ONVIF_MULTICAST_ADDRESS, error => {
            if (error) finish(error);
          });
          timer = setTimeout(() => finish(), timeoutMs);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}
