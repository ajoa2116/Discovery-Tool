import { Device, ReverificationResult } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export class ProjectReverificationEngine {
  /**
   * Section 43-45: Automatic Post-Import Verification & Replacement Detection
   */
  public static reverifyProject(knownProjectDevices: Device[], liveDiscoveredDevices: Device[]): ReverificationResult {
    let recognizedCount = 0;
    let changedIpCount = 0;
    const possibleReplacements: ReverificationResult['possibleReplacements'] = [];

    const liveMacMap = new Map<string, Device>();
    const liveUuidMap = new Map<string, Device>();
    const liveSerialMap = new Map<string, Device>();
    const liveIpMap = new Map<string, Device>();

    for (const dev of liveDiscoveredDevices) {
      if (dev.anchor.macAddress) liveMacMap.set(dev.anchor.macAddress.toLowerCase(), dev);
      if (dev.anchor.onvifEndpointUuid) liveUuidMap.set(dev.anchor.onvifEndpointUuid.toLowerCase(), dev);
      if (dev.anchor.serialNumber) liveSerialMap.set(dev.anchor.serialNumber.toLowerCase(), dev);
      liveIpMap.set(dev.network.ipAddress, dev);
    }

    for (const known of knownProjectDevices) {
      const knownMac = known.anchor.macAddress?.toLowerCase();
      const knownUuid = known.anchor.onvifEndpointUuid?.toLowerCase();
      const knownSerial = known.anchor.serialNumber?.toLowerCase();
      const liveDeviceByIdentity = (knownMac ? liveMacMap.get(knownMac) : undefined) ||
        (knownUuid ? liveUuidMap.get(knownUuid) : undefined) ||
        (knownSerial ? liveSerialMap.get(knownSerial) : undefined);

      if (liveDeviceByIdentity) {
        recognizedCount++;
        if (liveDeviceByIdentity.network.ipAddress !== known.network.ipAddress) {
          changedIpCount++;
          known.network.ipAddressHistory = Array.from(new Set([
            ...(known.network.ipAddressHistory || [known.network.ipAddress]),
            liveDeviceByIdentity.network.ipAddress,
          ]));
        }
        known.network = { ...known.network, ...liveDeviceByIdentity.network, ipAddressHistory: known.network.ipAddressHistory };
        known.anchor = { ...known.anchor, ...liveDeviceByIdentity.anchor };
        known.reachability = liveDeviceByIdentity.reachability;
        known.status = liveDeviceByIdentity.status;
        known.lastSeenAt = liveDeviceByIdentity.lastSeenAt;
        known.sessionVerification = 'VERIFIED';
      } else {
        known.sessionVerification = 'NOT_FOUND';
        // Known MAC not seen. Is another device using its static IP? (Section 45: Replacement Detection)
        const deviceAtKnownIp = liveIpMap.get(known.network.ipAddress);
        if (deviceAtKnownIp && deviceAtKnownIp.anchor.macAddress?.toLowerCase() !== knownMac) {
          possibleReplacements.push({
            expectedName: known.anchor.model || known.anchor.vendor,
            expectedMac: known.anchor.macAddress,
            foundMac: deviceAtKnownIp.anchor.macAddress,
            foundIp: known.network.ipAddress,
            model: deviceAtKnownIp.anchor.model || deviceAtKnownIp.anchor.vendor,
          });
        }
      }
    }

    const newDevicesCount = liveDiscoveredDevices.filter(live => !knownProjectDevices.some(known =>
      known.id === live.id ||
      Boolean(known.anchor.macAddress && live.anchor.macAddress && known.anchor.macAddress.toLowerCase() === live.anchor.macAddress.toLowerCase()) ||
      Boolean(known.anchor.onvifEndpointUuid && live.anchor.onvifEndpointUuid && known.anchor.onvifEndpointUuid.toLowerCase() === live.anchor.onvifEndpointUuid.toLowerCase()) ||
      Boolean(known.anchor.serialNumber && live.anchor.serialNumber && known.anchor.serialNumber.toLowerCase() === live.anchor.serialNumber.toLowerCase())
    )).length;

    const result: ReverificationResult = {
      totalKnown: knownProjectDevices.length,
      recognizedCount,
      changedIpCount,
      newDevicesCount,
      possibleReplacements,
    };

    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'EDGE_CASE',
      level: possibleReplacements.length > 0 ? 'WARNING' : 'INFO',
      message: `Section 43 Reverification: ${recognizedCount} recognized, ${changedIpCount} IP changed, ${newDevicesCount} new, ${possibleReplacements.length} replacement candidate(s).`,
      details: result,
    });

    return result;
  }

  public static reverifyActiveProject(liveDiscoveredDevices: Device[]): ReverificationResult {
    const known = projectDb.getDevices();
    const knownIds = new Set(known.map(device => device.id));
    const result = this.reverifyProject(known, liveDiscoveredDevices);
    for (const live of liveDiscoveredDevices) {
      const matched = known.some(device =>
        device.id === live.id ||
        Boolean(device.anchor.macAddress && live.anchor.macAddress && device.anchor.macAddress.toLowerCase() === live.anchor.macAddress.toLowerCase()) ||
        Boolean(device.anchor.onvifEndpointUuid && live.anchor.onvifEndpointUuid && device.anchor.onvifEndpointUuid.toLowerCase() === live.anchor.onvifEndpointUuid.toLowerCase()) ||
        Boolean(device.anchor.serialNumber && live.anchor.serialNumber && device.anchor.serialNumber.toLowerCase() === live.anchor.serialNumber.toLowerCase())
      );
      if (!matched || knownIds.has(live.id)) projectDb.upsertDevice(live);
    }
    return result;
  }
}
