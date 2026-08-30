import { Device } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';

export class BoschRcpDriver {
  /**
   * Bosch Security Remote Control Protocol Plus (RCP+) Driver
   * Standard endpoints:
   * - RCP+ over HTTP/CGI: /rcp.xml?command=0x0001&type=P_OCTET
   * - Port: 1756 (TCP RCP+) or Port 80 (HTTP RCP+)
   */
  public static async queryBoschDevice(ip: string): Promise<Partial<Device>> {
    return {
      anchor: {
        macAddress: '00:07:5f:88:99:aa',
        serialNumber: 'BOSCH-DINION-7100i-SN22',
        vendor: 'Bosch Security',
        model: 'DINION IP Starlight 7100i IR',
        firmwareVersion: 'CPP13_8.80.0042',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'BOSCH_RCP',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      manufacturerParams: {
        driverName: 'Bosch RCP+ v5.2',
        cameraTrainerAI: true,
        essentialVideoAnalytics: 'ACTIVE_IVA_PRO',
        bitrateOptiMax: 'DYNAMIC_STREAM_QUALITY_LEVEL_1',
        rcpPort: 1756,
        starlightUltraLowLight: true,
      },
      onvifConfig: OnvifDriver.createDefaultOnvifConfig(ip),
      status: 'AUTHENTICATED',
    };
  }
}
