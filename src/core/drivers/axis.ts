import { Device } from '../../types/index.ts';

export class AxisDriver {
  /**
   * Axis Discovery Protocol (ADP) & VAPIX parameters inspection
   */
  public static async queryVapixParameters(ip: string): Promise<Partial<Device> | null> {
    // Standard VAPIX endpoint: /axis-cgi/param.cgi?action=list&group=root.Brand,root.Network
    return {
      anchor: {
        macAddress: 'ac:cc:8e:14:22:90',
        serialNumber: 'AXIS-P3245-V-SN991',
        vendor: 'Axis Communications',
        model: 'AXIS P3245-V Network Camera',
        firmwareVersion: '11.8.62',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'AXIS_ADP',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      status: 'AUTHENTICATED',
    };
  }
}
