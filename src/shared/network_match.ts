import { normalizeIPv4, ipv4Number } from './address_validation.ts';
export interface NetworkMatchInput {interfaceIndex:number;ipAddress:string;prefixLength:number;gateway?:string}
export function networkMatchError(input:NetworkMatchInput):string|null {
  const ip=typeof input.ipAddress==='string'?normalizeIPv4(input.ipAddress):null;
  if(!Number.isInteger(input.interfaceIndex)||input.interfaceIndex<1)return 'Select an eligible Windows adapter.';
  if(!ip||!Number.isInteger(input.prefixLength)||input.prefixLength<1||input.prefixLength>30)return 'Enter a valid IPv4 address and prefix from 1 to 30.';
  const host=ipv4Number(ip)!,mask=(0xffffffff<<(32-input.prefixLength))>>>0,network=(host&mask)>>>0,broadcast=(network|~mask)>>>0;
  const first=Number(ip.split('.')[0]);
  if(first===0||first===127||first>=224||ip.startsWith('169.254.')||host===network||host===broadcast)return 'Use a unicast host address, not a network, broadcast, loopback or link-local address.';
  if(input.gateway!==undefined&&typeof input.gateway!=='string')return 'Gateway must be an IPv4 address.';
  if(input.gateway){const gateway=normalizeIPv4(input.gateway);if(!gateway||gateway===ip||networkMatchError({...input,ipAddress:gateway,gateway:undefined})||((ipv4Number(gateway)!&mask)>>>0)!==network)return 'Gateway must be another usable host in the temporary subnet.';}
  return null;
}
