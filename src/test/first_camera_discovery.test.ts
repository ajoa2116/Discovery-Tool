import { EventEmitter } from 'node:events';
import { RemoteInfo } from 'node:dgram';
import { fieldHello, fieldNic } from './support/first_camera_field.ts';
import { NodeOnvifWsDiscoveryTransport, UdpSocketLike } from '../core/drivers/ws_discovery_transport.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { Phase3ActiveProbing } from '../core/engine/phase3_probing.ts';
import type { Device } from '../types/index.ts';
import type { DeviceEnricher, DeviceEnrichmentOptions } from '../core/engine/device_enrichment.ts';
import type { WsDiscoveryResult } from '../core/drivers/ws_discovery_transport.ts';
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
  if (!process.argv.includes('--enrichment-only')) {
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
  }
  // --enrichment-only skips every pre-existing transport case. These regressions use promises and memory only.
  const deferred = <T,>() => { let resolve!: (value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return{promise,resolve}; };
  const camera = (ip:string,uuid='camera-uuid',mac='00:11:22:33:44:50'):Device => ({
    id:'onvif:'+uuid,anchor:{macAddress:mac,onvifEndpointUuid:uuid,vendor:'Fixture'},
    network:{ipAddress:ip,port:80,protocol:'ONVIF',subnetMask:'255.255.255.0'},
    status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',discoveredPhase:3,
    firstSeenAt:'2026-01-01T00:00:00Z',lastSeenAt:'2026-01-01T00:00:00Z',
    reachability:{subnetClassification:'LOCAL',wsDiscoveryRespondedAt:'2026-01-01T00:00:00Z'},
    diagnostics:{checks:[]},technician:{name:'Lobby',notes:'Keep notes'},
  });
  const scenario = () => {
    const database=new SiteProjectDatabase('ISOLATED_TEST');database.createNewProject('Progressive fixture');
    const transportGate=deferred<WsDiscoveryResult>(),controller=new AbortController();
    const observations:Device[]=[],events:Device[]=[];
    const jobs:Array<{device:Device;options:DeviceEnrichmentOptions;gate:ReturnType<typeof deferred<void>>;done:ReturnType<typeof deferred<void>>}>=[];
    let deliver!:(device:Device)=>void;
    const injected:DeviceEnricher={enrich:async(device,options={})=>{
      const gate=deferred<void>(),done=deferred<void>();jobs.push({device,options,gate,done});
      await gate.promise;try{options.onUpdate?.(device,['reachability','status','diagnostics']);}finally{done.resolve();}return device;
    }};
    const work=Phase3ActiveProbing.execute([fieldNic()],{discover:async(_n,options)=>{
      deliver=device=>{observations.push(device);options?.onDevice?.(device,true)};return transportGate.promise;
    }},injected,{signal:controller.signal,onEnrichment:device=>events.push(structuredClone(device))},LocalHostIdentity.fromInterfaces([fieldNic()]),database);
    const complete=async(index:number)=>{jobs[index].device.reachability={subnetClassification:'DIFFERENT_SUBNET',lastSuccessfulResponseAt:'2026-02-01T00:00:00Z'};jobs[index].device.status='ONLINE';jobs[index].device.diagnostics={checks:[{type:'TCP',targetIp:jobs[index].device.network.ipAddress,success:true,timestamp:'2026-02-01T00:00:00Z'}]};jobs[index].gate.resolve();await jobs[index].done.promise;};
    const finish=async()=>{for(const job of jobs)job.gate.resolve();transportGate.resolve({devices:observations,interfaceErrors:[],cancelled:controller.signal.aborted});return work;};
    return{database,controller,jobs,events,deliver:(device:Device)=>deliver(device),complete,finish};
  };
  for(const order of ['discovery-first','enrichment-first'] as const){
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));
      if(order==='enrichment-first')await fixture.complete(0);
      fixture.deliver(camera('192.0.2.20'));
      fixture.database.updateDeviceTechnicianFields('onvif:camera-uuid',{name:'Updated Lobby',notes:'New notes'});
      const before=JSON.stringify(fixture.database.getSession()),eventCount=fixture.events.length;
      if(order==='discovery-first')await fixture.complete(0);
      const current=fixture.database.getDeviceById('onvif:camera-uuid')!;
      a(current.network.ipAddress==='192.0.2.20',order+': delayed old-address enrichment cannot revert newer address');
      a(fixture.database.getDevices().length===1,order+': same physical identity retains one row');
      a(current.network.ipAddressHistory?.join(',')==='192.0.2.10,192.0.2.20',order+': history retains forward transition only');
      const moves=fixture.database.listProjectHistory().filter(event=>event.type==='IP_ADDRESS_CHANGED');
      a(moves.length===1&&moves[0].details?.previousIp==='192.0.2.10'&&moves[0].details?.currentIp==='192.0.2.20',order+': exactly one forward address-change history event, no false reverse transition');
      a(current.technician?.name==='Updated Lobby'&&current.technician.notes==='New notes',order+': latest technician fields retained');
      if(order==='discovery-first'){
        a(JSON.stringify(fixture.database.getSession())===before,'stale result cannot replace newer status, reachability, diagnostics, metadata or dirty state');
        a(fixture.events.length===eventCount,'stale result is not published as accepted enrichment');
      }
      a(fixture.jobs.some(job=>job.device.network.ipAddress==='192.0.2.20'),'new address receives its own enrichment opportunity');
    }finally{const result=await fixture.finish();if(order==='discovery-first')a(result.logs.some(log=>log.includes('ENRICHMENT REJECTED')),'stale rejection is distinguishable in existing logs');}
  }
  {
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));fixture.jobs[0].device.status='ONLINE';
      a(fixture.database.getDeviceById('onvif:camera-uuid')?.status==='UNKNOWN','enricher receives a detached observation, not mutable inventory');
      await fixture.complete(0);
      a(fixture.events.length===1&&fixture.events[0].network.ipAddress==='192.0.2.10'&&fixture.database.getDevices()[0].status==='ONLINE','same-address enrichment applies and publishes normally');
    }finally{await fixture.finish();}
  }
  {
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));fixture.deliver(camera('192.0.2.20'));fixture.deliver(camera('192.0.2.10'));
      const before=JSON.stringify(fixture.database.getSession());await fixture.complete(0);
      a(JSON.stringify(fixture.database.getSession())===before&&fixture.events.length===0,'A-B-A rediscovery supersedes the original generation despite equal final address');
    }finally{await fixture.finish();}
  }
  {
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));fixture.deliver(camera('192.0.2.10','other-uuid','00:11:22:33:44:60'));
      await fixture.complete(0);
      a(fixture.database.getDevices().length===2&&fixture.database.getDeviceById('onvif:other-uuid')?.status==='UNKNOWN','different identities at one address remain separate during enrichment');
    }finally{await fixture.finish();}
  }
  {
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));const before=JSON.stringify(fixture.database.getSession());fixture.controller.abort();await fixture.complete(0);
      a(JSON.stringify(fixture.database.getSession())===before&&fixture.events.length===0,'cancelled enrichment cannot mutate inventory or publish accepted results');
    }finally{a((await fixture.finish()).cancelled,'injected cancellation remains reported');}
  }
  {
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));fixture.deliver(camera('192.0.2.10','camera-uuid','00:11:22:33:44:60'));
      await fixture.complete(0);
      a(fixture.database.getDevices().length===2&&fixture.database.getDevices().some(device=>device.anchor.macAddress==='00:11:22:33:44:60'&&device.status==='UNKNOWN'),'shared UUID with conflicting MAC remains a separate, unmodified identity');
      a(fixture.jobs.length===2,'conflicting rows do not share one UUID-keyed enrichment task');
    }finally{await fixture.finish();}
  }
  {
    const fixture=scenario();try{
      const partial=camera('192.0.2.10');partial.anchor.macAddress=null;fixture.deliver(partial);
      fixture.deliver(camera('192.0.2.10'));
      const before=JSON.stringify(fixture.database.getSession());await fixture.complete(0);
      a(JSON.stringify(fixture.database.getSession())===before&&fixture.events.length===0,'same-address strengthened identity supersedes the earlier partial observation');
    }finally{await fixture.finish();}
  }
  {
    const fixture=scenario();try{
      fixture.deliver(camera('192.0.2.10'));fixture.deliver(camera('192.0.2.10'));
      a(fixture.jobs.length===1,'unchanged same-address identity does not launch duplicate enrichment');
      await fixture.complete(0);a(fixture.events.length===1,'valid same-address observation remains accepted after duplicate discovery');
    }finally{await fixture.finish();}
  }
  console.log(`First camera discovery summary: ${passed} passed, ${failed} failed, 0 skipped`);if(failed)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1});
