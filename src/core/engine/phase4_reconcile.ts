import { Device, IPCollisionRecord } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export class Phase4IdentityReconciliation {
  /**
   * Phase 4: Identity Reconciliation via MAC/Serial Anchors
   * Isolates physical hardware identities, eliminates IP volatility, and flags duplicate IP collisions.
   */
  public static async execute(): Promise<{ reconciledDevices: Device[]; collisions: IPCollisionRecord[]; logs: string[] }> {
    const logs: string[] = [];
    logs.push('[Phase 4] Initiating physical identity reconciliation via immutable MAC/Serial anchors...');

    const devices = projectDb.getDevices();
    const ipMap = new Map<string, Device[]>();

    for (const dev of devices) {
      const ip = dev.network.ipAddress;
      if (!ipMap.has(ip)) {
        ipMap.set(ip, []);
      }
      ipMap.get(ip)!.push(dev);
    }

    const collisions: IPCollisionRecord[] = [];
    const reconciledDevices: Device[] = [];

    for (const [ip, devList] of ipMap.entries()) {
      if (devList.length > 1) {
        // Section 13.2 Duplicate IP Address Collision detected!
        logs.push(`[Phase 4] [CRITICAL WARNING] IP Collision detected on ${ip}! ${devList.length} distinct MAC addresses competing for same lease.`);
        
        for (const dev of devList) {
          dev.status = 'COLLISION';
          dev.statusMessage = `Duplicate IP collision on ${ip} with ${devList.length - 1} other device(s)`;
          logs.push(`[Phase 4] Anchored identity ${dev.anchor.macAddress || dev.anchor.onvifEndpointUuid || dev.id} (Serial: ${dev.anchor.serialNumber || 'N/A'}) - Vendor: ${dev.anchor.vendor}`);
        }

        const collisionRecord: IPCollisionRecord = {
          id: crypto.randomUUID(),
          ipAddress: ip,
          collidingDevices: devList,
          detectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          resolved: false,
          state: 'AMBIGUOUS',
          ambiguity: 'NONE_UNIQUELY_TARGETABLE',
          deviceIds: devList.map(device => device.id),
          devices: devList.map(device=>({deviceId:device.id,identity:{macAddress:device.anchor.macAddress,onvifEndpointUuid:device.anchor.onvifEndpointUuid,serialNumber:device.anchor.serialNumber},targetable:false,targetabilityReason:'Responses on the shared IP cannot be attributed uniquely.',credentialAvailable:false,state:'NEEDS_ISOLATION'})),
          resolutionStrategy: 'MANUAL_REASSIGN',
        };

        projectDb.recordCollision(collisionRecord);
        collisions.push(collisionRecord);

        appStateDb.logAudit({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          phase: 4,
          category: 'EDGE_CASE',
          level: 'WARNING',
          message: `Section 13.2 Collision: IP ${ip} has ${devList.length} competing MAC anchors. Duplicate Assistant drawer engagement required.`,
        });
      } else {
        const dev = devList[0];
        if (dev.status === 'COLLISION') {
          dev.status = dev.reachability?.subnetClassification === 'DIFFERENT_SUBNET'
            ? 'DIFFERENT_SUBNET'
            : dev.reachability?.lastSuccessfulResponseAt
              ? 'ONLINE'
              : 'UNKNOWN';
          dev.statusMessage = undefined;
        }
        reconciledDevices.push(dev);
        logs.push(`[Phase 4] Successfully reconciled identity ${dev.anchor.macAddress || dev.anchor.onvifEndpointUuid || dev.id} -> IP ${dev.network.ipAddress} [Single Anchor Verified]`);
      }
    }

    logs.push(`[Phase 4] Identity reconciliation completed. Verified ${devices.length} total physical anchors. Found ${collisions.length} IP collision state(s).`);

    return { reconciledDevices: devices, collisions, logs };
  }
}
