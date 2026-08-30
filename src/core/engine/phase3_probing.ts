import { Device, NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';
import { NodeOnvifWsDiscoveryTransport, OnvifDiscoveryTransport } from '../drivers/ws_discovery_transport.ts';
import { DeviceEnricher, WindowsDeviceEnricher } from './device_enrichment.ts';

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
      onDevice: (device, isNew) => {
        const stored = projectDb.upsertDevice(device);
        options.onDevice?.(stored, isNew);
        const enrichmentKey = stored.anchor.onvifEndpointUuid || stored.anchor.macAddress || stored.id;
        if (!enrichmentTasks.has(enrichmentKey)) {
          const task = enricher.enrich(stored, {
            signal: options.signal,
            onUpdate: (updated, changedFields) => {
              const enriched = projectDb.upsertDevice(updated);
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

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      phase: 3,
      category: 'DISCOVERY',
      level: result.interfaceErrors.length > 0 ? 'WARNING' : 'INFO',
      message: `Phase 3 ${result.cancelled ? 'cancelled' : 'completed'}: ${result.devices.length} ONVIF device(s), ${result.interfaceErrors.length} interface error(s).`,
    });
    return { probedDevices: result.devices, logs, cancelled: result.cancelled, interfaceErrors: result.interfaceErrors };
  }
}
