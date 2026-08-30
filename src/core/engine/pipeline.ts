import { PhaseState, NICInfo } from '../../types/index.ts';
import { Phase1Topology } from './phase1_topology.ts';
import { Phase2PassiveListener } from './phase2_passive.ts';
import { Phase3ActiveProbing } from './phase3_probing.ts';
import { Phase4IdentityReconciliation } from './phase4_reconcile.ts';
import { Phase5BatchProvisioning } from './phase5_provision.ts';
import { Phase6TelemetryVerification } from './phase6_telemetry.ts';
import { projectDb } from '../storage/project_db.ts';

export type PipelineEventCallback = (event: {
  type: 'PHASE_START' | 'PHASE_PROGRESS' | 'PHASE_COMPLETE' | 'PIPELINE_COMPLETE' | 'LOG';
  phaseNumber?: number;
  data?: any;
}) => void;

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
  private callbacks: PipelineEventCallback[] = [];

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

  public async runFullPipeline(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Reset phases
      for (const p of this.phases) {
        p.status = 'PENDING';
        p.progressPct = 0;
        p.logs = [];
      }

      // Phase 1
      await this.runPhase1();
      await new Promise(r => setTimeout(r, 600));

      // Phase 2
      await this.runPhase2();
      await new Promise(r => setTimeout(r, 800));

      // Phase 3
      await this.runPhase3();
      await new Promise(r => setTimeout(r, 800));

      // Phase 4
      await this.runPhase4();
      await new Promise(r => setTimeout(r, 600));

      // Phase 5
      await this.runPhase5();
      await new Promise(r => setTimeout(r, 600));

      // Phase 6
      await this.runPhase6();

      this.emit({ type: 'PIPELINE_COMPLETE', data: { project: projectDb.getProject() } });
    } finally {
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
    phase.logs.push(...result.logs);
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 1, data: result });
  }

  public async runPhase2(): Promise<void> {
    const phase = this.phases[1];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 2 });

    const result = await Phase2PassiveListener.execute(this.currentInterfaces);
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.devices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
    phase.endTime = new Date().toISOString();
    this.emit({ type: 'PHASE_COMPLETE', phaseNumber: 2, data: result });
  }

  public async runPhase3(): Promise<void> {
    const phase = this.phases[2];
    phase.status = 'RUNNING';
    phase.startTime = new Date().toISOString();
    this.emit({ type: 'PHASE_START', phaseNumber: 3 });

    const result = await Phase3ActiveProbing.execute(this.currentInterfaces);
    phase.logs.push(...result.logs);
    phase.devicesFoundCount = result.probedDevices.length;
    phase.progressPct = 100;
    phase.status = 'COMPLETED';
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
