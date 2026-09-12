import { Device, NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { WindowsNeighborProvider, classifySubnet } from './device_enrichment.ts';
import { normalizeIPv4, normalizeManualMac } from '../../shared/address_validation.ts';

export class WindowsNeighborDiscoveryProvider implements PassiveDiscoveryProvider {
  constructor(private readonly neighbors: Pick<WindowsNeighborProvider, 'list'> = new WindowsNeighborProvider()) {}
  public async discover(interfaces: NICInfo[], signal?: AbortSignal): Promise<Device[]> {
    const entries = await this.neighbors.list(signal);
    return entries.slice(0,4096).flatMap(entry => {
      const nic = interfaces.find(nic => nic.interfaceIndex === entry.interfaceIndex && entry.interfaceIndex !== undefined);
      const ip = normalizeIPv4(entry.ipAddress), mac = normalizeManualMac(entry.macAddress);
      if (!nic || !ip || !mac || Number(ip.split('.')[0]) >= 224 || interfaces.some(local => local.ipAddress === ip) || ['0','1','Unreachable','Incomplete'].includes(String(entry.state))) return [];
      const now = new Date().toISOString(), subnetClassification = classifySubnet(ip,nic.ipAddress,nic.netmask);
      return [{ id:`mac:${mac}`, anchor:{macAddress:mac,vendor:'Unknown'}, network:{ipAddress:ip,subnetMask:null,port:0,protocol:'PASSIVE_SNIFF' as const},
        status:subnetClassification === 'DIFFERENT_SUBNET' ? 'DIFFERENT_SUBNET' as const : 'UNKNOWN' as const,
        statusMessage:'Windows neighbor table contains this IP/MAC mapping; current device communication is not verified.',sessionVerification:'NOT_VERIFIED' as const,
        reachability:{subnetClassification,discoveryInterface:{name:nic.name,ipAddress:nic.ipAddress,netmask:nic.netmask,interfaceIndex:nic.interfaceIndex}},
        discoveredPhase:2,firstSeenAt:now,lastSeenAt:now }];
    });
  }
}

export interface PassiveDiscoveryProvider {
  discover(interfaces: NICInfo[], signal?: AbortSignal): Promise<Device[]>;
}

export class DisabledPassiveDiscoveryProvider implements PassiveDiscoveryProvider {
  public async discover(_interfaces: NICInfo[], _signal?: AbortSignal): Promise<Device[]> {
    return [];
  }
}

export class Phase2PassiveListener {
  /** Passive capture requires an explicit provider; production never injects fixtures. */
  public static async execute(
    interfaces: NICInfo[],
    provider: PassiveDiscoveryProvider = new DisabledPassiveDiscoveryProvider(),
    signal?: AbortSignal,
  ): Promise<{ devices: Device[]; logs: string[] }> {
    const eligible = interfaces.filter(nic => !nic.isInternal);
    const logs = [`[Phase 2] Passive discovery provider initialized for ${eligible.length} eligible IPv4 adapter(s).`];
    let devices: Device[] = [];
    try { devices = await provider.discover(eligible, signal); }
    catch { logs.push('[Phase 2] [INTERFACE WARNING] Windows neighbor evidence could not be read; no devices inferred from this failure.'); }
    logs.push(`[Phase 2] Passive discovery completed with ${devices.length} evidence-backed device(s).`);

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      phase: 2,
      category: 'DISCOVERY',
      level: 'INFO',
      message: `Phase 2 completed: ${devices.length} passive devices captured.`,
    });
    return { devices, logs };
  }
}
