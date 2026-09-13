import { NICInfo, PairSessionState } from '../types/index.ts';
import { prefixMask } from './address_validation.ts';
/** Only applied/restored Windows snapshots may replace the adapter badge. */
export function pairAdapterInterfaces(interfaces:NICInfo[],pair:PairSessionState|null):NICInfo[]{
  if(!pair||!['VERIFYING','PAIRED','RESTORED'].includes(pair.state)||(pair.state!=='RESTORED'&&!pair.adapterConfigurationVerified))return interfaces;
  const adapter=pair.adapter,address=adapter.ipv4Addresses[0];if(!address)return interfaces;
  const nic:NICInfo={name:adapter.interfaceAlias,interfaceIndex:adapter.interfaceIndex,ipAddress:address.address,netmask:prefixMask(address.prefixLength),broadcast:'',mac:'',isInternal:false};
  const index=interfaces.findIndex(item=>item.interfaceIndex===adapter.interfaceIndex||item.name===adapter.interfaceAlias);
  if(index<0)return [nic,...interfaces];
  return [{...interfaces[index],...nic},...interfaces.filter((_,i)=>i!==index)];
}
