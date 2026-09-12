import { Device } from '../types/index.ts';
import { ipv4Number } from './address_validation.ts';

export type DeviceSortColumn = 'NAME' | 'STATUS' | 'IP' | 'LAST_6' | 'CONFIGURED' | 'SERIAL';
export interface DeviceSort { column: DeviceSortColumn; direction: 'asc' | 'desc' }
export const nextDeviceSort = (current: DeviceSort | null, column: DeviceSortColumn): DeviceSort => ({ column, direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc' });
const known = (value?: string): string | null => !value?.trim() || /^(unknown|n\/a)$/i.test(value.trim()) ? null : value.trim().toLowerCase();
const statusLabel = (device: Device) => ({ AUTHENTICATED:'Online', CONFIGURED:'Online', COLLISION:'Duplicate IP', DIFFERENT_SUBNET:'Different Subnet', UNRESPONSIVE:'Unreachable', ERROR:'Verification Required', PROVISIONING:'Working' } as Record<string,string>)[device.status] || device.status;
function value(device: Device, column: DeviceSortColumn): string | number | null {
  switch (column) {
    case 'NAME': return known(device.technician?.name || device.anchor.model || device.anchor.vendor);
    case 'STATUS': return known(statusLabel(device));
    case 'IP': return ipv4Number(device.network.ipAddress);
    case 'LAST_6': { const mac = device.anchor.macAddress?.replace(/[:-]/g, ''); return mac && /^[a-f\d]{12}$/i.test(mac) ? mac.slice(-6).toLowerCase() : null; }
    case 'CONFIGURED': { const state = device.configuredState?.manualOverride ?? device.configuredState?.inferred; return state == null ? null : Number(state); }
    case 'SERIAL': return known(device.anchor.serialNumber);
  }
}
const compare = (a: string | number, b: string | number) => a < b ? -1 : a > b ? 1 : 0;
export function sortDevices(devices: Device[], sort: DeviceSort | null): Device[] {
  if (!sort) return devices;
  return [...devices].sort((a, b) => {
    const left = value(a, sort.column), right = value(b, sort.column);
    // Unknown values remain last in both directions; equal values use stable identity.
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    const order = left === null || right === null ? 0 : compare(left, right);
    return order * (sort.direction === 'asc' ? 1 : -1) || compare(a.id, b.id);
  });
}
