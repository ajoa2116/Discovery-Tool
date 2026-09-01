import { Device } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export interface LegacyOnboardingPayload {
  macAddress: string;
  vendor: string;
  model: string;
  staticIp: string;
  subnetMask: string;
  gateway: string;
  httpPort: number;
  rtspPort: number;
  credentialId?: string;
}

export class LegacyHardwareOnboarding {
  /**
   * Section 13.1: Unresponsive Legacy Hardware & Manual Onboarding
   * Records technician-supplied network evidence without claiming live verification or configuration.
   */
  public static onboardLegacyDevice(payload: LegacyOnboardingPayload): Device {
    const dev: Device = {
      id: payload.macAddress,
      anchor: {
        macAddress: payload.macAddress,
        vendor: payload.vendor || appStateDb.resolveVendor(payload.macAddress),
        model: payload.model || undefined,
      },
      network: {
        ipAddress: payload.staticIp,
        subnetMask: payload.subnetMask,
        gateway: payload.gateway,
        port: payload.httpPort || 80,
        protocol: 'HTTP_LEGACY',
      },
      status: 'UNKNOWN',
      statusMessage: 'Manually entered; current reachability and identity are not verified.',
      discoveredPhase: 1,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      sessionVerification: 'NOT_VERIFIED',
    };

    projectDb.upsertDevice(dev);

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'EDGE_CASE',
      level: 'INFO',
      message: `Manual device record created for MAC ${payload.macAddress} at technician-supplied address ${payload.staticIp}; not live-verified.`,
      deviceId: dev.id,
    });

    return dev;
  }
}
