import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import express from 'express';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { createForegroundDiscoveryRouter } from '../server/foreground_discovery_routes.ts';
import { foregroundActive, reconcileForeground, isForegroundSnapshot } from '../shared/discovery_session.ts';
import { BatchExecutionPipeline } from '../core/engine/pipeline.ts';
import { IncrementalDiscoveryMonitor } from '../core/engine/incremental_discovery_monitor.ts';
import { NodeOnvifWsDiscoveryTransport, UdpSocketLike } from '../core/drivers/ws_discovery_transport.ts';
import { NoopDeviceEnricher } from '../core/engine/device_enrichment.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { AdvancedScanPlanner, AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { fieldNic, fieldEthernet } from './support/first_camera_field.ts';
import { hanwhaHello } from './support/hanwha_hello.ts';
let passed=0;const check=(v:unknown,name:string)=>{assert.ok(v,name);passed++;console.log(`PASS: ${name}`)};
const until=async(test:()=>boolean)=>{const limit=Date.now()+2000;while(!test()){if(Date.now()>limit)throw Error('Timed out waiting for test state');await new Promise(r=>setTimeout(r,1))}};
class Socket extends EventEmitter implements UdpSocketLike {
 closed=0;memberships=0;
 bind(_options:any,callback:()=>void){callback()}
 addMembership(){this.memberships++;queueMicrotask(()=>this.emit('message',Buffer.from(hanwhaHello({uuid:true})),{address:'192.168.1.100',port:3702}))}
 setMulticastInterface(){}
 send(_m:unknown,_p:number,_a:string,cb:(error?:Error|null)=>void){cb()}
 close(){this.closed++}
}
async function run(){
 const changes:any[]=[],sessions=new ForegroundDiscovery(s=>changes.push(s));
 const first=sessions.begin('MANUAL');check(sessions.isActive()&&sessions.getState().session?.state==='PREPARING','foreground reservation starts in preparing');
 assert.throws(()=>sessions.begin('ADVANCED'));check(true,'second foreground session cannot steal reservation');
 check(!sessions.stop('other')&&!first.signal.aborted,'wrong session Stop cannot cancel current session');
 sessions.scanning(first.context.sessionId);const scanning=sessions.getState();check(scanning.session?.state==='SCANNING','owned session transitions to scanning');
 check(sessions.stop(first.context.sessionId)&&first.signal.aborted&&sessions.getState().session?.state==='STOPPING','correct Stop aborts only owned token');
 sessions.finish(first.context.sessionId,'COMPLETED');check(sessions.getState().session?.state==='CANCELLED','cancelled work cannot report successful completion');
 const second=sessions.begin('ADVANCED');const newer=sessions.getState();sessions.finish(first.context.sessionId,'FAILED');check(sessions.getState().session?.sessionId===second.context.sessionId,'late terminal work cannot finish newer session');
 check(reconcileForeground(newer,scanning)===newer,'older manual snapshot cannot overwrite newer Advanced session');
 for(const incoming of [{running:true},{origin:'MONITORING',running:true},{...newer,session:{...newer.session,origin:'MONITORING'}},{...newer,revision:NaN},{...newer,session:{state:'SCANNING'}}])check(reconcileForeground(newer,incoming)===newer,'generic/monitoring/malformed status cannot advance foreground UI');
 check(isForegroundSnapshot(newer)&&foregroundActive(newer.session),'typed snapshot preserves Advanced foreground semantics');sessions.finish(second.context.sessionId,'COMPLETED');
 const reboot={epoch:'new-server',revision:0,session:null};check(reconcileForeground(newer,reboot)===reboot,'HTTP recovery accepts new backend epoch without stale running state');

 const db=new SiteProjectDatabase('ISOLATED_TEST');db.startQuickWork();const sockets:Socket[]=[],events:any[]=[],windows:number[]=[];let windowMs=5000,announce=true;
 const transport={discover:(nics:any,options:any)=>{windows.push(options.timeoutMs);return new NodeOnvifWsDiscoveryTransport().discover(nics,{...options,timeoutMs:windowMs,multicastSocketFactory:()=>{const s=new Socket();if(!announce)s.addMembership=()=>{};sockets.push(s);return s},socketFactory:()=>{const s=new Socket();sockets.push(s);return s}})}};
 const pipeline=new BatchExecutionPipeline({onvifDiscovery:transport,passiveDiscovery:{discover:async()=>[]} as any,deviceEnricher:new NoopDeviceEnricher()});
 pipeline.runPhase1=async()=>{(pipeline as any).currentInterfaces=[fieldNic()]};pipeline.subscribe(e=>events.push(e));
 const foreground=new ForegroundDiscovery();let timer:(()=>void)|undefined,clears=0,diagnosticsRunning=true;
 const monitor=new IncrementalDiscoveryMonitor({runCycle:id=>pipeline.runDiscoveryScan({context:{origin:'MONITORING',sessionId:id},database:db,emitTerminalEvent:false}),cancelCycle:id=>{pipeline.stopDiscovery(id)},canRun:()=>({allowed:!foreground.isActive()&&!pipeline.getIsRunning()}),setTimer:cb=>{timer=cb;return {unref(){}} as any},clearTimer:()=>{clears++}});monitor.start();
 const cycle=monitor.runNow();await until(()=>events.some(e=>e.type==='DEVICE_DISCOVERED'));
 check(monitor.getState().running&&monitor.getState().enabled&&!foreground.isActive(),'monitor cycle is independent of foreground state');
 check(events.find(e=>e.type==='DEVICE_DISCOVERED').context.origin==='MONITORING','real Hello discovery event carries monitoring origin');
 check(db.getDevices().length===1&&db.getDevices()[0].status==='DIFFERENT_SUBNET','monitor Hello preserves off-subnet evidence in inventory');
 check(windows[0]===10000,'production pipeline still requests 10-second receive window');
 const monitorId=monitor.getState().sessionId!;check(!pipeline.stopDiscovery('unrelated')&&sockets.every(s=>s.closed===0),'unrelated cancellation leaves monitoring sockets open');

 const app=express();app.use(express.json());let prepareHold:(()=>void)|null=null,prepareEntered=false,failPrepare=false,failRun=false;
 const request=emptyAdvancedScanRequest();request.adapterIndexes=[8];request.methods=['ONVIF'];request.targets=[{type:'RANGE',start:'192.168.1.100',end:'192.168.1.100'}];
 const prepared={plan:new AdvancedScanPlanner().plan(request,[fieldEthernet()]),adapters:[fieldEthernet()],timings:{adapterInspectionMs:0,planningMs:0}};
 app.use('/discovery',createForegroundDiscoveryRouter({foreground,yieldMonitoring:()=>monitor.yieldToTechnician(),busy:()=>pipeline.getIsRunning()&&!monitor.getState().running,
 quick:async(context,signal)=>{if(failRun)throw Error('injected');await pipeline.runDiscoveryScan({context,signal,database:db,emitTerminalEvent:false})},
 prepare:async()=>{prepareEntered=true;if(failPrepare)throw Error('injected');if(prepareHold)await new Promise<void>(resolve=>{prepareHold=resolve});return prepared},
 advanced:async(_p,context,signal)=>{await pipeline.runDiscoveryScan({context,signal,database:db,emitTerminalEvent:false})},monitoring:()=>({...monitor.getState(),diagnosticsRunning}),details:()=>({engineRunning:pipeline.getIsRunning()}),error:(res,_error,status)=>res.status(status).json({error:'safe'}),failed:()=>{}}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/discovery`;
 const post=(path:string,body:unknown={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {
  const initial=await(await fetch(base+'/status')).json();check(!initial.running&&initial.engineRunning&&initial.monitoring.running,'HTTP foreground running excludes active background pipeline');
  check((await post('/stop')).status===409&&sockets.every(s=>!s.closed),'unscoped REST Stop cannot kill monitor');
  let response=await post('/start');const manual=await response.json();await cycle;await until(()=>events.some(e=>e.context?.sessionId===manual.foreground.session.sessionId&&e.type==='DEVICE_DISCOVERED'));
  check(response.status===202&&manual.foreground.session.origin==='MANUAL','manual start returns owned foreground snapshot');
  check(sockets.slice(0,2).every(s=>s.closed===1)&&sockets.slice(2).every(s=>s.closed===0),'monitor handoff closes only old sockets before manual listener is created');
  check(monitor.getState().enabled&&!monitor.getState().running,'handoff preserves scheduler');
  check(await monitor.runNow()==='SKIPPED','monitor cannot overlap foreground listener');
  check(!pipeline.stopDiscovery(monitorId)&&sockets.slice(2).every(s=>s.closed===0),'stale monitor cancel cannot tear down manual socket');
  check(db.getDevices().length===1&&events.filter(e=>e.type==='DEVICE_DISCOVERED'&&e.data.isNew).length===1,'manual rediscovery retains Hello and suppresses duplicate inventory/notification');
  const manualId=manual.foreground.session.sessionId;response=await post('/stop',{sessionId:manualId});check(response.status===202,'scoped REST Stop accepts manual session');await until(()=>!foreground.isActive());
  check(foreground.getState().session?.state==='CANCELLED'&&diagnosticsRunning,'manual stop leaves Diagnostics untouched');
  check(monitor.getState().enabled&&clears===0,'manual stop never disables monitoring timer');
  windowMs=10;await monitor.runNow();check(monitor.getState().enabled&&!monitor.getState().running&&db.getDevices().length===1,'next monitor cycle runs after manual Stop without losing Hello');
  response=await post('/start');const completed=(await response.json()).foreground;await until(()=>!foreground.isActive());check(foreground.getState().session?.state==='COMPLETED','manual completion returns to terminal foreground state');await monitor.runNow();check(monitor.getState().enabled,'monitoring continues after foreground completion');
  windowMs=5000;response=await post('/advanced/start',request);const advanced=(await response.json()).foreground;await until(()=>events.some(e=>e.context?.sessionId===advanced.session.sessionId&&e.type==='DEVICE_DISCOVERED'));
  check(advanced.session.origin==='ADVANCED'&&events.some(e=>e.context?.origin==='ADVANCED'),'Advanced events retain explicit origin');
  check((await post('/stop',{sessionId:completed.session.sessionId})).status===409&&foreground.isActive(),'old manual Stop cannot cancel unrelated Advanced session');
  check((await post('/start')).status===409,'manual start cannot steal Advanced reservation');
  await post('/stop',{sessionId:advanced.session.sessionId});await until(()=>!foreground.isActive());check(foreground.getState().session?.state==='CANCELLED','Stop can cancel the explicitly selected Advanced foreground session');
  prepareHold=()=>{};prepareEntered=false;const preparing=post('/advanced/start',request);await until(()=>prepareEntered);const pending=foreground.getState();check(pending.session?.state==='PREPARING'&&await monitor.runNow()==='SKIPPED','Advanced reservation covers preflight gap and defers monitoring');
  await post('/stop',{sessionId:pending.session!.sessionId});prepareHold!();await preparing;prepareHold=null;check(foreground.getState().session?.state==='CANCELLED','preflight cancellation prevents listener start');
  failPrepare=true;check((await post('/advanced/start',request)).status===500&&!foreground.isActive(),'failed preparation releases reservation');failPrepare=false;
  failRun=true;await post('/start');await until(()=>!foreground.isActive());check(foreground.getState().session?.state==='FAILED','failed execution releases foreground reservation');failRun=false;
  announce=false;windowMs=5;await monitor.runNow();check(db.getDevices().length===1,'silent monitor cannot invent a target row');
  check(sockets.every(s=>s.closed===1),'all owned socket pairs close exactly once after terminal work');
  monitor.stop();timer?.();await Promise.resolve();check(clears===1&&!monitor.getState().enabled&&!pipeline.getIsRunning(),'shutdown clears scheduler and stale timer does not start orphan cycle');
 }finally{monitor.stop();pipeline.stopDiscovery();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}

 const targetRequest=emptyAdvancedScanRequest();targetRequest.adapterIndexes=[8];targetRequest.methods=['PING'];targetRequest.targets=[{type:'RANGE',start:'192.168.1.100',end:'192.168.1.100'}];
 const targetPlan=new AdvancedScanPlanner().plan(targetRequest,[fieldEthernet()]);let targetSignal:AbortSignal|undefined;
 const targeted=new AdvancedScanService({inspectAdapters:async()=>[fieldEthernet()]} as any,{check:async(ip:string,options:any)=>{targetSignal=options.signal;return await new Promise(resolve=>{options.signal.addEventListener('abort',()=>resolve({type:'PING',targetIp:ip,success:false,timestamp:'now'}),{once:true})})}} as any,undefined,db);
 const parent=new AbortController();const targetWork=targeted.execute(targetPlan,{onDevice(){},onComplete(){}},parent.signal);await until(()=>Boolean(targetSignal));
 check(targeted.getStatus().running&&!targetSignal!.aborted,'targeted Advanced stage owns live parent-linked cancellation token');
 const unrelated=new AbortController();unrelated.abort();check(!targetSignal!.aborted,'unrelated parent does not abort targeted Advanced checks');
 parent.abort();await targetWork;check(targeted.getStatus().cancelled&&!targeted.getStatus().running,'foreground parent abort stops targeted Advanced stage');
 targetSignal=undefined;const newParent=new AbortController();const nextTarget=targeted.execute(targetPlan,{onDevice(){},onComplete(){}},newParent.signal);await until(()=>Boolean(targetSignal));parent.abort();check(!targetSignal!.aborted,'old parent cannot cancel later Advanced invocation');newParent.abort();await nextTarget;
 check(db.getDevices().length===1,'silent targeted checks after cancellation create no synthetic row');
 console.log(`Scan monitoring separation: ${passed} passed, 0 failed, 0 skipped`);
}
run().catch(error=>{console.error(error);process.exitCode=1});
