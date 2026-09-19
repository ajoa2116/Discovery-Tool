import { conflicts, sameIdentity } from './identity_policy.ts';
import { Device } from '../types/index.ts';
import { AdvancedScanRequest } from './advanced_scan.ts';

// An OUI/vendor label, neighbor entry, Ping reply or open port is not camera identity.
export const hasCctvEvidence = (device: Device): boolean => Boolean(
  ['ONVIF','AXIS_ADP','ILLUSTRA','LENEL','HANWHA_SUNAPI','HIKVISION_ISAPI','DAHUA_CGI','BOSCH_RCP','PELCO_SARIX','OPTEX_REC'].includes(device.network.protocol) ||
  device.anchor.onvifEndpointUuid || ['IP_CAMERA','ACCESS_CONTROL','INTERCOM','PERIMETER_LIDAR'].includes(device.anchor.hardwareClass || '')
);
export const sameDiscoveryIdentity = (left:Device,right:Device):boolean => !conflicts(left,right)&&(left.id===right.id||sameIdentity(left,right));
export const matchesAdvancedScanFilters = (device: Device, filters: AdvancedScanRequest['filters']) => {
  const mac = device.anchor.macAddress?.toLowerCase() || '';
  const prefix = (filters.macPrefix || '').toLowerCase().replace(/-/g, ':');
  if (prefix && !mac.startsWith(prefix)) return false;
  if (filters.manufacturer && filters.manufacturer !== 'Any' && !device.anchor.vendor.toLowerCase().includes(filters.manufacturer.toLowerCase())) return false;
  return !((filters.onlyLikelyCameras || !filters.includeUnknownDevices) && !hasCctvEvidence(device));
};
export const discoveryNotification = (device:Device) => {
  if (!hasCctvEvidence(device)) return null;
  const evidence = device.reachability?.wsDiscoveryAnnouncedAt ? 'ONVIF announcement received; current communication is not verified.'
    : device.reachability?.wsDiscoveryRespondedAt ? 'ONVIF discovery response received.'
    : device.network.protocol === 'PASSIVE_SNIFF' ? 'Windows neighbor mapping observed; current communication is not verified.'
    : 'Device discovery evidence received.';
  return {ip:device.network.ipAddress,vendor:device.anchor.vendor,evidence,sourceAdapter:device.reachability?.discoveryInterface?.name};
};
