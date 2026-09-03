import { PhaseState, NICInfo } from '../../types/index.ts';
import { Phase1Topology } from './phase1_topology.ts';
import { DisabledPassiveDiscoveryProvider, PassiveDiscoveryProvider, Phase2PassiveListener } from './phase2_passive.ts';
import { Phase3ActiveProbing } from './phase3_probing.ts';
import { Phase4IdentityReconciliation } from './phase4_reconcile.ts';
import { Phase5BatchProvisioning } from './phase5_provision.ts';
import { Phase6TelemetryVerification } from './phase6_telemetry.ts';
import { projectDb } from '../storage/project_db.ts';
import { NodeOnvifWsDiscoveryTransport, OnvifDiscoveryTransport } from '../drivers/ws_discovery_transport.ts';
import { DeviceEnricher, WindowsDeviceEnricher } from './device_enrichment.ts';
import { LocalHostIdentity } from '../network/local_host_identity.ts';

export type PipelineEventCallback = (event: {
  type: 'PHASE_START' | 'PHASE_PROGRESS' | 'PHASE_COMPLETE' | 'PIPELINE_COMPLETE' | 'DEVICE_DISCOVERED' | 'DEVICE_ENRICHED' | 'SCAN_COMPLETE' | 'SCAN_CANCELLED' | 'LOG';
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
    this.passiveDiscovery = dependencies.passiveDiscovery ?? new DisabledPassiveDiscoveryProvider();
    this.onvifDiscovery = dependencies.onvifDiscovery ?? new NodeOnvifWsDiscoveryTransport();
    this.deviceEnricher = dependencies.deviceEnricher ?? new WindowsDeviceEnricher();
    this.discoveryTimeoutMs = dependencies.discoveryTimeoutMs ?? 3500;
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
        cb(event);
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

  public stopDiscovery(): boolean {
    if (!this.abortController || this.abortController.signal.aborted) return false;
    this.abortController.abort();
    return true;
  }

  public async runDiscoveryScan(options: { adapterNames?: string[]; emitTerminalEvent?: boolean } = {}): Promise<'COMPLETED'|'CANCELLED'|'BUSY'> {
    if (this.isRunning) return 'BUSY';
    this.isRunning = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    try {
      for (const p of this.phases.slice(0, 4)) {
        p.status = 'PENDING';
        p.progressPct = 0;
        p.devicesFoundCount = 0;
        p.logs = [];
      }
      await this.runPhase1();
      if (options.adapterNames?.length) this.currentInterfaces = this.currentInterfaces.filter(nic => options.adapterNames!.includes(nic.name));
      if (!signal.aborted) await this.runPhase2(signal);
      if (!signal.aborted) await this.runPhase3(signal);
      if (!signal.aborted) await this.runPhase4();

      if (signal.aborted && options.emitTerminalEvent !== false) {
        this.emit({ type: 'SCAN_CANCELLED', data: { project: projectDb.getProject() } });
      } else if (options.emitTerminalEvent !== false) {
        this.emit({ type: 'SCAN_COMPLETE', data: { project: projectDb.getProject() } });
      }
      return signal.aborted ? 'CANCELLED' : 'COMPLETED';
    } finally {
      this.abortController = null;
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

  public async runPhase2(signal?: AbortSignal): Promise<void> {
    const phase = this.phases[1];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 2 });

    const result = await Phase2PassiveListener.execute(this.currentInterfaces, this.passiveDiscovery, signal);
    const localHost = LocalHostIdentity.fromAddresses([...this.localHost.values(), ...this.currentInterfaces.map(value => value.ipAddress)]);
    result.devices = result.devices.filter(device => localHost.isRemoteDevice(device));
    for (const device of result.devices) {
      const isNew = !projectDb.getDevices().some(existing => existing.id === device.id || Boolean(
        (device.anchor.macAddress && existing.anchor.macAddress?.toLowerCase() === device.anchor.macAddress.toLowerCase()) ||
        (device.anchor.onvifEndpointUuid && existing.anchor.onvifEndpointUuid?.toLowerCase() === device.anchor.onvifEndpointUuid.toLowerCase()) ||
        (device.anchor.serialNumber && existing.anchor.serialNumber?.toLowerCase() === device.anchor.serialNumber.toLowerCase())
      ));
      const stored = projectDb.upsertDevice(device);
      this.emit({ type: 'DEVICE_DISCOVERED', phaseNumber: 2, data: { device: stored, isNew, project: projectDb.getProject() } });
    }
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.devices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 2, data: result });
  }

  public async runPhase3(signal?: AbortSignal): Promise<void> {
    const phase = this.phases[2];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 3 });

    const result = await Phase3ActiveProbing.execute(this.currentInterfaces, this.onvifDiscovery, this.deviceEnricher, {
      signal,
      timeoutMs: this.discoveryTimeoutMs,
      onDevice: (device, isNew) => this.emit({
        type: 'DEVICE_DISCOVERED',
        phaseNumber: 3,
        data: { device, isNew, project: projectDb.getProject() },
      }),
      onEnrichment: (device, changedFields) => this.emit({
        type: 'DEVICE_ENRICHED',
        phaseNumber: 3,
        data: { device, changedFields, project: projectDb.getProject() },
      }),
    }, LocalHostIdentity.fromAddresses([...this.localHost.values(), ...this.currentInterfaces.map(value => value.ipAddress)]));
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.probedDevices.length;
    phase.progressPct = 100;
    phase.status = result.cancelled ? 'SKIPPED' : 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 3, data: result });
  }

  public async runPhase4(): Promise<void> {
    const phase = this.phases[3];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 4 });

    const result = await Phase4IdentityReconciliation.execute();
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
