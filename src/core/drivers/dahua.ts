import { Device } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';

export class DahuaDriver {
  /**
   * Dahua Technology JSON-RPC & ConfigManager CGI Protocol Driver
   * Standard endpoints:
   * - /cgi-bin/configManager.cgi?action=getConfig&name=Network
   * - /cgi-bin/configManager.cgi?action=getConfig&name=Encode
   * - /cgi-bin/configManager.cgi?action=getConfig&name=VideoInMode
   */
  public static async queryDahuaDevice(ip: string): Promise<Partial<Device>> {
    return {
      anchor: {
        macAddress: '3c:ef:8c:12:99:44',
        serialNumber: 'DH-IPC-WIZMIND-4410',
        vendor: 'Dahua Technology',
        model: 'IPC-HDBW5442E-ZE WizMind 4MP AI Dome',
        firmwareVersion: 'V2.840.0000000.12.R.260408',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'DAHUA_CGI',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      manufacturerParams: {
        driverName: 'Dahua DHIP / ConfigManager CGI',
        smartH265Plus: true,
        wizMindTripwireAI: true,
        smartIlluminationMode: 'SMART_DUAL_LIGHT',
        dhSearchPort: 37810,
        quickPickTargetExtraction: true,
      },
      onvifConfig: OnvifDriver.createDefaultOnvifConfig(ip),
      status: 'AUTHENTICATED',
    };
  }

  public static generateCgiCommandUrl(ip: string, action: string, name: string): string {
    return `http://${ip}/cgi-bin/configManager.cgi?action=${action}&name=${name}`;
  }
}
