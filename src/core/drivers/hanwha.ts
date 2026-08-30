import { Device } from '../../types/index.ts';
import { OnvifDriver } from './onvif.ts';

export class HanwhaSunapiDriver {
  /**
   * Hanwha Vision SUNAPI REST Protocol Driver
   * Standard endpoints:
   * - System info: /stw-cgi/system.cgi?msubmenu=deviceinfo&action=view
   * - Video config: /stw-cgi/video.cgi?msubmenu=videoencprofile&action=view
   * - AI analytics: /stw-cgi/ai.cgi?msubmenu=analytics&action=view
   */
  public static async querySunapiDevice(ip: string): Promise<Partial<Device>> {
    return {
      anchor: {
        macAddress: '00:16:6c:44:55:66',
        serialNumber: 'HNV-AI-2026-09',
        vendor: 'Hanwha Vision',
        model: 'XNV-8081Z 4K AI Vandal Dome',
        firmwareVersion: 'v2.22.01_20260715',
      },
      network: {
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1',
        port: 80,
        protocol: 'HANWHA_SUNAPI',
        xAddr: `http://${ip}/onvif/device_service`,
      },
      manufacturerParams: {
        driverName: 'Hanwha SUNAPI 2.5',
        aiAnalyticsEnabled: true,
        aiObjectTypes: ['PERSON', 'VEHICLE', 'LICENSE_PLATE', 'FACE'],
        wiseStreamLevel: 'HIGH_DYNAMIC',
        wdrDb: 150,
        defogEnabled: true,
        hallwayView90Deg: false,
      },
      onvifConfig: OnvifDriver.createDefaultOnvifConfig(ip),
      status: 'AUTHENTICATED',
    };
  }

  public static generateSunapiConfigUrl(ip: string, action: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    return `http://${ip}/stw-cgi/${action}?${query}`;
  }
}
