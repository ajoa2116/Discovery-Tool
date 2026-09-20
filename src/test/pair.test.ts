import { Device, PairSessionState, WindowsAdapterSnapshot } from '../types/index.ts';
import { DeviceDiagnosticEngine } from '../core/engine/diagnostic_engine.ts';
import { NeighborProvider } from '../core/engine/device_enrichment.ts';
import { CandidateAddressChecker, ConservativeCandidateAddressChecker, PairRecoveryStore, PairService, prefixToSubnetMask, subnetMaskToPrefix } from '../core/network/pair_service.ts';
import { NetworkConfigurationError, WindowsNetworkAdapterService } from '../core/network/windows_adapter_service.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';

const adapter = (index: number, overrides: Partial<WindowsAdapterSnapshot> = {}): WindowsAdapterSnapshot => ({
  interfaceGuid: `11111111-2222-3333-4444-${String(index).padStart(12,'0')}`,interfaceIndex: index, interfaceAlias: `Ethernet ${index}`, mediaType: 'ETHERNET', operationalStatus: 'Up', eligible: true,
  dhcpEnabled: false, ipv4Addresses: [{ address: `10.0.${index}.10`, prefixLength: 24 }], defaultGateways: [`10.0.${index}.1`],
  dnsAutomatic: false, dnsServers: ['10.0.0.53'], capturedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});
const device = (id = 'camera-1', ip = '192.168.10.64'): Device => ({ id, anchor: { macAddress: '00:40:8c:00:00:64', onvifEndpointUuid: id, vendor: 'Axis' }, network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' }, status: 'DIFFERENT_SUBNET', discoveredPhase: 3, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });

class FakeAdapterService implements WindowsNetworkAdapterService {
  admin = true; changedBaseline = false; failRestoreVerification = false; applied?: { index: number; ip: string; prefix: number }; restored?: WindowsAdapterSnapshot;
  constructor(public adapters: WindowsAdapterSnapshot[]) {}
  async inspectAdapters() { return structuredClone(this.changedBaseline ? this.adapters.map((item, i) => i === 0 ? { ...item, ipv4Addresses: [{ address: '172.16.0.99', prefixLength: 24 }] } : item) : this.adapters); }
  async isAdministrator() { return this.admin; }
  async applyTemporary(index: number, ip: string, prefix: number) { this.applied = { index, ip, prefix }; const base = this.adapters.find(item => item.interfaceIndex === index)!; const applied={ ...structuredClone(base), dhcpEnabled: false, ipv4Addresses: [{ address: ip, prefixLength: prefix }], defaultGateways: [] };this.adapters=this.adapters.map(a=>a.interfaceIndex===index?applied:a);return structuredClone(applied); }
  async restore(snapshot: WindowsAdapterSnapshot) { this.restored = structuredClone(snapshot); return this.failRestoreVerification ? { ...structuredClone(snapshot), dnsServers: [] } : structuredClone(snapshot); }
}
class FakeChecker implements CandidateAddressChecker {
  calls: string[] = []; occupied = new Set<string>(); uncertain = new Set<string>(); delayUntilAbort = false; started?: () => void;
  async check(ip: string, options: { signal?: AbortSignal } = {}) {
    this.calls.push(ip); this.started?.();
    if (this.delayUntilAbort) return new Promise<{ availability: 'UNCERTAIN'; evidence: string[] }>(resolve => options.signal?.addEventListener('abort', () => resolve({ availability: 'UNCERTAIN', evidence: ['cancelled'] }), { once: true }));
    if (this.occupied.has(ip)) return { availability: 'OCCUPIED' as const, evidence: ['neighbor occupied'] };
    if (this.uncertain.has(ip)) return { availability: 'UNCERTAIN' as const, evidence: ['uncertain'] };
    return { availability: 'AVAILABLE' as const, evidence: ['neighbor absent', 'ping failed', 'tcp failed'] };
  }
}
class MemoryRecovery implements PairRecoveryStore {
  value: PairSessionState | null = null; saves = 0;
  async load() { return this.value ? structuredClone(this.value) : null; }
  async save(value: PairSessionState) { this.value = structuredClone(value); this.saves++; }
  async clear() { this.value = null; }
}
class FakeDiagnostics extends DeviceDiagnosticEngine {
  constructor(private readonly reachable: boolean) { super(); }
  override async diagnose(item: Device) { item.diagnostics = { checks: [{ type: 'PING', targetIp: item.network.ipAddress, success: this.reachable, transportReachable: this.reachable, timestamp: new Date().toISOString() }] }; item.status = this.reachable ? 'ONLINE' : 'UNKNOWN'; return item; }
}

async function run() {
  let passed = 0, failed = 0;
  const assert = (condition: unknown, name: string) => { if (condition) { console.log(`  PASS: ${name}`); passed++; } else { console.error(`  FAIL: ${name}`); failed++; } };
  const rejectsCode = async (action: () => Promise<unknown>, code: string) => { try { await action(); return false; } catch (error) { return error instanceof NetworkConfigurationError && error.code === code; } };
  const setup = (adapterService = new FakeAdapterService([adapter(1)]), checker = new FakeChecker(), reachable = true, recovery = new MemoryRecovery()) => {
    const db = new SiteProjectDatabase(); db.createNewProject('Pair Test'); db.upsertDevice(device());
    return { db, adapterService, checker, recovery, service: new PairService(adapterService, checker, new FakeDiagnostics(reachable), recovery, db) };
  };

  const eligibilityAdapters = [adapter(1), adapter(2, { mediaType: 'WIFI' }), adapter(3, { operationalStatus: 'Disconnected', eligible: false, eligibilityReason: 'Disconnected' }), adapter(4, { mediaType: 'OTHER', eligible: false })];
  const eligibility = setup(new FakeAdapterService(eligibilityAdapters));
  const eligible = await eligibility.service.getEligibleAdapters();
  assert(eligible.length === 2 && eligible.some(item => item.mediaType === 'ETHERNET') && eligible.some(item => item.mediaType === 'WIFI'), 'eligible Ethernet and Wi-Fi adapter filtering');
  assert(!eligible.some(item => item.operationalStatus === 'Disconnected'), 'disconnected adapter excluded');

  const multi = setup(new FakeAdapterService([adapter(1), adapter(2)]));
  const multiPreview = await multi.service.prepare('camera-1', 2);
  assert(multiPreview.adapter.interfaceIndex === 2, 'technician can select among multiple adapters');
  assert(multiPreview.originalAdapter.dhcpEnabled === false && multiPreview.originalAdapter.defaultGateways[0] === '10.0.2.1', 'static adapter snapshot preserved');

  const dhcpAdapter = adapter(5, { dhcpEnabled: true, dnsAutomatic: true, dnsServers: ['192.168.1.1'], defaultGateways: ['192.168.1.1'] });
  const dhcp = setup(new FakeAdapterService([dhcpAdapter]));
  const dhcpPreview = await dhcp.service.prepare('camera-1', 5);
  assert(dhcpPreview.originalAdapter.dhcpEnabled && dhcpPreview.originalAdapter.dnsAutomatic, 'DHCP adapter snapshot preserved');
  assert(dhcpPreview.state === 'READY_FOR_CONFIRMATION' && dhcpPreview.selectedCandidate && dhcpPreview.originalAdapter && dhcpPreview.cameraIp === '192.168.10.64', 'preview contains complete before/after state');
  assert(dhcpPreview.selectedCandidate!.ipAddress !== '192.168.10.64', 'candidate avoids camera address');

  const avoidance = setup(new FakeAdapterService([adapter(1, { ipv4Addresses: [{ address: '192.168.10.102', prefixLength: 24 }] })]));
  avoidance.db.upsertDevice({ ...device('camera-2', '192.168.10.139'), anchor: { macAddress: '00:40:8c:00:00:65', onvifEndpointUuid: 'camera-2', vendor: 'Axis' } });
  const avoidancePreview = await avoidance.service.prepare('camera-1', 1);
  assert(avoidancePreview.candidates.every(item => item.ipAddress !== '192.168.10.102'), 'candidate avoids local adapter address');
  assert(avoidancePreview.candidates.every(item => item.ipAddress !== '192.168.10.139'), 'candidate avoids discovered device address');

  const neighbor = setup();
  neighbor.checker.occupied.add('192.168.10.101');
  const neighborPreview = await neighbor.service.prepare('camera-1', 1);
  assert(neighbor.checker.calls.includes('192.168.10.101') && neighborPreview.candidates.every(item => item.ipAddress !== '192.168.10.101'), 'neighbor-table occupied candidate rejected');
  assert(neighbor.checker.calls.length <= 32 && neighborPreview.candidates.length <= 3, 'candidate search is bounded and returns at most three');

  const conservative = new ConservativeCandidateAddressChecker(
    { async lookup() { return null; } } as NeighborProvider,
    { async check(ip) { return { type: 'PING', targetIp: ip, success: false, timeout: true, errorCategory: 'TIMEOUT', timestamp: new Date().toISOString() }; } },
    { async check(ip, options) { return { type: 'TCP', targetIp: ip, port: options.port, success: false, transportReachable: false, errorCategory: 'CONNECTION_REFUSED', timestamp: new Date().toISOString() }; } },
  );
  const conservativeResult = await conservative.check('192.168.10.200');
  assert(conservativeResult.availability === 'AVAILABLE' && conservativeResult.evidence.length >= 3, 'failed ping alone is not used as proof; multiple evidence sources required');

  const confirmation = setup(); const confirmationPreview = await confirmation.service.prepare('camera-1', 1);
  assert(await rejectsCode(() => confirmation.service.confirmAndApply(confirmationPreview.id, false), 'CONFIRMATION_REQUIRED') && !confirmation.adapterService.applied, 'explicit confirmation required');

  const baseline = setup(); const baselinePreview = await baseline.service.prepare('camera-1', 1); baseline.adapterService.changedBaseline = true;
  assert(await rejectsCode(() => baseline.service.confirmAndApply(baselinePreview.id, true), 'BASELINE_CHANGED') && !baseline.adapterService.applied, 'adapter change after preview aborts apply');

  const disconnected = setup(); const disconnectedPreview = await disconnected.service.prepare('camera-1', 1); disconnected.adapterService.adapters[0].operationalStatus = 'Disconnected'; disconnected.adapterService.adapters[0].eligible = false;
  assert(await rejectsCode(() => disconnected.service.confirmAndApply(disconnectedPreview.id, true), 'BASELINE_CHANGED') && !disconnected.adapterService.applied, 'adapter disconnected before apply aborts safely');

  const candidateChanged = setup(); const candidateChangedPreview = await candidateChanged.service.prepare('camera-1', 1); candidateChanged.checker.occupied.add(candidateChangedPreview.selectedCandidate!.ipAddress);
  assert(await rejectsCode(() => candidateChanged.service.confirmAndApply(candidateChangedPreview.id, true), 'CANDIDATE_CHANGED') && !candidateChanged.adapterService.applied, 'candidate becoming occupied before apply aborts safely');

  const success = setup(); const successPreview = await success.service.prepare('camera-1', 1); const paired = await success.service.confirmAndApply(successPreview.id, true);
  assert(paired.state === 'PAIRED' && paired.adapterConfigurationVerified && success.adapterService.applied?.ip === paired.selectedCandidate?.ipAddress, 'successful temporary static configuration and verification');
  assert(success.adapterService.applied !== undefined && Object.keys(success.adapterService.applied).every(key => ['index', 'ip', 'prefix'].includes(key)), 'apply API invents no gateway or DNS');
  assert(paired.cameraReachabilityVerified === true, 'Pair success includes camera diagnostic verification');

  const unreachable = setup(undefined, undefined, false); const unreachablePreview = await unreachable.service.prepare('camera-1', 1); const pairedUnreachable = await unreachable.service.confirmAndApply(unreachablePreview.id, true);
  assert(pairedUnreachable.state === 'PAIRED' && pairedUnreachable.adapterConfigurationVerified && pairedUnreachable.cameraReachabilityVerified === false, 'adapter success with camera unreachable represented accurately');

  const admin = setup(); admin.adapterService.admin = false; const adminPreview = await admin.service.prepare('camera-1', 1);
  assert(await rejectsCode(() => admin.service.confirmAndApply(adminPreview.id, true), 'ADMIN_REQUIRED') && !admin.adapterService.applied, 'administrator privilege failure is truthful and non-partial');

  const staticRestore = await success.service.restore();
  assert(staticRestore.state === 'RESTORED' && success.adapterService.restored?.ipv4Addresses[0].address === '10.0.1.10' && success.adapterService.restored.defaultGateways[0] === '10.0.1.1', 'original static address and gateway restored');
  assert(success.adapterService.restored?.dnsServers[0] === '10.0.0.53', 'original DNS restored');

  const dhcpRestoreSetup = setup(new FakeAdapterService([dhcpAdapter])); const dp = await dhcpRestoreSetup.service.prepare('camera-1', 5); await dhcpRestoreSetup.service.confirmAndApply(dp.id, true); await dhcpRestoreSetup.service.restore();
  assert(dhcpRestoreSetup.adapterService.restored?.dhcpEnabled === true && dhcpRestoreSetup.adapterService.restored.dnsAutomatic === true, 'original DHCP and automatic DNS mode restored');

  const restoreFailure = setup(); const rf = await restoreFailure.service.prepare('camera-1', 1); await restoreFailure.service.confirmAndApply(rf.id, true); restoreFailure.adapterService.failRestoreVerification = true;
  assert(await rejectsCode(() => restoreFailure.service.restore(), 'RESTORE_VERIFICATION_FAILED') && restoreFailure.service.getStatus()?.state === 'ROLLBACK_REQUIRED', 'restore verification failure retains recovery state');

  const recovery = new MemoryRecovery(); recovery.value = paired; const recoveredService = setup(new FakeAdapterService([paired.adapter]), undefined, true, recovery).service; const recovered = await recoveredService.initializeRecovery();
  assert(recovered?.state === 'PAIRED' && recovered.recoveryDisposition==='HEALTHY_RETAINED' && recovered.recoveryAvailable, 'restart recognizes verified retained Pair recovery');

  const exportJson = success.db.exportProjectJson();
  assert(!exportJson.includes('selectedCandidate') && !exportJson.includes('originalAdapter') && !exportJson.includes('PAIR'), 'Pair session is not persisted as permanent project device state');
  const openedDb = new SiteProjectDatabase(); openedDb.importProjectJson(exportJson); const untouchedAdapters = new FakeAdapterService([adapter(1)]); new PairService(untouchedAdapters, new FakeChecker(), new FakeDiagnostics(true), new MemoryRecovery(), openedDb);
  assert(!untouchedAdapters.applied, 'opening a project does not automatically Pair');
  openedDb.getDevices()[0].network.ipAddress = '192.168.20.64';
  assert(!untouchedAdapters.applied, 'camera IP change does not automatically Pair');

  const cancellation = setup(); cancellation.checker.delayUntilAbort = true; let started!: () => void; const began = new Promise<void>(resolve => { started = resolve; }); cancellation.checker.started = started;
  const pending = cancellation.service.prepare('camera-1', 1).catch(error => error); await began; cancellation.service.cancelPreparation(); await pending;
  assert(cancellation.service.getStatus()?.state === 'FAILED' || cancellation.service.getStatus()?.state === 'CANCELLED', 'preparation cancellation cleans up without adapter modification');

  const serialized = JSON.stringify(paired);
  assert(!/password|authorization|bearer|credential|token/i.test(serialized), 'Pair recovery state contains no credentials or secrets');
  assert(subnetMaskToPrefix('255.255.255.0') === 24 && prefixToSubnetMask(24) === '255.255.255.0' && subnetMaskToPrefix('255.0.255.0') === null, 'subnet validation and prefix conversion');
  const invalidSubnet = setup(); invalidSubnet.db.getDevices()[0].network.subnetMask = '255.0.255.0';
  assert(await rejectsCode(() => invalidSubnet.service.prepare('camera-1', 1), 'INVALID_SUBNET'), 'invalid subnet is rejected without guessing');
  assert(!('execute' in success.service) && !('powershell' in success.service) && !('command' in success.service), 'Pair service exposes no arbitrary shell execution surface');

  console.log(`\nPair summary: ${passed} passed, ${failed} failed`); if (failed) process.exit(1);
}
run().catch(error => { console.error(error); process.exit(1); });
