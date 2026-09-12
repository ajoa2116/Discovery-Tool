import { Device, WindowsAdapterSnapshot, NICInfo } from '../../types/index.ts';

// Software regression fixture derived from technician evidence; not a hardware test.
export const fieldEthernet = (): WindowsAdapterSnapshot => ({ interfaceIndex:8,interfaceAlias:'Ethernet',mediaType:'ETHERNET',operationalStatus:'Up',eligible:true,dhcpEnabled:true,ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}],defaultGateways:[],dnsAutomatic:true,dnsServers:[],capturedAt:'2026-09-12T12:00:00Z' });
export const fieldNic = (): NICInfo => ({name:'Ethernet',interfaceIndex:8,ipAddress:'192.168.0.124',netmask:'255.255.255.0',broadcast:'192.168.0.255',mac:'00:11:22:33:44:66',isInternal:false});
export const fieldCamera = (): Device => ({id:'mac:e4:30:22:cd:68:85',anchor:{macAddress:'e4:30:22:cd:68:85',vendor:'Hanwha Vision'},network:{ipAddress:'192.168.1.100',subnetMask:null,port:0,protocol:'MANUAL'},status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',discoveredPhase:1,firstSeenAt:'2026-09-12T12:00:00Z',lastSeenAt:'2026-09-12T12:00:00Z'});
export const fieldHello = (ip = '192.168.1.100', uuid = '11111111-2222-3333-4444-555555555555') => `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">
<s:Header><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Hello</a:Action></s:Header>
<s:Body><d:Hello><a:EndpointReference><a:Address>urn:uuid:${uuid}</a:Address></a:EndpointReference>
<d:Scopes>onvif://www.onvif.org/name/Hanwha%20Vision
onvif://www.onvif.org/MAC/E4:30:22:CD:68:85</d:Scopes>
<d:XAddrs>
http://${ip}/onvif/device_service
</d:XAddrs></d:Hello></s:Body></s:Envelope>`;
