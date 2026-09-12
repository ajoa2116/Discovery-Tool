import { Device, WindowsAdapterSnapshot } from '../types/index.ts';
import { addressRelationship, normalizeIPv4, prefixMask } from './address_validation.ts';

export const DIFFERENT_NETWORK_MESSAGE = "The device address is outside the selected adapter's current subnet. Pair/Match Network may be required before reachability can be tested. This relationship does not verify a device response.";

export function pairTargetBlock(device: Device, adapters: WindowsAdapterSnapshot[], devices: Device[]): string | null {
  const ip = normalizeIPv4(device.network.ipAddress);
  if (!ip || Number(ip.split('.')[0]) >= 224 || ip.startsWith('0.') || ip.startsWith('127.')) return 'A valid unicast IPv4 target is required.';
  if (adapters.some(adapter => adapter.ipv4Addresses.some(address => address.address === ip))) return 'The target is the local host.';
  if (device.status === 'COLLISION' || device.identityConflicts?.length || devices.some(other => other.id !== device.id && other.network.ipAddress === ip)) return 'Duplicate or conflicting identity evidence must be resolved before Pair.';
  return null;
}

export function applyNetworkRelationship(device: Device, adapters: WindowsAdapterSnapshot[], devices: Device[], selectedIndex?: number): Device {
  const eligible = adapters.filter(adapter => adapter.eligible && adapter.ipv4Addresses.length);
  const preferredIndex = selectedIndex ?? device.reachability?.discoveryInterface?.interfaceIndex;
  const selected = preferredIndex !== undefined ? eligible.find(adapter => adapter.interfaceIndex === preferredIndex) :
    eligible.find(adapter => adapter.mediaType === 'ETHERNET') || eligible[0];
  const address = selected?.ipv4Addresses.find(address => addressRelationship(device.network.ipAddress, address.address, address.prefixLength) === 'LOCAL') || selected?.ipv4Addresses[0];
  const classification = address ? addressRelationship(device.network.ipAddress, address.address, address.prefixLength) : 'UNKNOWN';
  const block = pairTargetBlock(device, adapters, devices);
  const adapterIndexes = eligible.filter(adapter => adapter.ipv4Addresses.every(address => addressRelationship(device.network.ipAddress, address.address, address.prefixLength) === 'DIFFERENT_SUBNET')).map(adapter => adapter.interfaceIndex);
  device.reachability = { ...device.reachability, subnetClassification: classification,
    relationshipAdapter: selected && address ? { name: selected.interfaceAlias, ipAddress: address.address, netmask: prefixMask(address.prefixLength), interfaceIndex: selected.interfaceIndex } : undefined,
    pairEligibility: { eligible: !block && adapterIndexes.length > 0, reason: block || (adapterIndexes.length ? 'Known IPv4 address is outside an eligible adapter subnet; no response is required.' : 'No eligible adapter has a known different subnet.'), adapterIndexes, calculatedAt: new Date().toISOString() } };
  if (classification === 'DIFFERENT_SUBNET' && device.status !== 'COLLISION') {
    device.status = 'DIFFERENT_SUBNET'; device.statusMessage = DIFFERENT_NETWORK_MESSAGE;
  } else if (device.status === 'DIFFERENT_SUBNET') {
    device.status = 'UNKNOWN'; device.statusMessage = 'Network relationship updated; current device communication is not verified.';
  }
  return device;
}

export function canOfferPair(device: Device): boolean {
  return Boolean(normalizeIPv4(device.network.ipAddress)) && device.status !== 'COLLISION' && !device.identityConflicts?.length &&
    (device.reachability?.pairEligibility?.eligible ?? device.reachability?.subnetClassification === 'DIFFERENT_SUBNET');
}
