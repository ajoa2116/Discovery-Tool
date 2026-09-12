import { isUtf8 } from 'node:buffer';
import { discoveryMessageKind, inspectDiscoveryHello } from './ws_discovery_hello.ts';
import dgram, { RemoteInfo } from 'node:dgram';
import { Device, NICInfo } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';
import { classifySubnet } from '../engine/device_enrichment.ts';
import { DIFFERENT_NETWORK_MESSAGE } from '../../shared/network_relationship.ts';

export const ONVIF_MULTICAST_ADDRESS = '239.255.255.250';
export const ONVIF_DISCOVERY_PORT = 3702;
export const DEFAULT_DISCOVERY_WINDOW_MS = 10_000;
export interface DiscoveryTraceEvent { stage:string; elapsedMs:number; socket?:string; adapter?:string; address?:string; sourceIp?:string; sourcePort?:number; bytes?:number; reason?:string; classification?:string; metadataVersion?:number }
export interface DiscoveryTrace { windowId:string; createdAt:string; closedAt?:string; timeoutMs:number; droppedEvents:number; events:DiscoveryTraceEvent[] }

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
  announcementOnly?: boolean;
  signal?: AbortSignal;
  onDevice?: (device: Device, isNew: boolean) => void;
  socketFactory?: UdpSocketFactory;
  multicastSocketFactory?: UdpSocketFactory;
}

export interface WsDiscoveryResult {
  devices: Device[];
  interfaceErrors: Array<{ interfaceName: string; message: string }>;
  cancelled: boolean;
  trace?: DiscoveryTrace;
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
  return Boolean(leftSerial && rightSerial && leftSerial === rightSerial) || (left.id.startsWith('session:') && left.id === right.id && !leftMac && !rightMac && !leftUuid && !rightUuid);
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
    const timeoutMs = Math.min(30_000, Math.max(1, options.timeoutMs ?? DEFAULT_DISCOVERY_WINDOW_MS));
    const started=Date.now();
    const trace:DiscoveryTrace={windowId:crypto.randomUUID(),createdAt:new Date(started).toISOString(),timeoutMs,droppedEvents:0,events:[]};
    const record=(stage:string,fields:Omit<DiscoveryTraceEvent,'stage'|'elapsedMs'>={})=>{if(trace.events.length<128)trace.events.push({stage,elapsedMs:Date.now()-started,...fields});else trace.droppedEvents++};
    const socketFactory = options.socketFactory ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true }));
    const devices: Device[] = [];
    const interfaceErrors: WsDiscoveryResult['interfaceErrors'] = [];
    let cancelled = options.signal?.aborted ?? false;
    const messageCounts = { acceptedProbeMatches: 0, acceptedHellos: 0, rejected: 0 };
    const receive = (message: Buffer, remote: RemoteInfo, nic?: NICInfo, announcementOnly = false) => {
      const metadata={socket:announcementOnly?'ANNOUNCEMENT':'PROBE',adapter:nic?.name.slice(0,80),sourceIp:remote.address,sourcePort:remote.port,bytes:message.length};
      record('UDP_RECEIVED',metadata);
      if(!isUtf8(message)){messageCounts.rejected++;record('CANDIDATE_REJECTED',{...metadata,reason:'INVALID_UTF8'});return;}
      const xml = message.toString('utf8');
      const kind=discoveryMessageKind(xml);
      const hello=kind==='HELLO'||(kind==='UNKNOWN'&&/<(?:[A-Za-z_][\w.-]*:)?Hello\b/.test(xml));
      const inspection=hello?inspectDiscoveryHello(xml,remote.address):null;
      for(const stage of inspection?.stages || [])record(stage,{...metadata,metadataVersion:inspection?.metadataVersion});
      const legacyProbe=kind==='UNKNOWN'&&!/<(?:[A-Za-z_][\w.-]*:)?Action\b/.test(xml)&&/<(?:[A-Za-z_][\w.-]*:)?ProbeMatch\b/.test(xml);
      const parsed=inspection?.device || (!announcementOnly&&(kind==='PROBE_MATCH'||legacyProbe)?OnvifDriver.parseProbeMatch(xml,remote.address):null);
      if (!parsed?.id || !parsed.anchor || !parsed.network) { messageCounts.rejected++;record('CANDIDATE_REJECTED',{...metadata,reason:inspection?.reason || 'UNSUPPORTED_OR_MALFORMED_MESSAGE'});return; }
      if(interfaces.some(local=>local.ipAddress===parsed.network!.ipAddress || local.ipAddress===remote.address)){messageCounts.rejected++;record('CANDIDATE_REJECTED',{...metadata,reason:'LOCAL_HOST'});return;}
      if (hello) messageCounts.acceptedHellos++; else messageCounts.acceptedProbeMatches++;
      const now = new Date().toISOString();
      // Compare the advertised endpoint, not the UDP sender. Multi-NIC reception does not identify an ingress NIC.
      const subnetClassification = nic ? classifySubnet(parsed.network.ipAddress, nic.ipAddress, nic.netmask)
        : interfaces.length && interfaces.every(local=>classifySubnet(parsed.network!.ipAddress,local.ipAddress,local.netmask)==='DIFFERENT_SUBNET') ? 'DIFFERENT_SUBNET' : 'UNKNOWN';
      const device: Device = { ...parsed, id: parsed.id, anchor: parsed.anchor, network: parsed.network,
        status: subnetClassification === 'DIFFERENT_SUBNET' ? 'DIFFERENT_SUBNET' : hello ? 'UNKNOWN' : 'ONLINE',
        statusMessage: subnetClassification === 'DIFFERENT_SUBNET' ? DIFFERENT_NETWORK_MESSAGE : parsed.statusMessage,
        sessionVerification: hello ? 'NOT_VERIFIED' : 'VERIFIED',
        reachability: { subnetClassification, discoverySource:{ipAddress:remote.address,port:remote.port,payloadBytes:message.length,kind:hello?'HELLO':'PROBE_MATCH'}, ...(hello ? { wsDiscoveryAnnouncedAt: now } : { wsDiscoveryRespondedAt: now, lastSuccessfulResponseAt: now }),
          discoveryInterface: nic ? { name: nic.name, ipAddress: nic.ipAddress, netmask: nic.netmask, interfaceIndex: nic.interfaceIndex } : undefined },
        discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now };
      const merged = mergeDiscoveredDevice(devices, device);
      record('CANDIDATE_ACCEPTED',{...metadata,address:device.network.ipAddress,classification:device.reachability?.subnetClassification});
      try{options.onDevice?.(merged.device, merged.isNew)}catch{record('DELIVERY_FAILED',{...metadata,reason:'PIPELINE_CALLBACK_FAILED'});interfaceErrors.push({interfaceName:nic?.name || 'Multicast listener',message:'A discovery candidate could not be delivered to the inventory pipeline.'})}
    };

    const eligibleInterfaces = interfaces.filter(nic => !nic.isInternal && Boolean(nic.ipAddress));
    const announcements = this.listenAnnouncements(eligibleInterfaces, timeoutMs, options.multicastSocketFactory ?? socketFactory, options.signal,
      (message, remote) => {
        // dgram exposes no receiving interface index. Do not invent one for multi-adapter multicast.
        const nic = eligibleInterfaces.length === 1 ? eligibleInterfaces[0] : undefined;
        receive(message, remote, nic, true);
      }, interfaceErrors, record);
    await Promise.all([announcements, ...(options.announcementOnly ? [] : eligibleInterfaces).map(async nic => {
      try {
        await this.probeInterface(nic, timeoutMs, socketFactory, options.signal, (message, remote) => receive(message, remote, nic), record);
      } catch (error) {
        if (options.signal?.aborted) {
          cancelled = true;
          return;
        }
        interfaceErrors.push({
          interfaceName: nic.name,
          message: 'WS-Discovery probe socket failed; other adapters remain available.',
        });
      }
    })]);

    trace.closedAt=new Date().toISOString();record('WINDOW_CLOSED',{reason:options.signal?.aborted?'CANCELLED':'COMPLETED'});
    return { devices, interfaceErrors, messageCounts, trace, cancelled: cancelled || Boolean(options.signal?.aborted) };
  }

  private listenAnnouncements(interfaces: NICInfo[], timeoutMs: number, factory: UdpSocketFactory, signal: AbortSignal | undefined,
    receive: (message: Buffer, remote: RemoteInfo) => void, warnings: WsDiscoveryResult['interfaceErrors'], record:(stage:string,fields?:Omit<DiscoveryTraceEvent,'stage'|'elapsedMs'>)=>void): Promise<void> {
    if (!interfaces.length || signal?.aborted) return Promise.resolve();
    return new Promise(resolve => {
      let socket: UdpSocketLike;
      try { socket = factory(); record('SOCKET_CREATED',{socket:'ANNOUNCEMENT'}); } catch { record('SOCKET_FAILED',{socket:'ANNOUNCEMENT',reason:'CREATE_FAILED'}); warnings.push({ interfaceName: 'Multicast listener', message: 'Unable to create WS-Discovery announcement socket.' }); resolve(); return; }
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => { if (settled) return; settled = true; record('SOCKET_CLOSED',{socket:'ANNOUNCEMENT'}); clearTimeout(timer); signal?.removeEventListener('abort', finish); socket.off('message', receive); socket.off('error', failure); try { socket.close(); } catch {} resolve(); };
      const failure = () => { record('SOCKET_FAILED',{socket:'ANNOUNCEMENT',reason:'BIND_OR_RECEIVE_FAILED'}); warnings.push({ interfaceName: 'Multicast listener', message: 'WS-Discovery announcement listener failed; unicast probes remain available.' }); finish(); };
      socket.on('error', failure); socket.on('message', receive);
      signal?.addEventListener('abort', finish, { once: true });
      timer = setTimeout(finish, timeoutMs);
      try { socket.bind({ port: ONVIF_DISCOVERY_PORT, address: '0.0.0.0', exclusive: false }, () => {
        if (settled) return;
        record('WINDOW_OPENED',{socket:'ANNOUNCEMENT',address:'0.0.0.0'});
        for (const nic of interfaces) {
          try { if (!socket.addMembership) throw Error('Unsupported'); socket.addMembership(ONVIF_MULTICAST_ADDRESS, nic.ipAddress);record('MEMBERSHIP_JOINED',{socket:'ANNOUNCEMENT',adapter:nic.name.slice(0,80),address:nic.ipAddress}); }
          catch { record('MEMBERSHIP_FAILED',{socket:'ANNOUNCEMENT',adapter:nic.name.slice(0,80),reason:'JOIN_FAILED'}); warnings.push({ interfaceName: nic.name, message: 'Unable to join WS-Discovery multicast group on this adapter; unicast probes remain available.' }); }
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
    record:(stage:string,fields?:Omit<DiscoveryTraceEvent,'stage'|'elapsedMs'>)=>void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket:UdpSocketLike;
      try{socket=socketFactory();record('SOCKET_CREATED',{socket:'PROBE',adapter:nic.name.slice(0,80),address:nic.ipAddress})}catch{record('SOCKET_FAILED',{socket:'PROBE',reason:'CREATE_FAILED',adapter:nic.name.slice(0,80)});reject(Error('Unable to create discovery socket.'));return}
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
        record(error?'SOCKET_FAILED':'SOCKET_CLOSED',{socket:'PROBE',adapter:nic.name.slice(0,80),reason:error?'BIND_SEND_OR_RECEIVE_FAILED':undefined});
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

      timer = setTimeout(() => finish(), timeoutMs);
      try { socket.bind({ port: 0, address: nic.ipAddress, exclusive: true }, () => {
        if (settled) return;
        try {
          record('WINDOW_OPENED',{socket:'PROBE',adapter:nic.name.slice(0,80),address:nic.ipAddress});
          socket.setMulticastInterface(nic.ipAddress);
          const probe = OnvifDriver.createProbeEnvelope();
          socket.send(probe, ONVIF_DISCOVERY_PORT, ONVIF_MULTICAST_ADDRESS, error => {
            if (error) finish(error);
          });

        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }); } catch { finish(Error('Unable to bind discovery socket.')); }
    });
  }
}
