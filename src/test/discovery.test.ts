import { EventEmitter } from 'node:events';
import { RemoteInfo } from 'node:dgram';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import {
  mergeDiscoveredDevice,
  NodeOnvifWsDiscoveryTransport,
  UdpSocketLike,
} from '../core/drivers/ws_discovery_transport.ts';
import { Device, NICInfo } from '../types/index.ts';
import { DisabledPassiveDiscoveryProvider } from '../core/engine/phase2_passive.ts';

const uuid1 = '11111111-2222-3333-4444-555555555555';
const uuid2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function probeMatch(uuid: string, ip: string, options: { mac?: string; name?: string; model?: string } = {}): string {
  const scopes = [
    options.mac ? `onvif://www.onvif.org/MAC/${options.mac}` : '',
    options.name ? `onvif://www.onvif.org/name/${options.name}` : '',
    options.model ? `onvif://www.onvif.org/hardware/${options.model}` : '',
  ].filter(Boolean).join(' ');
  return `<s:Envelope><s:Body><d:ProbeMatches><d:ProbeMatch>
    <wsa:EndpointReference><wsa:Address>urn:uuid:${uuid}</wsa:Address></wsa:EndpointReference>
    <d:Scopes>${scopes}</d:Scopes>
    <d:XAddrs>http://${ip}/onvif/device_service http://${ip}:8080/onvif/device_service</d:XAddrs>
  </d:ProbeMatch></d:ProbeMatches></s:Body></s:Envelope>`;
}

function parsedDevice(xml: string, senderIp: string): Device {
  const parsed = OnvifDriver.parseProbeMatch(xml, senderIp);
  if (!parsed?.id || !parsed.anchor || !parsed.network) throw new Error('Fixture did not parse');
  const now = new Date().toISOString();
  return { ...parsed, id: parsed.id, anchor: parsed.anchor, network: parsed.network, status: 'DISCOVERED', discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now } as Device;
}

class FakeSocket extends EventEmitter implements UdpSocketLike {
  public closed = false;
  constructor(private readonly behavior: { xml?: string; error?: Error; senderIp?: string }) { super(); }
  public bind(_options: { port: number; address: string; exclusive?: boolean }, callback: () => void): void { callback(); }
  public setMulticastInterface(): void {}
  public send(_message: Uint8Array | string, _port: number, _address: string, callback: (error?: Error | null) => void): void {
    callback(this.behavior.error);
    if (!this.behavior.error && this.behavior.xml) {
      const remote = { address: this.behavior.senderIp || '192.168.1.20', family: 'IPv4', port: 3702, size: this.behavior.xml.length } as RemoteInfo;
      queueMicrotask(() => this.emit('message', Buffer.from(this.behavior.xml!), remote));
    }
  }
  public override on(event: 'message' | 'error', listener: (...args: any[]) => void): this { return super.on(event, listener); }
  public override off(event: 'message' | 'error', listener: (...args: any[]) => void): this { return super.off(event, listener); }
  public close(callback?: () => void): void { this.closed = true; callback?.(); }
}

const interfaces: NICInfo[] = [
  { name: 'Ethernet A', ipAddress: '192.168.1.10', netmask: '255.255.255.0', broadcast: '192.168.1.255', mac: '00:11:22:33:44:55', isInternal: false },
  { name: 'Ethernet B', ipAddress: '10.0.0.10', netmask: '255.255.255.0', broadcast: '10.0.0.255', mac: '00:11:22:33:44:66', isInternal: false },
];

async function run() {
  let passed = 0;
  let failed = 0;
  const assert = (condition: unknown, name: string) => {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.error(`  FAIL: ${name}`); failed++; }
  };

  const valid = parsedDevice(probeMatch(uuid1, '192.168.1.20', { mac: '00:40:8c:11:22:33', name: 'Axis', model: 'Q3538' }), '192.168.1.20');
  assert(valid.anchor.macAddress === '00:40:8c:11:22:33' && valid.anchor.onvifEndpointUuid === uuid1, 'valid ProbeMatch parsing');
  assert(valid.network.xAddrs?.length === 2 && valid.network.senderIp === '192.168.1.20', 'XAddrs and sender IP retained separately');
  assert(OnvifDriver.parseProbeMatch('<invalid/>', '192.168.1.20') === null, 'malformed ProbeMatch ignored');

  const duplicateReply = parsedDevice(probeMatch(uuid1, '192.168.1.20', { name: 'Axis', model: 'Q3538' }), '192.168.1.20');
  const merged: Device[] = [];
  mergeDiscoveredDevice(merged, valid);
  mergeDiscoveredDevice(merged, duplicateReply);
  assert(merged.length === 1, 'multiple responses from one UUID merge');

  const sameIpOtherDevice = parsedDevice(probeMatch(uuid2, '192.168.1.20', { name: 'Other' }), '192.168.1.20');
  mergeDiscoveredDevice(merged, sameIpOtherDevice);
  assert(merged.length === 2, 'same IP with different UUID remains separate');

  const changedIp = parsedDevice(probeMatch(uuid1, '192.168.1.99', { name: 'Axis' }), '192.168.1.99');
  mergeDiscoveredDevice(merged, changedIp);
  assert(merged.length === 2 && merged[0].network.ipAddress === '192.168.1.99', 'UUID retains identity across IP change');

  const unknownMac = parsedDevice(probeMatch(uuid2, '10.0.0.50'), '10.0.0.50');
  assert(unknownMac.anchor.macAddress === null, 'unknown MAC remains null');
  assert(!unknownMac.anchor.serialNumber && !unknownMac.onvifConfig && !unknownMac.telemetry, 'no fabricated serial, capabilities, or telemetry');

  const sockets: FakeSocket[] = [];
  const behaviors = [
    { error: new Error('interface unavailable') },
    { xml: probeMatch(uuid2, '10.0.0.50'), senderIp: '10.0.0.50' },
  ];
  const transport = new NodeOnvifWsDiscoveryTransport();
  const isolated = await transport.discover(interfaces, {
    timeoutMs: 5,
    socketFactory: () => {
      const socket = new FakeSocket(behaviors[sockets.length]);
      sockets.push(socket);
      return socket;
    },
  });
  assert(isolated.interfaceErrors.length === 1 && isolated.devices.length === 1, 'per-interface failure is isolated');
  assert(sockets.every(socket => socket.closed), 'discovery timeout cleans up every socket');

  const cancelSocket = new FakeSocket({});
  const controller = new AbortController();
  const pending = transport.discover([interfaces[0]], { timeoutMs: 1000, signal: controller.signal, socketFactory: () => cancelSocket });
  controller.abort();
  const cancelled = await pending;
  assert(cancelled.cancelled && cancelSocket.closed, 'cancellation closes pending socket');

  const passive = await new DisabledPassiveDiscoveryProvider().discover(interfaces);
  assert(passive.length === 0, 'production passive provider never injects simulated devices');

  console.log(`\nDiscovery summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
