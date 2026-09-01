import { Device } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export class Phase6TelemetryVerification {
  /**
   * Phase 6: Telemetry Verification and Audit Export
   * Summarizes real current-session reachability evidence. RTSP, packet loss,
   * switch, and PoE claims remain unknown until dedicated providers exist.
   */
  public static async execute(): Promise<{ verifiedDevices: Device[]; auditSummary: Record<string, any>; logs: string[] }> {
    const logs: string[] = [];
    logs.push('[Phase 6] Summarizing current-session diagnostic evidence...');

    const devices = projectDb.getDevices();
    const verifiedDevices: Device[] = [];

    for (const dev of devices) {
      delete dev.telemetry;
      const hasPositiveEvidence = Boolean(
        dev.reachability?.lastSuccessfulResponseAt ||
        dev.diagnostics?.checks.some(check => check.success && !check.ambiguousIdentity)
      );
      if (hasPositiveEvidence) {
        verifiedDevices.push(dev);
        logs.push(`[Phase 6] Current reachability evidence exists for ${dev.id} at ${dev.network.ipAddress}.`);
      } else {
        logs.push(`[Phase 6] No current positive evidence for ${dev.id}; health, packet loss, and RTSP remain unknown.`);
      }
    }

    const auditSummary = {
      siteName: projectDb.getProject().name,
      siteLocation: projectDb.getProject().siteLocation,
      technician: projectDb.getProject().technicianName,
      totalDiscovered: devices.length,
      totalVerified: verifiedDevices.length,
      totalCollisions: projectDb.getCollisions().filter(c => !c.resolved).length,
      totalRogueDhcpAlerts: projectDb.getRogueDhcpEvents().length,
      auditTimestamp: new Date().toISOString(),
      evidenceStatus: `${verifiedDevices.length}/${devices.length} device(s) have current positive reachability evidence`,
    };

    logs.push(`[Phase 6] Verification summary: ${auditSummary.evidenceStatus}. No compliance or field-certification claim is made.`);

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      phase: 6,
      category: 'SYSTEM',
      level: verifiedDevices.length === devices.length && devices.length > 0 ? 'SUCCESS' : 'WARNING',
      message: `Phase 6 evidence summary: ${verifiedDevices.length}/${devices.length} device(s) currently verified.`,
      details: auditSummary,
    });

    return { verifiedDevices, auditSummary, logs };
  }
}
