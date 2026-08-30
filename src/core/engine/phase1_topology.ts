import os from 'os';
import { NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';

export class Phase1Topology {
  /**
   * Phase 1: Topology Enumeration and Subnet Mapping
   * Discovers all physical/virtual network adapters, subnets, and broadcast addresses
   */
  public static async execute(): Promise<{ interfaces: NICInfo[]; logs: string[] }> {
    const logs: string[] = [];
    logs.push('[Phase 1] Starting NIC enumeration and subnet topology mapping...');

    const interfaces: NICInfo[] = [];
    const networkInterfaces = os.networkInterfaces();

    for (const [name, addrs] of Object.entries(networkInterfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4') {
          // Calculate broadcast address
          const ipParts = addr.address.split('.').map(Number);
          const maskParts = addr.netmask.split('.').map(Number);
          const bcastParts = ipParts.map((part, i) => (part | (~maskParts[i] & 255)));
          const broadcast = bcastParts.join('.');

          const nic: NICInfo = {
            name,
            ipAddress: addr.address,
            netmask: addr.netmask,
            broadcast,
            mac: addr.mac || '00:00:00:00:00:00',
            isInternal: addr.internal,
          };

          interfaces.push(nic);
          logs.push(`[Phase 1] Identified Adapter [${name}]: IP ${nic.ipAddress} / Netmask ${nic.netmask} (Broadcast: ${nic.broadcast})`);
        }
      }
    }

    logs.push(`[Phase 1] Subnet mapping complete. ${interfaces.length} active IPv4 interfaces discovered.`);

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      phase: 1,
      category: 'DISCOVERY',
      level: 'INFO',
      message: `Phase 1 completed: ${interfaces.length} network adapters mapped.`,
    });

    return { interfaces, logs };
  }
}
