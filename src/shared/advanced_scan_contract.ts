import { AdvancedScanRequest, AdvancedScanPlan } from './advanced_scan.ts';
import { WindowsAdapterSnapshot } from '../types/index.ts';
import { normalizeIPv4 } from './address_validation.ts';

export const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
export function isAdapterCollection(value: unknown): value is WindowsAdapterSnapshot[] {
  return Array.isArray(value) && value.every(adapter => isRecord(adapter) && Number.isInteger(adapter.interfaceIndex) && adapter.interfaceIndex > 0 &&
    typeof adapter.interfaceAlias === 'string' && typeof adapter.operationalStatus === 'string' && typeof adapter.eligible === 'boolean' &&
    ['ETHERNET','WIFI','OTHER'].includes(adapter.mediaType) && Array.isArray(adapter.ipv4Addresses) && adapter.ipv4Addresses.every((ip:unknown) =>
      isRecord(ip) && typeof ip.address === 'string' && normalizeIPv4(ip.address) !== null && Number.isInteger(ip.prefixLength) && ip.prefixLength >= 0 && ip.prefixLength <= 32) &&
    strings(adapter.defaultGateways) && strings(adapter.dnsServers) && typeof adapter.dhcpEnabled === 'boolean' && typeof adapter.dnsAutomatic === 'boolean' && typeof adapter.capturedAt === 'string');
}

export function advancedRequestErrors(value: unknown): string[] {
  if (!isRecord(value)) return ['A complete Advanced Scan request object is required.'];
  const errors: string[] = [];
  if (!Array.isArray(value.adapterIndexes) || value.adapterIndexes.length > 128 || !value.adapterIndexes.every((index:unknown) => Number.isInteger(index) && Number(index) > 0)) errors.push('Adapter indexes must be positive integers.');
  if (!Array.isArray(value.targets) || value.targets.length > 128 || !value.targets.every((target:unknown) => isRecord(target) && (target.type === 'CIDR' ? typeof target.cidr === 'string' && target.cidr.length <= 32 : target.type === 'RANGE' && typeof target.start === 'string' && typeof target.end === 'string' && target.start.length <= 32 && target.end.length <= 32))) errors.push('Targets must contain CIDR addresses or start/end IPv4 ranges.');
  if (!strings(value.methods) || !value.methods.every(method => ['ONVIF','NEIGHBOR','PING','TCP'].includes(method))) errors.push('Choose supported discovery methods.');
  if (!strings(value.portPresets) || !value.portPresets.every(preset => ['CAMERA_COMMON','WEB','RTSP'].includes(preset))) errors.push('Choose supported port presets.');
  if (!Array.isArray(value.customPorts) || value.customPorts.length > 32 || !value.customPorts.every((port:unknown) => Number.isInteger(port) && Number(port) > 0 && Number(port) <= 65535)) errors.push('Custom ports must be integers from 1 through 65535 (up to 32 ports).');
  if (!isRecord(value.filters) || typeof value.filters.onlyLikelyCameras !== 'boolean' || typeof value.filters.includeUnknownDevices !== 'boolean' || ['macPrefix','manufacturer'].some(key => value.filters[key] !== undefined && (typeof value.filters[key] !== 'string' || value.filters[key].length > 100))) errors.push('Device filters must contain valid flags and text.');
  if (!['CONSERVATIVE','NORMAL','FAST'].includes(value.performance)) errors.push('Choose a supported scan performance setting.');
  return errors;
}

export function isAdvancedPlan(value: unknown): value is AdvancedScanPlan {
  return isRecord(value) && ['QUICK_FALLBACK','ADVANCED'].includes(value.mode) && typeof value.valid === 'boolean' && strings(value.errors) && strings(value.warnings) &&
    Array.isArray(value.adapterIndexes) && value.adapterIndexes.every(Number.isInteger) && strings(value.normalizedTargets) && strings(value.methods) && Array.isArray(value.ports) && value.ports.every(Number.isInteger) && Array.isArray(value.routeSummary) &&
    Number.isFinite(value.estimatedTargetCount) && Number.isFinite(value.maximumTcpChecks) && advancedRequestErrors(value.request).length === 0;
}

export interface AdvancedTargetDraft { type:'CIDR'|'RANGE'; first:string; second:string; prefix:string; prefixSource:'BLANK'|'SUGGESTED'|'EDITED' }
export type DraftState = { state:'INCOMPLETE'|'INVALID'|'READY'; message:string };
export function assessAdvancedDraft(request: AdvancedScanRequest, targets: AdvancedTargetDraft[], customPorts:string, adapters:WindowsAdapterSnapshot[], intent:boolean): DraftState {
  const incomplete = (message:string):DraftState => ({state:'INCOMPLETE',message});
  const invalid = (message:string):DraftState => ({state:'INVALID',message});
  if (!adapters.some(adapter => adapter.eligible)) return incomplete('No eligible network adapters are available. Reload Adapters to try again.');
  if (intent && !request.adapterIndexes.length) return incomplete('Select an eligible network adapter.');
  if (request.adapterIndexes.some(index => !adapters.some(adapter => adapter.interfaceIndex === index && adapter.eligible))) return invalid('A selected adapter is unavailable. Select an eligible adapter.');
  for (const row of targets) {
    for (const [label,ip] of row.type === 'RANGE' ? [['Start IP',row.first],['End IP',row.second]] : [['CIDR address',row.first]]) {
      const parts=ip.trim().split('.');
      if (parts.length > 4 || parts.some(part => !/^\d{0,3}$/.test(part) || Number(part) > 255)) return invalid(`${label} must be a valid IPv4 address.`);
      if (parts.length < 4 || parts.some(part => part === '')) return incomplete(`Complete ${label}.`);
    }
    if (row.type === 'CIDR' && !row.prefix) return incomplete('Complete the CIDR prefix.');
    if (row.type === 'CIDR' && (!/^\d{1,2}$/.test(row.prefix) || Number(row.prefix) < 16 || Number(row.prefix) > 32)) return invalid('CIDR prefix must be /16 through /32.');
  }
  if (customPorts.trim() && customPorts.split(/[\s,]+/).filter(Boolean).some(port => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) return invalid('Custom ports must be integers from 1 through 65535.');
  if (intent && !targets.length && request.methods.some(method => ['PING','TCP'].includes(method)) && !request.methods.some(method => ['ONVIF','NEIGHBOR'].includes(method))) return incomplete('Add an IP target for Ping or TCP checks.');
  return {state:'READY',message:''};
}
