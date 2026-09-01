import { Device } from '../../types/index.ts';
import { projectDb } from '../storage/project_db.ts';

export class Phase5BatchProvisioning {
  /**
   * Phase 5: Batch Provisioning and Policy Application
   * Legacy compatibility boundary. Configuration now requires the explicit,
   * backend-authoritative preview/confirm/apply services.
   */
  public static async execute(): Promise<{ provisionedDevices: Device[]; logs: string[] }> {
    const logs: string[] = [];
    logs.push('[Phase 5] Automatic provisioning is unavailable. Use an explicit reviewed configuration workflow.');

    const devices = projectDb.getDevices();
    const provisionedDevices: Device[] = [];

    logs.push(`[Phase 5] No camera writes were attempted for ${devices.length} device(s).`);

    return { provisionedDevices, logs };
  }
}
