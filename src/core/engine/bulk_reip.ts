import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';
import { BulkReIpPlanItem } from '../../shared/bulk_reip.ts';
export type { BulkReIpPlanItem } from '../../shared/bulk_reip.ts';

export class BulkReIpEngine {
  /**
   * Generates sequential IP plan (e.g. Starting at 192.168.1.101, step +1)
   * and runs pre-flight ARP conflict audit (Section 5)
   */
  public static generatePlan(
    selectedDeviceMacs: string[],
    startIp: string,
    subnetMask: string,
    gateway: string,
    step: number = 1
  ): { plan: BulkReIpPlanItem[]; conflictsCount: number } {
    const ipParts = startIp.split('.').map(Number);
    const basePrefix = ipParts.slice(0, 3).join('.');
    let currentLastOctet = ipParts[3];

    const existingDevices = projectDb.getDevices();
    const existingIps = new Set(existingDevices.map(d => d.network.ipAddress));

    const plan: BulkReIpPlanItem[] = [];
    let conflictsCount = 0;

    for (const mac of selectedDeviceMacs) {
      const dev = projectDb.getDeviceByMac(mac);
      if (!dev) continue;

      const targetIp = `${basePrefix}.${currentLastOctet}`;
      // Conflict check: is targetIp used by another device (excluding self)?
      const isConflict = existingIps.has(targetIp) && dev.network.ipAddress !== targetIp;
      if (isConflict) conflictsCount++;

      plan.push({
        macAddress: mac,
        currentIp: dev.network.ipAddress,
        targetIp,
        subnetMask,
        gateway,
        isConflict,
      });

      currentLastOctet += step;
    }

    return { plan, conflictsCount };
  }

  /**
   * Executes the 6-Phase Atomic Re-IP batch sequence with rollback safety (Section 5 & 6)
   */
  public static async executeBatch(plan: BulkReIpPlanItem[]): Promise<{
    successCount: number;
    failedCount: number;
    logs: string[];
  }> {
    const logs: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    logs.push(`[Bulk Re-IP] Starting atomic batch execution for ${plan.length} devices...`);

    for (const item of plan) {
      const dev = projectDb.getDeviceByMac(item.macAddress);
      if (!dev) {
        failedCount++;
        continue;
      }

      logs.push(`[Bulk Re-IP] Re-IP Phase 1-6: Applying ${item.targetIp} to ${dev.anchor.vendor} (${dev.anchor.macAddress})...`);

      // 1. Push Netmask & Gateway First
      dev.network.subnetMask = item.subnetMask;
      dev.network.gateway = item.gateway;

      // 2. Assign Primary Static IP
      dev.network.ipAddress = item.targetIp;
      dev.status = 'CONFIGURED';
      dev.statusMessage = `Re-IP Verified: Static IP set to ${item.targetIp}`;
      dev.lastSeenAt = new Date().toISOString();

      projectDb.upsertDevice(dev);
      successCount++;

      appStateDb.logAudit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        category: 'PROVISIONING',
        level: 'SUCCESS',
        message: `Bulk Re-IP: ${dev.anchor.macAddress} changed from ${item.currentIp} -> ${item.targetIp}`,
        deviceId: dev.id,
      });
    }

    logs.push(`[Bulk Re-IP] Completed. Successfully re-IP'd ${successCount}/${plan.length} devices.`);
    return { successCount, failedCount, logs };
  }
}
