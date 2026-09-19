import { Device } from '../../types/index.ts';

/** Explicit independent discovery-response fixture, never inferred from an ARP lookup. */
export function withDiscoveryOwnership(device:Device,macAddress:string):Device {
  const interfaceIndex=device.reachability?.discoveryInterface?.interfaceIndex;
  if(interfaceIndex===undefined)throw Error('Ownership fixture needs a receiving interface');
  device.reachability={...device.reachability,identityObservation:{source:'WS_DISCOVERY',ipAddress:device.network.ipAddress,interfaceIndex,observedAt:new Date().toISOString(),anchor:{...device.anchor,macAddress}}};
  return device;
}
