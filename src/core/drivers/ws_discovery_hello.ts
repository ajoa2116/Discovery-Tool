import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Device } from '../../types/index.ts';
import { normalizeIPv4, normalizeManualMac } from '../../shared/address_validation.ts';

const SOAP = ['http://www.w3.org/2003/05/soap-envelope','http://schemas.xmlsoap.org/soap/envelope/'];
const ADDRESSING = ['http://schemas.xmlsoap.org/ws/2004/08/addressing','http://www.w3.org/2005/08/addressing'];
const DISCOVERY = ['http://schemas.xmlsoap.org/ws/2005/04/discovery','http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01'];
const ONVIF_TYPES = ['http://www.onvif.org/ver10/network/wsdl','http://www.onvif.org/ver10/device/wsdl'];
type Element = {node:any;ns:Record<string,string>};
const text = (element:Element|null):string => typeof element?.node === 'string' ? element.node : String(element?.node?.['#text'] ?? '');
function child(parent:Element, name:string, namespaces:string[]):Element|null {
  const keys = Object.keys(parent.node || {}).filter(key => !key.startsWith('@_') && key.split(':').at(-1) === name);
  if(keys.length!==1 || Array.isArray(parent.node[keys[0]])) return null;
  const key=keys[0],node=parent.node[key],ns={...parent.ns};
  for(const [attribute,uri] of Object.entries(node || {})) if(attribute==='@_xmlns'||attribute.startsWith('@_xmlns:')) ns[attribute==='@_xmlns'?'':attribute.slice(8)]=String(uri);
  return namespaces.includes(ns[key.includes(':')?key.split(':')[0]:'']) ? {node,ns} : null;
}
function soap(xml:string):Element|null {
  if(Buffer.byteLength(xml,'utf8')>65507 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) return null;
  const document=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,trimValues:true}).parse(xml);
  if(Object.keys(document).filter(key=>!key.startsWith('?')).length!==1)return null;
  return child({node:document,ns:{}},'Envelope',SOAP);
}
export function discoveryMessageKind(xml:string):'HELLO'|'PROBE_MATCH'|'UNKNOWN' {
  try {
    const envelope=soap(xml);if(!envelope)return 'UNKNOWN';
    const header=child(envelope,'Header',SOAP),action=header&&child(header,'Action',ADDRESSING);
    if(action) return DISCOVERY.some(ns=>text(action)===`${ns}/Hello`)?'HELLO':DISCOVERY.some(ns=>text(action)===`${ns}/ProbeMatches`)?'PROBE_MATCH':'UNKNOWN';
    return child(envelope,'Body',SOAP) && /<(?:[A-Za-z_][\w.-]*:)?Hello\b/.test(xml)?'HELLO':'UNKNOWN';
  }catch{return 'UNKNOWN'}
}
export interface HelloInspection {device:Partial<Device>|null;reason:string;stages:string[];metadataVersion?:number;hasUuid?:boolean;hasTypes?:boolean;hasScopes?:boolean}
export function inspectDiscoveryHello(xml:string,senderIp:string):HelloInspection {
  const stages:string[]=[];const reject=(reason:string):HelloInspection=>({device:null,reason,stages});
  try {
    if(!normalizeIPv4(senderIp))return reject('UNSUPPORTED_SOURCE');
    const envelope=soap(xml);if(!envelope)return reject('INVALID_SOAP');stages.push('SOAP_PARSED');
    const header=child(envelope,'Header',SOAP),action=header&&child(header,'Action',ADDRESSING);
    if(!action||!DISCOVERY.some(ns=>text(action)===`${ns}/Hello`))return reject('UNSUPPORTED_ACTION');stages.push('ACTION_HELLO');
    const discoveryNamespace=text(action).slice(0,-'/Hello'.length);
    const body=child(envelope,'Body',SOAP),hello=body&&child(body,'Hello',[discoveryNamespace]);if(!hello)return reject('MISSING_HELLO');stages.push('HELLO_IDENTIFIED');
    const xaddrs=child(hello,'XAddrs',[discoveryNamespace]);if(!text(xaddrs).trim())return reject('MISSING_XADDR');
    const validUrls = text(xaddrs).split(/\s+/).flatMap(value=>{
      if(/[\u0000-\u0020\u007f\\]/.test(value))return [];
      const host=value.match(/^https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:[/?#]|$)/i)?.[1];
      if(!host||!normalizeIPv4(host)||/^(?:0|127)\./.test(host)||Number(host.split('.')[0])>=224)return [];
      try{const url=new URL(value);return !url.username&&!url.password&&!url.hash&&(!url.port||Number(url.port)>0)&&url.hostname===host&&['http:','https:'].includes(url.protocol)?[{value,ip:host,port:url.port?Number(url.port):url.protocol==='https:'?443:80,path:url.pathname}]:[]}catch{return []}
    });
    if(!validUrls.length)return reject('NO_VALID_IPV4_XADDR');stages.push('XADDR_EXTRACTED');
    const scopesElement=child(hello,'Scopes',[discoveryNamespace]),typesElement=child(hello,'Types',[discoveryNamespace]);
    const scopes=text(scopesElement),types=text(typesElement).split(/\s+/).filter(Boolean);
    const onvifScope=/onvif:\/\/www\.onvif\.org\//i.test(scopes);
    const onvifType=types.some(type=>{const parts=type.split(':');return ONVIF_TYPES.includes(typesElement!.ns[parts.length===2?parts[0]:''])&&['Device','NetworkVideoTransmitter'].includes(parts.at(-1)!)});
    // Some compliant devices omit optional Scopes/Types. Their advertised ONVIF service is evidence, not an HTTP verification.
    if(!onvifScope&&!onvifType&&!(!scopes.trim()&&!types.length&&validUrls.some(url=>/^\/onvif\/device_service\/?$/i.test(url.path))))return reject('NOT_ONVIF');
    const endpoint=child(hello,'EndpointReference',ADDRESSING),address=endpoint&&child(endpoint,'Address',ADDRESSING),endpointText=text(address);
    const uuid=endpointText.match(/^urn:uuid:([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i)?.[1]?.toLowerCase();
    if(/^urn:uuid:/i.test(endpointText)&&!uuid)return reject('INVALID_ENDPOINT_UUID');
    const scopeValue=(field:string)=>{const value=scopes.match(new RegExp(`onvif://www\\.onvif\\.org/(?:${field})/([^\\s]+)`,'i'))?.[1];try{return value?decodeURIComponent(value):undefined}catch{return undefined}};
    const mac=normalizeManualMac(scopeValue('MAC')||''),model=scopeValue('hardware'),serialNumber=scopeValue('serial|serialnumber');
    const name=scopeValue('name')||'';const vendors:Record<string,string>={axis:'Axis Communications',illustra:'Illustra / Tyco',lenel:'Lenel Access Control',hanwha:'Hanwha Vision',hikvision:'Hikvision Digital Technology',dahua:'Dahua Technology'};
    const vendor=Object.entries(vendors).find(([key])=>name.toLowerCase().includes(key))?.[1]||'Unknown ONVIF Device';
    const chosen=validUrls[0],version=Number(text(child(hello,'MetadataVersion',[discoveryNamespace])));const metadataVersion=Number.isSafeInteger(version)&&version>=0&&text(child(hello,'MetadataVersion',[discoveryNamespace]))!==''?version:undefined;
    const id=mac?`mac:${mac}`:uuid?`onvif:${uuid}`:serialNumber?`serial:${encodeURIComponent(serialNumber)}`:`session:${createHash('sha256').update(`${senderIp}|${chosen.value}`).digest('hex').slice(0,32)}`;
    stages.push('CANDIDATE_CREATED');
    return {reason:'ACCEPTED',stages,metadataVersion,hasUuid:Boolean(uuid),hasTypes:types.length>0,hasScopes:Boolean(scopes.trim()),device:{id,anchor:{macAddress:mac,onvifEndpointUuid:uuid,serialNumber,vendor,model},network:{ipAddress:chosen.ip,senderIp,subnetMask:null,port:chosen.port,protocol:'ONVIF',xAddr:chosen.value,xAddrs:[...new Set(validUrls.map(url=>url.value))]},status:'DISCOVERED',sessionVerification:'NOT_VERIFIED',statusMessage:'Observed an ONVIF WS-Discovery Hello announcement; unicast communication is not verified.',discoveredPhase:3}};
  }catch{return reject('MALFORMED_DISCOVERY_XML')}
}

/** Diagnostic projection only. Never exports XML, scope values, credentials, or arbitrary Action text. */
export function inspectDiscoveryMetadata(xml:string) {
  try {
    const envelope=soap(xml),header=envelope&&child(envelope,'Header',SOAP),action=header&&child(header,'Action',ADDRESSING);
    const actionText=text(action),known=DISCOVERY.flatMap(ns=>['Hello','ProbeMatches','Probe','Bye'].map(kind=>`${ns}/${kind}`)).includes(actionText);
    const kind=known?({Hello:'HELLO',ProbeMatches:'PROBE_MATCH',Probe:'PROBE',Bye:'BYE'} as Record<string,string>)[actionText.split('/').at(-1)!]:'UNKNOWN';
    const body=envelope&&child(envelope,'Body',SOAP),message=body&&(child(body,'Hello',DISCOVERY)||child(body,'ProbeMatches',DISCOVERY)||child(body,'Probe',DISCOVERY)||child(body,'Bye',DISCOVERY));
    const candidate=message&&(child(message,'ProbeMatch',DISCOVERY)||message),xaddrs=candidate&&child(candidate,'XAddrs',DISCOVERY);
    const urls=text(xaddrs).trim().split(/\s+/).filter(Boolean);
    const hosts=urls.flatMap(value=>{try{const u=new URL(value),host=value.match(/^https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:[/?#]|$)/i)?.[1];return host&&normalizeIPv4(host)&&u.hostname===host&&!u.username&&!u.password&&!u.hash&&(!u.port||Number(u.port)>0)&&!/^(?:0|127)\./.test(host)&&Number(host.split('.')[0])<224?[host]:[]}catch{return []}});
    return {soapParsed:Boolean(envelope),actionFound:Boolean(action),actionUri:known?actionText:action?'UNRECOGNIZED_ACTION':undefined,kind,messageId:text(header&&child(header,'MessageID',ADDRESSING)),xAddrCount:urls.length,validatedXAddrHosts:[...new Set(hosts)].slice(0,16),endpointReferencePresent:Boolean(candidate&&child(candidate,'EndpointReference',ADDRESSING)),typesPresent:Boolean(candidate&&child(candidate,'Types',DISCOVERY)),scopesPresent:Boolean(candidate&&child(candidate,'Scopes',DISCOVERY)),metadataVersionPresent:Boolean(candidate&&child(candidate,'MetadataVersion',DISCOVERY))};
  } catch {return {soapParsed:false,actionFound:false,kind:'UNKNOWN',messageId:'',xAddrCount:0,validatedXAddrHosts:[]};}
}
