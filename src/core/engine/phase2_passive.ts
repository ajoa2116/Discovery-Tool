import { Device, NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';

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
    const devices = await provider.discover(eligible, signal);
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
