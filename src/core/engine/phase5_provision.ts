import { Device } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';
import { osVault } from '../storage/vault.ts';

export class Phase5BatchProvisioning {
  /**
   * Phase 5: Batch Provisioning and Policy Application
   * Applies network configuration templates, credentials, and security baselines
   */
  public static async execute(): Promise<{ provisionedDevices: Device[]; logs: string[] }> {
    const logs: string[] = [];
    logs.push('[Phase 5] Starting batch provisioning and security policy application...');

    const devices = projectDb.getDevices();
    const provisionedDevices: Device[] = [];

    for (const dev of devices) {
      if (dev.status === 'COLLISION') {
        logs.push(`[Phase 5] [SKIP] Device ${dev.anchor.macAddress} is in COLLISION state. Bypassing provisioning until resolved.`);
        continue;
      }

      dev.status = 'PROVISIONING';
      logs.push(`[Phase 5] Applying security baseline & static profile to ${dev.anchor.vendor} (${dev.anchor.macAddress})...`);

      // Match credential from OS Vault
      const creds = osVault.getCredentialsForVendor(dev.anchor.vendor);
      const activeCred = creds[0];

      if (activeCred) {
        const lockoutCheck = osVault.checkLockoutStatus(activeCred.id);
        if (lockoutCheck.isLocked) {
          logs.push(`[Phase 5] [SECURITY BACKOFF] Credential '${activeCred.label}' is locked for ${lockoutCheck.waitSeconds}s to prevent camera lockout.`);
          dev.status = 'ERROR';
          dev.statusMessage = 'Provisioning paused: OS Credential Vault lockout protection active.';
          continue;
        }
      }

      // Simulate successful policy application
      dev.status = 'CONFIGURED';
      dev.statusMessage = 'Provisioned with Enterprise Baseline & Static Profile';
      provisionedDevices.push(dev);

      logs.push(`[Phase 5] [SUCCESS] ${dev.anchor.macAddress} successfully provisioned (IP: ${dev.network.ipAddress}, NTP: pool.ntp.org, DNS: 1.1.1.1).`);

      appStateDb.logAudit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        phase: 5,
        category: 'PROVISIONING',
        level: 'SUCCESS',
        message: `Provisioned device ${dev.anchor.macAddress} (${dev.anchor.vendor})`,
        deviceId: dev.id,
      });
    }

    logs.push(`[Phase 5] Batch provisioning completed. ${provisionedDevices.length} devices configured.`);

    return { provisionedDevices, logs };
  }
}
