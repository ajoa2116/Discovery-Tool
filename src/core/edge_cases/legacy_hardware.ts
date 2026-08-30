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
   * Deploys static profile templates and forces direct MAC-level routing to bypass automated discovery limits.
   */
  public static onboardLegacyDevice(payload: LegacyOnboardingPayload): Device {
    const dev: Device = {
      id: payload.macAddress,
      anchor: {
        macAddress: payload.macAddress,
        vendor: payload.vendor || appStateDb.resolveVendor(payload.macAddress),
        model: payload.model || 'Legacy Analog-to-IP Encoder / Camera',
        firmwareVersion: 'Legacy Firmware (Manual Mode)',
      },
      network: {
        ipAddress: payload.staticIp,
        subnetMask: payload.subnetMask,
        gateway: payload.gateway,
        port: payload.httpPort || 80,
        protocol: 'HTTP_LEGACY',
      },
      status: 'AUTHENTICATED',
      statusMessage: 'Manually onboarded via Section 13.1 direct MAC routing template',
      discoveredPhase: 1,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      customStaticProfile: {
        assignedIp: payload.staticIp,
        assignedSubnet: payload.subnetMask,
        assignedGateway: payload.gateway,
        appliedCredentialsId: payload.credentialId,
      },
    };

    projectDb.upsertDevice(dev);

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'EDGE_CASE',
      level: 'INFO',
      message: `Section 13.1 Legacy Hardware: Manual onboarding executed for MAC ${payload.macAddress} -> Bound to ${payload.staticIp}`,
      deviceId: dev.id,
    });

    return dev;
  }
}
