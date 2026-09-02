import { AdvancedScanMethod, AdvancedScanPlan, AdvancedScanRequest, AdvancedScanStatus } from '../../shared/advanced_scan.ts';
import { Device, DiagnosticCheckEvidence, WindowsAdapterSnapshot } from '../../types/index.ts';
import { NodeTcpDiagnosticProvider, TcpDiagnosticProvider, WindowsPingProvider, PingProvider } from './diagnostic_engine.ts';
import { PowerShellWindowsNetworkAdapterService, WindowsNetworkAdapterService } from '../network/windows_adapter_service.ts';
import { LocalHostIdentity } from '../network/local_host_identity.ts';
import { SiteProjectDatabase, projectDb } from '../storage/project_db.ts';

const PRESETS = { CAMERA_COMMON: [80, 443, 554, 8000, 8080], WEB: [80, 443, 8080, 8443], RTSP: [554] };
const MAX_TARGETS = 4096;
const MAX_PORTS = 32;
const ipNum = (ip: string) => {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(value => !/^(0|[1-9]\d{0,2})$/.test(value) || Number(value) > 255)) return null;
  return parts.reduce((number, value) => number * 256 + Number(value), 0);
};
const numIp = (number: number) => [24, 16, 8, 0].map(shift => (number >>> shift) & 255).join('.');
const mask = (prefix: number) => prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
const addresses = (target: AdvancedScanRequest['targets'][number]) => {
  if (target.type === 'CIDR') {
    const [ip, prefixText, ...extra] = target.cidr.trim().split('/');
    const number = ipNum(ip);
    const prefix = Number(prefixText);
    if (extra.length || number === null || !Number.isInteger(prefix) || prefix < 16 || prefix > 32) throw Error('CIDR must be valid IPv4 with prefix /16 through /32.');
    const start = (number & mask(prefix)) >>> 0;
    const count = 2 ** (32 - prefix);
    return Array.from({ length: count }, (_, index) => numIp((start + index) >>> 0));
  }
  const start = ipNum(target.start.trim());
  const end = ipNum(target.end.trim());
  if (start === null || end === null) throw Error('Start and end must be valid IPv4 addresses.');
  if (start > end) throw Error('Range start must not be after range end.');
  if (end - start + 1 > MAX_TARGETS) throw Error(`A single range may not exceed ${MAX_TARGETS} addresses.`);
  return Array.from({ length: end - start + 1 }, (_, index) => numIp(start + index));
};
const localContains = (adapter: WindowsAdapterSnapshot, ip: string) => adapter.ipv4Addresses.some(address => {
  const number = ipNum(ip);
  const local = ipNum(address.address);
  return number !== null && local !== null && ((number & mask(address.prefixLength)) >>> 0) === ((local & mask(address.prefixLength)) >>> 0);
});

export const matchesAdvancedScanFilters = (device: Device, filters: AdvancedScanRequest['filters']) => {
  const mac = device.anchor.macAddress?.toLowerCase() || '';
  const prefix = (filters.macPrefix || '').toLowerCase().replace(/-/g, ':');
  const vendor = device.anchor.vendor || 'Unknown';
  const likely = Boolean(device.anchor.onvifEndpointUuid || (vendor !== 'Unknown' && vendor !== 'Generic ONVIF Device'));
  if (prefix && !mac.startsWith(prefix)) return false;
  if (filters.manufacturer && filters.manufacturer !== 'Any' && !vendor.toLowerCase().includes(filters.manufacturer.toLowerCase())) return false;
  if (filters.onlyLikelyCameras && !likely) return false;
  if (!filters.includeUnknownDevices && !likely) return false;
  return true;
};

export class AdvancedScanValidationError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export class AdvancedScanPlanner {
  public plan(request: AdvancedScanRequest, adapters: WindowsAdapterSnapshot[]): AdvancedScanPlan {
    const errors: string[] = [];
    const warnings: string[] = [];
    const hasChoice = Boolean(request.adapterIndexes.length || request.targets.length || request.methods.length || request.portPresets.length || request.customPorts.length || request.filters.macPrefix || request.filters.manufacturer || request.filters.onlyLikelyCameras || !request.filters.includeUnknownDevices);
    if (!hasChoice) return { mode: 'QUICK_FALLBACK', request, adapterIndexes: [], normalizedTargets: [], methods: [], ports: [], routeSummary: [], estimatedTargetCount: 0, maximumTcpChecks: 0, warnings: [], valid: true, errors: [] };
    const selected = [...new Set(request.adapterIndexes)];
    for (const index of selected) {
      const adapter = adapters.find(value => value.interfaceIndex === index);
      if (!adapter?.eligible) errors.push(adapter?.eligibilityReason || `Adapter ${index} is not eligible.`);
    }
    let targets: string[] = [];
    for (const target of request.targets) {
      try { targets.push(...addresses(target)); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    targets = [...new Set(targets)];
    if (targets.length > MAX_TARGETS) errors.push(`Advanced Scan is limited to ${MAX_TARGETS} unique IPv4 targets.`);
    let ports = [...request.portPresets.flatMap(preset => PRESETS[preset] || []), ...request.customPorts];
    if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) errors.push('Ports must be integers from 1 through 65535.');
    ports = [...new Set(ports)].sort((left, right) => left - right);
    if (ports.length > MAX_PORTS) errors.push(`Advanced Scan is limited to ${MAX_PORTS} unique TCP ports.`);
    const methods = [...new Set(request.methods)] as AdvancedScanMethod[];
    if (!methods.length) methods.push('ONVIF', 'NEIGHBOR', 'PING');
    if (ports.length && !methods.includes('TCP')) methods.push('TCP');
    const chosen = adapters.filter(adapter => selected.includes(adapter.interfaceIndex));
    const routeSummary = targets.map(target => {
      const direct = chosen.find(adapter => localContains(adapter, target));
      if (direct) return { target, classification: 'DIRECTLY_CONNECTED' as const, adapterIndex: direct.interfaceIndex };
      const routed = chosen.find(adapter => adapter.defaultGateways.length);
      return routed ? { target, classification: 'ROUTABLE' as const, adapterIndex: routed.interfaceIndex } : { target, classification: 'NO_KNOWN_ROUTE' as const };
    });
    if (routeSummary.some(route => route.classification === 'NO_KNOWN_ROUTE')) warnings.push('One or more targets have no known route. Pair may be required; no automatic network change will occur.');
    return { mode: 'ADVANCED', request, adapterIndexes: selected, normalizedTargets: targets, methods, ports, routeSummary, estimatedTargetCount: targets.length, maximumTcpChecks: targets.length * (methods.includes('TCP') ? ports.length : 0), warnings, valid: errors.length === 0, errors };
  }
}

export interface AdvancedScanCallbacks { onDevice: (device: Device, isNew: boolean) => void; onComplete: (status: AdvancedScanStatus) => void }

export class AdvancedScanService {
  private controller: AbortController | null = null;
  private status: AdvancedScanStatus = { running: false, mode: 'IDLE', targetCount: 0, completedTargets: 0, findings: 0, cancelled: false, message: 'Idle' };
  constructor(
    private adapters: WindowsNetworkAdapterService = new PowerShellWindowsNetworkAdapterService(),
    private ping: PingProvider = new WindowsPingProvider(),
    private tcp: TcpDiagnosticProvider = new NodeTcpDiagnosticProvider(),
    private db: SiteProjectDatabase = projectDb,
    private planner = new AdvancedScanPlanner(),
  ) {}
  public async listAdapters() { return this.adapters.inspectAdapters(); }
  public async validate(request: AdvancedScanRequest) { return this.planner.plan(request, await this.listAdapters()); }
  public getStatus() { return structuredClone(this.status); }
  public stop() { if (!this.controller) return false; this.controller.abort(); return true; }
  public async execute(plan: AdvancedScanPlan, callbacks: AdvancedScanCallbacks) {
    if (!plan.valid) throw new AdvancedScanValidationError(plan.errors.join(' '), 'INVALID_PLAN');
    if (plan.mode !== 'ADVANCED') throw new AdvancedScanValidationError('Quick fallback must use the standard Quick Scan pipeline.', 'QUICK_FALLBACK');
    if (this.controller) throw new AdvancedScanValidationError('An Advanced Scan is already running.', 'SCAN_RUNNING');
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const startedAt = new Date().toISOString();
    this.status = { running: true, mode: 'ADVANCED', startedAt, targetCount: plan.normalizedTargets.length, completedTargets: 0, findings: 0, cancelled: false, message: 'Advanced Scan running' };
    try {
      const localHost = LocalHostIdentity.fromAdapters(await this.adapters.inspectAdapters());
      const concurrency = { CONSERVATIVE: 4, NORMAL: 12, FAST: 24 }[plan.request.performance];
      const queue = [...plan.normalizedTargets];
      const worker = async () => {
        while (queue.length && !signal.aborted) {
          const ip = queue.shift()!;
          const evidence: DiagnosticCheckEvidence[] = [];
          if (plan.methods.includes('PING')) evidence.push(await this.ping.check(ip, { timeoutMs: 700, signal }));
          if (plan.methods.includes('TCP')) for (const port of plan.ports) {
            if (signal.aborted) break;
            evidence.push(await this.tcp.check(ip, { port, timeoutMs: 600, signal }));
          }
          const success = evidence.some(value => value.success);
          if (success && !localHost.isLocal(ip)) {
            const existing = this.db.getDevices().find(device => device.network.ipAddress === ip);
            const now = new Date().toISOString();
            const device: Device = existing ? { ...existing, diagnostics: { ...existing.diagnostics, checks: [...(existing.diagnostics?.checks || []), ...evidence] }, lastSeenAt: now } : {
              id: `advanced:${ip}`, anchor: { macAddress: null, vendor: 'Unknown' }, network: { ipAddress: ip, ipAddressHistory: [ip], subnetMask: 'Unknown', port: 0, protocol: 'PASSIVE_SNIFF' }, status: 'UNKNOWN', discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now, sessionVerification: 'NOT_VERIFIED', technician: { name: 'Unknown Device', location: '', notes: '' }, configuredState: { inferred: null, manualOverride: false }, diagnostics: { checks: evidence },
            };
            const stored = this.db.upsertDevice(device);
            this.status.findings++;
            callbacks.onDevice(stored, !existing);
          }
          this.status.completedTargets++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, worker));
      this.status = { ...this.status, running: false, cancelled: signal.aborted, completedAt: new Date().toISOString(), message: signal.aborted ? 'Advanced Scan cancelled; completed findings were preserved.' : 'Advanced Scan completed.' };
      callbacks.onComplete(this.getStatus());
      return this.getStatus();
    } finally { this.controller = null; }
  }
}
