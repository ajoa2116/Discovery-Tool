import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Device, PairCandidate, PairSessionState, WindowsAdapterSnapshot } from '../../types/index.ts';
import { SiteProjectDatabase, projectDb } from '../storage/project_db.ts';
import { appStateDb } from '../storage/app_db.ts';
import { DeviceDiagnosticEngine, NodeTcpDiagnosticProvider, WindowsPingProvider } from '../engine/diagnostic_engine.ts';
import { WindowsNeighborProvider } from '../engine/device_enrichment.ts';
import { NetworkConfigurationError, PowerShellWindowsNetworkAdapterService, WindowsNetworkAdapterService } from './windows_adapter_service.ts';

export type CandidateAvailability = 'OCCUPIED' | 'AVAILABLE' | 'UNCERTAIN';
export interface CandidateAddressChecker {
  check(ipAddress: string, options?: { signal?: AbortSignal }): Promise<{ availability: CandidateAvailability; evidence: string[] }>;
}
export interface PairRecoveryStore {
  load(): Promise<PairSessionState | null>;
  save(session: PairSessionState): Promise<void>;
  clear(): Promise<void>;
}

export class JsonPairRecoveryStore implements PairRecoveryStore {
  constructor(private readonly filePath = join(process.env.LOCALAPPDATA || tmpdir(), 'CCTVDiscoveryTool', 'pair-recovery.json')) {}
  async load(): Promise<PairSessionState | null> { try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as PairSessionState; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  async save(session: PairSessionState): Promise<void> { await fs.mkdir(dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, JSON.stringify(session, null, 2), { flag: 'wx' }); await fs.rename(temp, this.filePath); }
  async clear(): Promise<void> { await fs.rm(this.filePath, { force: true }); }
}

export class ConservativeCandidateAddressChecker implements CandidateAddressChecker {
  constructor(private readonly neighbor = new WindowsNeighborProvider(), private readonly ping = new WindowsPingProvider(), private readonly tcp = new NodeTcpDiagnosticProvider()) {}
  async check(ipAddress: string, options: { signal?: AbortSignal } = {}) {
    const evidence: string[] = [];
    try {
      const neighbor = await this.neighbor.lookup(ipAddress, { signal: options.signal });
      if (neighbor) return { availability: 'OCCUPIED' as const, evidence: [`Windows neighbor table reports ${neighbor.macAddress}.`] };
      evidence.push('No Windows neighbor-table identity was present.');
      const [ping, http, https] = await Promise.all([
        this.ping.check(ipAddress, { timeoutMs: 350, signal: options.signal }),
        this.tcp.check(ipAddress, { port: 80, timeoutMs: 350, signal: options.signal }),
        this.tcp.check(ipAddress, { port: 443, timeoutMs: 350, signal: options.signal }),
      ]);
      if (ping.success || http.success || https.success) return { availability: 'OCCUPIED' as const, evidence: ['The address responded to an active ICMP or TCP check.'] };
      evidence.push('ICMP did not respond; this alone is not proof of availability.');
      evidence.push('Targeted TCP checks on 80 and 443 did not accept a connection.');
      const stimulatedNeighbor = await this.neighbor.lookup(ipAddress, { signal: options.signal });
      if (stimulatedNeighbor) return { availability: 'OCCUPIED' as const, evidence: [...evidence, `Neighbor stimulation resolved ${stimulatedNeighbor.macAddress}.`] };
      evidence.push('A second neighbor-table check after active stimulation remained empty.');
      return { availability: 'AVAILABLE' as const, evidence };
    } catch {
      return { availability: 'UNCERTAIN' as const, evidence: ['Availability checks could not establish sufficient confidence.'] };
    }
  }
}

const ipToNumber = (ip: string): number | null => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
};
const numberToIp = (value: number) => [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');

export function subnetMaskToPrefix(mask: string): number | null {
  const number = ipToNumber(mask); if (number === null) return null;
  const binary = number.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(binary)) return null;
  const prefix = binary.indexOf('0');
  return prefix === -1 ? 32 : prefix;
}
export function prefixToSubnetMask(prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return numberToIp(mask);
}

function snapshotFingerprint(snapshot: WindowsAdapterSnapshot): string {
  return JSON.stringify({ index: snapshot.interfaceIndex, status: snapshot.operationalStatus, dhcp: snapshot.dhcpEnabled, ips: [...snapshot.ipv4Addresses].sort((a, b) => a.address.localeCompare(b.address)), gateways: [...snapshot.defaultGateways].sort(), dnsAutomatic: snapshot.dnsAutomatic, dns: [...snapshot.dnsServers].sort() });
}

export class PairService {
  private session: PairSessionState | null = null;
  private preparationController: AbortController | null = null;
  constructor(
    private readonly adapters: WindowsNetworkAdapterService = new PowerShellWindowsNetworkAdapterService(),
    private readonly checker: CandidateAddressChecker = new ConservativeCandidateAddressChecker(),
    private readonly diagnostics = new DeviceDiagnosticEngine(),
    private readonly recovery: PairRecoveryStore = new JsonPairRecoveryStore(),
    private readonly database: SiteProjectDatabase = projectDb,
  ) {}

  async initializeRecovery(): Promise<PairSessionState | null> {
    const recovered = await this.recovery.load();
    if (recovered && !['RESTORED', 'CANCELLED'].includes(recovered.state)) {
      this.session = { ...recovered, state: 'ROLLBACK_REQUIRED', message: 'A previous Pair operation may still be active. Review and explicitly restore the original adapter configuration.', recoveryAvailable: true, updatedAt: new Date().toISOString() };
    }
    return this.getStatus();
  }

  getStatus(): PairSessionState | null { return this.session ? structuredClone(this.session) : null; }
  async getEligibleAdapters(signal?: AbortSignal) { return (await this.adapters.inspectAdapters(signal)).filter(adapter => adapter.eligible); }

  async prepare(deviceId: string, interfaceIndex: number): Promise<PairSessionState> {
    if (this.session && ['APPLYING', 'VERIFYING', 'PAIRED', 'RESTORING', 'ROLLBACK_REQUIRED'].includes(this.session.state)) throw new NetworkConfigurationError('Restore or resolve the active Pair session before starting another.', 'PAIR_SESSION_ACTIVE');
    const device = this.database.getDeviceById(deviceId);
    if (!device) throw new NetworkConfigurationError('The selected camera no longer exists.', 'DEVICE_NOT_FOUND');
    if (!device.network.subnetMask) throw new NetworkConfigurationError('The camera subnet is unknown; Pair cannot safely propose an address.', 'SUBNET_UNKNOWN');
    const prefix = subnetMaskToPrefix(device.network.subnetMask);
    if (prefix === null || prefix < 1 || prefix > 30) throw new NetworkConfigurationError('The camera subnet mask is invalid or unsupported for Pair.', 'INVALID_SUBNET');
    this.preparationController?.abort();
    this.preparationController = new AbortController();
    const adapters = await this.adapters.inspectAdapters(this.preparationController.signal);
    const adapter = adapters.find(item => item.interfaceIndex === interfaceIndex);
    if (!adapter?.eligible) throw new NetworkConfigurationError(adapter?.eligibilityReason || 'The selected adapter is unavailable.', 'ADAPTER_INELIGIBLE');
    const now = new Date().toISOString();
    this.session = { id: crypto.randomUUID(), state: 'CHECKING_ADDRESS', deviceId, cameraIp: device.network.ipAddress, cameraSubnetMask: device.network.subnetMask, adapter, originalAdapter: structuredClone(adapter), candidates: [], createdAt: now, updatedAt: now, recoveryAvailable: false };
    const candidates = await this.findCandidates(device, prefix, adapters, this.preparationController.signal);
    if (this.preparationController.signal.aborted) throw new NetworkConfigurationError('Pair preparation was cancelled.', 'CANCELLED');
    if (!candidates.length) { this.session.state = 'FAILED'; this.session.errorCode = 'NO_CONFIDENT_CANDIDATE'; this.session.message = 'No candidate address passed the conservative availability checks.'; throw new NetworkConfigurationError(this.session.message, this.session.errorCode); }
    this.session.candidates = candidates;
    this.session.selectedCandidate = candidates[0];
    this.session.state = 'READY_FOR_CONFIRMATION';
    this.session.message = 'Review the complete before/after preview and explicitly confirm Pair.';
    this.session.updatedAt = new Date().toISOString();
    this.preparationController = null;
    this.audit('Pair preview prepared', { deviceId, interfaceIndex, proposedIp: candidates[0].ipAddress });
    return this.getStatus()!;
  }

  selectCandidate(ipAddress: string): PairSessionState {
    if (!this.session || this.session.state !== 'READY_FOR_CONFIRMATION') throw new NetworkConfigurationError('Pair is not ready for candidate selection.', 'NOT_READY');
    const candidate = this.session.candidates.find(item => item.ipAddress === ipAddress && item.confidence === 'AVAILABLE');
    if (!candidate) throw new NetworkConfigurationError('Select one of the verified Pair candidates.', 'INVALID_CANDIDATE');
    this.session.selectedCandidate = candidate; this.session.updatedAt = new Date().toISOString(); return this.getStatus()!;
  }

  async confirmAndApply(sessionId: string, confirmed: boolean): Promise<PairSessionState> {
    if (!confirmed) throw new NetworkConfigurationError('Explicit technician confirmation is required.', 'CONFIRMATION_REQUIRED');
    if (!this.session || this.session.id !== sessionId || this.session.state !== 'READY_FOR_CONFIRMATION' || !this.session.selectedCandidate) throw new NetworkConfigurationError('Pair preview is missing or no longer current.', 'NOT_READY');
    if (!(await this.adapters.isAdministrator())) throw new NetworkConfigurationError('Administrator privileges are required to Pair this Windows adapter.', 'ADMIN_REQUIRED');
    const current = (await this.adapters.inspectAdapters()).find(item => item.interfaceIndex === this.session!.adapter.interfaceIndex);
    if (!current) throw new NetworkConfigurationError('The selected adapter no longer exists.', 'ADAPTER_NOT_FOUND');
    if (snapshotFingerprint(current) !== snapshotFingerprint(this.session.originalAdapter)) throw new NetworkConfigurationError('The adapter configuration changed after preview. Prepare Pair again.', 'BASELINE_CHANGED');
    const recheck = await this.checker.check(this.session.selectedCandidate.ipAddress);
    if (recheck.availability !== 'AVAILABLE') throw new NetworkConfigurationError('The proposed address is no longer confidently available.', 'CANDIDATE_CHANGED');

    this.session.state = 'APPLYING'; this.session.technicianConfirmedAt = new Date().toISOString(); this.session.updatedAt = this.session.technicianConfirmedAt; this.session.recoveryAvailable = true;
    await this.recovery.save(this.session);
    this.audit('Technician confirmed Pair', { deviceId: this.session.deviceId, interfaceIndex: current.interfaceIndex, temporaryIp: this.session.selectedCandidate.ipAddress });
    try {
      const applied = await this.adapters.applyTemporary(current.interfaceIndex, this.session.selectedCandidate.ipAddress, this.session.selectedCandidate.prefixLength);
      this.session.state = 'VERIFYING';
      const verified = applied.ipv4Addresses.some(item => item.address === this.session!.selectedCandidate!.ipAddress && item.prefixLength === this.session!.selectedCandidate!.prefixLength);
      this.session.adapterConfigurationVerified = verified;
      if (!verified) throw new NetworkConfigurationError('Windows did not report the intended temporary address after Pair.', 'APPLY_VERIFICATION_FAILED');
      const device = this.database.getDeviceById(this.session.deviceId)!;
      device.reachability = { ...device.reachability, discoveryInterface: { name: applied.interfaceAlias, ipAddress: this.session.selectedCandidate.ipAddress, netmask: prefixToSubnetMask(this.session.selectedCandidate.prefixLength), interfaceIndex: applied.interfaceIndex }, subnetClassification: 'LOCAL' };
      await this.diagnostics.diagnose(device);
      this.database.upsertDevice(device);
      this.session.cameraReachabilityVerified = Boolean(device.diagnostics?.checks.slice(-6).some(check => check.success && !check.ambiguousIdentity));
      this.session.state = 'PAIRED';
      this.session.message = this.session.cameraReachabilityVerified ? 'Adapter Pair succeeded and the camera responded.' : 'Adapter Pair succeeded, but camera communication remains unverified. Restore remains available.';
      this.session.updatedAt = new Date().toISOString();
      await this.recovery.save(this.session);
      this.audit('Pair applied', { deviceId: device.id, interfaceIndex: applied.interfaceIndex, cameraVerified: this.session.cameraReachabilityVerified });
      return this.getStatus()!;
    } catch (error) {
      this.session.state = 'ROLLBACK_REQUIRED'; this.session.message = error instanceof Error ? error.message : 'Pair failed after network modification began.'; this.session.errorCode = error instanceof NetworkConfigurationError ? error.code : 'PAIR_FAILED'; this.session.updatedAt = new Date().toISOString();
      await this.recovery.save(this.session); throw error;
    }
  }

  async restore(): Promise<PairSessionState> {
    if (!this.session?.recoveryAvailable) throw new NetworkConfigurationError('No original adapter snapshot is available to restore.', 'NO_RECOVERY');
    this.session.state = 'RESTORING'; this.session.updatedAt = new Date().toISOString();
    try {
      const restored = await this.adapters.restore(this.session.originalAdapter);
      const ok = this.verifyRestoration(this.session.originalAdapter, restored);
      if (!ok) throw new NetworkConfigurationError('Windows did not report the complete original adapter configuration after restore.', 'RESTORE_VERIFICATION_FAILED');
      this.session.state = 'RESTORED'; this.session.recoveryAvailable = false; this.session.message = 'Original network configuration restored and verified.'; this.session.updatedAt = new Date().toISOString();
      await this.recovery.clear(); this.audit('Original adapter configuration restored', { interfaceIndex: restored.interfaceIndex }); return this.getStatus()!;
    } catch (error) {
      this.session.state = 'ROLLBACK_REQUIRED'; this.session.errorCode = error instanceof NetworkConfigurationError ? error.code : 'RESTORE_FAILED'; this.session.message = error instanceof Error ? error.message : 'Restore failed.'; this.session.updatedAt = new Date().toISOString(); await this.recovery.save(this.session); throw error;
    }
  }

  cancelPreparation(): PairSessionState | null {
    this.preparationController?.abort(); this.preparationController = null;
    if (this.session && ['PREPARING', 'CHECKING_ADDRESS', 'READY_FOR_CONFIRMATION'].includes(this.session.state)) { this.session.state = 'CANCELLED'; this.session.message = 'Pair preparation cancelled; no adapter change was made.'; this.session.updatedAt = new Date().toISOString(); }
    return this.getStatus();
  }

  private async findCandidates(device: Device, prefix: number, adapters: WindowsAdapterSnapshot[], signal: AbortSignal): Promise<PairCandidate[]> {
    const camera = ipToNumber(device.network.ipAddress)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (camera & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
    const hostCount = broadcast - network - 1;
    const excluded = new Set([device.network.ipAddress, ...this.database.getDevices().map(item => item.network.ipAddress), ...adapters.flatMap(item => item.ipv4Addresses.map(ip => ip.address))]);
    const candidates: PairCandidate[] = [];
    const attempts = Math.min(32, hostCount);
    for (let attempt = 1; attempt <= attempts && candidates.length < 3; attempt++) {
      if (signal.aborted) throw new NetworkConfigurationError('Pair preparation was cancelled.', 'CANCELLED');
      const hostOffset = ((camera - network + attempt * 37 - 1) % hostCount) + 1;
      const candidateIp = numberToIp((network + hostOffset) >>> 0);
      if (excluded.has(candidateIp) || candidateIp === numberToIp(network) || candidateIp === numberToIp(broadcast)) continue;
      const result = await this.checker.check(candidateIp, { signal });
      if (result.availability === 'AVAILABLE') candidates.push({ ipAddress: candidateIp, prefixLength: prefix, confidence: 'AVAILABLE', evidence: result.evidence });
    }
    return candidates;
  }

  private verifyRestoration(expected: WindowsAdapterSnapshot, actual: WindowsAdapterSnapshot): boolean {
    if (expected.dhcpEnabled !== actual.dhcpEnabled || expected.dnsAutomatic !== actual.dnsAutomatic) return false;
    if (!expected.dhcpEnabled && expected.ipv4Addresses.some(ip => !actual.ipv4Addresses.some(item => item.address === ip.address && item.prefixLength === ip.prefixLength))) return false;
    if (expected.defaultGateways.some(gateway => !actual.defaultGateways.includes(gateway))) return false;
    if (!expected.dnsAutomatic && expected.dnsServers.some(server => !actual.dnsServers.includes(server))) return false;
    return true;
  }

  private audit(message: string, details: Record<string, unknown>) { appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'SYSTEM', level: 'INFO', message, details }); }
}
