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
    const liveIpMap = new Map<string, Device>();

    for (const dev of liveDiscoveredDevices) {
      liveMacMap.set(dev.anchor.macAddress.toLowerCase(), dev);
      liveIpMap.set(dev.network.ipAddress, dev);
    }

    for (const known of knownProjectDevices) {
      const knownMac = known.anchor.macAddress.toLowerCase();
      const liveDeviceByMac = liveMacMap.get(knownMac);

      if (liveDeviceByMac) {
        if (liveDeviceByMac.network.ipAddress === known.network.ipAddress) {
          recognizedCount++;
        } else {
          changedIpCount++;
          known.network.ipAddress = liveDeviceByMac.network.ipAddress;
          known.status = 'CONFIGURED';
        }
      } else {
        // Known MAC not seen. Is another device using its static IP? (Section 45: Replacement Detection)
        const deviceAtKnownIp = liveIpMap.get(known.network.ipAddress);
        if (deviceAtKnownIp && deviceAtKnownIp.anchor.macAddress.toLowerCase() !== knownMac) {
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

    const newDevicesCount = liveDiscoveredDevices.filter(
      live => !knownProjectDevices.some(k => k.anchor.macAddress.toLowerCase() === live.anchor.macAddress.toLowerCase())
    ).length;

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
}
