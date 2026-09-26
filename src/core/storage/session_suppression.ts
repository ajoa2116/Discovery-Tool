import {Device} from '../../types/index.ts';
import {canonicalAnchor,hasIdentity,mergeAnchors,sameIdentity,selectIdentity} from '../../shared/identity_policy.ts';

/** Identity only: no IP matching, provider payloads, technician notes or credentials. */
const identity=(device:Device):Device=>{
 const anchor=canonicalAnchor(device.anchor);
 return {id:device.id,anchor:{macAddress:anchor.macAddress,onvifEndpointUuid:anchor.onvifEndpointUuid,serialNumber:anchor.serialNumber,vendor:'Unknown'},network:{ipAddress:'',subnetMask:'',port:0,protocol:'MANUAL'},status:'UNKNOWN',discoveredPhase:1,firstSeenAt:'',lastSeenAt:''};
};
interface Entry {device:Device;createdAt:string}
/** One backend instance, never serialized. Matching reuses Phase 1/2 policy in both directions. */
export class SessionSuppression {
 private entries:Entry[]=[];
 get count(){return this.entries.length;}
 private match(device:Device,inventory:Device[]):Entry|undefined {
  const candidates=this.entries.filter(e=>sameIdentity(e.device,device));
  if(candidates.length!==1)return;
  const entry=candidates[0],reverse=selectIdentity(inventory,entry.device);
  if(reverse.ambiguous||reverse.index<0||inventory[reverse.index].id!==device.id)return;
  return entry;
 }
 hides(device:Device,inventory:Device[]){
  const entry=this.match(device,inventory);if(!entry)return false;
  entry.device=identity({...entry.device,anchor:mergeAnchors(entry.device.anchor,device.anchor)});return true;
 }
 add(device:Device,inventory:Device[]):boolean {
  if(!hasIdentity(device))return false;
  const existing=this.entries.filter(e=>sameIdentity(e.device,device));
  if(existing.length>1)throw Error('Identity is ambiguous. This camera cannot safely be hidden for the session.');
  if(existing.length){if(!this.hides(device,inventory))throw Error('Identity is ambiguous. This camera cannot safely be hidden for the session.');return true;}
  const reverse=selectIdentity(inventory,device);
  if(reverse.ambiguous||reverse.index<0||inventory[reverse.index].id!==device.id)throw Error('Identity is ambiguous. This camera cannot safely be hidden for the session.');
  this.entries.push({device:identity(device),createdAt:new Date().toISOString()});return true;
 }
 releaseObserved(device:Device,inventory:Device[]){const match=this.match(device,inventory);if(match)this.entries=this.entries.filter(e=>e!==match);}
 moveTo(target:SessionSuppression){for(const entry of this.entries){const matches=target.entries.filter(e=>sameIdentity(e.device,entry.device));if(matches.length===1)matches[0].device=identity({...matches[0].device,anchor:mergeAnchors(matches[0].device.anchor,entry.device.anchor)});else target.entries.push(structuredClone(entry));}this.entries=[];}
 diagnostics(){return {count:this.count,entries:this.entries.map(e=>({createdAt:e.createdAt,reason:'MANUAL_CURRENT_LIST_REMOVAL',hasMac:Boolean(e.device.anchor.macAddress),hasUuid:Boolean(e.device.anchor.onvifEndpointUuid),hasSerial:Boolean(e.device.anchor.serialNumber)}))};}
}
