import { Device, NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb, SiteProjectDatabase } from '../storage/project_db.ts';
import { NodeOnvifWsDiscoveryTransport, OnvifDiscoveryTransport } from '../drivers/ws_discovery_transport.ts';
import { DeviceEnricher, WindowsDeviceEnricher } from './device_enrichment.ts';
import { LocalHostIdentity } from '../network/local_host_identity.ts';

export interface ActiveProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onDevice?: (device: Device, isNew: boolean) => void;
  onEnrichment?: (device: Device, changedFields: string[]) => void;
}

export class Phase3ActiveProbing {
  public static async execute(
    interfaces: NICInfo[],
    transport: OnvifDiscoveryTransport = new NodeOnvifWsDiscoveryTransport(),
    enricher: DeviceEnricher = new WindowsDeviceEnricher(),
    options: ActiveProbeOptions = {},
    localHost: LocalHostIdentity = LocalHostIdentity.fromInterfaces(interfaces),
    database: SiteProjectDatabase = projectDb,
  ): Promise<{
    probedDevices: Device[];
    logs: string[];
    cancelled: boolean;
    interfaceErrors: Array<{ interfaceName: string; message: string }>;
  }> {
    const eligible = interfaces.filter(nic => !nic.isInternal && Boolean(nic.ipAddress));
    const logs = [`[Phase 3] Sending ONVIF WS-Discovery probes on ${eligible.length} eligible IPv4 adapter(s) via 239.255.255.250:3702.`];
    const enrichmentTasks = new Map<string, Promise<void>>();

    const result = await transport.discover(eligible, {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      onDevice: (device) => {
        if (!localHost.isRemoteDevice(device)) {
          logs.push(`[Phase 3] Ignored local-host response at ${device.network.ipAddress}.`);
          return;
        }
        const isNew = !database.getDevices().some(existing => existing.id === device.id || Boolean(
          (device.anchor.macAddress && existing.anchor.macAddress?.toLowerCase() === device.anchor.macAddress.toLowerCase()) ||
          (device.anchor.onvifEndpointUuid && existing.anchor.onvifEndpointUuid?.toLowerCase() === device.anchor.onvifEndpointUuid.toLowerCase()) ||
          (device.anchor.serialNumber && existing.anchor.serialNumber?.toLowerCase() === device.anchor.serialNumber.toLowerCase())
        ));
        const stored = database.upsertDevice(device);
        options.onDevice?.(stored, isNew);
        const enrichmentKey = stored.anchor.onvifEndpointUuid || stored.anchor.macAddress || stored.id;
        if (!enrichmentTasks.has(enrichmentKey)) {
          const task = enricher.enrich(stored, {
            signal: options.signal,
            onUpdate: (updated, changedFields) => {
              const enriched = database.upsertDevice(updated);
              options.onEnrichment?.(enriched, changedFields);
            },
          }).then(() => undefined).catch(error => {
            if (!options.signal?.aborted) {
              logs.push(`[Phase 3] [ENRICHMENT WARNING] ${stored.network.ipAddress}: ${error instanceof Error ? error.message : String(error)}`);
            }
          });
          enrichmentTasks.set(enrichmentKey, task);
        }
      },
    });
    await Promise.allSettled(enrichmentTasks.values());

    for (const failure of result.interfaceErrors) {
      logs.push(`[Phase 3] [INTERFACE WARNING] ${failure.interfaceName}: ${failure.message}`);
    }
    logs.push(result.cancelled
      ? `[Phase 3] Discovery cancelled after retaining ${result.devices.length} discovered device(s).`
      : `[Phase 3] Discovery timeout completed with ${result.devices.length} unique ONVIF device(s).`);
    if (!result.cancelled && result.devices.length === 0) logs.push('[Phase 3] No ONVIF responses received. Verify the camera is connected to a reachable network and that ONVIF/WS-Discovery is enabled. Interface warnings above may identify binding, multicast-send, adapter, or permission failures; zero responses alone do not prove a firewall cause.');

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      phase: 3,
      category: 'DISCOVERY',
      level: result.interfaceErrors.length > 0 ? 'WARNING' : 'INFO',
      message: `Phase 3 ${result.cancelled ? 'cancelled' : 'completed'}: ${result.devices.length} ONVIF device(s), ${result.interfaceErrors.length} interface error(s).`,
      details: { messageCounts: result.messageCounts, interfaceWarnings: result.interfaceErrors.slice(0,32) },
    });
    return { probedDevices: result.devices, logs, cancelled: result.cancelled, interfaceErrors: result.interfaceErrors };
  }
}
