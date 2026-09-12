import os from 'os';
import { NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { PowerShellWindowsNetworkAdapterService } from '../network/windows_adapter_service.ts';

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
    const windowsAdapters = process.platform === 'win32' ? await new PowerShellWindowsNetworkAdapterService().inspectAdapters().catch(() => {
      logs.push('[Phase 1] [INTERFACE WARNING] Windows adapter indexes unavailable; neighbor entries cannot be safely attributed.'); return [];
    }) : [];

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
            interfaceIndex: windowsAdapters.find(adapter => adapter.ipv4Addresses.some(ip => ip.address === addr.address))?.interfaceIndex,
          };

          if (!isEligibleDiscoveryInterface(nic)) {
            logs.push(`[Phase 1] Excluded Adapter [${name}]: internal, virtual, tunnel, or unusable IPv4 interface.`);
            continue;
          }
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

export function isEligibleDiscoveryInterface(nic: NICInfo): boolean {
  if (nic.isInternal || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(nic.ipAddress) || nic.ipAddress === '0.0.0.0') return false;
  return !/(loopback|bluetooth|wi-?fi direct|virtual|hyper-v|vmware|virtualbox|vpn|tunnel|tap|wireguard|teredo|isatap)/i.test(nic.name);
}
