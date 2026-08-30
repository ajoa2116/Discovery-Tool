import { Device } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';

export class HikvisionIsapiDriver {
  /**
   * Hikvision ISAPI (REST/XML) & SADP Protocol Driver
   * Standard endpoints:
   * - Device Info: /ISAPI/System/deviceInfo
   * - Network Interfaces: /ISAPI/System/Network/interfaces
   * - Streaming Channels: /ISAPI/Streaming/channels/101
   * - Image Settings: /ISAPI/Image/channels/1/ispImageParam
   */
  public static async queryIsapiDevice(ip: string): Promise<Partial<Device>> {
    return {
      anchor: {
        macAddress: '00:24:b2:aa:11:22',
        serialNumber: 'DS-2CD2143G2-SN991',
        vendor: 'Hikvision Digital Technology',
        model: 'DS-2CD2143G2-I DarkFighter AcuSense Dome',
        firmwareVersion: 'V5.7.15_build260601',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'HIKVISION_ISAPI',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      manufacturerParams: {
        driverName: 'Hikvision ISAPI v2.6',
        acusenseHumanFilter: true,
        acusenseVehicleFilter: true,
        h265PlusSmartCodec: true,
        darkFighterGain: 'MAXIMUM_COLOR',
        sadpPort: 37020,
        ezvizCloudBinding: false,
      },
      onvifConfig: OnvifDriver.createDefaultOnvifConfig(ip),
      status: 'AUTHENTICATED',
    };
  }

  public static generateIsapiXmlPayload(command: 'SET_WDR' | 'SET_NTP', value: any): string {
    if (command === 'SET_WDR') {
      return `<?xml version="1.0" encoding="UTF-8"?>
<WDR version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <mode>${value.enabled ? 'open' : 'close'}</mode>
  <WDRLevel>${value.level || 50}</WDRLevel>
</WDR>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<NTPServer version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <addressingFormatType>hostname</addressingFormatType>
  <hostName>${value.server || 'pool.ntp.org'}</hostName>
  <portNo>123</portNo>
  <synchronizeInterval>60</synchronizeInterval>
</NTPServer>`;
  }
}
