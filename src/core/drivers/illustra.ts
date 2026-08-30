import { Device } from '../../types/index.ts';

export class IllustraDriver {
  /**
   * Illustra / Tyco Pro & Flex Series Camera Handler
   */
  public static async queryIllustraDevice(ip: string): Promise<Partial<Device> | null> {
    return {
      anchor: {
        macAddress: '00:1a:e8:f4:19:a2',
        serialNumber: 'ILLUSTRA-PRO-4K-8812',
        vendor: 'Illustra / Tyco',
        model: 'Illustra Pro Gen4 4K Dome',
        firmwareVersion: 'v4.2.0-R1',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'ILLUSTRA',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      status: 'AUTHENTICATED',
    };
  }
}
