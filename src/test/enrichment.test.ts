import { withDiscoveryOwnership } from './support/identity_observation.ts';
import { Device } from '../types/index.ts';
import {
  classifySubnet,
  NeighborEntry,
  NeighborProvider,
  normalizeMacAddress,
  ReachabilityProvider,
  WindowsDeviceEnricher,
} from '../core/engine/device_enrichment.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';

function device(uuid: string, ip: string, mac: string | null = null): Device {
  const now = new Date().toISOString();
  return {
    id: `onvif:${uuid}`,
    anchor: { macAddress: mac, onvifEndpointUuid: uuid, vendor: 'Unknown ONVIF Device' },
    network: { ipAddress: ip, subnetMask: null, port: 80, protocol: 'ONVIF', senderIp: ip },
    status: 'ONLINE',
    discoveredPhase: 3,
    firstSeenAt: now,
    lastSeenAt: now,
    reachability: {
      wsDiscoveryRespondedAt: now,
      lastSuccessfulResponseAt: now,
      discoveryInterface: { name: 'Ethernet', ipAddress: '192.168.1.10', netmask: '255.255.255.0', interfaceIndex: 7 },
    },
  };
}

class FakeNeighborProvider implements NeighborProvider {
  public calls = 0;
  constructor(private readonly result: NeighborEntry | null | Error) {}
  public async lookup(): Promise<NeighborEntry | null> {
    this.calls++;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeReachabilityProvider implements ReachabilityProvider {
  public cancelled = false;
  constructor(private readonly reachablePorts: number[] = []) {}
  public async probe(
    _ipAddress: string,
    options: { ports: number[]; timeoutMs: number; signal?: AbortSignal; localAddress?: string },
  ): Promise<Array<{ port: number; reachable: boolean; testedAt: string }>> {
    if (options.signal?.aborted) this.cancelled = true;
    return options.ports.map(port => ({ port, reachable: this.reachablePorts.includes(port), testedAt: new Date().toISOString() }));
  }
}

class CancellableReachabilityProvider implements ReachabilityProvider {
  public cleanedUp = false;
  public readonly started: Promise<void>;
  private markStarted!: () => void;
  constructor() {
    this.started = new Promise(resolve => { this.markStarted = resolve; });
  }
  public probe(
    _ipAddress: string,
    options: { ports: number[]; timeoutMs: number; signal?: AbortSignal; localAddress?: string },
  ): Promise<Array<{ port: number; reachable: boolean; testedAt: string }>> {
    return new Promise(resolve => {
      this.markStarted();
      const finish = () => {
        this.cleanedUp = true;
        resolve(options.ports.map(port => ({ port, reachable: false, testedAt: new Date().toISOString() })));
      };
      options.signal?.addEventListener('abort', finish, { once: true });
      if (options.signal?.aborted) finish();
    });
  }
}

async function run() {
  let passed = 0;
  let failed = 0;
  const assert = (condition: unknown, name: string) => {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.error(`  FAIL: ${name}`); failed++; }
  };

  const uuidOnly = device('uuid-only', '192.168.1.50');
  assert(uuidOnly.anchor.macAddress === null && Boolean(uuidOnly.id), 'UUID-only device remains valid');
  assert(normalizeMacAddress('00-40-8C-11-22-33') === '00:40:8c:11:22:33', 'MAC normalization');
  assert(normalizeMacAddress('ff:ff:ff:ff:ff:ff') === null && normalizeMacAddress('01:00:5e:00:00:01') === null, 'invalid and multicast MAC rejection');

  const neighbor = new FakeNeighborProvider({ ipAddress: '192.168.1.50', macAddress: '00:40:8c:11:22:33', interfaceIndex: 7 });
  withDiscoveryOwnership(uuidOnly,'00:40:8c:11:22:33');
  const enriched = await new WindowsDeviceEnricher(neighbor, new FakeReachabilityProvider()).enrich(uuidOnly);
  assert(enriched.anchor.macAddress === '00:40:8c:11:22:33', 'legitimate neighbor MAC enrichment');

  const unknown = device('unknown-neighbor', '192.168.1.51');
  await new WindowsDeviceEnricher(new FakeNeighborProvider(null), new FakeReachabilityProvider()).enrich(unknown);
  assert(unknown.anchor.macAddress === null, 'unknown neighbor leaves MAC null');

  const db = new SiteProjectDatabase();
  db.createNewProject('Identity Test', 'Lab');
  const original = device('stable-uuid', '192.168.1.50');
  const stableId = db.upsertDevice(original).id;
  const withMac = device('stable-uuid', '192.168.1.50', '00:40:8c:11:22:33');
  const strengthened = db.upsertDevice(withMac);
  assert(db.getDevices().length === 1 && strengthened.id === stableId && strengthened.anchor.macAddress !== null, 'UUID record gains MAC without duplication or ID replacement');

  const mergeDb = new SiteProjectDatabase();
  mergeDb.createNewProject('Late Merge Test', 'Lab');
  const macOnly = device('', '192.168.1.49', '00:40:8c:44:55:66');
  macOnly.id = 'mac:00:40:8c:44:55:66';
  macOnly.anchor.onvifEndpointUuid = undefined;
  mergeDb.upsertDevice(macOnly);
  const uuidRecord = device('late-uuid', '192.168.1.50');
  const uuidStableId = mergeDb.upsertDevice(uuidRecord).id;
  const lateEvidence = device('late-uuid', '192.168.1.50', '00:40:8c:44:55:66');
  const mergedLate = mergeDb.upsertDevice(lateEvidence);
  assert(mergeDb.getDevices().length === 1 && mergedLate.id === uuidStableId, 'late MAC evidence merges provably identical records into stable UUID row');

  const changedIp = device('stable-uuid', '192.168.1.80', '00:40:8c:11:22:33');
  const moved = db.upsertDevice(changedIp);
  assert(db.getDevices().length === 1 && moved.id === stableId && moved.network.ipAddress === '192.168.1.80', 'stable identity after IP change');
  assert(moved.network.ipAddressHistory?.includes('192.168.1.50') && moved.network.ipAddressHistory?.includes('192.168.1.80'), 'address history retained');

  db.upsertDevice(device('other-uuid', '192.168.1.80', '00:40:8c:aa:bb:cc'));
  assert(db.getDevices().length === 2, 'same IP with different identity remains separate');

  const conflicting = device('stable-uuid', '192.168.1.90', '00:40:8c:de:ad:01');
  db.upsertDevice(conflicting);
  assert(db.getDevices().length === 3 && db.getDevices().some(item => item.identityConflicts?.length), 'conflicting identity evidence is recorded and not silently merged');

  assert(classifySubnet('192.168.2.50', '192.168.1.10', '255.255.255.0') === 'DIFFERENT_SUBNET', 'Different Subnet calculation');
  const different = device('different-subnet', '192.168.2.50');
  await new WindowsDeviceEnricher(new FakeNeighborProvider(null), new FakeReachabilityProvider([80])).enrich(different);
  assert(different.status === 'DIFFERENT_SUBNET', 'Different Subnet status preserved despite positive reachability');

  const positive = device('positive', '192.168.1.60');
  positive.status = 'UNKNOWN';
  await new WindowsDeviceEnricher(new FakeNeighborProvider(null), new FakeReachabilityProvider([80])).enrich(positive);
  assert(String(positive.status) === 'ONLINE' && positive.reachability?.tcpServices?.some(service => service.port === 80 && service.reachable), 'positive reachability evidence sets Online truthfully');

  const failedProbe = device('failed-probe', '192.168.1.61');
  await new WindowsDeviceEnricher(new FakeNeighborProvider(null), new FakeReachabilityProvider()).enrich(failedProbe);
  assert(failedProbe.status === 'ONLINE' && !failedProbe.reachability?.httpReachableAt && !failedProbe.telemetry, 'failed reachability adds no unrelated offline or telemetry state');

  const providerByIp: NeighborProvider = {
    async lookup(ipAddress) {
      if (ipAddress.endsWith('.70')) throw new Error('adapter failure');
      return { ipAddress, macAddress: '00:40:8c:11:22:70', interfaceIndex:7 };
    },
  };
  const perAdapterEnricher = new WindowsDeviceEnricher(providerByIp, new FakeReachabilityProvider());
  const adapterDevices = [device('adapter-fail', '192.168.1.70'), device('adapter-ok', '192.168.1.71')];
  withDiscoveryOwnership(adapterDevices[1],'00:40:8c:11:22:70');
  await Promise.all(adapterDevices.map(item => perAdapterEnricher.enrich(item)));
  assert(adapterDevices[0].anchor.macAddress === null && adapterDevices[1].anchor.macAddress !== null, 'per-adapter enrichment failure isolation');

  const cancellable = new CancellableReachabilityProvider();
  const controller = new AbortController();
  const pending = new WindowsDeviceEnricher(new FakeNeighborProvider(null), cancellable).enrich(device('cancel', '192.168.1.72'), { signal: controller.signal });
  await cancellable.started;
  controller.abort();
  await pending;
  assert(cancellable.cleanedUp, 'cancellation cleans up pending enrichment probe');

  console.log(`\nEnrichment summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
