import { projectDb } from '../storage/project_db.ts';

export class AvailableIpFinder {
  /**
   * Section 25: Available IP Finder
   * Identifies unassigned IPv4 addresses on the active subnet range
   */
  public static scanAvailableIps(
    subnetPrefix: string = '192.168.1',
    startRange: number = 100,
    endRange: number = 250
  ): string[] {
    const devices = projectDb.getDevices();
    const usedIps = new Set(devices.map(d => d.network.ipAddress));

    const available: string[] = [];
    for (let i = startRange; i <= endRange; i++) {
      const candidateIp = `${subnetPrefix}.${i}`;
      if (!usedIps.has(candidateIp)) {
        available.push(candidateIp);
      }
    }

    return available;
  }
}
