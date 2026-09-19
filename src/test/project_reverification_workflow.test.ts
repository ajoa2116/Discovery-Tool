import { readFileSync } from 'node:fs';
import { Device } from '../types/index.ts';
import { ProjectReverificationEngine, ProjectReverificationWorkflow } from '../core/engine/reverification.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';

let passed=0,failed=0;const assert=(value:unknown,name:string)=>{if(value){console.log(`  PASS: ${name}`);passed++}else{console.error(`  FAIL: ${name}`);failed++}};
const device=(id:string,ip:string,mac:string|null,extra:Partial<Device>={}):Device=>({id,anchor:{macAddress:mac,vendor:'Fixture',model:'Camera'},network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:[ip]},status:'ONLINE',discoveredPhase:3,firstSeenAt:'2026-01-01T00:00:00.000Z',lastSeenAt:'2026-01-02T00:00:00.000Z',...extra});
const cleanProject=(devices:Device[])=>{const db=new SiteProjectDatabase();db.createNewProject('Reverify Fixture');devices.forEach(item=>db.upsertDevice(item));db.exportProjectJsonForSave();return db};
const workflow=(db:SiteProjectDatabase,live:Device[],outcome:'COMPLETED'|'CANCELLED'='COMPLETED',local=LocalHostIdentity.fromAddresses([]))=>new ProjectReverificationWorkflow(db,async staging=>{live.forEach(item=>staging.upsertDevice(structuredClone(item)));return outcome},()=>true,local);

async function run(){
  const saved=device('saved','192.168.1.20','00:11:22:33:44:55',{technician:{name:'Lobby',location:'North',notes:'Retain'}}),same=device('runtime','192.168.1.20','00:11:22:33:44:55');
  let plan=ProjectReverificationEngine.plan([saved],[same]);
  assert(plan.recognizedCount===1&&plan.projectDevices[0].id==='saved'&&plan.projectDevices[0].sessionVerification==='VERIFIED','A normal MAC match retains Project identity');
  const moved={...same,network:{...same.network,ipAddress:'10.20.30.40'}};plan=ProjectReverificationEngine.plan([saved],[moved]);
  assert(plan.changedIpCount===1&&plan.projectDevices[0].network.ipAddressHistory?.includes('192.168.1.20')&&plan.possibleReplacements.length===0,'B changed IP preserves identity/history without replacement');
  const ten=Array.from({length:10},(_,i)=>device(`p${i}`,`192.168.1.${i+10}`,`00:00:00:00:00:${String(i+1).padStart(2,'0')}`));const twelve=[...ten.map(x=>structuredClone(x)),device('new-a','192.168.1.100','aa:00:00:00:00:01'),device('new-b','192.168.1.101','aa:00:00:00:00:02')];
  const growthDb=cleanProject(ten);let result=await workflow(growthDb,twelve).run();
  assert(result.recognizedCount===10&&result.newDevicesCount===2&&growthDb.getProjectMemberDevices().length===10&&growthDb.getSession().dirty,'C growth keeps 2 devices live-only and records Reverify history');
  assert(JSON.parse(growthDb.exportProjectJson()).project.devices.length===10,'C live-only devices are excluded from Project export');
  const missingDb=cleanProject([saved]);result=await workflow(missingDb,[]).run();
  assert(result.notVerifiedCount===1&&missingDb.getProjectMemberDevices()[0].sessionVerification==='NOT_FOUND'&&missingDb.getProjectMemberDevices().length===1,'D missing device is preserved as Not Verified');
  const replacement=device('replacement','192.168.1.20','aa:bb:cc:dd:ee:ff',{anchor:{macAddress:'aa:bb:cc:dd:ee:ff',onvifEndpointUuid:'new-uuid',serialNumber:'NEW-SERIAL',vendor:'Fixture',model:'New Camera'}});
  const replacementDb=cleanProject([saved]);const replacementFlow=workflow(replacementDb,[replacement]);result=await replacementFlow.run();const candidate=result.possibleReplacements[0];
  assert(Boolean(candidate)&&replacementDb.getProjectMemberDevices()[0].anchor.macAddress===saved.anchor.macAddress,'E replacement is surfaced without automatic mutation');
  replacementFlow.decide(candidate.candidateId!,'CONFIRMED');const confirmed=replacementDb.getProjectMemberDevices()[0];
  assert(confirmed.id==='saved'&&confirmed.anchor.macAddress===replacement.anchor.macAddress&&confirmed.technician?.notes==='Retain'&&replacementDb.getSession().dirty,'F confirmed replacement preserves Project record/metadata and dirties');
  assert(confirmed.network.ipAddressHistory?.includes(saved.network.ipAddress)&&replacementDb.getProject().auditLogs.some(log=>log.message.includes('confirmed Project device replacement')),'F confirmed replacement retains history and records event');
  for(const decision of ['REJECTED','DEFERRED'] as const){const db=cleanProject([saved]),flow=workflow(db,[replacement]),summary=await flow.run();flow.decide(summary.possibleReplacements[0].candidateId!,decision);assert(db.getProjectMemberDevices()[0].anchor.macAddress===saved.anchor.macAddress&&db.getSession().dirty&&db.getDevices().length===2,decision==='REJECTED'?'G rejection preserves original and records decision history':'H defer preserves original and records decision history')}
  plan=ProjectReverificationEngine.plan([saved],[replacement]);assert(plan.recognizedCount===0&&plan.notVerifiedCount===1,'I IP alone never establishes Project identity');
  const collisionTwin=device('twin','192.168.1.20','12:34:56:78:90:ab');plan=ProjectReverificationEngine.plan([saved],[replacement,collisionTwin]);assert(plan.collisionCount===1&&plan.newDevicesCount===2&&plan.possibleReplacements.length===0,'J duplicate IP identities remain separate and ambiguous');
  const remote={...same,reachability:{subnetClassification:'DIFFERENT_SUBNET' as const}};plan=ProjectReverificationEngine.plan([saved],[remote]);assert(plan.projectDevices[0].status==='DIFFERENT_SUBNET'&&plan.recognizedCount===1,'K different-network identity remains the same device without Pair');
  plan=ProjectReverificationEngine.plan([], [device('host','192.168.1.5','00:aa:bb:cc:dd:ee')],LocalHostIdentity.fromAddresses(['192.168.1.5']));assert(plan.newDevicesCount===0,'L local-host address never enters reconciliation');
  const removedDb=cleanProject([saved]);removedDb.removeDeviceFromProject('saved');await workflow(removedDb,[same]).run();assert(removedDb.getProjectMemberDevices().length===0&&removedDb.getDevices().length===1,'M Project-removed device may return live without membership restoration');
  const hiddenDb=cleanProject([saved]);hiddenDb.removeDeviceFromCurrentList('saved');await workflow(hiddenDb,[same]).run();assert(hiddenDb.getProject().devices.some(item=>item.id==='saved'),'N current-list-only removal is restored by matching discovery');
  const repeatDb=cleanProject([saved]);await workflow(repeatDb,[same,replacement]).run();await workflow(repeatDb,[same,replacement]).run();assert(repeatDb.getDevices().filter(item=>item.anchor.macAddress===replacement.anchor.macAddress).length===1,'O repeated Reverify keeps stable new row without duplication');
  const movedDb=cleanProject([saved]);await workflow(movedDb,[moved]).run();assert(movedDb.getSession().dirty,'P persistent IP change dirties Project');
  const cancelledDb=cleanProject([saved]);let cancelled=false;try{await workflow(cancelledDb,[replacement],'CANCELLED').run()}catch{cancelled=true}assert(cancelled&&cancelledDb.getDevices().length===1&&!cancelledDb.getSession().dirty,'Q cancelled Reverify leaves Project transaction untouched');
  const failedDb=cleanProject([saved]);const failure=new ProjectReverificationWorkflow(failedDb,async()=>{throw new Error('ECONNREFUSED raw')});let safe='';try{await failure.run()}catch(error){safe=(error as Error).message}assert(safe.includes('discovery stopped unexpectedly')&&!safe.includes('ECONNREFUSED')&&failedDb.getProjectMemberDevices().length===1,'R failure is normalized, valid, and retryable');
  const app=readFileSync('src/ui/App.tsx','utf8'),server=readFileSync('src/server/index.ts','utf8'),pipeline=readFileSync('src/core/engine/pipeline.ts','utf8'),monitor=readFileSync('src/core/engine/incremental_discovery_monitor.ts','utf8');
  assert(app.includes('setProjectReverifyOpen(true)')&&!/handleScanNetwork\(\);setOpenMenu\(null\)\}\}>Reverify/.test(app)&&app.includes('ProjectReverifyModal'),'S Project menu opens dedicated Reverify workflow');
  assert(app.includes('onClick={handleScanNetwork}')&&server.includes("'/api/discovery', createForegroundDiscoveryRouter") && readFileSync('src/server/foreground_discovery_routes.ts','utf8').includes("router.post('/start'")&&pipeline.includes('runDiscoveryScan'),'T ordinary Quick Scan remains independently wired');
  assert(server.includes('incrementalMonitor.yieldToTechnician()')&&server.includes('reverifyWorkflow?.isRunning()')&&monitor.includes('runNow'),'U incremental monitoring yields and does not conflict with Reverify');
  const saveJson=replacementDb.exportProjectJsonForSave();assert(JSON.parse(saveJson).project.devices[0].anchor.macAddress===replacement.anchor.macAddress&&!replacementDb.getSession().dirty,'V confirmed replacement saves normally without auto-save');
  console.log(`\nProject Reverify workflow summary: ${passed} passed, ${failed} failed`);if(failed)process.exit(1)
}run().catch(error=>{console.error(error);process.exit(1)});
