import { readFileSync } from 'node:fs';
import { Device, NICInfo } from '../types/index.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { BatchExecutionPipeline } from '../core/engine/pipeline.ts';
import { ProjectReverificationWorkflow } from '../core/engine/reverification.ts';

let passed=0,failed=0;
const check=(value:unknown,name:string)=>{if(value){passed++;console.log('PASS: '+name)}else{failed++;console.error('FAIL: '+name)}};
const now=()=>new Date().toISOString();
const nic=(name='Ethernet',ipAddress='192.168.1.205',interfaceIndex=8):NICInfo=>({name,ipAddress,interfaceIndex,netmask:'255.255.255.0',isInternal:false,broadcast:'',mac:''});
const camera=(id='A',ip='192.168.1.100'):Device=>({id,anchor:{macAddress:id==='A'?'00:50:f9:63:fb:0f':'e4:30:22:cd:68:85',onvifEndpointUuid:'uuid-'+id,vendor:'Fixture'},network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:[ip]},status:'DIFFERENT_SUBNET',sessionVerification:'VERIFIED',discoveredPhase:3,firstSeenAt:now(),lastSeenAt:now(),technician:{name:'Lobby',notes:'Keep'},reachability:{discoveryInterface:nic(),subnetClassification:'LOCAL',wsDiscoveryRespondedAt:now()}});
const clean=(devices=[camera()])=>{const db=new SiteProjectDatabase();db.createNewProject('Phase 5');devices.forEach(d=>db.upsertDevice(structuredClone(d)));db.exportProjectJsonForSave();return db};
const workflow=(db:SiteProjectDatabase,live:Device[])=>new ProjectReverificationWorkflow(db,async staging=>{live.forEach(d=>staging.upsertDevice(structuredClone(d)));return 'COMPLETED'});
async function scan(db:SiteProjectDatabase,observations:Device[],interfaces=[nic()],origin:'MANUAL'|'MONITORING'='MANUAL'){
 const engine=new BatchExecutionPipeline({passiveDiscovery:{discover:async()=>[]} as any,onvifDiscovery:{discover:async(_n:any,o:any)=>{observations.forEach(d=>o.onDevice(structuredClone(d)));return{devices:observations,interfaceErrors:[],cancelled:false}}} as any,deviceEnricher:{enrich:async(d:Device)=>d}});
 engine.runPhase1=async()=>{(engine as any).currentInterfaces=interfaces};
 let intermediate:Device['status']|undefined,terminal:Device['status']|undefined;
 engine.subscribe(e=>{if(e.type==='DEVICE_DISCOVERED')intermediate=db.getDevices()[0]?.status;if(e.type==='SCAN_COMPLETE')terminal=db.getDevices()[0]?.status});
 await engine.runDiscoveryScan({database:db,context:{origin,sessionId:'phase5'}});return{intermediate,terminal};
}
async function run(){
 const db=clean(),events=await scan(db,[camera()]);
 check(db.getDevices()[0].reachability?.subnetClassification==='LOCAL','T01 Ethernet final relationship LOCAL');
 check(events.terminal==='ONLINE','T02 final status consumes positive discovery evidence');
 for(const [n,extra] of [['T03 Wi-Fi',nic('Wi-Fi','192.168.40.5',9)],['T04 link-local',nic('Ethernet','169.254.1.2',8)]] as const){const d=camera();d.reachability!.relationshipAdapter=extra;const p=clean();await scan(p,[d],[extra,nic()]);check(p.getDevices()[0].status==='ONLINE'&&p.getDevices()[0].reachability?.relationshipAdapter?.ipAddress==='192.168.1.205',n+' cannot override matching Ethernet');}
 const remote=clean();await scan(remote,[camera('A','192.168.9.100')]);check(remote.getDevices()[0].status==='DIFFERENT_SUBNET','T05 remote remains different subnet');
 const quiet=camera();quiet.reachability={subnetClassification:'LOCAL',discoveryInterface:nic()};const q=clean([quiet]);await scan(q,[quiet]);check(q.getDevices()[0].status==='UNKNOWN','T06 local alone is not Online or stale Different Subnet');
 const duplicate=clean([camera(),camera('B')]);await scan(duplicate,[camera(),camera('B')]);check(duplicate.getDevices().every(d=>d.status==='COLLISION')&&duplicate.getCollisions().filter(c=>!c.resolved).length===1,'T07 active collision precedence');
 await scan(duplicate,[camera('A','192.168.1.168'),camera('B')]);check(duplicate.getDevices().every(d=>d.status==='ONLINE')&&duplicate.getCollisions()[0].resolved,'T08 resolved collision final status');
 const background=clean();await scan(background,[camera()],[nic()],'MONITORING');check(background.getDevices()[0].status===db.getDevices()[0].status&&background.getDevices()[0].status==='ONLINE','T09 foreground/background converge');
 check(events.intermediate==='DIFFERENT_SUBNET'&&events.terminal==='ONLINE','T10 progressive status reconciled before completion');
 const conflict=camera('A','192.168.9.100');conflict.anchor.macAddress=camera('B').anchor.macAddress;const safe=clean([camera(),camera('B','192.168.1.168')]);await scan(safe,[conflict]);check(safe.getDeviceById('A')?.network.ipAddress==='192.168.1.100'&&safe.getDeviceById('B')?.network.ipAddress==='192.168.1.168','T11 conflicting anchors cannot move established identities');
 const source=readFileSync('src/core/engine/pipeline.ts','utf8');const path=source.slice(source.indexOf('public async runDiscoveryScan'),source.indexOf('public async runFullPipeline'));
 check(!/runPhase5|runPhase6|applyTemporary|\.restore\(|confirmAndApply|tasks\.begin/.test(path),'T12 final scan invokes no configuration or new Tasks');
 const project=clean([camera(),camera('B','192.168.1.168')]);project.importProjectJson(project.exportProjectJsonForSave());let result=await workflow(project,[camera(),camera('B','192.168.1.168')]).run();
 check(!project.getSession().dirty,'T13 unchanged opened project remains clean');
 for(const [label,extra] of [['T14 status',{status:'OFFLINE'}],['T15 diagnostics',{diagnostics:{checks:[],lastRefreshAt:now()},reachability:{subnetClassification:'LOCAL'}}],['T17 timestamps',{lastSeenAt:now()}]] as const){const p=clean();await workflow(p,[{...camera(),...extra} as Device]).run();check(!p.getSession().dirty,label+' is observation');}
 const colliding=clean([camera(),camera('B')]);result=await workflow(colliding,[camera(),camera('B')]).run();check(!colliding.getSession().dirty,'T16 collision observation remains clean');check(result.collisionCount===colliding.getCollisions().filter(c=>!c.resolved).length&&result.collisionCount===1,'T30 summary agrees with active collisions');
 const replacement=clean(),flow=workflow(replacement,[camera('B')]);result=await flow.run();check(!replacement.getSession().dirty&&result.possibleReplacements.length===1&&replacement.getProjectMemberDevices()[0].id==='A','T18 replacement detection is clean');flow.decide(result.possibleReplacements[0].candidateId!,'CONFIRMED');check(replacement.getSession().dirty&&replacement.getDeviceById('A')?.anchor.macAddress===camera('B').anchor.macAddress,'T19 confirmation dirties');
 const growth=clean();await workflow(growth,[camera(),camera('B','192.168.1.168')]).run();check(!growth.getSession().dirty&&growth.getProjectMemberDevices().length===1,'T20 new device detection stays clean');
 const added=clean();added.upsertDevice(camera('B','192.168.1.168'));check(added.getSession().dirty&&JSON.parse(added.exportProjectJson()).project.devices.length===2,'T21 explicit addition dirties');
 for(const [label,fields] of [['T22 name',{name:'Entrance'}],['T23 Notes',{notes:'Changed'}],['location',{location:'North'}]] as const){const p=clean();p.updateDeviceTechnicianFields('A',fields);check(p.getSession().dirty,label+' edit dirties');}
 const removed=clean();removed.removeDeviceFromProject('A');check(removed.getSession().dirty,'T24 removal dirties');
 project.updateDeviceTechnicianFields('A',{notes:'Edited'});project.exportProjectJsonForSave();check(!project.getSession().dirty,'T25 Save resets baseline');result=await workflow(project,[camera(),camera('B','192.168.1.168')]).run();check(!project.getSession().dirty&&project.getDeviceById('A')?.technician?.notes==='Edited','T26 next identical Reverify remains clean and preserves edits');
 check(project.listProjectHistory().length>0&&project.getProject().auditLogs.some(l=>l.message.includes('Project Reverify'))&&JSON.parse(project.exportProjectJsonForSave()).project.auditLogs.length===project.getProject().auditLogs.length,'T27 history retained including explicit Save');
 check(result.recognizedCount===2&&result.notVerifiedCount===0&&result.newDevicesCount===0&&result.possibleReplacements.length===0&&result.collisionCount===0,'T28 truthful no-change summary');
 const moved=clean();await workflow(moved,[camera('A','192.168.1.168')]).run();check(moved.getSession().dirty&&moved.getDeviceById('A')?.network.ipAddressHistory?.includes('192.168.1.100'),'persistent IP update still dirties and preserves history');
 const dirty=clean();dirty.updateDeviceTechnicianFields('A',{notes:'Pending'});await workflow(dirty,[camera()]).run();check(dirty.getSession().dirty,'pre-existing persistent edit stays dirty');
 for(const kind of ['TCP','PING','HTTP','HTTPS'] as const){const d=camera();d.reachability={discoveryInterface:nic()};if(kind==='TCP')d.reachability.tcpServices=[{port:80,reachable:true,testedAt:now()}];else d.diagnostics={checks:[{type:kind,targetIp:d.network.ipAddress,success:true,timestamp:now()}]};const p=clean([d]);await scan(p,[d]);check(p.getDevices()[0].status==='ONLINE',kind+'-only current evidence supports Online');}
 const stale=camera();stale.reachability={discoveryInterface:nic(),wsDiscoveryRespondedAt:'2020-01-01T00:00:00.000Z',lastSuccessfulResponseAt:'2020-01-01T00:00:00.000Z',tcpServices:[{port:80,reachable:true,testedAt:'2020-01-01T00:00:00.000Z'}]};const staleDb=clean([stale]);await scan(staleDb,[stale]);check(staleDb.getDevices()[0].status==='UNKNOWN','stale contact cannot fabricate Online');
 const failures=camera();failures.reachability={discoveryInterface:nic()};failures.diagnostics={checks:[{type:'HTTP',targetIp:failures.network.ipAddress,success:false,timestamp:now()},{type:'HTTPS',targetIp:failures.network.ipAddress,success:false,timestamp:now()}],lastRefreshAt:now(),previouslyReachableThisSession:true,consecutiveFailedRefreshes:2};const failedDb=clean([failures]);await scan(failedDb,[failures]);check(failedDb.getDevices()[0].status==='UNREACHABLE'&&failedDb.getDevices()[0].diagnostics?.consecutiveFailedRefreshes===2,'final pass preserves failure taxonomy without counting an extra refresh');
 const oldIp=camera();oldIp.reachability={discoveryInterface:nic()};oldIp.diagnostics={checks:[{type:'HTTP',targetIp:'192.168.9.100',success:true,timestamp:now()}]};const oldDb=clean([oldIp]);await scan(oldDb,[oldIp]);check(oldDb.getDevices()[0].status==='UNKNOWN','diagnostic evidence for another IP cannot classify Online');
 const virtual=clean();await scan(virtual,[camera()],[nic('VPN','192.168.9.1',19),nic()]);check(virtual.getDevices()[0].status==='ONLINE','virtual adapter cannot override physical Ethernet');
 const historyBefore=project.getProject().auditLogs.length;const reopened=new SiteProjectDatabase();reopened.importProjectJson(project.exportProjectJsonForSave());check(reopened.getProject().auditLogs.length===historyBefore&&!reopened.getSession().dirty,'saved verification history survives reopen cleanly');
 const multihomed=camera();multihomed.reachability={discoveryInterface:nic('Wi-Fi','192.168.40.5',9)};const multiDb=clean([multihomed]);await scan(multiDb,[multihomed],[nic('Wi-Fi','192.168.40.5',9),nic(),nic('Ethernet 2','192.168.1.206',10)]);check(multiDb.getDevices()[0].reachability?.subnetClassification==='LOCAL'&&multiDb.getDevices()[0].status==='UNKNOWN','multiple local interfaces cannot become Different Subnet via unrelated origin');
 const future=camera();future.reachability!.wsDiscoveryRespondedAt=new Date(Date.now()+3600_000).toISOString();const futureDb=clean([future]);await scan(futureDb,[future]);check(futureDb.getDevices()[0].status==='UNKNOWN','future-dated discovery is not current communication evidence');
 console.log(`Phase 5 summary: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1});
