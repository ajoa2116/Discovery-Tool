import { Device } from '../../types/index.ts';

export class LenelDriver {
  /**
   * Lenel OnGuard & BlueDiamond Access Control Discovery Driver
   */
  public static async queryLenelController(ip: string): Promise<Partial<Device> | null> {
    return {
      anchor: {
        macAddress: '00:02:b3:8d:44:11',
        serialNumber: 'LENEL-LNL-3300-CONTROLLER',
        vendor: 'Lenel Access Control',
        model: 'LNL-3300 Intelligent System Controller',
        firmwareVersion: '1.28.4',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 3001,
        protocol: 'LENEL',
      },
      status: 'AUTHENTICATED',
    };
  }
}
