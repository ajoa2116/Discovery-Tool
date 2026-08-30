import { Device } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';

export class PelcoSarixDriver {
  /**
   * Pelco / Motorola Solutions Sarix & VideoXpert REST Driver
   * Standard endpoints:
   * - REST API: /api/v1/deviceInfo, /api/v1/streams, /api/v1/ptz
   */
  public static async queryPelcoDevice(ip: string): Promise<Partial<Device>> {
    return {
      anchor: {
        macAddress: '00:04:7d:33:44:55',
        serialNumber: 'PELCO-SARIX-PRO4-991',
        vendor: 'Pelco',
        model: 'Sarix Professional 4 Series Dome',
        firmwareVersion: 'v4.1.28.10_rel',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'PELCO_SARIX',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      manufacturerParams: {
        driverName: 'Pelco Sarix VideoXpert REST Driver',
        smartAnalyticsSmartIR: true,
        enduraCompatibilityMode: false,
        sureVisionEnhancedWDR: true,
        pelcoDProtocolPort: 485,
      },
      onvifConfig: OnvifDriver.createDefaultOnvifConfig(ip),
      status: 'AUTHENTICATED',
    };
  }
}
