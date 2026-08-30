import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export interface ResolutionAction {
  macAddress: string;
  newIp: string;
  newSubnet: string;
  newGateway: string;
}

export class DuplicateAssistantDrawer {
  /**
   * Section 13.2: Duplicate IP Address Collisions Resolver
   * Isolates competing hardware using permanent MAC/Serial anchors and cleanly reassigns static parameters.
   */
  public static resolveCollision(collidingIp: string, resolutions: ResolutionAction[]): { success: boolean; message: string } {
    const collisions = projectDb.getCollisions();
    const targetCollision = collisions.find(c => c.ipAddress === collidingIp);

    if (!targetCollision) {
      return { success: false, message: `No active collision found for IP ${collidingIp}` };
    }

    for (const res of resolutions) {
      const dev = projectDb.getDeviceByMac(res.macAddress) || projectDb.getDeviceById(res.macAddress);
      if (dev) {
        dev.network.ipAddress = res.newIp;
        dev.network.subnetMask = res.newSubnet;
        dev.network.gateway = res.newGateway;
        dev.status = 'AUTHENTICATED';
        dev.statusMessage = `Collision resolved: Static IP reassigned to ${res.newIp}`;
        dev.lastSeenAt = new Date().toISOString();
      }
    }

    targetCollision.resolved = true;

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'EDGE_CASE',
      level: 'SUCCESS',
      message: `Section 13.2 Resolved: Collision on IP ${collidingIp} cleared via Duplicate Assistant drawer. Devices reassigned to clean static IPs.`,
    });

    return {
      success: true,
      message: `Collision on ${collidingIp} successfully resolved across ${resolutions.length} device anchors.`,
    };
  }
}
