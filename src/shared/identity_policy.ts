import { Device, DevicePhysicalAnchor } from '../types/index.ts';

/** Formatting/validity only: this does not establish ownership of an observed MAC. */
export function canonicalMac(value?: string | null): string | null {
  const input = value?.trim() || '';
  if (!/^(?:[a-f\d]{12}|(?:[a-f\d]{2}:){5}[a-f\d]{2}|(?:[a-f\d]{2}-){5}[a-f\d]{2}|(?:[a-f\d]{4}\.){2}[a-f\d]{4})$/i.test(input)) return null;
  const hex = input.replace(/[:.\-]/g, '').toLowerCase();
  if (hex === '000000000000' || hex === 'ffffffffffff' || (parseInt(hex.slice(0,2),16)&1)) return null;
  return hex.match(/.{2}/g)!.join(':');
}
const norm = (value?: string | null) => value?.trim().toLowerCase() || undefined;
export function canonicalAnchor(anchor: DevicePhysicalAnchor): DevicePhysicalAnchor {
  return {...anchor, macAddress:canonicalMac(anchor.macAddress),onvifEndpointUuid:norm(anchor.onvifEndpointUuid),serialNumber:anchor.serialNumber?.trim() || undefined};
}
export function mergeAnchors(saved: DevicePhysicalAnchor, incoming: DevicePhysicalAnchor): DevicePhysicalAnchor {
  const a=canonicalAnchor(saved),b=canonicalAnchor(incoming);
  return {...a,...Object.fromEntries(Object.entries(b).filter(([,value])=>value!==null&&value!==undefined&&value!=='')),macAddress:b.macAddress||a.macAddress};
}
export function sharesAnchor(a: Device, b: Device): boolean {
  const left=canonicalAnchor(a.anchor),right=canonicalAnchor(b.anchor);
  return Boolean(left.macAddress&&left.macAddress===right.macAddress || left.onvifEndpointUuid&&left.onvifEndpointUuid===right.onvifEndpointUuid || norm(left.serialNumber)&&norm(left.serialNumber)===norm(right.serialNumber));
}
export function conflicts(a: Device,b: Device): boolean {
  const left=canonicalAnchor(a.anchor),right=canonicalAnchor(b.anchor);
  return Boolean(left.macAddress&&right.macAddress&&left.macAddress!==right.macAddress || left.onvifEndpointUuid&&right.onvifEndpointUuid&&left.onvifEndpointUuid!==right.onvifEndpointUuid);
}
export function sameIdentity(a: Device,b: Device): boolean { return sharesAnchor(a,b)&&!conflicts(a,b); }
export function hasIdentity(d:Device):boolean { const a=canonicalAnchor(d.anchor);return Boolean(a.macAddress||a.onvifEndpointUuid||a.serialNumber); }
/** Exact record ID supports updates, but never overrides conflicting physical evidence.
 * A known row may bridge compatible partial records; otherwise multiple matches are ambiguous.
 */
export function selectIdentity(devices:Device[],incoming:Device):{index:number;ambiguous:boolean;related:Device[]} {
  const related=devices.filter(d=>d.id===incoming.id||sharesAnchor(d,incoming));
  // A conflicting established MAC/UUID rules a candidate out; a reused serial
  // must not turn a unique established-MAC match into an ambiguous update.
  const compatible=related.filter(d=>!conflicts(d,incoming));
  const exact=compatible.find(d=>d.id===incoming.id);
  const ambiguous=compatible.length>1&&(!exact||compatible.some(a=>compatible.some(b=>conflicts(a,b))));
  const match=!ambiguous&&(exact||compatible[0]);
  return {index:match&&!conflicts(match,incoming)?devices.indexOf(match):-1,ambiguous,related};
}
