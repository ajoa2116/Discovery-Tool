import { EventEmitter } from 'node:events';
import { RemoteInfo } from 'node:dgram';
import { fieldHello, fieldNic } from './support/first_camera_field.ts';
import { NodeOnvifWsDiscoveryTransport, UdpSocketLike } from '../core/drivers/ws_discovery_transport.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { Phase3ActiveProbing } from '../core/engine/phase3_probing.ts';
import { NoopDeviceEnricher } from '../core/engine/device_enrichment.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';

let passed=0,failed=0;const a=(condition:unknown,name:string)=>{if(condition){passed++;console.log(`  PASS: ${name}`)}else{failed++;console.error(`  FAIL: ${name}`)}};
class Socket extends EventEmitter implements UdpSocketLike {
  closed=false;bound?:{port:number;address:string};memberships:string[]=[];outbound?:string;
  constructor(readonly packet?:string,readonly broken=false){super()}
  bind(options:{port:number;address:string},callback:()=>void){this.bound=options;callback()}
  setMulticastInterface(address:string){this.outbound=address}
  addMembership(address:string,local:string){if(this.broken)throw Error('membership denied');this.memberships.push(`${address}@${local}`);if(this.packet)queueMicrotask(()=>this.deliver(this.packet!))}
  send(_message:unknown,_port:number,_address:string,callback:(error?:Error|null)=>void){callback()}
  deliver(packet:string){this.emit('message',Buffer.from(packet),{address:'192.168.1.100',family:'IPv4',port:3702,size:packet.length} as RemoteInfo)}
  close(){this.closed=true}
}
async function run(){
  const hello=fieldHello(),parsed=OnvifDriver.parseHello(hello,'192.168.1.100');
  a(parsed?.anchor?.macAddress==='e4:30:22:cd:68:85','field Hello safely extracts advertised MAC');
  a(parsed?.anchor?.vendor==='Hanwha Vision','field Hello extracts advertised manufacturer');
  a(parsed?.network?.xAddr==='http://192.168.1.100/onvif/device_service','multiline off-subnet XAddr preserved');
  a(!parsed?.anchor?.model&&!parsed?.anchor?.serialNumber&&!parsed?.onvifConfig,'Hello creates no unadvertised fields');
  const whitespace=hello.replace('<s:Header>','<s:Header><a:MessageID>urn:uuid:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</a:MessageID>').replace('<a:Address>urn:uuid:','<a:Address>\n urn:uuid:').replace('</a:Address>',' \n</a:Address>');
  a(OnvifDriver.parseHello(whitespace,'192.168.1.100')?.anchor?.onvifEndpointUuid==='11111111-2222-3333-4444-555555555555','identity comes from endpoint, not header message ID');
  for(const [packet,label] of [[hello.replaceAll('http://schemas.xmlsoap.org/ws/2005/04/discovery','urn:unrelated'),'wrong discovery namespace'],[hello.replaceAll('onvif://www.onvif.org/','urn:windows/'),'generic non-ONVIF discovery'],[hello.replace('urn:uuid:11111111-2222-3333-4444-555555555555','urn:uuid:invalid'),'invalid endpoint identity'],[hello.slice(0,-20),'truncated XML'],['<hello/>','arbitrary UDP'],[hello.replace('?>','?><!DOCTYPE s [<!ENTITY x "test">]>'),'DTD/entity XML']] as const) a(OnvifDriver.parseHello(packet,'192.168.1.100')===null,`reject ${label}`);
  a(OnvifDriver.parseHello(hello,'fe80::100')===null,'IPv6 sender not misrepresented as IPv4');
  const probePacket=hello.replaceAll('d:Hello','d:ProbeMatch').replace('/Hello</a:Action>','/ProbeMatches</a:Action>');
  a(OnvifDriver.parseProbeMatch(probePacket,'192.168.1.100')!==null,'existing ProbeMatch still parses');
  const listener=new Socket(hello),probe=new Socket(),transport=new NodeOnvifWsDiscoveryTransport();
  const result=await transport.discover([fieldNic()],{timeoutMs:5,socketFactory:()=>probe,multicastSocketFactory:()=>listener});
  a(listener.bound?.port===3702&&listener.bound.address==='0.0.0.0','multicast receiver binds shared discovery port');
  a(listener.memberships.includes('239.255.255.250@192.168.0.124'),'receiver joins selected Ethernet multicast group');
  a(probe.bound?.port===0&&probe.bound.address==='192.168.0.124'&&probe.outbound==='192.168.0.124','probe retains adapter-bound source and outbound interface');
  a(result.devices.length===1&&result.devices[0].status==='DIFFERENT_SUBNET','off-subnet announcement surfaced without unicast prerequisite');
  a(result.devices[0]?.sessionVerification==='NOT_VERIFIED'&&!result.devices[0]?.reachability?.lastSuccessfulResponseAt,'announcement is presence evidence, not live unicast verification');
  a(result.messageCounts?.acceptedHellos===1,'bounded announcement count recorded');
  a(listener.closed&&probe.closed,'timeout closes listener and probe');
  const controller=new AbortController(),cancelListener=new Socket(),cancelProbe=new Socket();
  const pending=transport.discover([fieldNic()],{timeoutMs:1000,signal:controller.signal,socketFactory:()=>cancelProbe,multicastSocketFactory:()=>cancelListener});controller.abort();
  a((await pending).cancelled&&cancelListener.closed&&cancelProbe.closed,'cancellation closes both socket types');
  const badListener=new Socket(undefined,true),okProbe=new Socket();
  const failedMembership=await transport.discover([fieldNic()],{timeoutMs:5,socketFactory:()=>okProbe,multicastSocketFactory:()=>badListener});
  a(failedMembership.interfaceErrors.length===1&&okProbe.outbound==='192.168.0.124','membership failure visible while probes continue');
  const rejection=await transport.discover([fieldNic()],{timeoutMs:5,socketFactory:()=>new Socket(),multicastSocketFactory:()=>new Socket('<invalid/>')});
  a(rejection.devices.length===0&&rejection.messageCounts?.rejected===1,'rejected UDP packet creates no device and increments safe count');
  const multi=await transport.discover([fieldNic(),{...fieldNic(),name:'Wi-Fi',ipAddress:'192.168.40.166',interfaceIndex:9}],{timeoutMs:5,socketFactory:()=>new Socket(),multicastSocketFactory:()=>new Socket(hello)});
  a(multi.devices.length===1&&!multi.devices[0].reachability?.discoveryInterface,'multi-adapter multicast does not invent receiving interface');
  const db=new SiteProjectDatabase('ISOLATED_TEST');db.startQuickWork();
  await Phase3ActiveProbing.execute([fieldNic()],{discover:async(_interfaces,options)=>{for(const device of result.devices)options?.onDevice?.(device,true);return result}},new NoopDeviceEnricher(),{},LocalHostIdentity.fromInterfaces([fieldNic()]),db);
  a(db.getDevices().length===1&&db.getDevices()[0].id==='mac:e4:30:22:cd:68:85','announcement reuses existing inventory reconciliation');
  a(db.getDevices()[0].sessionVerification==='NOT_VERIFIED','enrichment/storage retain announcement verification boundary');
  console.log(`First camera discovery summary: ${passed} passed, ${failed} failed, 0 skipped`);if(failed)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1});
