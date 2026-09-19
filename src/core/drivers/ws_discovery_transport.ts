import { canonicalAnchor, mergeAnchors, selectIdentity } from '../../shared/identity_policy.ts';
import os from 'node:os';
import { EvidenceProvenance, packetProvenance } from '../../shared/evidence_provenance.ts';
import { DiscoveryContext } from '../../shared/discovery_session.ts';
import { wsDiscoveryEvidence, WsDiscoveryEvidence, safeSocketCode } from './ws_discovery_evidence.ts';
import { isUtf8 } from 'node:buffer';
import { discoveryMessageKind, inspectDiscoveryHello, inspectDiscoveryMetadata } from './ws_discovery_hello.ts';
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
  address?(): {address:string;port:number;family?:string};
  on(event: 'close' | 'listening', listener: () => void): this;
  bind(options: { port: number; address: string; exclusive?: boolean }, callback: () => void): void;
  setMulticastInterface(address: string): void;
  addMembership?(address: string, interfaceAddress: string): void;
  send(message: Uint8Array | string, port: number, address: string, callback: (error?: Error | null) => void): void;
  on(event: 'message', listener: (message: Buffer, remote: RemoteInfo) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  off(event: 'message' | 'error' | 'close' | 'listening', listener: (...args: any[]) => void): this;
  close(callback?: () => void): void;
}

export type UdpSocketFactory = () => UdpSocketLike;

export interface WsDiscoveryOptions {
  provenance?: EvidenceProvenance;
  strategy?: 'WILDCARD_SELECTED' | 'WILDCARD_ALL' | 'ADAPTER_SPECIFIC' | 'WILDCARD_EXCLUSIVE' | 'SINGLE_MEMBERSHIP';
  awaitSocketClose?: boolean;
  localAddresses?: string[];
  context?: DiscoveryContext;
  evidence?: WsDiscoveryEvidence;
  purpose?: 'DISCOVERY' | 'RECEIVE_TRACE_ONLY';
  onTraceSession?: (windowId:string) => void;
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

export function mergeDiscoveredDevice(
  devices: Device[],
  incoming: Device,
): { device: Device; isNew: boolean } {
  incoming={...incoming,anchor:canonicalAnchor(incoming.anchor)};
  const eligible=devices.filter(d=>(d.evidenceProvenance||'PHYSICAL_NETWORK')===(incoming.evidenceProvenance||'PHYSICAL_NETWORK'));
  const selection=selectIdentity(eligible,incoming);
  if(selection.index<0){
    if(selection.related.length){
      const conflict={detectedAt:new Date().toISOString(),reason:selection.ambiguous?'Ambiguous physical identity matches':'Conflicting MAC/UUID identity evidence',existingMac:selection.related[0].anchor.macAddress,incomingMac:incoming.anchor.macAddress,existingUuid:selection.related[0].anchor.onvifEndpointUuid,incomingUuid:incoming.anchor.onvifEndpointUuid};
      for(const related of selection.related)related.identityConflicts=[...(related.identityConflicts||[]),conflict];
      incoming={...incoming,identityConflicts:[...(incoming.identityConflicts||[]),conflict]};
      if(devices.some(d=>d.id===incoming.id))incoming.id=`${incoming.id}:conflict:${crypto.randomUUID()}`;
    }
    devices.push(incoming);return {device:incoming,isNew:true};
  }
  const existing=eligible[selection.index],existingIndex=devices.indexOf(existing);
  const merged: Device = {
    ...existing,
    ...incoming,
    id: existing.id,
    firstSeenAt: existing.firstSeenAt,
    lastSeenAt: incoming.lastSeenAt,
    anchor: {...mergeAnchors(existing.anchor,incoming.anchor),vendor:incoming.anchor.vendor==='Unknown ONVIF Device'?existing.anchor.vendor:incoming.anchor.vendor},
    technician: {...incoming.technician,...existing.technician},
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
    const provenance:EvidenceProvenance=options.provenance || (options.purpose==='RECEIVE_TRACE_ONLY'?'SUPPORT_DIAGNOSTIC':options.socketFactory||options.multicastSocketFactory?'SYNTHETIC_TEST':'PHYSICAL_NETWORK');
    const localAddresses=new Set([...interfaces.map(n=>n.ipAddress),...(options.localAddresses||[])]);
    try {for(const nic of Object.values(os.networkInterfaces()).flat())if(nic?.family==='IPv4')localAddresses.add(nic.address);}catch {}
    const isLocal=(address:string)=>localAddresses.has(address)||/^127\./.test(address);
    const closeWaits:Promise<void>[]=[];
    const strategy=options.strategy || (interfaces.length>1?'WILDCARD_ALL':'WILDCARD_SELECTED');
    if(strategy==='ADAPTER_SPECIFIC'&&(options.purpose!=='RECEIVE_TRACE_ONLY'||interfaces.length!==1))throw Error('Adapter-specific binding requires a single-adapter support session.');
    if(['WILDCARD_EXCLUSIVE','SINGLE_MEMBERSHIP'].includes(strategy)&&(options.purpose!=='RECEIVE_TRACE_ONLY'||interfaces.length!==1))throw Error('Single-adapter support strategy required.');
    const evidence=options.evidence || wsDiscoveryEvidence;
    const session=evidence.begin(options.context,interfaces,timeoutMs,options.purpose);
    session.provenance=provenance;session.strategy=strategy;session.processId=process.pid;
    options.onTraceSession?.(session.windowId);
    const localProbeIds=new Set<string>();
    const started=Date.now();
    const trace:DiscoveryTrace={windowId:session.windowId,createdAt:new Date(started).toISOString(),timeoutMs,droppedEvents:0,events:[]};
    const record=(stage:string,fields:Omit<DiscoveryTraceEvent,'stage'|'elapsedMs'>={})=>{if(trace.events.length<128)trace.events.push({stage,elapsedMs:Date.now()-started,...fields});else trace.droppedEvents++};
    const socketFactory = options.socketFactory ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true }));
    const trackedFactory = (factory:UdpSocketFactory, kind:'ANNOUNCEMENT'|'PROBE', nic?:NICInfo):UdpSocketFactory => () => {
      let closedResolve:()=>void=()=>{};
      const closedPromise=new Promise<void>(resolve=>{closedResolve=resolve;});
      const socketId=crypto.randomUUID(),details:Record<string,unknown>={socketId,kind,type:'udp4',reuseAddr:options.socketFactory||options.multicastSocketFactory?'INJECTED_FACTORY':true,adapterAlias:nic?.name.slice(0,80),interfaceIndex:nic?.interfaceIndex,adapterIPv4:nic?.ipAddress,memberships:[],localAddress:null,localPort:null};
      if(session.sockets.length<32)session.sockets.push(details);
      const event=(stage:string,fields:Record<string,unknown>={})=>evidence.event(session.windowId,stage,{socketId,...fields});
      let socket:UdpSocketLike;
      try {socket=factory();event('SOCKET_CREATED');}catch(error){session.counters.socketErrorCount++;event('SOCKET_CREATE_FAILED',{code:safeSocketCode(error)});throw error;}
      const observe=(message:Buffer,remote:RemoteInfo)=>{
        session.counters.datagramsReceived++;
        const xml=isUtf8(message)?message.toString('utf8'):null,xmlLike=xml!==null&&xml.trimStart().startsWith('<');
        const metadata=xmlLike?inspectDiscoveryMetadata(xml!):{soapParsed:false,actionFound:false,kind:'UNKNOWN',messageId:''};
        const self=isLocal(remote.address);
        const packetOrigin=packetProvenance(xml||'',provenance);
        if(!self&&!session.externalSourceIPs.includes(remote.address)&&session.externalSourceIPs.length<16)session.externalSourceIPs.push(remote.address);
        if(self)session.counters.selfDatagrams++;else {session.counters.externalDatagrams++;session.firstExternalDatagramAt ||= new Date().toISOString();}
        if(self&&metadata.kind==='PROBE')session.firstSelfProbeAt ||= new Date().toISOString();
        if(metadata.kind==='HELLO')session.firstHelloAt ||= new Date().toISOString();
        if(metadata.kind==='HELLO')session.counters.helloCount++;
        if(metadata.kind==='PROBE_MATCH')session.counters.probeMatchCount++;
        if(!metadata.soapParsed)session.counters.parseErrorCount++;
        const {messageId: _privateMessageId,...safeMetadata}=metadata;
        const datagram={provenance:packetOrigin,correlatedOwnProbe:metadata.kind==='PROBE'&&localProbeIds.has(metadata.messageId),stage:'UDP_DATAGRAM_RECEIVED',socketId,sequence:session.counters.datagramsReceived,sourceIp:remote.address,sourcePort:remote.port,bytes:message.length,classification:xml===null?'UNKNOWN':xmlLike?'XML':'NON_XML',appearsSoap:Boolean(xml&&/<(?:[\w.-]+:)?Envelope\b/.test(xml)),selfTraffic:self,adapterAlias:nic?.name.slice(0,80),interfaceIndex:nic?.interfaceIndex,configuredAdapterIPv4:nic?.ipAddress,ingressInterface:'NOT_EXPOSED_BY_NODE',listenerMulticastGroup:ONVIF_MULTICAST_ADDRESS,listenerLocalPort:details.localPort,destinationAddress:'NOT_EXPOSED_BY_NODE',...safeMetadata};
        evidence.datagram(session.windowId,datagram);event('UDP_DATAGRAM_RECEIVED',{sourceIp:remote.address,bytes:message.length,selfTraffic:self,sequence:session.counters.datagramsReceived});
        if(metadata.soapParsed)evidence.parser(session.windowId,'SOAP_PARSED',{sequence:session.counters.datagramsReceived});
        evidence.parser(session.windowId,'ACTION_CLASSIFIED',{sequence:session.counters.datagramsReceived,...safeMetadata});
      };
      const error=(reason:Error)=>{session.counters.socketErrorCount++;details.errorCode=safeSocketCode(reason);event('SOCKET_ERROR',{code:details.errorCode});};
      const listening=()=>{try{const bound=socket.address?.();if(bound){details.localAddress=bound.address;details.localPort=bound.port;details.family=bound.family;}event('SOCKET_READY',{localAddress:details.localAddress,localPort:details.localPort,addressEvidence:bound?'SOCKET_ADDRESS':'UNAVAILABLE'});}catch{event('SOCKET_ADDRESS_UNAVAILABLE');}};
      const closed=()=>{closedResolve();details.closedAt=new Date().toISOString();event('SOCKET_CLOSED',{reason:details.closeReason||'EXTERNAL_CLOSE'});socket.off('close',closed);};
      closeWaits.push(closedPromise);
      socket.on('message',observe);socket.on('error',error);socket.on('close',closed);event('RECEIVE_HANDLER_ATTACHED');
      const wrapped:UdpSocketLike={
        address:()=>socket.address!(),
        bind:(binding,callback)=>{details.intendedBindAddress=binding.address;details.intendedBindPort=binding.port;details.nodeExclusive=binding.exclusive;event('BIND_ATTEMPT',{...binding});try{socket.bind(binding,()=>{listening();details.openedAt=new Date().toISOString();event('RECEIVE_WINDOW_OPEN');callback();});}catch(reason){error(reason as Error);throw reason;}},
        addMembership:(group,local)=>{const membership:Record<string,unknown>={group,interfaceIPv4:local,attemptedAt:new Date().toISOString(),status:'ATTEMPTED'};if((details.memberships as unknown[]).length<32)(details.memberships as unknown[]).push(membership);event('MULTICAST_JOIN_ATTEMPT',{group,interfaceIPv4:local});try{if(!socket.addMembership)throw Error();socket.addMembership(group,local);membership.status='JOINED';event('MULTICAST_JOIN_SUCCEEDED',{group,interfaceIPv4:local});}catch(reason){membership.status='FAILED';membership.code=safeSocketCode(reason);session.counters.socketErrorCount++;event('MULTICAST_JOIN_FAILED',{group,interfaceIPv4:local,code:membership.code});throw reason;}},
        setMulticastInterface:local=>{details.outboundInterface=local;event('OUTBOUND_INTERFACE_SET',{interfaceIPv4:local});try{socket.setMulticastInterface(local);}catch(reason){error(reason as Error);throw reason;}},
        send:(message,port,address,callback)=>{const id=inspectDiscoveryMetadata(String(message)).messageId;if(id)localProbeIds.add(id);event('PROBE_SEND_ATTEMPT',{address,port});try{socket.send(message,port,address,reason=>{if(reason)session.counters.socketErrorCount++;event(reason?'PROBE_SEND_FAILED':'PROBE_SENT',reason?{code:safeSocketCode(reason)}:{});callback(reason);});}catch(reason){session.counters.socketErrorCount++;event('PROBE_SEND_FAILED',{code:safeSocketCode(reason)});throw reason;}},
        on:((name:any,listener:any)=>{socket.on(name,listener);return wrapped;}) as UdpSocketLike['on'],
        off:(name,listener)=>{socket.off(name,listener);return wrapped;},
        close:callback=>{details.closeRequestedAt=new Date().toISOString();details.closeReason=options.signal?.aborted?'CANCELLED':details.errorCode?'SOCKET_ERROR':'WINDOW_FINISHED';event('SOCKET_CLOSE_REQUESTED',{reason:details.closeReason});socket.off('message',observe);socket.off('error',error);try{socket.close(callback);}catch(reason){session.counters.socketErrorCount++;event('SOCKET_CLOSE_FAILED',{code:safeSocketCode(reason)});if(safeSocketCode(reason)==='ERR_SOCKET_DGRAM_NOT_RUNNING'){closedResolve();details.closedAt=new Date().toISOString();details.closeConfirmation='SOCKET_NOT_RUNNING';socket.off('close',closed);}throw reason;}},
      };
      return wrapped;
    };
    const devices: Device[] = [];
    const interfaceErrors: WsDiscoveryResult['interfaceErrors'] = [];
    let cancelled = options.signal?.aborted ?? false;
    const messageCounts = { acceptedProbeMatches: 0, acceptedHellos: 0, rejected: 0 };
    const receive = (message: Buffer, remote: RemoteInfo, nic?: NICInfo, announcementOnly = false) => {
      const metadata={socket:announcementOnly?'ANNOUNCEMENT':'PROBE',adapter:nic?.name.slice(0,80),sourceIp:remote.address,sourcePort:remote.port,bytes:message.length};
      record('UDP_RECEIVED',metadata);
      if(!isUtf8(message)){messageCounts.rejected++;session.counters.rejectedCount++;evidence.parser(session.windowId,'CANDIDATE_REJECTED',{reason:'INVALID_UTF8'});record('CANDIDATE_REJECTED',{...metadata,reason:'INVALID_UTF8'});return;}
      const xml = message.toString('utf8');
      const packetOrigin=packetProvenance(xml,provenance);
      const kind=discoveryMessageKind(xml);
      const hello=kind==='HELLO'||(kind==='UNKNOWN'&&/<(?:[A-Za-z_][\w.-]*:)?Hello\b/.test(xml));
      const inspection=hello?inspectDiscoveryHello(xml,remote.address):null;
      for(const stage of inspection?.stages || [])record(stage,{...metadata,metadataVersion:inspection?.metadataVersion});
      const legacyProbe=kind==='UNKNOWN'&&!/<(?:[A-Za-z_][\w.-]*:)?Action\b/.test(xml)&&/<(?:[A-Za-z_][\w.-]*:)?ProbeMatch\b/.test(xml);
      const parsed=inspection?.device || (!announcementOnly&&(kind==='PROBE_MATCH'||legacyProbe)?OnvifDriver.parseProbeMatch(xml,remote.address):null);
      if (!parsed?.id || !parsed.anchor || !parsed.network) { messageCounts.rejected++;session.counters.rejectedCount++;evidence.parser(session.windowId,'CANDIDATE_REJECTED',{reason:inspection?.reason || 'UNSUPPORTED_OR_MALFORMED_MESSAGE',sourceIp:remote.address,sequence:session.counters.datagramsReceived});record('CANDIDATE_REJECTED',{...metadata,reason:inspection?.reason || 'UNSUPPORTED_OR_MALFORMED_MESSAGE'});return; }
      if(isLocal(parsed.network.ipAddress) || (isLocal(remote.address)&&packetOrigin==='PHYSICAL_NETWORK')){messageCounts.rejected++;session.counters.rejectedCount++;evidence.parser(session.windowId,'CANDIDATE_REJECTED',{reason:'LOCAL_HOST',sequence:session.counters.datagramsReceived});record('CANDIDATE_REJECTED',{...metadata,reason:'LOCAL_HOST'});return;}
      if (hello) messageCounts.acceptedHellos++; else messageCounts.acceptedProbeMatches++;
      const now = new Date().toISOString();
      // Compare the advertised endpoint, not the UDP sender. Multi-NIC reception does not identify an ingress NIC.
      const subnetClassification = nic ? classifySubnet(parsed.network.ipAddress, nic.ipAddress, nic.netmask)
        : interfaces.length && interfaces.every(local=>classifySubnet(parsed.network!.ipAddress,local.ipAddress,local.netmask)==='DIFFERENT_SUBNET') ? 'DIFFERENT_SUBNET' : 'UNKNOWN';
      const device: Device = { ...parsed, evidenceProvenance:packetOrigin, id: parsed.id, anchor: parsed.anchor, network: parsed.network,
        status: subnetClassification === 'DIFFERENT_SUBNET' ? 'DIFFERENT_SUBNET' : hello ? 'UNKNOWN' : 'ONLINE',
        statusMessage: subnetClassification === 'DIFFERENT_SUBNET' ? DIFFERENT_NETWORK_MESSAGE : parsed.statusMessage,
        sessionVerification: hello ? 'NOT_VERIFIED' : 'VERIFIED',
        reachability: { subnetClassification, discoverySource:{ipAddress:remote.address,port:remote.port,payloadBytes:message.length,kind:hello?'HELLO':'PROBE_MATCH'}, ...(hello ? { wsDiscoveryAnnouncedAt: now } : { wsDiscoveryRespondedAt: now, lastSuccessfulResponseAt: now }),
          discoveryInterface: nic ? { name: nic.name, ipAddress: nic.ipAddress, netmask: nic.netmask, interfaceIndex: nic.interfaceIndex } : undefined },
        discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now };
      // Capture only anchors co-present in this raw response, before transport merge.
      const packetAnchor=canonicalAnchor(parsed.anchor);
      if(packetAnchor.macAddress&&packetAnchor.onvifEndpointUuid&&nic?.interfaceIndex!==undefined) {
        device.reachability!.identityObservation={source:'WS_DISCOVERY',ipAddress:device.network.ipAddress,interfaceIndex:nic.interfaceIndex,observedAt:now,anchor:structuredClone(packetAnchor)};
      }
      const merged = mergeDiscoveredDevice(devices, device);
      evidence.parser(session.windowId,hello?'HELLO_PARSED':'PROBE_MATCH_PARSED',{sequence:session.counters.datagramsReceived});
      evidence.parser(session.windowId,'XADDR_EXTRACTED',{address:device.network.ipAddress,sequence:session.counters.datagramsReceived});
      evidence.parser(session.windowId,'CANDIDATE_CREATED',{provenance:packetOrigin,address:device.network.ipAddress,classification:device.status,verification:device.sessionVerification,sequence:session.counters.datagramsReceived});
      if(options.purpose==='RECEIVE_TRACE_ONLY')evidence.parser(session.windowId,'INVENTORY_NOT_REQUESTED',{reason:'SUPPORT_RECEIVE_TRACE_ONLY'});
      record('CANDIDATE_ACCEPTED',{...metadata,address:device.network.ipAddress,classification:device.reachability?.subnetClassification});
      try{if(options.purpose!=='RECEIVE_TRACE_ONLY')options.onDevice?.(merged.device, merged.isNew)}catch{evidence.parser(session.windowId,'INVENTORY_REJECTED',{reason:'PIPELINE_CALLBACK_FAILED'});record('DELIVERY_FAILED',{...metadata,reason:'PIPELINE_CALLBACK_FAILED'});interfaceErrors.push({interfaceName:nic?.name || 'Multicast listener',message:'A discovery candidate could not be delivered to the inventory pipeline.'})}
    };

    const eligibleInterfaces = interfaces.filter(nic => !nic.isInternal && Boolean(nic.ipAddress));
    const announcements = this.listenAnnouncements(eligibleInterfaces, timeoutMs, trackedFactory(options.multicastSocketFactory ?? socketFactory,'ANNOUNCEMENT'), options.signal,
      (message, remote) => {
        // dgram exposes no receiving interface index. Do not invent one for multi-adapter multicast.
        const nic = eligibleInterfaces.length === 1 ? eligibleInterfaces[0] : undefined;
        receive(message, remote, nic, true);
      }, interfaceErrors, record, strategy==='ADAPTER_SPECIFIC'?eligibleInterfaces[0]?.ipAddress:'0.0.0.0',strategy==='WILDCARD_EXCLUSIVE');
    await Promise.all([announcements, ...(options.announcementOnly ? [] : eligibleInterfaces).map(async nic => {
      try {
        await this.probeInterface(nic, timeoutMs, trackedFactory(socketFactory,'PROBE',nic), options.signal, (message, remote) => receive(message, remote, nic), record);
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

    if(options.awaitSocketClose){
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([Promise.all(closeWaits),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SOCKET_CLOSE_NOT_CONFIRMED')),1000);})]);}catch(error){evidence.end(session.windowId,'SOCKET_CLOSE_NOT_CONFIRMED');throw error;}finally{if(timer)clearTimeout(timer);}
    }
    trace.closedAt=new Date().toISOString();record('WINDOW_CLOSED',{reason:options.signal?.aborted?'CANCELLED':'COMPLETED'});
    evidence.end(session.windowId,options.signal?.aborted?'CANCELLED':session.counters.socketErrorCount?'WINDOW_FINISHED_WITH_ERRORS':'DEADLINE');
    return { devices, interfaceErrors, messageCounts, trace, cancelled: cancelled || Boolean(options.signal?.aborted) };
  }

  private listenAnnouncements(interfaces: NICInfo[], timeoutMs: number, factory: UdpSocketFactory, signal: AbortSignal | undefined,
    receive: (message: Buffer, remote: RemoteInfo) => void, warnings: WsDiscoveryResult['interfaceErrors'], record:(stage:string,fields?:Omit<DiscoveryTraceEvent,'stage'|'elapsedMs'>)=>void, bindAddress='0.0.0.0', exclusive=false): Promise<void> {
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
      try { socket.bind({ port: ONVIF_DISCOVERY_PORT, address: bindAddress, exclusive }, () => {
        if (settled) return;
        record('WINDOW_OPENED',{socket:'ANNOUNCEMENT',address:bindAddress});
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
