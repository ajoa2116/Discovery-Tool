import dgram, { RemoteInfo } from 'node:dgram';
import { Device, NICInfo } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';

export const ONVIF_MULTICAST_ADDRESS = '239.255.255.250';
export const ONVIF_DISCOVERY_PORT = 3702;

export interface UdpSocketLike {
  bind(options: { port: number; address: string; exclusive?: boolean }, callback: () => void): void;
  setMulticastInterface(address: string): void;
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
}

export interface WsDiscoveryResult {
  devices: Device[];
  interfaceErrors: Array<{ interfaceName: string; message: string }>;
  cancelled: boolean;
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

    const eligibleInterfaces = interfaces.filter(nic => !nic.isInternal && Boolean(nic.ipAddress));
    await Promise.all(eligibleInterfaces.map(async nic => {
      try {
        await this.probeInterface(nic, timeoutMs, socketFactory, options.signal, discovered => {
          const merged = mergeDiscoveredDevice(devices, discovered);
          options.onDevice?.(merged.device, merged.isNew);
        });
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
    }));

    return { devices, interfaceErrors, cancelled: cancelled || Boolean(options.signal?.aborted) };
  }

  private probeInterface(
    nic: NICInfo,
    timeoutMs: number,
    socketFactory: UdpSocketFactory,
    signal: AbortSignal | undefined,
    onDevice: (device: Device) => void,
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
        const parsed = OnvifDriver.parseProbeMatch(message.toString('utf8'), remote.address);
        if (!parsed?.id || !parsed.anchor || !parsed.network) return;
        const now = new Date().toISOString();
        onDevice({
          ...parsed,
          anchor: parsed.anchor,
          network: parsed.network,
          id: parsed.id,
          status: 'ONLINE',
          reachability: {
            wsDiscoveryRespondedAt: now,
            lastSuccessfulResponseAt: now,
            discoveryInterface: {
              name: nic.name,
              ipAddress: nic.ipAddress,
              netmask: nic.netmask,
              interfaceIndex: nic.interfaceIndex,
            },
          },
          discoveredPhase: 3,
          firstSeenAt: now,
          lastSeenAt: now,
        } as Device);
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
