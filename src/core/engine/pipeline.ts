import { DiscoveryContext } from '../../shared/discovery_session.ts';
import { hasCctvEvidence, matchesAdvancedScanFilters, sameDiscoveryIdentity } from '../../shared/discovery_evidence.ts';
import { AdvancedScanRequest } from '../../shared/advanced_scan.ts';
import { appStateDb } from '../storage/app_db.ts';
import { PhaseState, NICInfo } from '../../types/index.ts';
import { Phase1Topology } from './phase1_topology.ts';
import { WindowsNeighborDiscoveryProvider, PassiveDiscoveryProvider, Phase2PassiveListener } from './phase2_passive.ts';
import { Phase3ActiveProbing } from './phase3_probing.ts';
import { Phase4IdentityReconciliation } from './phase4_reconcile.ts';
import { Phase5BatchProvisioning } from './phase5_provision.ts';
import { Phase6TelemetryVerification } from './phase6_telemetry.ts';
import { projectDb, SiteProjectDatabase } from '../storage/project_db.ts';
import { DEFAULT_DISCOVERY_WINDOW_MS, NodeOnvifWsDiscoveryTransport, OnvifDiscoveryTransport } from '../drivers/ws_discovery_transport.ts';
import { DeviceEnricher, WindowsDeviceEnricher } from './device_enrichment.ts';
import { LocalHostIdentity } from '../network/local_host_identity.ts';

export type PipelineEventCallback = (event: {
  type: 'PHASE_START' | 'PHASE_PROGRESS' | 'PHASE_COMPLETE' | 'PIPELINE_COMPLETE' | 'DEVICE_DISCOVERED' | 'DEVICE_ENRICHED' | 'SCAN_COMPLETE' | 'SCAN_CANCELLED' | 'LOG';
  context?: DiscoveryContext;
  phaseNumber?: number;
  data?: any;
}) => void;

export interface PipelineDependencies {
  passiveDiscovery?: PassiveDiscoveryProvider;
  onvifDiscovery?: OnvifDiscoveryTransport;
  deviceEnricher?: DeviceEnricher;
  discoveryTimeoutMs?: number;
  phaseDelayMs?: number;
}

export class BatchExecutionPipeline {
  private phases: PhaseState[] = [
    {
      phaseNumber: 1,
      name: 'Topology Enumeration',
      description: 'NIC enumeration & subnet boundary mapping',
      status: 'PENDING',
      progressPct: 0,
      devicesFoundCount: 0,
      logs: [],
    },
    {
      phaseNumber: 2,
      name: 'Passive Listener',
      description: 'Non-destructive ARP/DHCP cross-subnet indexing',
      status: 'PENDING',
      progressPct: 0,
      devicesFoundCount: 0,
      logs: [],
    },
    {
      phaseNumber: 3,
      name: 'Active Probing',
      description: 'ONVIF WS-Discovery & handshake verification',
      status: 'PENDING',
      progressPct: 0,
      devicesFoundCount: 0,
      logs: [],
    },
    {
      phaseNumber: 4,
      name: 'Identity Reconciliation',
      description: 'Permanent MAC/Serial anchor binding & collision detection',
      status: 'PENDING',
      progressPct: 0,
      devicesFoundCount: 0,
      logs: [],
    },
    {
      phaseNumber: 5,
      name: 'Batch Provisioning',
      description: 'Policy application & static parameter assignment',
      status: 'PENDING',
      progressPct: 0,
      devicesFoundCount: 0,
      logs: [],
    },
    {
      phaseNumber: 6,
      name: 'Telemetry Verification',
      description: 'Heartbeat, stream health & final audit export',
      status: 'PENDING',
      progressPct: 0,
      devicesFoundCount: 0,
      logs: [],
    },
  ];

  private isRunning = false;
  private context: DiscoveryContext | null = null;
  private currentInterfaces: NICInfo[] = [];
  private localHost = LocalHostIdentity.fromAddresses([]);
  private callbacks: PipelineEventCallback[] = [];
  private abortController: AbortController | null = null;
  private readonly passiveDiscovery: PassiveDiscoveryProvider;
  private readonly onvifDiscovery: OnvifDiscoveryTransport;
  private readonly deviceEnricher: DeviceEnricher;
  private readonly discoveryTimeoutMs: number;
  private readonly phaseDelayMs: number;

  constructor(dependencies: PipelineDependencies = {}) {
    this.passiveDiscovery = dependencies.passiveDiscovery ?? new WindowsNeighborDiscoveryProvider();
    this.onvifDiscovery = dependencies.onvifDiscovery ?? new NodeOnvifWsDiscoveryTransport();
    this.deviceEnricher = dependencies.deviceEnricher ?? new WindowsDeviceEnricher();
    this.discoveryTimeoutMs = dependencies.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_WINDOW_MS;
    this.phaseDelayMs = dependencies.phaseDelayMs ?? 0;
  }

  public subscribe(cb: PipelineEventCallback): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(c => c !== cb);
    };
  }

  private emit(event: any): void {
    for (const cb of this.callbacks) {
      try {
        cb({ ...event, context: this.context || { origin: 'INTERNAL', sessionId: 'unscoped' } });
      } catch (err) {
        console.error('Callback error:', err);
      }
    }
  }

  public getStates(): PhaseState[] {
    return this.phases;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public stopDiscovery(sessionId?: string): boolean {
    if (sessionId !== undefined && this.context?.sessionId !== sessionId) return false;
    if (!this.abortController || this.abortController.signal.aborted) return false;
    this.abortController.abort();
    return true;
  }

  public async runDiscoveryScan(options: { context?: DiscoveryContext; signal?: AbortSignal; adapterNames?: string[]; filters?: AdvancedScanRequest['filters']; discoveryMethods?: string[]; emitTerminalEvent?: boolean; database?: SiteProjectDatabase; emitDeviceEvents?: boolean } = {}): Promise<'COMPLETED'|'CANCELLED'|'BUSY'> {
    if (this.isRunning) return 'BUSY';
    this.isRunning = true;
    this.context = options.context || { origin: 'MANUAL', sessionId: crypto.randomUUID() };
    this.abortController = new AbortController();
    const sessionId = this.context.sessionId;
    const cancel = () => this.stopDiscovery(sessionId);
    if (options.signal?.aborted) cancel(); else options.signal?.addEventListener('abort', cancel, { once: true });
    const signal = this.abortController.signal;
    try {
      for (const p of this.phases.slice(0, 4)) {
        p.status = 'PENDING';
        p.progressPct = 0;
        p.devicesFoundCount = 0;
        p.logs = [];
      }
      const database = options.database || projectDb;
      if (!signal.aborted) await this.runPhase1();
      if (options.adapterNames?.length) this.currentInterfaces = this.currentInterfaces.filter(nic => options.adapterNames!.includes(nic.name));
      if (!signal.aborted && (!options.discoveryMethods || options.discoveryMethods.includes('NEIGHBOR'))) await this.runPhase2(signal, database, options.emitDeviceEvents !== false, options.filters);
      if (!signal.aborted && (!options.discoveryMethods || options.discoveryMethods.includes('ONVIF'))) await this.runPhase3(signal, database, options.emitDeviceEvents !== false, options.filters);
      if (!signal.aborted) await this.runPhase4(database);

      if (signal.aborted && options.emitTerminalEvent !== false) {
        this.emit({ type: 'SCAN_CANCELLED', data: { project: database.getProject() } });
      } else if (options.emitTerminalEvent !== false) {
        this.emit({ type: 'SCAN_COMPLETE', data: { project: database.getProject() } });
      }
      return signal.aborted ? 'CANCELLED' : 'COMPLETED';
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      this.abortController = null; this.context = null;
      this.isRunning = false;
    }
  }

  public async runFullPipeline(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    try {
      // Reset phases
      for (const p of this.phases) {
        p.status = 'PENDING';
        p.progressPct = 0;
        p.logs = [];
      }

      // Phase 1
      await this.runPhase1();
      if (this.phaseDelayMs) await new Promise(r => setTimeout(r, this.phaseDelayMs));

      // Phase 2
      await this.runPhase2(this.abortController.signal);
      if (this.phaseDelayMs) await new Promise(r => setTimeout(r, this.phaseDelayMs));

      // Phase 3
      await this.runPhase3(this.abortController.signal);
      if (this.phaseDelayMs) await new Promise(r => setTimeout(r, this.phaseDelayMs));

      // Phase 4
      await this.runPhase4();
      if (this.phaseDelayMs) await new Promise(r => setTimeout(r, this.phaseDelayMs));

      // Phase 5
      await this.runPhase5();
      if (this.phaseDelayMs) await new Promise(r => setTimeout(r, this.phaseDelayMs));

      // Phase 6
      await this.runPhase6();

      this.emit({ type: 'PIPELINE_COMPLETE', data: { project: projectDb.getProject() } });
    } finally {
      this.abortController = null;
      this.isRunning = false;
    }
  }

  public async runPhase1(): Promise<void> {
    const phase = this.phases[0];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 1 });

    const result = await Phase1Topology.execute();
    this.currentInterfaces = result.interfaces;
    this.localHost = LocalHostIdentity.fromInterfaces(result.interfaces);
    phase.logs.push(...result.logs);
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 1, data: result });
  }

  public async runPhase2(signal?: AbortSignal, database: SiteProjectDatabase = projectDb, emitDeviceEvents = true, filters?: AdvancedScanRequest['filters']): Promise<void> {
    const phase = this.phases[1];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 2 });

    const result = await Phase2PassiveListener.execute(this.currentInterfaces, this.passiveDiscovery, signal);
    const localHost = LocalHostIdentity.fromAddresses([...this.localHost.values(), ...this.currentInterfaces.map(value => value.ipAddress)]);
    result.devices = result.devices.filter(device => localHost.isRemoteDevice(device));
    const observed = result.devices.length;
    const excluded = result.devices.filter(device => {
      const known = database.getDevices().find(existing => sameDiscoveryIdentity(existing,device));
      return !(known || (filters ? matchesAdvancedScanFilters(device,filters) : hasCctvEvidence(device)));
    });
    const excludedSet = new Set(excluded);
    result.devices = result.devices.filter(device => !excludedSet.has(device));
    if (excluded.length) {
      result.logs.push(`[Phase 2] ${excluded.length} generic or filtered neighbor observations retained in Support evidence; not promoted to inventory.`);
      appStateDb.logAudit({id:crypto.randomUUID(),timestamp:new Date().toISOString(),category:'DISCOVERY',level:'INFO',message:'Neighbor evidence inventory policy applied.',details:{observed,promoted:result.devices.length,excluded:excluded.length,samples:excluded.slice(0,32).map(device=>({ip:device.network.ipAddress,mac:device.anchor.macAddress,sourceAdapter:device.reachability?.discoveryInterface,classification:hasCctvEvidence(device)?'FILTERED_CCTV':'GENERIC_NETWORK',reason:'Does not meet current inventory discovery policy.'}))}});
    }
    for (let device of result.devices) {
      const known = database.getDevices().find(existing => sameDiscoveryIdentity(existing,device));
      if (known && !hasCctvEvidence(device)) {
        const unchangedAddress = known.network.ipAddress === device.network.ipAddress;
        device = {...device,anchor:{...known.anchor,macAddress:device.anchor.macAddress || known.anchor.macAddress},network:{...known.network,ipAddress:device.network.ipAddress},technician:known.technician,sessionVerification:unchangedAddress?known.sessionVerification:'NOT_VERIFIED',status:unchangedAddress?known.status:device.status,statusMessage:unchangedAddress?known.statusMessage:device.statusMessage};
      }
      const isNew = !database.getDevices().some(existing => existing.id === device.id || Boolean(
        (device.anchor.macAddress && existing.anchor.macAddress?.toLowerCase() === device.anchor.macAddress.toLowerCase()) ||
        (device.anchor.onvifEndpointUuid && existing.anchor.onvifEndpointUuid?.toLowerCase() === device.anchor.onvifEndpointUuid.toLowerCase()) ||
        (device.anchor.serialNumber && existing.anchor.serialNumber?.toLowerCase() === device.anchor.serialNumber.toLowerCase())
      ));
      const stored = database.upsertDevice(device);
      if (emitDeviceEvents) this.emit({ type: 'DEVICE_DISCOVERED', phaseNumber: 2, data: { device: stored, isNew, project: database.getProject() } });
    }
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.devices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 2, data: result });
  }

  public async runPhase3(signal?: AbortSignal, database: SiteProjectDatabase = projectDb, emitDeviceEvents = true, filters?: AdvancedScanRequest['filters']): Promise<void> {
    const phase = this.phases[2];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 3 });

    const result = await Phase3ActiveProbing.execute(this.currentInterfaces, this.onvifDiscovery, this.deviceEnricher, {
      signal,
      timeoutMs: this.discoveryTimeoutMs,
      acceptDevice: filters ? device => matchesAdvancedScanFilters(device,filters) : undefined,
      onDevice: emitDeviceEvents ? (device, isNew) => this.emit({
        type: 'DEVICE_DISCOVERED',
        phaseNumber: 3,
        data: { device, isNew, project: database.getProject() },
      }) : undefined,
      onEnrichment: emitDeviceEvents ? (device, changedFields) => this.emit({
        type: 'DEVICE_ENRICHED',
        phaseNumber: 3,
        data: { device, changedFields, project: database.getProject() },
      }) : undefined,
    }, LocalHostIdentity.fromAddresses([...this.localHost.values(), ...this.currentInterfaces.map(value => value.ipAddress)]), database);
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.probedDevices.length;
    phase.progressPct = 100;
    phase.status = result.cancelled ? 'SKIPPED' : 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 3, data: result });
  }

  public async runPhase4(database: SiteProjectDatabase = projectDb): Promise<void> {
    const phase = this.phases[3];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 4 });

    const result = await Phase4IdentityReconciliation.execute(database);
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.reconciledDevices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 4, data: result });
  }

  public async runPhase5(): Promise<void> {
    const phase = this.phases[4];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 5 });

    const result = await Phase5BatchProvisioning.execute();
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.provisionedDevices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 5, data: result });
  }

  public async runPhase6(): Promise<void> {
    const phase = this.phases[5];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 6 });

    const result = await Phase6TelemetryVerification.execute();
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.verifiedDevices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 6, data: result });
  }
}

export const pipelineEngine = new BatchExecutionPipeline();
