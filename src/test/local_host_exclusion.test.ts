import { AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { BatchExecutionPipeline } from '../core/engine/pipeline.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';
import { projectDb, SiteProjectDatabase } from '../core/storage/project_db.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { Device, NICInfo, WindowsAdapterSnapshot } from '../types/index.ts';

let passed = 0;
let failed = 0;
function assert(value: unknown, name: string) {
  if (value) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}
const nic = (name: string, ipAddress: string): NICInfo => ({ name, ipAddress, netmask: '255.255.224.0', broadcast: '192.168.159.255', mac: '00:11:22:33:44:55', isInternal: false });
const adapter = (index: number, addresses: string[]): WindowsAdapterSnapshot => ({ interfaceIndex: index, interfaceAlias: `Adapter ${index}`, mediaType: 'WIFI', operationalStatus: 'Up', eligible: true, hardwareInterface: true, physicalMediaType: 'Native 802.11', dhcpEnabled: true, ipv4Addresses: addresses.map(address => ({ address, prefixLength: 19 })), defaultGateways: ['192.168.128.1'], dnsAutomatic: true, dnsServers: [], capturedAt: 'now' });
const device = (ipAddress: string): Device => ({ id: `device:${ipAddress}`, anchor: { macAddress: null, vendor: 'Unknown' }, network: { ipAddress, ipAddressHistory: [ipAddress], subnetMask: 'Unknown', port: 0, protocol: 'PASSIVE_SNIFF' }, status: 'UNKNOWN', discoveredPhase: 2, firstSeenAt: 'now', lastSeenAt: 'now', technician: { name: 'Unknown Device', location: '', notes: '' }, configuredState: { inferred: null } });

async function run() {
  const one = LocalHostIdentity.fromInterfaces([nic('Wi-Fi', '192.168.145.49')]);
  assert(one.isLocal('192.168.145.49') && !one.isLocal('192.168.145.50'), 'one local IPv4 is excluded without suppressing its adjacent remote address');
  const many = LocalHostIdentity.fromAdapters([adapter(10, ['192.168.145.49', '192.168.145.60']), adapter(12, ['10.0.0.8'])]);
  assert(['192.168.145.49', '192.168.145.60', '10.0.0.8'].every(address => many.isLocal(address)), 'multiple addresses across multiple active adapters are all local');
  assert(!many.isLocal('192.168.145.50') && !many.isLocal('10.0.0.9'), 'legitimate remote targets remain discoverable');

  const db = new SiteProjectDatabase(); db.startQuickWork();
  const snapshots = [adapter(10, ['192.168.145.49', '192.168.145.60']), adapter(12, ['10.0.0.8'])];
  const adapters = { inspectAdapters: async () => snapshots } as any;
  const ping = { check: async (ip: string) => ({ type: 'PING', targetIp: ip, protocol: 'ICMP', success: true, transportReachable: true, timestamp: 'now' }) } as any;
  const tcp = { check: async (ip: string, options: any) => ({ type: 'TCP', targetIp: ip, port: options.port, protocol: 'TCP', success: true, transportReachable: true, timestamp: 'now' }) } as any;
  const service = new AdvancedScanService(adapters, ping, tcp, db);
  const request = emptyAdvancedScanRequest();
  request.adapterIndexes = [10];
  request.targets = [{ type: 'RANGE', start: '192.168.145.49', end: '192.168.145.50' }];
  request.methods = ['PING', 'TCP']; request.customPorts = [80];
  const emitted: string[] = [];
  const status = await service.execute(await service.validate(request), { onDevice: found => emitted.push(found.network.ipAddress), onComplete: () => {} });
  assert(status.completedTargets === 2 && status.findings === 1, 'local target remains in workload accounting but not findings');
  assert(emitted.join() === '192.168.145.50', 'local ICMP/TCP success emits no device event while adjacent remote success does');
  assert(db.getDevices().map(found => found.network.ipAddress).join() === '192.168.145.50', 'local address creates no inventory row, staging record, or collision candidate');
  assert(!emitted.includes('192.168.145.49'), 'local address cannot trigger the DEVICE_DISCOVERED-driven New Device notification');

  projectDb.startQuickWork();
  const passive = { discover: async () => [device('192.168.145.49'), device('10.0.0.8'), device('192.168.145.50')] } as any;
  const pipeline = new BatchExecutionPipeline({ passiveDiscovery: passive });
  (pipeline as any).currentInterfaces = [nic('Wi-Fi', '192.168.145.49')];
  (pipeline as any).localHost = LocalHostIdentity.fromInterfaces([nic('Wi-Fi', '192.168.145.49'), nic('Ethernet', '10.0.0.8')]);
  await pipeline.runPhase2();
  assert(projectDb.getDevices().map(found => found.network.ipAddress).join() === '192.168.145.50', 'Quick Scan excludes selected and other local-adapter addresses at the passive/neighbor boundary');

  console.log(`\nLocal-host exclusion summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
run().catch(error => { console.error(error); process.exit(1); });
