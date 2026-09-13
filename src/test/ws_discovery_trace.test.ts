import { SupportTraceLease } from '../core/readiness/support_trace_lease.ts';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import express from 'express';
import dgram from 'node:dgram';
import { NodeOnvifWsDiscoveryTransport, UdpSocketLike } from '../core/drivers/ws_discovery_transport.ts';
import { WsDiscoveryEvidence, wsDiscoveryEvidence } from '../core/drivers/ws_discovery_evidence.ts';
import { inspectDiscoveryMetadata } from '../core/drivers/ws_discovery_hello.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { Phase3ActiveProbing } from '../core/engine/phase3_probing.ts';
import { NoopDeviceEnricher } from '../core/engine/device_enrichment.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { SupportBundleBuilder } from '../core/readiness/support_bundle.ts';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { createReceiveTraceRouter } from '../server/ws_discovery_trace_routes.ts';
import { fieldNic, fieldEthernet, fieldCamera } from './support/first_camera_field.ts';
import { hanwhaHello } from './support/hanwha_hello.ts';
let passed=0;const check=(v:unknown,name:string)=>{assert.ok(v,name);passed++;console.log(`PASS: ${name}`)};
class Socket extends EventEmitter implements UdpSocketLike {
  binding:any;closed=0;handlerCount=0;members:string[]=[];fail='';onBind=()=>{};
  bind(binding:any,callback:()=>void){this.handlerCount=this.listenerCount('message');this.binding=binding;if(this.fail==='bind')throw Object.assign(Error('PRIVATE_SECRET'),{code:'EADDRINUSE'});callback();this.onBind();}
  address(){return {address:this.binding.address,port:this.binding.port||49152,family:'IPv4'};}
  addMembership(_group:string,local:string){this.members.push(local);if(this.fail==='join')throw Object.assign(Error('PRIVATE_SECRET'),{code:'EACCES'});}
  setMulticastInterface(){}
  send(_m:unknown,_p:number,_a:string,cb:(error?:Error|null)=>void){cb();}
  close(){this.closed++;this.emit('close');}
  packet(packet:string|Buffer,ip='192.168.1.100'){const bytes=Buffer.from(packet);this.emit('message',bytes,{address:ip,port:3702,family:'IPv4',size:bytes.length});}
}
const until=async(test:()=>boolean)=>{const limit=Date.now()+2000;while(!test()){if(Date.now()>limit)throw Error('Timed out');await new Promise(r=>setTimeout(r,1));}};
async function run(){
 const transport=new NodeOnvifWsDiscoveryTransport(),evidence=new WsDiscoveryEvidence();
 const announcement=new Socket(),probe=new Socket(),hello=hanwhaHello({padding:1800,uuid:true,types:true,scopes:'onvif://www.onvif.org/name/Camera',metadata:true});
 announcement.onBind=()=>queueMicrotask(()=>{announcement.packet(OnvifDriver.createProbeEnvelope(),fieldNic().ipAddress);announcement.packet(hello);announcement.packet('plain PRIVATE_SECRET');announcement.packet(Buffer.from([255]));announcement.packet(hello.slice(0,-10));announcement.packet(hello.replace('/Hello</wsa:Action>','/SecretAction</wsa:Action>'));});
 const result=await transport.discover([fieldNic()],{context:{origin:'MANUAL',sessionId:'manual-a'},timeoutMs:5,evidence,multicastSocketFactory:()=>announcement,socketFactory:()=>probe});
 let session=evidence.snapshot().sessions[0];
 check(session.sessionId==='manual-a'&&session.origin==='MANUAL','owner identity and origin retained');
 check(session.sockets.length===2,'announcement and probe sockets distinguished');
 check(session.sockets[0].localAddress==='0.0.0.0'&&session.sockets[0].localPort===3702,'actual announcement address reports wildcard port 3702');
 check(session.sockets[1].localPort===49152&&session.sockets[1].intendedBindPort===0,'actual ephemeral port distinguished from requested zero');
 check(announcement.handlerCount===2&&probe.handlerCount===2,'diagnostic and acceptance handlers attach before bind');
 check(announcement.members[0]===fieldNic().ipAddress,'membership uses adapter IPv4 rather than interface index');
 check(session.events.some(e=>e.stage==='MULTICAST_JOIN_SUCCEEDED'),'membership success is explicit');
 check(session.counters.datagramsReceived===6&&session.counters.selfDatagrams===1&&session.counters.externalDatagrams===5,'all UDP receives counted independently of acceptance');
 check(session.firstSelfProbeAt&&session.firstExternalDatagramAt&&session.firstHelloAt,'first self Probe external and Hello timestamps retained');
 check(session.recentDatagrams[1].bytes===Buffer.byteLength(hello)&&Number(session.recentDatagrams[1].bytes)>1400,'full large reassembled payload byte length observed');
 check(session.recentDatagrams[1].ingressInterface==='NOT_EXPOSED_BY_NODE','ingress interface is not fabricated');
 check(session.recentDatagrams[1].destinationAddress==='NOT_EXPOSED_BY_NODE','UDP destination is not inferred from group membership');
 check(session.recentDatagrams[1].actionUri==='http://schemas.xmlsoap.org/ws/2005/04/discovery/Hello','safe known Hello Action URI exported');
 check(session.recentDatagrams[1].xAddrCount===1&&(session.recentDatagrams[1].validatedXAddrHosts as string[])[0]==='192.168.1.100','safe XAddr host projection retained');
 check(session.recentDatagrams[1].typesPresent&&session.recentDatagrams[1].scopesPresent&&session.recentDatagrams[1].endpointReferencePresent&&session.recentDatagrams[1].metadataVersionPresent,'optional metadata presence recorded');
 check(session.counters.parseErrorCount===3,'non XML invalid UTF8 and malformed XML count parse failures');
 check(session.counters.candidatesCreated===1&&session.counters.rejectedCount===5,'candidate creation and rejection counters separate');
 check(result.devices[0].status==='DIFFERENT_SUBNET'&&result.devices[0].sessionVerification==='NOT_VERIFIED','off-subnet Hello stays unverified');
 check(session.sockets.every(s=>s.closedAt&&s.closeRequestedAt)&&announcement.closed===1&&probe.closed===1,'actual close event and request recorded separately');
 check(!JSON.stringify(session).includes('PRIVATE_SECRET')&&!JSON.stringify(session).includes('SecretAction')&&!JSON.stringify(session).includes('device_service'),'trace excludes bodies arbitrary Action values and full URLs');
 const noAction=inspectDiscoveryMetadata(hanwhaHello().replace(/<wsa:Action>.*?<\/wsa:Action>/,''));
 check(noAction.soapParsed&&!noAction.actionFound,'missing SOAP Action remains explicit without parser changes');
 for(const failure of ['bind','join']){const socket=new Socket();socket.fail=failure;await transport.discover([fieldNic()],{timeoutMs:2,evidence,announcementOnly:true,multicastSocketFactory:()=>socket});session=evidence.snapshot().sessions[0];check(session.counters.socketErrorCount>0&&session.events.some(e=>e.code===(failure==='bind'?'EADDRINUSE':'EACCES')),`${failure} failure preserves safe error code`);check(!JSON.stringify(session).includes('PRIVATE_SECRET'),`${failure} error does not export raw message`);}
 const sendFailure=new Socket();sendFailure.send=()=>{throw Object.assign(Error('PRIVATE_SECRET'),{code:'ENETUNREACH'});};await transport.discover([fieldNic()],{timeoutMs:2,evidence,multicastSocketFactory:()=>new Socket(),socketFactory:()=>sendFailure});check(evidence.snapshot().sessions[0].events.some(e=>e.stage==='PROBE_SEND_FAILED'&&e.code==='ENETUNREACH'),'synchronous send failure is not swallowed by transport cleanup');
 const multi=new Socket();await transport.discover([fieldNic(),{...fieldNic(),name:'Wi-Fi',ipAddress:'192.168.40.166'}],{timeoutMs:2,evidence,announcementOnly:true,multicastSocketFactory:()=>multi});check(multi.members.join(',')==='192.168.0.124,192.168.40.166','each selected adapter gets explicit membership');
 const response=new Socket(),probeXml=hanwhaHello({uuid:true}).replace('/Hello</wsa:Action>','/ProbeMatches</wsa:Action>').replace('<wsd:Hello>','<wsd:ProbeMatches><wsd:ProbeMatch>').replace('</wsd:Hello>','</wsd:ProbeMatch></wsd:ProbeMatches>');
 response.onBind=()=>queueMicrotask(()=>response.packet(probeXml));await transport.discover([fieldNic()],{timeoutMs:2,evidence,multicastSocketFactory:()=>new Socket(),socketFactory:()=>response});
 check(evidence.snapshot().sessions[0].counters.probeMatchCount===1&&evidence.snapshot().sessions[0].recentParserEvents.some(e=>e.stage==='PROBE_MATCH_PARSED'),'ProbeMatches classification and candidate path remain visible');
 const controller=new AbortController(),old=new Socket();const pending=transport.discover([fieldNic()],{context:{origin:'MONITORING',sessionId:'monitor'},signal:controller.signal,timeoutMs:1000,evidence,announcementOnly:true,multicastSocketFactory:()=>old});controller.abort();await pending;
 const next=new Socket();await transport.discover([fieldNic()],{context:{origin:'ADVANCED',sessionId:'advanced'},timeoutMs:2,evidence,announcementOnly:true,multicastSocketFactory:()=>next});
 check(evidence.snapshot().sessions[1].closeReason==='CANCELLED'&&old.closed===1&&next.closed===1,'handoff cancellation closes only owned sockets once');
 check(evidence.snapshot().sessions[0].origin==='ADVANCED'&&evidence.snapshot().sessions[0].events.some(e=>typeof e.gapSincePreviousSessionMs==='number'),'subsequent origin and session handoff gap retained');
 const capped=new WsDiscoveryEvidence();for(let i=0;i<25;i++){const s=capped.begin({origin:'MONITORING',sessionId:String(i)},[fieldNic()],10);for(let j=0;j<80;j++){capped.datagram(s.windowId,{bytes:j});capped.parser(s.windowId,'CANDIDATE_REJECTED',{reason:'MISSING_XADDR'});capped.event(s.windowId,'BIND_ATTEMPT');}capped.end(s.windowId,'DEADLINE');}
 const active=capped.begin(undefined,[fieldNic()],10);for(let i=0;i<200;i++)capped.event(active.windowId,'BIND_ATTEMPT');check(capped.snapshot().sessions[0].events.length===128&&active.droppedEvents>0,'lifecycle event cap reports truncation');
 const snapshot=capped.snapshot();check(snapshot.sessions.length===20,'only newest 20 sessions retained');check(snapshot.sessions.reduce((n,s)=>n+s.recentDatagrams.length,0)===50,'50 datagram samples globally across sessions');check(snapshot.sessions.reduce((n,s)=>n+s.recentParserEvents.length,0)===50,'50 parser events globally across sessions');
 const db=new SiteProjectDatabase('ISOLATED_TEST');db.startQuickWork();db.upsertDevice(fieldCamera());check(wsDiscoveryEvidence.snapshot().sessions.length===0,'manual inventory addition does not create receive evidence');
 const wrapped={discover:(nics:any,options:any)=>{const socket=new Socket();socket.onBind=()=>queueMicrotask(()=>socket.packet(hanwhaHello({uuid:true})));return transport.discover(nics,{...options,timeoutMs:2,announcementOnly:true,multicastSocketFactory:()=>socket});}};
 await Phase3ActiveProbing.execute([fieldNic()],wrapped,new NoopDeviceEnricher(),{context:{origin:'MONITORING',sessionId:'pipeline'}},LocalHostIdentity.fromInterfaces([fieldNic()]),db);
 const chain=wsDiscoveryEvidence.snapshot().sessions[0];check(chain.counters.inventoryReconciliations===1&&chain.counters.inventoryVisibleObservations===1,'actual transport candidate reconciles and observes visible inventory');
 check(chain.recentParserEvents.some(e=>e.stage==='HELLO_PARSED')&&chain.recentParserEvents.some(e=>e.stage==='INVENTORY_PROMOTION'),'receive to inventory chain is in dedicated evidence');
 const bundle:any=new SupportBundleBuilder().build({wsDiscoveryTransport:wsDiscoveryEvidence.snapshot(),application:{name:'test',version:'test',runtime:'node',platform:'win32'},readiness:{},network:[],monitoring:{},discovery:{},projectSession:db.getSession(),events:Array.from({length:1100},(_,i)=>({id:String(i),timestamp:new Date().toISOString(),category:'DISCOVERY' as const,level:'INFO' as const,message:'Noise',details:{receiveTrace:{windowId:'old',events:[{raw:'PRIVATE_SECRET'}]}}})),pair:null});
 check(bundle.wsDiscoveryTransport.sessions[0].windowId===chain.windowId&&bundle.globalTimeline.length===250,'dedicated receive evidence survives noisy audit timeline');check(!JSON.stringify(bundle).includes('PRIVATE_SECRET'),'legacy receive trace samples replaced by bounded evidence reference');
 const support=new SupportTraceLease(),fg=new ForegroundDiscovery(),routeEvidence=new WsDiscoveryEvidence();let called:any,release:()=>void=()=>{},yieldReserved=false;
 const app=express();app.use(express.json());app.use('/trace',createReceiveTraceRouter({support,foreground:fg,evidence:routeEvidence,busy:()=>false,adapters:async()=>[fieldEthernet()],yieldMonitoring:async()=>{yieldReserved=support.isActive()&&!fg.isActive();},transport:{discover:async(nics,options)=>{called={nics,options};await new Promise<void>(r=>{release=r;options?.signal?.addEventListener('abort',r as any,{once:true});});return {devices:[],interfaceErrors:[],cancelled:false};}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/trace`;const post=(body:any)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {check((await post({interfaceIndex:8,durationMs:5})).status===400,'support route rejects unbounded or too short windows');check((await post({interfaceIndex:99})).status===400&&!fg.isActive(),'invalid adapter releases reservation');check((await post({interfaceIndex:8})).status===202&&yieldReserved,'support route reserves separate lease before yielding monitoring');await until(()=>Boolean(called));check(called.options.announcementOnly&&called.options.purpose==='RECEIVE_TRACE_ONLY'&&!called.options.onDevice,'support route defaults to passive receive without inventory callback');check(called.nics[0].netmask==='255.255.255.0'&&called.options.timeoutMs===20000,'current selected adapter and bounded duration passed');check((await post({interfaceIndex:8})).status===409,'overlapping support session rejected');const id=support.snapshot()!.sessionId;check(!support.stop('stale')&&support.stop(id),'support session honors scoped cancellation');await until(()=>!support.isActive());called=undefined;check((await post({interfaceIndex:8,sendProbe:true,durationMs:15000})).status===202,'optional one-probe support operation starts');await until(()=>Boolean(called));check(!called.options.announcementOnly,'one selected adapter enables one outbound Probe');release();await until(()=>!support.isActive());check((await(await fetch(base)).json()).schemaVersion===1,'support trace can be read independently');}finally{release();await new Promise<void>(r=>server.close(()=>r()));}
 const liveEvidence=new WsDiscoveryEvidence(),liveAbort=new AbortController(),sender=dgram.createSocket('udp4');
 const isolatedSocket=dgram.createSocket('udp4'),originalBind=isolatedSocket.bind.bind(isolatedSocket);isolatedSocket.bind=((_options:any,callback:any)=>originalBind({port:0,address:'127.0.0.1',exclusive:true},callback)) as any;
 isolatedSocket.addMembership=()=>{};
 const liveRun=transport.discover([{...fieldNic(),name:'Software loopback',ipAddress:'127.0.0.1'}],{timeoutMs:2000,signal:liveAbort.signal,announcementOnly:true,purpose:'RECEIVE_TRACE_ONLY',evidence:liveEvidence,multicastSocketFactory:()=>isolatedSocket});
 try {await until(()=>Boolean(liveEvidence.snapshot().sessions[0].sockets[0]?.localPort));check(true,'real Windows Node transport uses isolated ephemeral test port');
 for(const payload of [hello,OnvifDriver.createProbeEnvelope()])await new Promise<void>((resolve,reject)=>sender.send(Buffer.from(payload),isolatedSocket.address().port,'127.0.0.1',error=>error?reject(error):resolve()));
 await until(()=>liveEvidence.snapshot().sessions[0].counters.datagramsReceived>=2);const live=liveEvidence.snapshot().sessions[0];
 check(live.recentDatagrams.some(d=>d.bytes===Buffer.byteLength(hello)&&d.kind==='HELLO'),'real Node listener receives complete unsolicited large Hello from software sender');
 check(Boolean(live.firstSelfProbeAt)&&live.counters.selfDatagrams>=2,'real UDP callback records local software Probe as self traffic');
 check(live.counters.externalDatagrams===0&&live.counters.inventoryVisibleObservations===0,'loopback evidence cannot claim physical camera receive or promotion');
 }finally{liveAbort.abort();await liveRun;sender.close();console.log('LIVE_COUNTERS',JSON.stringify(liveEvidence.snapshot().sessions[0].counters));}
 await until(()=>Boolean(liveEvidence.snapshot().sessions[0].sockets[0].closedAt));check(true,'real socket close event observed after cancellation');
 console.log(`WS discovery trace: ${passed} assertions passed.`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
