import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import express from 'express';
import { readFileSync } from 'node:fs';
import { NodeOnvifWsDiscoveryTransport, UdpSocketLike, mergeDiscoveredDevice } from '../core/drivers/ws_discovery_transport.ts';
import { WsDiscoveryEvidence } from '../core/drivers/ws_discovery_evidence.ts';
import { inspectDiscoveryHello } from '../core/drivers/ws_discovery_hello.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { Phase3ActiveProbing } from '../core/engine/phase3_probing.ts';
import { NoopDeviceEnricher, WindowsDeviceEnricher } from '../core/engine/device_enrichment.ts';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { createReceiveTraceRouter } from '../server/ws_discovery_trace_routes.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';
import { EvidenceProvenance } from '../shared/evidence_provenance.ts';
import { hanwhaHello } from './support/hanwha_hello.ts';
import { fieldNic,fieldEthernet } from './support/first_camera_field.ts';
let passed=0;const check=(value:unknown,name:string)=>{assert.ok(value,name);passed++;console.log(`PASS: ${name}`)};
// An unmarked network packet is simulated only through injected sockets, never transmitted.
const physicalXml=()=>hanwhaHello({uuid:true,padding:1800}).replace('xmlns:synthetic="urn:cctv-discovery:synthetic-test" ','');
class Socket extends EventEmitter implements UdpSocketLike {
  bound:any;closed=0;members:string[]=[];onReady=()=>{};
  bind(options:any,callback:()=>void){this.bound=options;callback();queueMicrotask(()=>this.onReady());}
  address(){return {address:this.bound.address,port:this.bound.port||49170,family:'IPv4'};}
  addMembership(_group:string,local:string){this.members.push(local);}
  setMulticastInterface(){}
  send(_m:unknown,_p:number,_a:string,cb:(error?:Error|null)=>void){cb();}
  close(){this.closed++;this.emit('close');}
  packet(xml:string,source='192.168.1.100'){this.emit('message',Buffer.from(xml),{address:source,port:3702,family:'IPv4',size:Buffer.byteLength(xml)});}
}
const transport=new NodeOnvifWsDiscoveryTransport();
async function candidate(provenance:EvidenceProvenance,xml=physicalXml(),source='192.168.1.100'){
 const evidence=new WsDiscoveryEvidence(),socket=new Socket();socket.onReady=()=>socket.packet(xml,source);
 const result=await transport.discover([fieldNic()],{timeoutMs:2,announcementOnly:true,evidence,provenance,localAddresses:[fieldNic().ipAddress,'192.168.40.166'],multicastSocketFactory:()=>socket});return {result,trace:evidence.snapshot().sessions[0],socket};
}
async function pipeline(db:SiteProjectDatabase,provenance:EvidenceProvenance,notify:()=>void,xml=physicalXml(),purpose?:'RECEIVE_TRACE_ONLY'){
 const wrapper={discover:(nics:any,options:any)=>{const socket=new Socket();socket.onReady=()=>socket.packet(xml);return transport.discover(nics,{...options,timeoutMs:2,announcementOnly:true,provenance,purpose,multicastSocketFactory:()=>socket});}};
 return Phase3ActiveProbing.execute([fieldNic()],wrapper,new NoopDeviceEnricher(),{onDevice:notify},LocalHostIdentity.fromInterfaces([fieldNic()]),db);
}
async function run(){
 const parsed=inspectDiscoveryHello(hanwhaHello({uuid:true}),'192.168.1.100').device;
 check(parsed?.evidenceProvenance==='SYNTHETIC_TEST','fixture declares provenance at XML creation and parser preserves it');
 const synthetic=await candidate('SYNTHETIC_TEST');check(synthetic.result.devices.length===1,'synthetic input still exercises candidate construction');
 check(synthetic.result.devices[0].evidenceProvenance==='SYNTHETIC_TEST','transport options preserve provenance without XML marker');
 const arbitrary=await candidate('SYNTHETIC_TEST',physicalXml(),'203.0.113.57');check(arbitrary.result.devices[0].evidenceProvenance==='SYNTHETIC_TEST','arbitrary external-style source cannot upgrade synthetic provenance');
 const marked=await candidate('PHYSICAL_NETWORK',hanwhaHello({uuid:true}));check(marked.result.devices[0].evidenceProvenance==='SYNTHETIC_TEST','on-wire test marker downgrades trust across process boundaries');
 const quick=new SiteProjectDatabase(),project=new SiteProjectDatabase();project.createNewProject('Guard test');
 for(const db of [quick,project]){const before=JSON.stringify(db.getSession());assert.throws(()=>db.upsertDevice(synthetic.result.devices[0]));check(JSON.stringify(db.getSession())===before,`${db.getSession().mode} rejects synthetic evidence without mutation or dirty changes`);}
 let notifications=0;await pipeline(quick,'SYNTHETIC_TEST',()=>notifications++);check(quick.getDevices().length===0&&!quick.getSession().dirty,'synthetic pipeline creates no Unsaved Quick Work changes');check(notifications===0,'synthetic pipeline emits no technician device notification');
 await pipeline(project,'SUPPORT_DIAGNOSTIC',()=>notifications++);check(project.getDevices().length===0&&notifications===0,'support provenance cannot mutate Project or notify technician');
 await pipeline(quick,'PHYSICAL_NETWORK',()=>notifications++,physicalXml(),'RECEIVE_TRACE_ONLY');check(quick.getDevices().length===0&&notifications===0,'support purpose suppresses callbacks even with an explicitly physical candidate');
 const isolated=new SiteProjectDatabase('ISOLATED_TEST');await pipeline(isolated,'SYNTHETIC_TEST',()=>{});check(isolated.getDevices().length===1&&isolated.getDevices()[0].evidenceProvenance==='SYNTHETIC_TEST','explicit isolated inventory accepts simulation and retains provenance');
 const persisted=isolated.getProject();persisted.devices.forEach(device=>device.anchor.macAddress??=null);const beforeImport=JSON.stringify(project.getSession());assert.throws(()=>project.importProjectJson(JSON.stringify(persisted)),/Nonphysical evidence/);check(JSON.stringify(project.getSession())===beforeImport,'synthetic project import rejects before changing technician session');
 const reopened=new SiteProjectDatabase('ISOLATED_TEST');reopened.importProjectJson(JSON.stringify(persisted));check(reopened.getDevices()[0].evidenceProvenance==='SYNTHETIC_TEST','explicit isolated import retains provenance across persistence');
 const cloned=await Promise.resolve(structuredClone(isolated.getDevices()[0]));check(cloned.evidenceProvenance==='SYNTHETIC_TEST','provenance survives asynchronous event and serialization boundary');
 assert.throws(()=>quick.upsertDevice(cloned));check(quick.getDevices().length===0,'isolated result cannot later enter technician inventory');
 await pipeline(quick,'PHYSICAL_NETWORK',()=>notifications++);check(quick.getDevices().length===1&&notifications===1,'unmarked physical-network candidate remains eligible');
 check(quick.getDevices()[0].anchor.onvifEndpointUuid==='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','unusual fixture-like UUID is not blacklisted for physical evidence');
 const physicalReference=quick.getDevices()[0],mixed=[physicalReference];mergeDiscoveredDevice(mixed,{...synthetic.result.devices[0],anchor:{...synthetic.result.devices[0].anchor,macAddress:'00:11:22:33:44:55'}});check(mixed.length===2&&!physicalReference.identityConflicts,'transport merge partitions provenance before any identity conflict mutation');
 const beforePhysical=JSON.stringify(quick.getDevices()[0]);assert.throws(()=>quick.upsertDevice({...synthetic.result.devices[0],network:{...synthetic.result.devices[0].network,ipAddress:'192.168.1.101'}}));check(JSON.stringify(quick.getDevices()[0])===beforePhysical,'synthetic identity collision cannot overwrite physical device');
 await pipeline(quick,'PHYSICAL_NETWORK',()=>{});check(quick.getDevices().length===1,'repeated physical Hello deduplicates');
 const original=quick.getDevices()[0];await new WindowsDeviceEnricher({lookup:async()=>({ipAddress:original.network.ipAddress,macAddress:'e4:30:22:cd:68:85',interfaceIndex:8})},{probe:async()=>[]}).enrich(original,{onUpdate:device=>quick.upsertDevice(device)});
 check(quick.getDevices().length===1&&quick.getDevices()[0].anchor.macAddress==='e4:30:22:cd:68:85','later MAC enrichment preserves one physical identity');
 check(quick.getDevices()[0].evidenceProvenance==='PHYSICAL_NETWORK','MAC reconciliation retains physical provenance');
 const provisional=await candidate('PHYSICAL_NETWORK',hanwhaHello().replace('xmlns:synthetic="urn:cctv-discovery:synthetic-test" ',''));check(provisional.result.devices[0].id.startsWith('session:'),'physical Hello without UUID remains provisional');
 for(const source of ['127.0.0.8','192.168.40.166']){const local=await candidate('PHYSICAL_NETWORK',physicalXml(),source);check(local.result.devices.length===0,`local-source guard blocks unmarked local traffic from ${source}`);}
 const observed=await candidate('PHYSICAL_NETWORK');const trace=observed.trace;
 check(trace.recentDatagrams[0].stage==='UDP_DATAGRAM_RECEIVED'&&trace.recentDatagrams[0].sourceIp==='192.168.1.100','source IP proof exists independently of inventory');
 check(trace.counters.externalDatagrams===1&&trace.counters.selfDatagrams===0,'external and self receive counts are separate');
 check(trace.externalSourceIPs[0]==='192.168.1.100','bounded external source samples retained');
 check(trace.recentDatagrams[0].soapParsed&&trace.recentDatagrams[0].kind==='HELLO','external-style packet parses and classifies Hello');
 check(trace.recentParserEvents.some(e=>e.stage==='XADDR_EXTRACTED')&&trace.recentParserEvents.some(e=>e.stage==='CANDIDATE_CREATED'),'XAddr and candidate stages retained');
 check(observed.result.devices[0].status==='DIFFERENT_SUBNET'&&observed.result.devices[0].sessionVerification==='NOT_VERIFIED','off-subnet evidence makes no reachability claim');
 check(trace.processId===process.pid&&trace.provenance==='PHYSICAL_NETWORK','PID and provenance identify observation context');
 const wifi={...fieldNic(),name:'Wi-Fi',interfaceIndex:10,ipAddress:'192.168.40.166'};
 const sockets:Socket[]=[];
 for(const strategy of ['WILDCARD_ALL','WILDCARD_SELECTED','ADAPTER_SPECIFIC'] as const){const socket=new Socket();sockets.push(socket);const evidence=new WsDiscoveryEvidence();await transport.discover(strategy==='WILDCARD_ALL'?[fieldNic(),wifi]:[fieldNic()],{strategy,purpose:'RECEIVE_TRACE_ONLY',timeoutMs:2,announcementOnly:true,evidence,multicastSocketFactory:()=>socket});const s=evidence.snapshot().sessions[0];check(s.strategy===strategy&&s.sockets[0].localPort===3702,`${strategy} records strategy and actual port in injected socket test`);check(s.sockets[0].localAddress===(strategy==='ADAPTER_SPECIFIC'?fieldNic().ipAddress:'0.0.0.0'),`${strategy} requested and actual bind strategy agree`);check(socket.members.length===(strategy==='WILDCARD_ALL'?2:1),`${strategy} keeps requested memberships without overwrite`);check(s.sockets[0].openedAt&&s.sockets[0].closedAt&&socket.closed===1,`${strategy} records window and actual owned close`);}
 check(sockets[1].members.join()===fieldNic().ipAddress,'Ethernet-only strategy omits Wi-Fi while Wi-Fi stays active');check(sockets.every(s=>s.closed===1),'later listener cleanup does not close older or newer socket again');
 const cancel=new AbortController(),old=new Socket();const pending=transport.discover([fieldNic()],{timeoutMs:1000,signal:cancel.signal,announcementOnly:true,multicastSocketFactory:()=>old});cancel.abort();await pending;const newer=new Socket();const next=transport.discover([fieldNic()],{timeoutMs:2,announcementOnly:true,multicastSocketFactory:()=>newer});old.emit('close');await next;check(old.closed===1&&newer.closed===1,'stale close event cannot close subsequent owned socket');
 const fg=new ForegroundDiscovery(),app=express();let owners:any[]=[{pid:process.pid+10000,processName:'other',localAddress:'0.0.0.0',localPort:3702}],called:any;
 app.use(express.json());app.use('/trace',createReceiveTraceRouter({foreground:fg,evidence:new WsDiscoveryEvidence(),busy:()=>false,yieldMonitoring:async()=>{},portOwners:async()=>owners,adapters:async()=>[fieldEthernet(),{...fieldEthernet(),interfaceIndex:10,interfaceAlias:'Wi-Fi',mediaType:'WIFI',ipv4Addresses:[{address:wifi.ipAddress,prefixLength:24}]}],transport:{discover:async(nics,options)=>{called={nics,options};return {devices:[],interfaceErrors:[],cancelled:false};}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/trace`;const post=(strategy:string)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({interfaceIndex:8,strategy})});
 try {check((await post('WILDCARD_SELECTED')).status===409&&!called&&!fg.isActive(),'another PID owning 3702 blocks support experiment without mutation');owners=[];for(const strategy of ['WILDCARD_SELECTED','WILDCARD_ALL','ADAPTER_SPECIFIC']){check((await post(strategy)).status===202,`support route accepts bounded ${strategy}`);check(called.options.provenance==='SUPPORT_DIAGNOSTIC'&&called.options.purpose==='RECEIVE_TRACE_ONLY',`${strategy} is observational by construction`);check(called.nics.length===(strategy==='WILDCARD_ALL'?2:1),`${strategy} route selects exact adapter set`);}check((await post('INVALID')).status===400,'unsupported strategy rejected');}finally{await new Promise<void>(r=>server.close(()=>r()));}
 const testSource=readFileSync('src/test/ws_discovery_trace.test.ts','utf8');check(!testSource.includes("Buffer.from(payload),3702")&&testSource.includes('isolatedSocket.address().port'),'regression sender targets only its owned ephemeral socket');
 console.log(`Synthetic isolation: ${passed} passed, 0 failed, 0 skipped`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
