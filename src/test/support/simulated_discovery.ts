import { Device, NICInfo } from '../../types/index.ts';
import { PassiveDiscoveryProvider } from '../../core/engine/phase2_passive.ts';
import { OnvifDiscoveryTransport, WsDiscoveryOptions, WsDiscoveryResult } from '../../core/drivers/ws_discovery_transport.ts';

function device(mac: string, ip: string, vendor: string, model: string, phase: number): Device {
  const now = new Date().toISOString();
  return {
    id: `mac:${mac}`,
    anchor: { macAddress: mac, vendor, model, hardwareClass: vendor === 'Lenel Access Control' ? 'ACCESS_CONTROL' : 'IP_CAMERA', serialNumber: `${vendor}-${mac.replace(/:/g, '')}` },
    network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: phase === 2 ? 'PASSIVE_SNIFF' : 'ONVIF' },
    status: 'DISCOVERED',
    discoveredPhase: phase,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

function prefix(interfaces: NICInfo[]): string {
  return interfaces.find(nic => !nic.isInternal)?.ipAddress.split('.').slice(0, 3).join('.') || '192.168.1';
}

export class ExplicitTestPassiveDiscovery implements PassiveDiscoveryProvider {
  public async discover(interfaces: NICInfo[]): Promise<Device[]> {
    const base = prefix(interfaces);
    return [
      device('00:40:8c:11:22:33', `${base}.102`, 'Axis Communications', 'AXIS Q3538-LVE Dome Camera', 2),
      device('00:1a:e8:33:44:55', `${base}.105`, 'Illustra / Tyco', 'Illustra Flex Gen3 4MP Bullet', 2),
      device('00:02:b3:aa:bb:cc', `${base}.120`, 'Lenel Access Control', 'LNL-1320 Dual Reader Interface', 2),
      device('00:16:6c:44:55:66', `${base}.140`, 'Hanwha Vision', 'XNV-8081Z 4K AI Vandal Dome', 2),
    ];
  }
}

export class ExplicitTestOnvifDiscovery implements OnvifDiscoveryTransport {
  public async discover(interfaces: NICInfo[], options: WsDiscoveryOptions = {}): Promise<WsDiscoveryResult> {
    const base = prefix(interfaces);
    const devices = [
      device('00:40:8c:99:88:77', `${base}.105`, 'Axis Communications', 'AXIS M3075-V Fixed Mini Dome', 3),
      device('00:1a:e8:77:88:99', `${base}.150`, 'Illustra / Tyco', 'Illustra Essentials Gen4', 3),
      device('00:24:b2:aa:11:22', `${base}.165`, 'Hikvision Digital Technology', 'DS-2CD2143G2-I', 3),
      device('3c:ef:8c:12:99:44', `${base}.180`, 'Dahua Technology', 'IPC-HDBW5442E-ZE', 3),
      device('00:16:6c:44:55:66', `${base}.140`, 'Hanwha Vision', 'XNV-8081Z 4K AI Vandal Dome', 3),
      device('00:07:5f:88:99:aa', `${base}.190`, 'Bosch Security', 'DINION IP Starlight 7100i', 3),
      device('00:04:7d:33:44:55', `${base}.195`, 'Pelco', 'Sarix Professional 4', 3),
    ];
    for (const discovered of devices) options.onDevice?.(discovered, true);
    return { devices, interfaceErrors: [], cancelled: Boolean(options.signal?.aborted) };
  }
}
