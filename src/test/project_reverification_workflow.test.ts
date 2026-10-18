import { productionBackendSource } from './support/backend_source.ts';
import { readFileSync, promises as fs } from 'node:fs';
import { Device } from '../types/index.ts';
import { ProjectReverificationEngine, ProjectReverificationWorkflow } from '../core/engine/reverification.ts';
import { ProjectValidationError, SiteProjectDatabase } from '../core/storage/project_db.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';
import { technicianErrorResponse } from '../shared/error_presentation.ts';

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
  assert(result.recognizedCount===10&&result.newDevicesCount===2&&growthDb.getProjectMemberDevices().length===10&&!growthDb.getSession().dirty&&growthDb.listProjectHistory().some(event=>event.type==='REVERIFY_COMPLETED'),'C growth stays clean, keeps 2 devices live-only, and records Reverify history');
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
  const hiddenDb=cleanProject([saved]);hiddenDb.removeDeviceFromCurrentList('saved');await workflow(hiddenDb,[same]).run();assert(!hiddenDb.getProject().devices.some(item=>item.id==='saved')&&hiddenDb.getProjectMemberDevices().some(item=>item.id==='saved'&&item.sessionVerification==='VERIFIED'),'N current-list-only removal remains suppressed after matching Reverify');
  const repeatDb=cleanProject([saved]);await workflow(repeatDb,[same,replacement]).run();await workflow(repeatDb,[same,replacement]).run();assert(repeatDb.getDevices().filter(item=>item.anchor.macAddress===replacement.anchor.macAddress).length===1,'O repeated Reverify keeps stable new row without duplication');
  const movedDb=cleanProject([saved]);await workflow(movedDb,[moved]).run();assert(movedDb.getSession().dirty,'P persistent IP change dirties Project');
  const cancelledDb=cleanProject([saved]);let cancelled=false;try{await workflow(cancelledDb,[replacement],'CANCELLED').run()}catch{cancelled=true}assert(cancelled&&cancelledDb.getDevices().length===1&&!cancelledDb.getSession().dirty,'Q cancelled Reverify leaves Project transaction untouched');
  const failedDb=cleanProject([saved]);const failure=new ProjectReverificationWorkflow(failedDb,async()=>{throw new Error('ECONNREFUSED raw')});let safe='';try{await failure.run()}catch(error){safe=(error as Error).message}assert(safe.includes('discovery stopped unexpectedly')&&!safe.includes('ECONNREFUSED')&&failedDb.getProjectMemberDevices().length===1,'R failure is normalized, valid, and retryable');
  const app=readFileSync('src/ui/App.tsx','utf8'),server=productionBackendSource(),pipeline=readFileSync('src/core/engine/pipeline.ts','utf8'),monitor=readFileSync('src/core/engine/incremental_discovery_monitor.ts','utf8');
  assert(app.includes('setProjectReverifyOpen(true)')&&!/handleScanNetwork\(\);setOpenMenu\(null\)\}\}>Reverify/.test(app)&&app.includes('ProjectReverifyModal'),'S Project menu opens dedicated Reverify workflow');
  assert(app.includes('onClick={handleScanNetwork}')&&server.includes("'/api/discovery', createForegroundDiscoveryRouter") && readFileSync('src/server/foreground_discovery_routes.ts','utf8').includes("router.post('/start'")&&pipeline.includes('runDiscoveryScan'),'T ordinary Quick Scan remains independently wired');
  assert(server.includes('incrementalMonitor.yieldToTechnician()')&&server.includes('reverifyWorkflow?.isRunning()')&&monitor.includes('runNow'),'U incremental monitoring yields and does not conflict with Reverify');
  const saveJson=replacementDb.exportProjectJsonForSave();assert(JSON.parse(saveJson).project.devices[0].anchor.macAddress===replacement.anchor.macAddress&&!replacementDb.getSession().dirty,'V confirmed replacement saves normally without auto-save');
  // Ownership must be resolved across the whole Project before address-based replacement review.
  for(const order of ['A-first','B-first'] as const)for(const anchorKind of ['MAC','UUID','SERIAL'] as const){
    const owner=device('project-B','192.168.1.30',anchorKind==='MAC'?'00:11:22:33:44:66':null,{
      anchor:{macAddress:anchorKind==='MAC'?'00:11:22:33:44:66':null,onvifEndpointUuid:anchorKind==='UUID'?'owned-uuid':undefined,serialNumber:anchorKind==='SERIAL'?'owned-serial':undefined,vendor:'Fixture'},
      technician:{name:'Back Door',location:'South',notes:'Retain owner notes'},configuredState:{inferred:false,manualOverride:true,updatedAt:'2026-01-01T00:00:00Z'},
    });
    const found=device('runtime-B',saved.network.ipAddress,null,{anchor:structuredClone(owner.anchor),technician:{name:'Incoming name',notes:'Incoming notes'},configuredState:{inferred:false,manualOverride:false}});
    const records=order==='A-first'?[structuredClone(saved),owner]:[owner,structuredClone(saved)];
    const proposal=ProjectReverificationEngine.plan(records,[found]);
    assert(proposal.recognizedCount===1&&proposal.notVerifiedCount===1&&proposal.newDevicesCount===0,'OWNED '+order+' '+anchorKind+': unique ownership recognized before replacement eligibility');
    assert(proposal.possibleReplacements.length===0,'OWNED '+order+' '+anchorKind+': recognized camera is never another Project camera replacement');
    const db=cleanProject(records),flow=workflow(db,[found]),summary=await flow.run();
    const retained=db.getProjectMemberDevices().find(item=>item.id==='project-B')!,missing=db.getProjectMemberDevices().find(item=>item.id===saved.id)!;
    assert(summary.possibleReplacements.length===0,'OWNED '+order+' '+anchorKind+': workflow exposes no unusable replacement action');
    assert(retained.sessionVerification==='VERIFIED'&&JSON.stringify(retained.anchor)===JSON.stringify(owner.anchor)&&db.getProjectMemberDevices().length===2&&!db.getDeviceById('runtime-B'),'OWNED '+order+' '+anchorKind+': B retains original Project identity and membership');
    assert(JSON.stringify(retained.technician)===JSON.stringify(owner.technician)&&JSON.stringify(retained.configuredState)===JSON.stringify(owner.configuredState),'OWNED '+order+' '+anchorKind+': technician name/location/notes and configured override retained');
    assert(retained.network.ipAddress===saved.network.ipAddress&&retained.network.ipAddressHistory?.includes('192.168.1.30')&&summary.changedIpCount===1,'OWNED '+order+' '+anchorKind+': B address change and history retained');
    assert(missing.sessionVerification==='NOT_FOUND'&&missing.anchor.macAddress===saved.anchor.macAddress,'OWNED '+order+' '+anchorKind+': missing A remains Not Verified with original identity');
    assert(!db.listProjectHistory().some(event=>event.type==='REPLACEMENT_CANDIDATE'),'OWNED '+order+' '+anchorKind+': no false replacement-candidate history');
  }
  for(const order of ['A-first','B-first'] as const){
    const owner=device('project-B','192.168.1.30','00:11:22:33:44:66'),found=device('runtime-B','192.168.1.40','00:11:22:33:44:66');
    const db=cleanProject(order==='A-first'?[structuredClone(saved),owner]:[owner,structuredClone(saved)]),flow=workflow(db,[found,replacement]);
    const summary=await flow.run(),candidate=summary.possibleReplacements[0];
    assert(summary.recognizedCount===1&&summary.possibleReplacements.length===1&&candidate.originalDeviceId===saved.id,'OWNED '+order+': genuinely unmatched camera remains a replacement proposal');
    const accepted=flow.decide(candidate.candidateId!,'CONFIRMED');
    assert(accepted.device?.id===saved.id&&accepted.device.anchor.macAddress===replacement.anchor.macAddress&&accepted.device.technician?.notes==='Retain'&&db.getDeviceById('project-B')?.network.ipAddress==='192.168.1.40','OWNED '+order+': explicit genuine replacement remains confirmable without changing B');
  }
  {
    const owner=device('project-B','192.168.1.30','00:11:22:33:44:66'),found=device('runtime-B',saved.network.ipAddress,'00:11:22:33:44:66');
    const collision=ProjectReverificationEngine.plan([saved,owner],[found,replacement]);
    assert(collision.recognizedCount===1&&collision.collisionCount===1&&collision.newDevicesCount===1&&collision.possibleReplacements.length===0,'OWNED duplicate-IP conflict is not hidden by filtering out the recognized occupant');
    const unknown=device('unknown',saved.network.ipAddress,null);
    assert(ProjectReverificationEngine.plan([saved,owner],[unknown]).possibleReplacements.length===0,'OWNED observation without physical anchors does not become a replacement');
    const sharedA=structuredClone(saved),sharedB=structuredClone(owner);sharedA.anchor.serialNumber='shared';sharedB.anchor.serialNumber='shared';
    const weak=device('weak',saved.network.ipAddress,null,{anchor:{macAddress:null,serialNumber:'shared',vendor:'Fixture'}});
    const ambiguous=ProjectReverificationEngine.plan([sharedA,sharedB],[weak]);
    assert(ambiguous.recognizedCount===0&&ambiguous.possibleReplacements.length===0,'OWNED ambiguous shared serial does not acquire Project ownership or replacement authority');
  }
  // Session-lifetime regressions: all discovery and file-open data is injected in memory.
  const deferred = <T,>() => { let resolve!: (value:T)=>void, reject!: (reason:Error)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}; };
  const settled = <T,>(promise:Promise<T>) => promise.then(result=>({result,error:null as Error|null}),error=>({result:null,error:error as Error}));
  const snapshot = (db:SiteProjectDatabase) => JSON.stringify(db.getSession());
  const stale = (error:Error|null) => error instanceof ProjectValidationError && /Project session changed/.test(error.message) && /Reverify/.test(error.message);
  const projectB=cleanProject([device('saved','10.9.8.7','12:34:56:78:90:ab',{technician:{name:'Project B',notes:'Keep B metadata'}})]).exportProjectJson();
  const openInMemory = async (db:SiteProjectDatabase,json:string) => {
    const original=fs.readFile;
    fs.readFile=(async (_path:unknown,encoding?:unknown)=>encoding==='utf8'?json:Buffer.from(json)) as typeof fs.readFile;
    try { await db.openProject('C:\\in-memory-reverify-test\\project.cctvproj'); }
    finally { fs.readFile=original; }
  };
  const transitions: Array<{name:string;change:(db:SiteProjectDatabase,original:string)=>void|Promise<void>}> = [
    {name:'import another Project',change:db=>{db.importProjectJson(projectB)}},
    {name:'reopen same Project ID',change:(db,json)=>{db.importProjectJson(json)}},
    {name:'Quick Work',change:db=>{db.startQuickWork()}},
    {name:'create Project',change:db=>{db.createNewProject('New session','New site','Keep description')}},
    {name:'create from current results',change:db=>{db.createProjectFromCurrentResults('Derived session')}},
    {name:'open Project through async read',change:db=>openInMemory(db,projectB)},
  ];
  for(const transition of transitions){
    const db=cleanProject([saved]),original=db.exportProjectJson(),gate=deferred<'COMPLETED'>();let cancelCalls=0;
    const flow=new ProjectReverificationWorkflow(db,async staging=>{staging.upsertDevice(structuredClone(moved));return gate.promise},()=>{cancelCalls++;return true});
    const pending=settled(flow.run());await transition.change(db,original);const before=snapshot(db);
    assert(flow.isRunning()&&flow.cancel()&&cancelCalls===1,'SESSION '+transition.name+': pending discovery retains its slot and cancellation ownership');
    gate.resolve('COMPLETED');const outcome=await pending;
    assert(stale(outcome.error),'SESSION '+transition.name+': stale completion has a clear Project validation error');
    const response=technicianErrorResponse(outcome.error,{operation:'PROJECT_REVERIFY',fallbackCode:'OPERATION_FAILED'});
    assert(response.code==='OPERATION_FAILED'&&response.presentation.title==='Project session changed'&&response.presentation.message==='The Project session changed before Reverify could finish.'&&response.presentation.action==='Run Reverify again for the current Project.','SESSION '+transition.name+': actual presentation explains the session change and retry');
    assert(response.error==='The Project session changed before Reverify could finish. Run Reverify again for the current Project. Reference: '+response.presentation.reference&&!/invalid|corrupt/i.test(response.error)&&response.presentation.context?.operation==='PROJECT_REVERIFY','SESSION '+transition.name+': formatted API response does not blame the Project file');
    assert(!flow.isRunning(),'SESSION '+transition.name+': settlement releases the discovery slot');
    assert(snapshot(db)===before,'SESSION '+transition.name+': devices, metadata, history and dirty state remain unchanged');
  }
  for(const transition of transitions)for(const decision of ['CONFIRMED','REJECTED','DEFERRED'] as const){
    const db=cleanProject([saved]),original=db.exportProjectJson(),flow=workflow(db,[replacement]);
    const summary=await flow.run(),candidateId=summary.possibleReplacements[0].candidateId!;
    await transition.change(db,original);const before=snapshot(db);let error:Error|null=null;
    try{flow.decide(candidateId,decision)}catch(caught){error=caught as Error}
    assert(stale(error),'CANDIDATE '+transition.name+' / '+decision+': old session decision denied');
    assert(snapshot(db)===before,'CANDIDATE '+transition.name+' / '+decision+': current session unchanged');
  }
  {
    const db=cleanProject([saved]),gate=deferred<'COMPLETED'>();
    const flow=new ProjectReverificationWorkflow(db,async()=>gate.promise),pending=settled(flow.run());
    db.importProjectJson(projectB);const before=snapshot(db);gate.reject(new Error('Injected discovery failure'));
    const outcome=await pending;
    assert(stale(outcome.error)&&snapshot(db)===before&&!flow.isRunning(),'SESSION rejected discovery: stale session takes precedence without mutation');
  }
  {
    const db=cleanProject([saved]),gate=deferred<'COMPLETED'|'CANCELLED'>();let attempts=0;
    const flow=new ProjectReverificationWorkflow(db,async staging=>{staging.upsertDevice(structuredClone(same));return ++attempts===1?gate.promise:'COMPLETED'},()=>{gate.resolve('CANCELLED');return true});
    const before=snapshot(db),pending=settled(flow.run());assert(flow.cancel(),'SESSION same-session cancellation reaches current discovery');
    const cancelled=await pending;
    assert(cancelled.error instanceof ProjectValidationError&&/cancelled/.test(cancelled.error.message)&&snapshot(db)===before&&!flow.isRunning(),'SESSION cancellation preserves the current Project and clears its run');
    const retry=await settled(flow.run());assert(retry.result?.recognizedCount===1&&attempts===2&&!flow.isRunning(),'SESSION cancelled workflow retries normally in the same session');
  }
  // Model the backend adapter's single cancellation ID, including its BUSY/finally behavior.
  // Cancellation requests deliberately do not settle discovery until the test releases its gate.
  {
    const db=cleanProject([saved]),gates=[deferred<'COMPLETED'|'CANCELLED'>(),deferred<'COMPLETED'|'CANCELLED'>()];
    let calls=0,busy=0,cancellationId:string|null=null,activeId:string|null=null;
    const cancelledIds:string[]=[];
    const flow=new ProjectReverificationWorkflow(db,async staging=>{
      const index=calls++,id='scan-'+index;cancellationId=id;
      try {
        if(activeId!==null){busy++;return 'BUSY';}
        activeId=id;staging.upsertDevice(structuredClone(db.getProjectMemberDevices()[0]));
        return await gates[index].promise;
      } finally { if(activeId===id)activeId=null;cancellationId=null; }
    },()=>{if(!cancellationId||cancellationId!==activeId)return false;cancelledIds.push(cancellationId);return true});
    const old=settled(flow.run());const originalId=cancellationId;
    db.importProjectJson(projectB);const before=snapshot(db);
    assert(flow.isRunning(),'OWNER Project switch invalidates commits but keeps pending discovery running');
    const blocked=await settled(flow.run());
    assert(blocked.error instanceof ProjectValidationError&&/already running/.test(blocked.error.message),'OWNER retry is rejected while the old discovery is pending');
    assert(calls===1&&busy===0&&cancellationId===originalId&&activeId===originalId,'OWNER rejection occurs before adapter invocation and preserves its cancellation ID');
    assert(flow.cancel()&&cancelledIds.length===1&&cancelledIds[0]===originalId,'OWNER cancellation still targets the original discovery after Project switch');
    const afterCancel=await settled(flow.run());
    assert(afterCancel.error instanceof ProjectValidationError&&flow.isRunning()&&calls===1&&cancellationId===originalId,'OWNER cancellation request does not release the slot before actual settlement');
    assert(snapshot(db)===before,'OWNER blocked retries and cancellation do not mutate Project B');
    gates[0].resolve('CANCELLED');const obsolete=await old;
    assert(stale(obsolete.error)&&snapshot(db)===before&&!flow.isRunning()&&cancellationId===null&&activeId===null,'OWNER stale settlement denies commit and releases only its discovery slot');
    const newer=settled(flow.run());
    assert(calls===2&&flow.isRunning()&&cancellationId==='scan-1'&&activeId==='scan-1','OWNER new discovery starts normally after old settlement');
    const blockedNew=await settled(flow.run());
    assert(blockedNew.error instanceof ProjectValidationError&&calls===2&&busy===0&&flow.isRunning()&&cancellationId==='scan-1','OWNER rejected attempts cannot clear the newer run or overwrite its ID');
    gates[1].resolve('COMPLETED');const current=await newer;
    assert(current.result?.recognizedCount===1&&!current.error&&!flow.isRunning()&&cancellationId===null&&activeId===null,'OWNER subsequent same-session completion succeeds and cleans up');
  }
  {
    const invalid=technicianErrorResponse(new ProjectValidationError('Project file contains invalid JSON.'),{operation:'PROJECT_OPEN'});
    assert(invalid.code==='PROJECT_FILE_INVALID'&&invalid.presentation.title==='Project file could not be opened','ERROR real Project-file errors retain their existing classification');
    const cancelled=technicianErrorResponse(new ProjectValidationError('Project reverification was cancelled.'),{operation:'PROJECT_REVERIFY'});
    assert(cancelled.code==='CANCELLED','ERROR cancellation retains its existing presentation');
  }
  {
    const db=cleanProject([saved]),before=JSON.parse(db.exportProjectJson());await workflow(db,[same]).run();
    const after=JSON.parse(db.exportProjectJsonForSave());
    assert(after.schemaVersion===before.schemaVersion&&Object.keys(after).sort().join()===Object.keys(before).sort().join()&&!/sessionGeneration|activeRun/.test(JSON.stringify(after))&&!/sessionGeneration/.test(JSON.stringify(db.getSession())),'SESSION generation is absent from exported schema and session snapshots');
  }
  console.log(`\nProject Reverify workflow summary: ${passed} passed, ${failed} failed`);if(failed)process.exit(1)
}run().catch(error=>{console.error(error);process.exit(1)});
